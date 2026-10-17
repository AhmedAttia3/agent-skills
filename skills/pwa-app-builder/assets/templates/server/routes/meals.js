'use strict';
/** مسارات الوجبات: عرض/بحث/إضافة/تعديل/حذف + التقييم + المشاركة + الاقتراح + الإحصاءات */
const express = require('express');
const crypto = require('crypto');
const { all, get, run } = require('../db');
const { requireAuth } = require('../auth');
const { CATEGORIES } = require('../config');
const { saveImage, removeImage } = require('../images');
const { parseCategories, normalizeCategories, categoryFilter } = require('../categories');

const router = express.Router();
router.use(requireAuth);

const MEAL_SELECT = `
  SELECT m.*,
    (SELECT ROUND(AVG(r.stars), 1) FROM ratings r WHERE r.meal_id = m.id AND r.stars IS NOT NULL) AS avg_stars,
    (SELECT COUNT(*) FROM ratings r WHERE r.meal_id = m.id AND r.stars IS NOT NULL) AS stars_count,
    (SELECT COUNT(*) FROM ratings r WHERE r.meal_id = m.id AND r.liked = 1) AS likes,
    (SELECT COUNT(*) FROM ratings r WHERE r.meal_id = m.id AND r.liked = -1) AS dislikes,
    (SELECT sh.token FROM shares sh WHERE sh.meal_id = m.id) AS share_token,
    mr.stars AS my_stars,
    mr.liked AS my_liked
  FROM meals m
  LEFT JOIN ratings mr ON mr.meal_id = m.id AND mr.user_id = ?
`;

/** نص متعدد الأسطر ← مصفوفة أسطر غير فارغة. */
const lines = (value) =>
  String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** csv ← مصفوفة. */
const csvList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * الحقول الاختيارية للوجبة (وصف/مكوّنات/خطوات/تصنيفات/زمن/حصص).
 * كلها اختيارية: الواجب الوحيد عند الإضافة هو الاسم + فئة واحدة على الأقل.
 */
function optionalFields(body = {}) {
  const join = (value) =>
    (Array.isArray(value) ? value : String(value == null ? '' : value).split('\n'))
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('\n');
  const tags = [...new Set(
    (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
      .map((tag) => String(tag).trim().toLowerCase())
      .filter((tag) => /^[a-z0-9-]+$/.test(tag))
  )];
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return {
    description: String(body.description || '').trim(),
    ingredients: join(body.ingredients),
    steps: join(body.steps),
    tags: tags.join(','),
    prepMinutes: num(body.prepMinutes),
    servings: num(body.servings),
  };
}

/** تحويل صف قاعدة البيانات إلى شكل يستهلكه الواجهة. */
function toMeal(row) {
  if (!row) return null;
  const categories = parseCategories(row);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categories,
    recipe: row.recipe || '',
    description: row.description || '',
    ingredients: lines(row.ingredients),
    steps: lines(row.steps),
    tags: csvList(row.tags),
    prepMinutes: row.prep_minutes ?? null,
    servings: row.servings ?? null,
    imageUrl: row.image ? `/uploads/${row.image}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    avgStars: row.avg_stars ?? null,
    starsCount: row.stars_count || 0,
    likes: row.likes || 0,
    dislikes: row.dislikes || 0,
    shareToken: row.share_token || null,
    myRating: { stars: row.my_stars ?? null, liked: row.my_liked ?? null },
  };
}

function findMeal(userId, id) {
  return toMeal(get(`${MEAL_SELECT} WHERE m.id = ? AND m.user_id = ?`, [userId, id, userId]));
}

function assertCategory(category) {
  return category == null || category === '' || category === 'all' || CATEGORIES.includes(category);
}

/* ------------------------------ قائمة الوجبات ------------------------------ */
router.get('/', (req, res) => {
  const { q = '', category = 'all', sort = 'recent' } = req.query;
  const where = ['m.user_id = ?'];
  const params = [req.user.id, req.user.id];

  if (category && category !== 'all') {
    const filter = categoryFilter(String(category));
    where.push(filter.clause);
    params.push(filter.param);
  }
  if (q.trim()) {
    where.push('(m.name LIKE ? OR m.recipe LIKE ? OR m.ingredients LIKE ?)');
    params.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
  }

  const order =
    { name: 'm.name COLLATE NOCASE ASC', rating: 'avg_stars DESC NULLS LAST, m.name ASC' }[sort] ||
    'm.created_at DESC';

  const rows = all(`${MEAL_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}`, params);
  res.json({ meals: rows.map(toMeal), total: rows.length });
});

/* -------------------------------- إضافة وجبة ------------------------------ */
router.post('/', (req, res) => {
  const { name, recipe = '', image = null } = req.body || {};
  if (!String(name || '').trim()) {
    return res.status(400).json({ error: 'VALIDATION', message: 'اسم الوجبة مطلوب' });
  }
  const categories = normalizeCategories(req.body);
  if (!categories) {
    return res.status(400).json({ error: 'VALIDATION', message: 'اختر فئة واحدة على الأقل' });
  }

  let imageName = null;
  if (image) {
    imageName = saveImage(image);
    if (!imageName) return res.status(400).json({ error: 'BAD_IMAGE', message: 'تعذّر حفظ الصورة' });
  }

  const extra = optionalFields(req.body);
  const info = run(
    `INSERT INTO meals
       (user_id, name, category, categories, recipe, description, ingredients, steps, tags,
        prep_minutes, servings, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      String(name).trim(),
      categories[0],
      categories.join(','),
      String(recipe || '').trim(),
      extra.description,
      extra.ingredients,
      extra.steps,
      extra.tags,
      extra.prepMinutes,
      extra.servings,
      imageName,
    ]
  );
  res.status(201).json({ meal: findMeal(req.user.id, Number(info.lastInsertRowid)) });
});

