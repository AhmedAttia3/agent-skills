'use strict';
/**
 * الاقتراح العشوائي: اختيار وجبة عشوائية فعلياً من قاعدة البيانات (ORDER BY RANDOM())
 * مع إمكانية استثناء آخر وجبة مقترحة، وتسجيل كل اقتراح في السجل للإحصاءات.
 */
const express = require('express');
const { all, get, run } = require('../db');
const { requireAuth } = require('../auth');
const { CATEGORIES } = require('../config');
const { findMeal } = require('./meals');
const { categoryFilter } = require('../categories');

const router = express.Router();

/** POST /api/suggest  { category?: 'all'|'breakfast'|..., excludeLast?: boolean } */
router.post('/suggest', requireAuth, (req, res) => {
  const { category = 'all', excludeLast = true } = req.body || {};
  if (category !== 'all' && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'VALIDATION', message: 'الفئة غير صحيحة' });
  }

  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (category !== 'all') {
    const filter = categoryFilter(category, 'categories');
    where.push(filter.clause);
    params.push(filter.param);
  }

  let candidates = all(`SELECT id FROM meals WHERE ${where.join(' AND ')}`, params);

  if (candidates.length > 1 && excludeLast) {
    const last = get(
      'SELECT meal_id FROM suggestions WHERE user_id = ? AND meal_id IS NOT NULL ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    if (last?.meal_id) {
      const filtered = candidates.filter((c) => c.id !== last.meal_id);
      if (filtered.length) candidates = filtered;
    }
  }

  if (!candidates.length) {
    return res.status(404).json({
      error: 'NO_MEALS',
      message: category === 'all' ? 'لا توجد وجبات بعد — أضف وجبة أولاً' : 'لا توجد وجبات في هذه الفئة',
    });
  }

  // اختيار عشوائي حقيقي (Fisher–Yates) من قائمة المرشحين
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  run('INSERT INTO suggestions (user_id, meal_id, category) VALUES (?, ?, ?)', [
    req.user.id,
    picked.id,
    category === 'all' ? null : category,
  ]);

  const meal = findMeal(req.user.id, picked.id);
  res.json({ meal, candidates: candidates.length });
});

/** POST /api/suggest/outcome  { mealId, outcome: 'shown'|'accepted' } */
router.post('/suggest/outcome', requireAuth, (req, res) => {
  const { mealId, outcome = 'accepted' } = req.body || {};
  if (!['shown', 'accepted'].includes(outcome)) {
    return res.status(400).json({ error: 'VALIDATION' });
  }
  const last = get('SELECT id FROM suggestions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [req.user.id]);
  if (last) run('UPDATE suggestions SET outcome = ? WHERE id = ?', [outcome, last.id]);
  if (mealId) {
    const meal = findMeal(req.user.id, Number(mealId));
    if (meal) return res.json({ meal });
  }
  res.json({ ok: true });
});

/** GET /api/meals/meta/stats تُخدم من مسار الوجبات، هذا مسار مقترح للتوافق فقط. */

module.exports = router;
