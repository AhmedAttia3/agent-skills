'use strict';
/**
 * مُجدوِل التنبيهات: يفحص كل 30 ثانية التنبيهات المستحقة ويرسل Web Push لأصحابها.
 * يعتمد على فرق التوقيت المحفوظ مع كل تنبيه (tz_offset) حتى تُطلق التنبيهات بتوقيت المستخدم.
 */
const { all, run } = require('./db');
const { sendToUser } = require('./routes/push');

const CHECK_INTERVAL_MS = 30 * 1000;

const CATEGORY_LABEL = {
  breakfast: 'فطور',
  lunch: 'غداء',
  dinner: 'عشاء',
  snack: 'وجبة خفيفة',
};

/** الوقت المحلي للمستخدم على شكل أجزاء جاهزة للمقارنة. */
function localParts(tzOffsetMinutes) {
  const shifted = new Date(Date.now() + tzOffsetMinutes * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  return {
    date,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    weekday: shifted.getUTCDay(),
  };
}

function tick() {
  const alarms = all(
    `SELECT a.*, m.name AS meal_name, m.category AS meal_category, m.image AS meal_image
     FROM alarms a LEFT JOIN meals m ON m.id = a.meal_id
     WHERE a.enabled = 1`
  );

  for (const alarm of alarms) {
    const { date, time, weekday } = localParts(alarm.tz_offset || 0);
    if (alarm.time !== time) continue;
    const days = alarm.days ? alarm.days.split(',').filter(Boolean).map(Number) : [];
    if (days.length && !days.includes(weekday)) continue;
    if (alarm.last_fired === `${date} ${time}`) continue; // أُرسل مسبقاً

    const body = alarm.meal_name
      ? `موعد ${CATEGORY_LABEL[alarm.meal_category] || 'وجبة'}: ${alarm.meal_name}`
      : 'حان وقت وجبتك المسجّلة';
    sendToUser(alarm.user_id, {
      title: alarm.title?.trim() || '{{APP_NAME}} 🍽️',
      body,
      url: alarm.meal_id ? `/meals/${alarm.meal_id}` : '/alarms',
      tag: `alarm-${alarm.id}`,
      alarmId: alarm.id,
      // صورة الوجبة (نسبية داخل نطاق التطبيق) — يظهرها أندرويد/كروم، ويتجاهلها iOS
      ...(alarm.meal_image ? { image: `/uploads/${alarm.meal_image}` } : {}),
    }).catch((err) => console.warn('[scheduler] فشل إرسال إشعار:', err?.message || err));
    run('UPDATE alarms SET last_fired = ? WHERE id = ?', [`${date} ${time}`, alarm.id]);
  }
}

function startScheduler() {
  tick();
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = { startScheduler, tick };
