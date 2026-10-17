'use strict';
/**
 * طبقة قراءة الكتالوج العام (catalog_meals + catalog_tags).
 * الكتالوج مشترك بين كل المستخدمين، ويُملأ من scripts/catalog-sync.js.
 */
const { all, get } = require('./db');

const CATALOG_SELECT = `
  SELECT id, slug, name_ar, name_en, aliases, short_desc, ingredients, steps,
         meal_times, tags, region, prep_minutes, servings, emoji,
         image_file, image_credit, image_license, image_source, sort_order
  FROM catalog_meals
  WHERE is_active = 1
`;

const csv = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** تحويل صف قاعدة البيانات إلى كائن الـAPI. */
function toCatalogMeal(row, { full = false } = {}) {
  if (!row) return null;
  const base = {
    slug: row.slug,
    name: row.name_ar,
    nameEn: row.name_en || '',
    shortDesc: row.short_desc || '',
    emoji: row.emoji || '🍽️',
    mealTimes: csv(row.meal_times),
    tags: csv(row.tags),
    region: row.region || '',
    prepMinutes: row.prep_minutes ?? null,
    servings: row.servings ?? null,
    imageUrl: row.image_file ? `/catalog-images/${row.image_file}` : null,
    imageCredit: row.image_credit || '',
    imageLicense: row.image_license || '',
    imageSource: row.image_source || '',
  };
  if (!full) return base;
  return {
    ...base,
    ingredients: String(row.ingredients || '').split('\n').filter(Boolean),
    steps: String(row.steps || '').split('\n').filter(Boolean),
  };
}

/** كل التصنيفات النشطة مرتّبة، مع عدد الأطباق في كل تصنيف. */
function listTags() {
  const rows = all('SELECT slug, name_ar, name_en, emoji, sort_order FROM catalog_tags WHERE is_active = 1 ORDER BY sort_order, slug');
  const counts = new Map();
  for (const meal of all('SELECT tags FROM catalog_meals WHERE is_active = 1')) {
    for (const tag of csv(meal.tags)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return rows
    .map((row) => ({
      slug: row.slug,
      name: row.name_ar,
      nameEn: row.name_en || '',
      emoji: row.emoji || '🍽️',
      count: counts.get(row.slug) || 0,
    }))
    .filter((tag) => tag.count > 0);
}

/** مولّد أرقام عشوائية مزروع (mulberry32): نفس البذرة ⇒ نفس الترتيب. */
function seededRandom(seed) {
  // خلط البذرة أولاً حتى لا تُنتج قيم صغيرة ترتيباً مطابقاً للترتيب الطبيعي
  let state = (Math.imul(Math.abs(Math.floor(seed)) || 1, 0x9e3779b9) ^ 0x85ebca6b) >>> 0;
  for (let i = 0; i < 3; i += 1) state = (Math.imul(state ^ (state >>> 16), 0x7feb352d) + 0x9e3779b9) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** خلط فيشر-ييتس ببذرة ثابتة. */
function shuffleWithSeed(rows, seed) {
  const random = seededRandom(seed);
  const list = [...rows];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * بحث وتصفية الكتالوج.
 * q: بحث في الاسم العربي/الإنجليزي/المرادفات
 * tag: تصنيف واحد
 * category: وقت الوجبة (breakfast|lunch|dinner|snack|all)
 * sort: recent | name | quick | random (مع seed لبذرة عشوائية ثابتة خلال الزيارة)
 */
function listCatalog({ q = '', tag = '', category = 'all', sort = 'recent', seed = 0, limit = 60, offset = 0 } = {}) {
  const where = [];
  const params = [];

  const term = String(q || '').trim();
  if (term) {
    where.push('(name_ar LIKE ? OR name_en LIKE ? OR aliases LIKE ?)');
    params.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }
  if (tag) {
    where.push("(',' || tags || ',') LIKE ?");
    params.push(`%,${tag},%`);
  }
  if (category && category !== 'all') {
    where.push("(',' || meal_times || ',') LIKE ?");
    params.push(`%,${category},%`);
  }

  const clause = where.length ? ` AND ${where.join(' AND ')}` : '';
  const order =
    sort === 'name' ? 'name_ar COLLATE NOCASE ASC' : sort === 'quick' ? 'prep_minutes ASC NULLS LAST, sort_order' : 'sort_order, id';
  const size = Math.min(Math.max(Number(limit) || 60, 1), 100);
  const skip = Math.max(Number(offset) || 0, 0);

  // ترتيب عشوائي: نجلب المطابقات كلها ثم نخلطها ببذرة ثابتة
  // ⇒ ترتيب مختلف في كل زيارة (بذرة جديدة) وثابت أثناء البحث والتصفية داخل نفس الزيارة.
  if (sort === 'random') {
    const allRows = all(`${CATALOG_SELECT}${clause} ORDER BY sort_order, id`, params);
    const shuffled = shuffleWithSeed(allRows, Number(seed) || 1);
    return { meals: shuffled.slice(skip, skip + size).map((row) => toCatalogMeal(row)), total: allRows.length };
  }

  const rows = all(`${CATALOG_SELECT}${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, size, skip]);
  const total = get(`SELECT COUNT(*) AS n FROM catalog_meals WHERE is_active = 1${clause}`, params).n;
  return { meals: rows.map((row) => toCatalogMeal(row)), total };
}

/** طبق واحد بتفاصيله الكاملة. */
function getCatalogMeal(slug) {
  return toCatalogMeal(get(`${CATALOG_SELECT} AND slug = ?`, [String(slug)]), { full: true });
}

/** اقتراح طبق عشوائي من الكتالوج (يُستخدم في الرئيسية لمن قائمته فارغة). */
function randomCatalogMeal(mealTime = 'all') {
  const clause = mealTime && mealTime !== 'all' ? " AND (',' || meal_times || ',') LIKE ?" : '';
  const params = clause ? [`%,${mealTime},%`] : [];
  return toCatalogMeal(get(`${CATALOG_SELECT}${clause} ORDER BY RANDOM() LIMIT 1`, params));
}

module.exports = { toCatalogMeal, listTags, listCatalog, getCatalogMeal, randomCatalogMeal };
