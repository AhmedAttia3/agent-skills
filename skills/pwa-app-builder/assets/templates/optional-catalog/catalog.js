'use strict';
/** مسارات الكتالوج العام: قراءة للجميع، وإضافة الطبق إلى قائمة المستخدم تتطلب جلسة. */
const express = require('express');
const { run, get } = require('../db');
const { requireAuth } = require('../auth');
const { listTags, listCatalog, getCatalogMeal, randomCatalogMeal } = require('../catalog');
const { findMeal } = require('./meals');
const { copyCatalogImage } = require('../images');

const router = express.Router();

/* ------------------------------- التصنيفات -------------------------------- */
router.get('/tags', (_req, res) => {
  res.json({ tags: listTags() });
});

/* -------------------------- اقتراح عشوائي من الكتالوج --------------------- */
router.get('/random', (req, res) => {
  const meal = randomCatalogMeal(String(req.query.category || 'all'));
  if (!meal) return res.status(404).json({ error: 'NOT_FOUND', message: 'الكتالوج فارغ' });
  res.json({ meal: { ...meal, tags: undefined, imageCredit: undefined, imageLicense: undefined, imageSource: undefined } });
});

/* -------------------------------- التصفح --------------------------------- */
router.get('/', (req, res) => {
  const { q = '', tag = '', category = 'all', sort = 'recent', seed = 0, limit = 60, offset = 0 } = req.query;
  const { meals, total } = listCatalog({ q, tag, category, sort, seed, limit, offset });
  res.json({ meals, total });
});

/* ------------------------------ طبق واحد --------------------------------- */
router.get('/:slug', (req, res) => {
  const meal = getCatalogMeal(req.params.slug);
  if (!meal) return res.status(404).json({ error: 'NOT_FOUND', message: 'الطبق غير موجود' });
  res.json({ meal });
});

/**
 * إضافة طبق من الكتالوج إلى قائمة المستخدم.
 *  - تُنسخ الصورة والوصفة كاملة (مكوّنات + خطوات + تصنيفات + زمن التحضير) لتصبح ملك المستخدم.
 *  - إن كانت هناك وجبة بنفس الاسم: نُعيدها مع `canUpdate: true`، فيمكن تحديثها بالكامل
 *    بإعادة الطلب مع `updateId` (بدل ترك نسخة ناقصة).
 */
router.post('/:slug/add', requireAuth, (req, res) => {
  const meal = getCatalogMeal(req.params.slug);
  if (!meal) return res.status(404).json({ error: 'NOT_FOUND', message: 'الطبق غير موجود' });

  const updateId = Number(req.body?.updateId) || 0;
  const content = {
    recipe: [
      meal.shortDesc,
      meal.imageSource
        ? `صورة الوصفة: ${meal.imageCredit || 'مصدر حر'} — ${meal.imageLicense} — ${meal.imageSource}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    description: meal.shortDesc,
    ingredients: meal.ingredients.join('\n'),
    steps: meal.steps.join('\n'),
    tags: meal.tags.join(','),
    prepMinutes: meal.prepMinutes,
    servings: meal.servings,
  };
  const imageName = copyCatalogImage(meal.imageUrl ? meal.imageUrl.split('/').pop() : null);

  // تحديث وجبة موجودة بمحتوى الكتالوج الكامل
  if (updateId) {
    const target = get('SELECT id, image FROM meals WHERE id = ? AND user_id = ?', [updateId, req.user.id]);
    if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'الوجبة غير موجودة' });
    run(
      `UPDATE meals SET recipe = ?, description = ?, ingredients = ?, steps = ?, tags = ?,
         prep_minutes = ?, servings = ?, image = COALESCE(?, image), updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [
        content.recipe,
        content.description,
        content.ingredients,
        content.steps,
        content.tags,
        content.prepMinutes,
        content.servings,
        imageName,
        updateId,
        req.user.id,
      ]
    );
    return res.json({ meal: findMeal(req.user.id, updateId), duplicate: false, updated: true });
  }

  const existing = get('SELECT id FROM meals WHERE user_id = ? AND name = ?', [req.user.id, meal.name]);
  if (existing) {
    return res.json({
      meal: findMeal(req.user.id, existing.id),
      duplicate: true,
      canUpdate: true,
      updateId: existing.id,
    });
  }

  const categories = meal.mealTimes.filter((time) => ['breakfast', 'lunch', 'dinner', 'snack'].includes(time));
  const primary = categories[0] || 'lunch';
  const info = run(
    `INSERT INTO meals
       (user_id, name, category, categories, recipe, description, ingredients, steps, tags,
        prep_minutes, servings, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      meal.name,
      primary,
      categories.join(',') || primary,
      content.recipe,
      content.description,
      content.ingredients,
      content.steps,
      content.tags,
      content.prepMinutes,
      content.servings,
      imageName,
    ]
  );
  res.status(201).json({ meal: findMeal(req.user.id, Number(info.lastInsertRowid)), duplicate: false });
});

module.exports = { router };