/* --------------------------------- وجبة واحدة ---------------------------- */
router.get('/:id', (req, res) => {
  const meal = findMeal(req.user.id, Number(req.params.id));
  if (!meal) return res.status(404).json({ error: 'NOT_FOUND', message: 'الوجبة غير موجودة' });
  res.json({ meal });
});

/* ---------------------------------- تعديل -------------------------------- */
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = get('SELECT * FROM meals WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!current) return res.status(404).json({ error: 'NOT_FOUND', message: 'الوجبة غير موجودة' });

  const { name, recipe, image, removeImage: dropImage } = req.body || {};
  const fields = [];
  const values = [];

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'VALIDATION', message: 'اسم الوجبة مطلوب' });
    fields.push('name = ?');
    values.push(String(name).trim());
  }
  if (req.body?.categories !== undefined || req.body?.category !== undefined) {
    const categories = normalizeCategories(req.body);
    if (!categories) {
      return res.status(400).json({ error: 'VALIDATION', message: 'اختر فئة واحدة على الأقل' });
    }
    fields.push('category = ?', 'categories = ?');
    values.push(categories[0], categories.join(','));
  }
  if (recipe !== undefined) {
    fields.push('recipe = ?');
    values.push(String(recipe).trim());
  }
  if (['description', 'ingredients', 'steps', 'tags', 'prepMinutes', 'servings'].some((key) => req.body?.[key] !== undefined)) {
    const extra = optionalFields({
      description: req.body.description ?? current.description,
      ingredients: req.body.ingredients ?? current.ingredients,
      steps: req.body.steps ?? current.steps,
      tags: req.body.tags ?? current.tags,
      prepMinutes: req.body.prepMinutes ?? current.prep_minutes,
      servings: req.body.servings ?? current.servings,
    });
    fields.push('description = ?', 'ingredients = ?', 'steps = ?', 'tags = ?', 'prep_minutes = ?', 'servings = ?');
    values.push(extra.description, extra.ingredients, extra.steps, extra.tags, extra.prepMinutes, extra.servings);
  }
  if (dropImage === true) {
    removeImage(current.image);
    fields.push('image = ?');
    values.push(null);
  } else if (image) {
    const imageName = saveImage(image);
    if (!imageName) return res.status(400).json({ error: 'BAD_IMAGE', message: 'تعذّر حفظ الصورة' });
    removeImage(current.image);
    fields.push('image = ?');
    values.push(imageName);
  }

  if (!fields.length) return res.status(400).json({ error: 'NOTHING_TO_UPDATE', message: 'لا توجد بيانات للتحديث' });
  fields.push("updated_at = datetime('now')");
  values.push(id, req.user.id);
  run(`UPDATE meals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  res.json({ meal: findMeal(req.user.id, id) });
});

/* ---------------------------------- حذف ---------------------------------- */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const meal = get('SELECT * FROM meals WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!meal) return res.status(404).json({ error: 'NOT_FOUND', message: 'الوجبة غير موجودة' });
  run('DELETE FROM meals WHERE id = ? AND user_id = ?', [id, req.user.id]);
  removeImage(meal.image);
  res.json({ ok: true });
});

/* --------------------------------- التقييم ------------------------------- */
router.post('/:id/rate', (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM meals WHERE id = ? AND user_id = ?', [id, req.user.id])) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'الوجبة غير موجودة' });
  }
  const { stars, liked } = req.body || {};
  if (stars != null && (!Number.isInteger(stars) || stars < 1 || stars > 5)) {
    return res.status(400).json({ error: 'VALIDATION', message: 'التقييم يجب أن يكون من 1 إلى 5' });
  }
  if (liked != null && ![1, -1, 0].includes(liked)) {
    return res.status(400).json({ error: 'VALIDATION', message: 'قيمة الإعجاب غير صحيحة' });
  }

  const existing = get('SELECT * FROM ratings WHERE meal_id = ? AND user_id = ?', [id, req.user.id]);
  const nextStars = stars === undefined ? (existing?.stars ?? null) : stars;
  const nextLiked = liked === undefined ? (existing?.liked ?? null) : liked === 0 ? null : liked;

  run(
    `INSERT INTO ratings (meal_id, user_id, stars, liked) VALUES (?, ?, ?, ?)
     ON CONFLICT(meal_id, user_id) DO UPDATE SET stars = excluded.stars, liked = excluded.liked,
       updated_at = datetime('now')`,
    [id, req.user.id, nextStars, nextLiked]
  );
  res.json({ meal: findMeal(req.user.id, id) });
});

/* -------------------------------- المشاركة ------------------------------- */
router.post('/:id/share', (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM meals WHERE id = ? AND user_id = ?', [id, req.user.id])) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'الوجبة غير موجودة' });
  }
  let share = get('SELECT * FROM shares WHERE meal_id = ?', [id]);
  if (!share) {
    const token = crypto.randomBytes(9).toString('base64url');
    run('INSERT INTO shares (meal_id, token) VALUES (?, ?)', [id, token]);
    share = get('SELECT * FROM shares WHERE meal_id = ?', [id]);
  }
  res.json({ token: share.token, path: `/s/${share.token}` });
});

router.delete('/:id/share', (req, res) => {
  run('DELETE FROM shares WHERE meal_id = ? AND meal_id IN (SELECT id FROM meals WHERE id = ? AND user_id = ?)', [
    Number(req.params.id),
    Number(req.params.id),
    req.user.id,
  ]);
  res.json({ ok: true });
});

/* ---------------------------- الإحصاءات والسجل --------------------------- */
router.get('/meta/stats', (req, res) => {
  const userId = req.user.id;
  const categoryRows = all('SELECT category, categories FROM meals WHERE user_id = ?', [userId]);
  const byCategory = CATEGORIES.map((key) => ({
    category: key,
    count: categoryRows.filter((row) => parseCategories(row).includes(key)).length,
  }));
  const topRated = all(
    `${MEAL_SELECT} WHERE m.user_id = ? AND avg_stars IS NOT NULL ORDER BY avg_stars DESC, stars_count DESC LIMIT 5`,
    [userId, userId]
  );
  const suggestions = get(
    'SELECT COUNT(*) AS total, SUM(outcome = \'accepted\') AS accepted FROM suggestions WHERE user_id = ?',
    [userId]
  );
  const recent = all(
    `SELECT s.created_at, s.outcome, m.name, m.category
     FROM suggestions s LEFT JOIN meals m ON m.id = s.meal_id
     WHERE s.user_id = ? ORDER BY s.id DESC LIMIT 10`,
    [userId]
  );
  const alarms = get('SELECT COUNT(*) AS total, SUM(enabled = 1) AS active FROM alarms WHERE user_id = ?', [userId]);

  res.json({
    totals: {
      meals: get('SELECT COUNT(*) AS n FROM meals WHERE user_id = ?', [userId]).n,
      suggestions: suggestions.total || 0,
      accepted: suggestions.accepted || 0,
      alarms: alarms.total || 0,
      activeAlarms: alarms.active || 0,
    },
    byCategory: CATEGORIES.reduce(
      (acc, c) => ({ ...acc, [c]: byCategory.find((r) => r.category === c)?.count || 0 }),
      {}
    ),
    topRated: topRated.map(toMeal),
    recentSuggestions: recent,
  });
});

module.exports = { router, toMeal, MEAL_SELECT, findMeal };
