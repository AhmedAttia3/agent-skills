'use strict';
/** مسارات عامة: عرض وجبة عبر رابط مشاركة + إضافة الوجبة المشاركة إلى قائمة المستخدم */
const express = require('express');
const { get, run } = require('../db');
const { requireAuth } = require('../auth');
const { copyImage } = require('../images');
const { findMeal } = require('./meals');
const { parseCategories } = require('../categories');

const router = express.Router();

const SHARED_MEAL_SELECT = `
  SELECT m.id, m.name, m.category, m.categories, m.recipe, m.description, m.ingredients,
         m.steps, m.tags, m.prep_minutes, m.servings, m.image, m.created_at,
    u.name AS owner_name,
    (SELECT ROUND(AVG(r.stars), 1) FROM ratings r WHERE r.meal_id = m.id AND r.stars IS NOT NULL) AS avg_stars,
    (SELECT COUNT(*) FROM ratings r WHERE r.meal_id = m.id AND r.stars IS NOT NULL) AS stars_count,
    (SELECT COUNT(*) FROM ratings r WHERE r.meal_id = m.id AND r.liked = 1) AS likes
  FROM shares s
  JOIN meals m ON m.id = s.meal_id
  JOIN users u ON u.id = m.user_id
  WHERE s.token = ?
`;

/** عرض عام للوجبة المشاركة (بدون مصادقة). */
router.get('/meal/:token', (req, res) => {
  const row = get(SHARED_MEAL_SELECT, [String(req.params.token)]);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'رابط المشاركة غير صالح' });
  res.json({
    meal: {
      name: row.name,
      category: row.category,
      categories: parseCategories(row),
      recipe: row.recipe || '',
      description: row.description || '',
      ingredients: String(row.ingredients || '').split('\n').filter(Boolean),
      steps: String(row.steps || '').split('\n').filter(Boolean),
      tags: String(row.tags || '').split(',').filter(Boolean),
      prepMinutes: row.prep_minutes ?? null,
      servings: row.servings ?? null,
      imageUrl: row.image ? `/uploads/${row.image}` : null,
      createdAt: row.created_at,
      avgStars: row.avg_stars ?? null,
      starsCount: row.stars_count || 0,
      likes: row.likes || 0,
      ownerName: row.owner_name,
    },
  });
});

/**
 * إضافة الوجبة المشاركة إلى قائمة المستخدم الحالي (زائر أو مسجّل).
 * - إن كانت الوجبة موجودة لديه بنفس الاسم والفئة → تُعاد الموجودة بدون تكرار.
 * - تُنسخ الصورة ليستقل المستخدم بها عن صاحب المشاركة الأصلية.
 */
router.post('/meal/:token/import', requireAuth, (req, res) => {
  const row = get(SHARED_MEAL_SELECT, [String(req.params.token)]);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'رابط المشاركة غير صالح' });

  const categories = parseCategories(row);
  const existing = get('SELECT id FROM meals WHERE user_id = ? AND name = ? AND category = ?', [
    req.user.id,
    row.name,
    categories[0] || row.category,
  ]);
  if (existing) {
    return res.json({ meal: findMeal(req.user.id, existing.id), duplicate: true });
  }

  const info = run(
    `INSERT INTO meals
       (user_id, name, category, categories, recipe, description, ingredients, steps, tags,
        prep_minutes, servings, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      row.name,
      categories[0] || row.category,
      categories.join(','),
      row.recipe || '',
      row.description || '',
      row.ingredients || '',
      row.steps || '',
      row.tags || '',
      row.prep_minutes ?? null,
      row.servings ?? null,
      copyImage(row.image),
    ]
  );
  res.status(201).json({ meal: findMeal(req.user.id, Number(info.lastInsertRowid)), duplicate: false });
});

module.exports = { router };
