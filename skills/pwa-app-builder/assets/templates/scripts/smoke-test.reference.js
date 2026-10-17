'use strict';
/**
 * اختبار شامل سريع لواجهات الـAPI (بدون متصفح).
 * الاستخدام: node scripts/smoke-test.js  (يحتاج السيرفر يعمل على المنفذ 3000)
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

let cookie = '';
let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length && setCookie[0].includes('{{PREFIX}}_session=')) {
    cookie = setCookie[0].split(';')[0];
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

// صورة PNG صغيرة (1×1) لاختبار رفع الصور
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  console.log(`\n🧪 اختبار ${BASE}\n`);

  console.log('— الصحة والمصادقة —');
  const health = await call('/health', { auth: false });
  check('GET /api/health', health.status === 200 && health.data.ok);

  const guest = await call('/auth/guest', { method: 'POST', auth: false });
  check('POST /api/auth/guest', guest.status === 201 && guest.data.user.kind === 'guest', JSON.stringify(guest.data));
  check('كوكي الجلسة تم ضبطه', Boolean(cookie));

  const me = await call('/auth/me');
  check('GET /api/auth/me', me.status === 200 && me.data.user?.isGuest === true);

  const unauthorized = await fetch(`${BASE}/api/meals`);
  check('منع الوصول بدون جلسة', unauthorized.status === 401);

  console.log('\n— الوجبات —');
  const created = [];
  for (const [name, category, recipe] of [
    ['كشري', 'lunch', 'عدس وأرز ومكرونة'],
    ['فول وطعمية', 'breakfast', 'فول مدمس'],
    ['سلطة فواكه', 'snack', ''],
  ]) {
    const res = await call('/meals', { method: 'POST', body: { name, category, recipe } });
    created.push(res.data?.meal);
    check(`إضافة وجبة: ${name}`, res.status === 201 && res.data.meal.name === name);
  }

  const withImage = await call('/meals', {
    method: 'POST',
    body: { name: 'بيتزا', category: 'dinner', recipe: 'عجينة وجبن', image: TINY_PNG },
  });
  check('إضافة وجبة بصورة', withImage.status === 201 && Boolean(withImage.data.meal.imageUrl), JSON.stringify(withImage.data));
  const imageMeal = withImage.data.meal;

  const list = await call('/meals');
  check('GET /api/meals', list.status === 200 && list.data.total === 4, `total=${list.data?.total}`);

  const filtered = await call('/meals?category=breakfast');
  check('تصفية حسب الفئة', filtered.data.total === 1);

  const searched = await call('/meals?q=كشري');
  check('البحث بالاسم', searched.data.total === 1);

  const invalidCategory = await call('/meals', { method: 'POST', body: { name: 'خطأ', category: 'brunch' } });
  check('رفض فئة غير صحيحة', invalidCategory.status === 400);
  const noCategory = await call('/meals', { method: 'POST', body: { name: 'بلا فئة' } });
  check('رفض وجبة بلا فئات', noCategory.status === 400);

  // وجبة بفئتين (فطور + عشاء)
  const multi = await call('/meals', {
    method: 'POST',
    body: { name: 'عجة بالجبن', categories: ['breakfast', 'dinner'], recipe: 'بيض وجبن' },
  });
  check('إضافة وجبة بفئتين', multi.status === 201 && multi.data.meal.categories.length === 2, JSON.stringify(multi.data?.meal?.categories));
  check('الفئة الأساسية هي الأولى', multi.data.meal.category === 'breakfast');
  const breakfastList = await call('/meals?category=breakfast');
  check('تظهر في تصفية الفطور', breakfastList.data.meals.some((m) => m.id === multi.data.meal.id));
  const dinnerList = await call('/meals?category=dinner');
  check('وتظهر أيضاً في تصفية العشاء', dinnerList.data.meals.some((m) => m.id === multi.data.meal.id));
  const multiSuggest = await call('/suggest', { method: 'POST', body: { category: 'dinner' } });
  check('الاقتراح يشمل الوجبات متعددة الفئات', multiSuggest.status === 200);
  const multiPatched = await call(`/meals/${multi.data.meal.id}`, { method: 'PATCH', body: { categories: ['snack'] } });
  check('تعديل الفئات', multiPatched.data.meal.categories.join(',') === 'snack');
  await call(`/meals/${multi.data.meal.id}`, { method: 'DELETE' });

  // الواجب: الاسم + فئة فقط؛ وكل التفاصيل الأخرى اختيارية
  const minimal = await call('/meals', { method: 'POST', body: { name: 'وجبة بسيطة', categories: ['snack'] } });
  check('إضافة وجبة بالاسم والفئة فقط', minimal.status === 201);
  check(
    'الحقول الاختيارية فارغة افتراضياً',
    minimal.data.meal.ingredients.length === 0 && minimal.data.meal.steps.length === 0 && minimal.data.meal.prepMinutes === null
  );
  const rich = await call('/meals', {
    method: 'POST',
    body: {
      name: 'وجبة كاملة التفاصيل',
      categories: ['dinner'],
      description: 'وصف مختصر',
      ingredients: 'أرز: كوبان\nعدس: كوب',
      steps: 'اسلق العدس\nأضف الأرز',
      tags: ['grilled', 'quick'],
      prepMinutes: '25',
      servings: '3',
    },
  });
  check(
    'تخزين التفاصيل الاختيارية (مكوّنات/خطوات/تصنيفات/زمن/حصص)',
    rich.status === 201 &&
      rich.data.meal.ingredients.length === 2 &&
      rich.data.meal.steps.length === 2 &&
      rich.data.meal.tags.join(',') === 'grilled,quick' &&
      rich.data.meal.prepMinutes === 25 &&
      rich.data.meal.servings === 3,
    JSON.stringify({ i: rich.data?.meal?.ingredients, t: rich.data?.meal?.tags })
  );
  const byIngredient = await call(`/meals?q=${encodeURIComponent('عدس')}`);
  check('البحث يشمل المكوّنات', byIngredient.data.meals.some((m) => m.id === rich.data.meal.id));
  const patchedRich = await call(`/meals/${rich.data.meal.id}`, {
    method: 'PATCH',
    body: { ingredients: 'أرز: 3 أكواب', prepMinutes: 40 },
  });
  check('تعديل المكوّنات وزمن التحضير', patchedRich.data.meal.ingredients.join('') === 'أرز: 3 أكواب' && patchedRich.data.meal.prepMinutes === 40);
  const badTags = await call('/meals', { method: 'POST', body: { name: 'تصنيف خاطئ', categories: ['snack'], tags: ['!!!', 'OK-Tag'] } });
  check('تنقية التصنيفات غير الصالحة', badTags.data.meal.tags.join(',') === 'ok-tag', JSON.stringify(badTags.data?.meal?.tags));
  for (const id of [minimal.data.meal.id, rich.data.meal.id, badTags.data.meal.id]) {
    await call(`/meals/${id}`, { method: 'DELETE' });
  }

  const noName = await call('/meals', { method: 'POST', body: { name: '  ', category: 'lunch' } });
  check('رفض وجبة بلا اسم', noName.status === 400);

  console.log('\n— الاقتراح العشوائي —');
  const first = await call('/suggest', { method: 'POST', body: { category: 'all', excludeLast: true } });
  check('POST /api/suggest', first.status === 200 && Boolean(first.data.meal), JSON.stringify(first.data));
  const second = await call('/suggest', { method: 'POST', body: { category: 'all', excludeLast: true } });
  check(
    'استثناء آخر وجبة مقترحة',
    second.status === 200 && second.data.meal.id !== first.data.meal.id,
    `${first.data?.meal?.id} vs ${second.data?.meal?.id}`
  );
  const categorySuggest = await call('/suggest', { method: 'POST', body: { category: 'breakfast' } });
  check('الاقتراح داخل الفئة المطلوبة', categorySuggest.data.meal.category === 'breakfast');
  const outcome = await call('/suggest/outcome', { method: 'POST', body: { mealId: first.data.meal.id, outcome: 'accepted' } });
  check('تسجيل قبول الاقتراح', outcome.status === 200);

  console.log('\n— التقييم —');
  const rated = await call(`/meals/${created[0].id}/rate`, { method: 'POST', body: { stars: 5, liked: 1 } });
  check('تقييم بالنجوم والإعجاب', rated.status === 200 && rated.data.meal.myRating.stars === 5 && rated.data.meal.avgStars === 5);
  const ratedAgain = await call(`/meals/${created[0].id}/rate`, { method: 'POST', body: { stars: 4 } });
  check('تحديث التقييم', ratedAgain.data.meal.myRating.stars === 4 && ratedAgain.data.meal.myRating.liked === 1);
  const badStars = await call(`/meals/${created[0].id}/rate`, { method: 'POST', body: { stars: 9 } });
  check('رفض تقييم خارج المدى', badStars.status === 400);

  console.log('\n— المشاركة العامة —');
  const share = await call(`/meals/${created[0].id}/share`, { method: 'POST' });
  check('إنشاء رابط مشاركة', share.status === 200 && Boolean(share.data.token));
  const publicMeal = await call(`/public/meal/${share.data.token}`, { auth: false });
  check('عرض الوجبة عبر الرابط العام', publicMeal.status === 200 && publicMeal.data.meal.name === 'كشري');
  const badToken = await call('/public/meal/invalid-token', { auth: false });
  check('رفض رمز مشاركة غير صالح', badToken.status === 404);

  console.log('\n— إضافة وجبة مشاركة إلى قائمتي —');
  // مستخدم آخر يشارك وجبة لنستوردها في قائمتنا
  const otherGuest = await fetch(`${BASE}/api/auth/guest`, { method: 'POST' });
  const otherCookie = otherGuest.headers.getSetCookie()[0].split(';')[0];
  const otherMealRes = await fetch(`${BASE}/api/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: otherCookie },
    body: JSON.stringify({ name: 'منسف أردني', categories: ['lunch'], recipe: 'لحم ولبن جميد' }),
  });
  const otherMeal = (await otherMealRes.json()).meal;
  const otherShare = await (
    await fetch(`${BASE}/api/meals/${otherMeal.id}/share`, { method: 'POST', headers: { Cookie: otherCookie } })
  ).json();
  const otherPublic = await call(`/public/meal/${otherShare.token}`, { auth: false });
  check('عرض وجبة مشاركة من مستخدم آخر', otherPublic.status === 200 && otherPublic.data.meal.name === 'منسف أردني');

  const importNoAuth = await fetch(`${BASE}/api/public/meal/${otherShare.token}/import`, { method: 'POST' });
  check('الاستيراد يتطلب جلسة', importNoAuth.status === 401);

  const imported = await call(`/public/meal/${otherShare.token}/import`, { method: 'POST' });
  check(
    'استيراد الوجبة المشاركة إلى قائمتي',
    imported.status === 201 && imported.data.meal.name === 'منسف أردني' && imported.data.duplicate === false,
    JSON.stringify(imported.data?.meal?.name)
  );
  check('الوجبة المستوردة في القائمة', (await call('/meals')).data.total === 5);
  const importedAgain = await call(`/public/meal/${otherShare.token}/import`, { method: 'POST' });
  check(
    'منع التكرار عند الاستيراد مرة أخرى',
    importedAgain.data.duplicate === true && importedAgain.data.meal.id === imported.data.meal.id
  );
  // استيراد وجبة بنفس اسم/فئة وجبة موجودة لدينا لا يُنشئ نسخة مكررة
  const sameName = await call(`/public/meal/${share.data.token}/import`, { method: 'POST' });
  check('عدم تكرار وجبة موجودة بنفس الاسم', sameName.data.duplicate === true);
  const importBad = await call('/public/meal/does-not-exist/import', { method: 'POST' });
  check('رفض استيراد رمز غير صالح', importBad.status === 404);

  console.log('\n— التنبيهات —');
  const alarm = await call('/alarms', {
    method: 'POST',
    body: { title: 'وقت الغداء', time: '13:30', days: [0, 2], mealId: created[0].id, tzOffset: 180 },
  });
  check('إضافة تنبيه', alarm.status === 201 && alarm.data.alarm.time === '13:30', JSON.stringify(alarm.data));
  const badTime = await call('/alarms', { method: 'POST', body: { time: '25:99' } });
  check('رفض وقت غير صحيح', badTime.status === 400);
  const alarms = await call('/alarms');
  check('عرض التنبيهات', alarms.data.alarms.length === 1 && alarms.data.alarms[0].mealName === 'كشري');
  const toggled = await call(`/alarms/${alarm.data.alarm.id}`, { method: 'PATCH', body: { enabled: false } });
  check('إيقاف التنبيه', toggled.data.alarm.enabled === false);

  console.log('\n— الإحصاءات —');
  const stats = await call('/meals/meta/stats');
  check('GET /api/meals/meta/stats', stats.status === 200 && stats.data.totals.meals === 5, JSON.stringify(stats.data?.totals));
  check('توزيع الفئات محسوب', stats.data.byCategory.lunch === 2 && stats.data.byCategory.breakfast === 1);
  check('سجل الاقتراحات موجود', stats.data.recentSuggestions.length >= 3);
  check('الأعلى تقييماً موجود', stats.data.topRated.length >= 1);

  console.log('\n— تعديل/حذف وجبة —');
  const patched = await call(`/meals/${created[1].id}`, { method: 'PATCH', body: { name: 'فول بالزيت', recipe: 'فول + زيت حار' } });
  check('تعديل وجبة', patched.data.meal.name === 'فول بالزيت');
  const dropped = await call(`/meals/${imageMeal.id}`, { method: 'PATCH', body: { removeImage: true } });
  check('إزالة صورة الوجبة', dropped.data.meal.imageUrl === null);
  const removed = await call(`/meals/${created[2].id}`, { method: 'DELETE' });
  check('حذف وجبة', removed.status === 200);
  const afterDelete = await call('/meals');
  check('العدد بعد الحذف', afterDelete.data.total === 4);

  console.log('\n— ترقية حساب الزائر —');
  const upgraded = await call('/auth/upgrade', {
    method: 'POST',
    body: { email: `tester${Date.now()}@example.com`, password: 'secret123', name: 'مستخدم تجريبي' },
  });
  check('ترقية الزائر لحساب دائم', upgraded.status === 200 && upgraded.data.user.kind === 'user');
  const mealsAfterUpgrade = await call('/meals');
  check('البيانات محفوظة بعد الترقية', mealsAfterUpgrade.data.total === 4);
  const upgradedMe = await call('/auth/me');
  check('جلسة الحساب المرفّع تعمل', upgradedMe.data.user.isGuest === false);

  console.log('\n— الخروج والحماية —');
  const logout = await call('/auth/logout', { method: 'POST' });
  check('تسجيل الخروج', logout.status === 200);
  cookie = '';
  const afterLogout = await call('/meals');
  check('منع الوصول بعد الخروج', afterLogout.status === 401);

  console.log('\n— تسجيل الدخول: البريد وكلمة المرور فقط + تطبيع المدخلات —');
  const RLM = '\u200f'; // محرف اتجاه غير مرئي تُدخله لوحات مفاتيح عربية
  const loginEmail = `dirty.user+${Date.now()}@example.com`;
  const dirtyEmail = `${loginEmail.toUpperCase()}${RLM} `; // كما قد يأتي من الحقل
  const dirtyPassword = ` secret123${RLM} `; // مسافة/محرف مخفي في الطرفين

  const dirtyReg = await call('/auth/register', {
    method: 'POST',
    auth: false,
    body: { name: 'مستخدم ببيانات ملوّثة', email: dirtyEmail, password: dirtyPassword },
  });
  check(
    'إنشاء حساب ببريد/كلمة مرور بهما مسافات ومحارف مخفية يُطبّع القيم',
    dirtyReg.status === 201 && dirtyReg.data.user.email === loginEmail,
    JSON.stringify(dirtyReg.data)
  );

  const cleanLogin = await call('/auth/login', { method: 'POST', auth: false, body: { email: loginEmail, password: 'secret123' } });
  check('الدخول ببيانات نظيفة بعد تسجيل ملوّث', cleanLogin.status === 200, JSON.stringify(cleanLogin.data));

  const nameNotRequired = await call('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: loginEmail, password: 'secret123', name: '' },
  });
  check('حقل الاسم ليس مطلوباً في تسجيل الدخول', nameNotRequired.status === 200);

  const noisyLogin = await call('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: ` ${loginEmail.toUpperCase()}${RLM}`, password: ` secret123 ` },
  });
  check('الدخول مع مسافات زائدة ومحارف مخفية', noisyLogin.status === 200, JSON.stringify(noisyLogin.data));

  const spacedLogin = await call('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: loginEmail, password: `${RLM}secret123${RLM}` },
  });
  check('الدخول مع محارف RLM داخل كلمة المرور', spacedLogin.status === 200);

  const wrongPassword = await call('/auth/login', { method: 'POST', auth: false, body: { email: loginEmail, password: 'wrong123' } });
  check('رفض كلمة مرور خاطئة', wrongPassword.status === 401 && wrongPassword.data.error === 'BAD_CREDENTIALS');

  const unknownEmail = await call('/auth/login', { method: 'POST', auth: false, body: { email: 'no-such-user@example.com', password: 'secret123' } });
  check('رفض بريد غير مسجّل', unknownEmail.status === 401 && unknownEmail.data.error === 'BAD_CREDENTIALS');

  const emptyLogin = await call('/auth/login', { method: 'POST', auth: false, body: {} });
  check('رفض طلب دخول بلا بيانات', emptyLogin.status === 401);

  console.log('\n— تغيير كلمة المرور —');
  const wrongCurrent = await call('/auth/password', {
    method: 'POST',
    body: { currentPassword: 'nope123', newPassword: 'newSecret456' },
  });
  check('رفض التغيير بكلمة المرور الحالية الخاطئة', wrongCurrent.status === 401 && wrongCurrent.data.error === 'BAD_CREDENTIALS');

  const shortNew = await call('/auth/password', { method: 'POST', body: { currentPassword: 'secret123', newPassword: '123' } });
  check('رفض كلمة مرور جديدة أقل من 6 أحرف', shortNew.status === 400);

  const changed = await call('/auth/password', { method: 'POST', body: { currentPassword: 'secret123', newPassword: 'newSecret456' } });
  check('تغيير كلمة المرور بكلمة حالية صحيحة', changed.status === 200 && changed.data.ok === true);

  const oldFails = await call('/auth/login', { method: 'POST', auth: false, body: { email: loginEmail, password: 'secret123' } });
  check('كلمة المرور القديمة لم تعد تعمل', oldFails.status === 401);

  const newWorks = await call('/auth/login', { method: 'POST', auth: false, body: { email: loginEmail, password: 'newSecret456' } });
  check('الدخول بكلمة المرور الجديدة', newWorks.status === 200);

  const restored = await call('/auth/password', { method: 'POST', body: { currentPassword: 'newSecret456', newPassword: 'secret123' } });
  check('إرجاع كلمة المرور لحالتها لبقية الاختبارات', restored.status === 200);
  cookie = '';

  console.log('\n— كتالوج الوصفات العام (استكشف) —');
  const catalog = await call('/catalog', { auth: false });
  check('GET /api/catalog', catalog.status === 200 && catalog.data.total >= 1, `total=${catalog.data?.total}`);
  check('كل طبق له فئات وقت وفئات تصنيف', catalog.data.meals.every((m) => m.mealTimes.length && m.tags.length));
  const catalogTags = await call('/catalog/tags', { auth: false });
  check('GET /api/catalog/tags', catalogTags.status === 200 && catalogTags.data.tags.length >= 5);
  check('التصنيفات تحمل أسماء عربية وعدد الأطباق', catalogTags.data.tags.every((tag) => tag.name && typeof tag.count === 'number'));
  const searchAr = await call(`/catalog?q=${encodeURIComponent('ملوخية')}`, { auth: false });
  check('بحث عربي في الكتالوج', searchAr.data.total === 1 && searchAr.data.meals[0].slug === 'molokheya');
  const searchEn = await call('/catalog?q=koshari', { auth: false });
  check('بحث إنجليزي (بالاسم الإنجليزي/المرادفات)', searchEn.data.total === 1 && searchEn.data.meals[0].name === 'كشري');
  const byTag = await call('/catalog?tag=vegetarian', { auth: false });
  check('تصفية بالتصنيف', byTag.data.total >= 3 && byTag.data.meals.every((m) => m.tags.includes('vegetarian')));
  const byTime = await call('/catalog?category=breakfast', { auth: false });
  check('تصفية بوقت الوجبة', byTime.data.total >= 2 && byTime.data.meals.every((m) => m.mealTimes.includes('breakfast')));
  const quick = await call('/catalog?sort=quick', { auth: false });
  check('ترتيب حسب الأسرع تحضيراً', quick.status === 200 && quick.data.meals[0].prepMinutes <= quick.data.meals[quick.data.meals.length - 1].prepMinutes);
  const shuffleA = await call('/catalog?sort=random&seed=123&limit=100', { auth: false });
  const shuffleB = await call('/catalog?sort=random&seed=123&limit=100', { auth: false });
  const natural = await call('/catalog?limit=100', { auth: false });
  check(
    'الترتيب العشوائي ثابت مع نفس البذرة',
    shuffleA.data.meals.map((m) => m.slug).join() === shuffleB.data.meals.map((m) => m.slug).join()
  );
  check(
    'الترتيب العشوائي يعيد كل الأطباق بلا تكرار',
    new Set(shuffleA.data.meals.map((m) => m.slug)).size === shuffleA.data.total
  );
  check(
    'الترتيب العشوائي يختلف عن الترتيب الافتراضي',
    shuffleA.data.meals.map((m) => m.slug).join() !== natural.data.meals.map((m) => m.slug).join()
  );
  const oneCatalogMeal = await call('/catalog/molokheya', { auth: false });
  check(
    'GET /api/catalog/:slug يعيد المكوّنات والخطوات',
    oneCatalogMeal.status === 200 && oneCatalogMeal.data.meal.ingredients.length >= 3 && oneCatalogMeal.data.meal.steps.length >= 3
  );
  check(
    'إسناد الصورة محفوظ (رخصة + مصوّر + مصدر)',
    Boolean(oneCatalogMeal.data.meal.imageLicense && oneCatalogMeal.data.meal.imageCredit && oneCatalogMeal.data.meal.imageSource)
  );
  const catalogBadSlug = await call('/catalog/no-such-dish', { auth: false });
  check('رفض طبق غير موجود', catalogBadSlug.status === 404);
  const addNoAuth = await fetch(`${BASE}/api/catalog/molokheya/add`, { method: 'POST' });
  check('إضافة طبق تتطلب جلسة', addNoAuth.status === 401);

  // جلسة جديدة للإضافة (اختبرنا الخروج أعلاه)
  await call('/auth/guest', { method: 'POST', auth: false });
  const addFromCatalog = await call('/catalog/molokheya/add', { method: 'POST' });
  check(
    'إضافة طبق من الكتالوج إلى قائمتي',
    addFromCatalog.status === 201 && addFromCatalog.data.meal.name === 'ملوخية بالدجاج' && addFromCatalog.data.duplicate === false
  );
  check(
    'وصف الطبق منسوخ مع الإسناد',
    addFromCatalog.data.meal.description.length > 10 && addFromCatalog.data.meal.recipe.includes('commons.wikimedia.org'),
    addFromCatalog.data.meal.recipe.slice(0, 40)
  );
  check(
    'تُحفظ فئات وقت الوجبة كما في الكتالوج',
    addFromCatalog.data.meal.categories.join(',') === 'lunch,dinner'
  );
  check('الطبق المنسوخ في قائمتي', (await call('/meals')).data.total === 1);
  const addAgain = await call('/catalog/molokheya/add', { method: 'POST' });
  check('منع تكرار نفس الطبق', addAgain.data.duplicate === true && addAgain.data.meal.id === addFromCatalog.data.meal.id);
  check(
    'نسخ صورة الطبق إلى صور المستخدم (لا يبقى بلا صورة)',
    Boolean(addFromCatalog.data.meal.imageUrl && addFromCatalog.data.meal.imageUrl.startsWith('/uploads/')),
    String(addFromCatalog.data.meal.imageUrl)
  );
  check(
    'نسخ التصنيفات وزمن التحضير مع الطبق',
    addFromCatalog.data.meal.tags.includes('egyptian') && addFromCatalog.data.meal.prepMinutes === 35
  );
  check(
    'حفظ المكوّنات والخطوات كحقول مستقلة (لا نص مدمج)',
    addFromCatalog.data.meal.ingredients.length >= 3 && addFromCatalog.data.meal.steps.length >= 3
  );

  // الاسم الموجود بلا تفاصيل → يمكن تحديثه بالوصفة الكاملة بدل تكراره
  const manual = await call('/meals', { method: 'POST', body: { name: 'كشري', categories: ['lunch'] } });
  check('إنشاء وجبة يدوية باسم مطابق', manual.status === 201 && manual.data.meal.ingredients.length === 0);
  const duplicate = await call('/catalog/koshari/add', { method: 'POST' });
  check(
    'كشف التكرار يعرض خيار التحديث',
    duplicate.data.duplicate === true && duplicate.data.canUpdate === true && duplicate.data.updateId === manual.data.meal.id
  );
  const updated = await call('/catalog/koshari/add', { method: 'POST', body: { updateId: manual.data.meal.id } });
  check(
    'تحديث نسختي الناقصة بالوصفة الكاملة',
    updated.data.updated === true && updated.data.meal.ingredients.length >= 5 && updated.data.meal.imageUrl !== null,
    JSON.stringify({ updated: updated.data?.updated, ings: updated.data?.meal?.ingredients?.length })
  );
  check('لم تُنشأ نسخة مكرّرة', (await call('/meals')).data.total === 2);

  const randomPublic = await call('/catalog/random', { auth: false });
  check('اقتراح عشوائي من الكتالوج', randomPublic.status === 200 && Boolean(randomPublic.data.meal.slug));

  // ---- الإشعارات (Push) ----
  const vapid = await call('/push/public-key', { auth: false });
  check('مفتاح VAPID العام متاح ويبدو صحيحاً', vapid.status === 200 && /^B[\w-]{80,}$/.test(vapid.data.publicKey));

  const testNoSubs = await call('/push/test', { method: 'POST' });
  check(
    'إشعار تجريبي بلا اشتراك: نتيجة صريحة (لا "تم الإرسال" كاذبة)',
    testNoSubs.status === 200 && testNoSubs.data.subscriptions === 0 && testNoSubs.data.sent === 0 && testNoSubs.data.ok === false
  );

  const fakeSub = await call('/push/subscribe', {
    method: 'POST',
    body: {
      subscription: {
        endpoint: 'http://127.0.0.1:9/dead-endpoint',
        keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
      },
    },
  });
  check('تسجيل اشتراك Push', fakeSub.status === 201 && fakeSub.data.ok === true);

  const testFail = await call('/push/test', { method: 'POST' });
  check(
    'فشل التسليم يُبلَّغ بسببه (بدل نجاح وهمي)',
    testFail.status === 200 &&
      testFail.data.subscriptions === 1 &&
      testFail.data.sent === 0 &&
      testFail.data.ok === false &&
      testFail.data.failed.length === 1
  );
  check('الاشتراك المؤقت لا يُحذف عند خطأ شبكة عارض', (await call('/push/test', { method: 'POST' })).data.subscriptions === 1);

  const testImage = await call('/push/test', { method: 'POST', body: { image: '/icons/icon-512.png' } });
  check('إشعار تجريبي مع صورة: يقبل المسار النسبي ويعيده', testImage.status === 200 && testImage.data.image === '/icons/icon-512.png');
  const testBadImage = await call('/push/test', { method: 'POST', body: { image: 'javascript:alert(1)' } });
  check('رفض رابط صورة غير صالح', testBadImage.status === 200 && testBadImage.data.image === null);

  const unsub = await call('/push/unsubscribe', { method: 'POST', body: { endpoint: 'http://127.0.0.1:9/dead-endpoint' } });
  check('إلغاء الاشتراك', unsub.status === 200 && (await call('/push/test', { method: 'POST' })).data.subscriptions === 0);

  console.log(`\nنتيجة: ${passed} ناجح، ${failed} فاشل\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('💥 فشل الاختبار:', err);
  process.exit(1);
});
