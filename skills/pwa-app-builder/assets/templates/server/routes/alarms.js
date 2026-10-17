'use strict';
/** مسارات التنبيهات (تذكيرات الوجبات) */
const express = require('express');
const { all, get, run } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const toAlarm = (row) => ({
  id: row.id,
  mealId: row.meal_id,
  mealName: row.meal_name || null,
  title: row.title,
  time: row.time,
  days: row.days ? row.days.split(',').map(Number) : [],
  tzOffset: row.tz_offset,
  enabled: !!row.enabled,
  lastFired: row.last_fired,
  createdAt: row.created_at,
});

const SELECT_ALARM = `SELECT a.*, m.name AS meal_name FROM alarms a
  LEFT JOIN meals m ON m.id = a.meal_id WHERE a.user_id = ?`;

function validate(body) {
  const { time, days, tzOffset, mealId } = body;
  if (!TIME_RE.test(String(time || ''))) return 'صيغة الوقت غير صحيحة (HH:MM)';
  if (days !== undefined && (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) {
    return 'أيام التكرار غير صحيحة';
  }
  if (tzOffset !== undefined && !Number.isFinite(tzOffset)) return 'فرق التوقيت غير صحيح';
  return null;
}

router.get('/', (req, res) => {
  const rows = all(`${SELECT_ALARM} ORDER BY a.time ASC`, [req.user.id]);
  res.json({ alarms: rows.map(toAlarm) });
});

router.post('/', (req, res) => {
  const { title = '', time, days = [], tzOffset = 0, mealId = null } = req.body || {};
  const error = validate({ time, days, tzOffset });
  if (error) return res.status(400).json({ error: 'VALIDATION', message: error });
  if (mealId && !get('SELECT id FROM meals WHERE id = ? AND user_id = ?', [mealId, req.user.id])) {
    return res.status(400).json({ error: 'VALIDATION', message: 'الوجبة المرتبطة غير موجودة' });
  }
  const info = run(
    'INSERT INTO alarms (user_id, meal_id, title, time, days, tz_offset) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, mealId || null, String(title).trim(), time, days.join(','), Number(tzOffset)]
  );
  res
    .status(201)
    .json({ alarm: toAlarm(get(`${SELECT_ALARM} AND a.id = ?`, [req.user.id, Number(info.lastInsertRowid)])) });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = get('SELECT * FROM alarms WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!current) return res.status(404).json({ error: 'NOT_FOUND', message: 'التنبيه غير موجود' });

  const { title, time, days, tzOffset, enabled, mealId } = req.body || {};
  const error = validate({ time: time ?? current.time, days, tzOffset });
  if (error) return res.status(400).json({ error: 'VALIDATION', message: error });

  const fields = [];
  const values = [];
  if (title !== undefined) {
    fields.push('title = ?');
    values.push(String(title).trim());
  }
  if (time !== undefined) {
    fields.push('time = ?');
    values.push(time);
  }
  if (days !== undefined) {
    fields.push('days = ?');
    values.push(days.join(','));
  }
  if (tzOffset !== undefined) {
    fields.push('tz_offset = ?');
    values.push(Number(tzOffset));
  }
  if (enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }
  if (mealId !== undefined) {
    if (mealId && !get('SELECT id FROM meals WHERE id = ? AND user_id = ?', [mealId, req.user.id])) {
      return res.status(400).json({ error: 'VALIDATION', message: 'الوجبة المرتبطة غير موجودة' });
    }
    fields.push('meal_id = ?');
    values.push(mealId || null);
  }
  if (!fields.length) return res.status(400).json({ error: 'NOTHING_TO_UPDATE' });
  values.push(id, req.user.id);
  run(`UPDATE alarms SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  res.json({ alarm: toAlarm(get(`${SELECT_ALARM} AND a.id = ?`, [req.user.id, id])) });
});

router.delete('/:id', (req, res) => {
  const info = run('DELETE FROM alarms WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  if (!info.changes) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
});

module.exports = { router };
