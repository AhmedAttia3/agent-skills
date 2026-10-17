'use strict';
/**
 * إدارة فئات الوجبة: الوجبة قد تنتمي لأكثر من فئة (مثال: فطور + عشاء).
 * تُخزَّن كل الفئات في عمود `categories` كـCSV، وتبقى `category` هي الفئة الأساسية (الأولى).
 */
const { CATEGORIES } = require('./config');

/** يحوّل صف قاعدة البيانات إلى مصفوفة فئات صالحة. */
function parseCategories(row) {
  if (!row) return [];
  const raw = row.categories ? String(row.categories) : '';
  const list = raw ? raw.split(',') : [row.category].filter(Boolean);
  return [...new Set(list.map((c) => c.trim()).filter((c) => CATEGORIES.includes(c)))];
}

/**
 * يتحقق من مدخلات المستخدم ويعيد مصفوفة فئات نظيفة.
 * يقبل `categories: []` (المفضّل) أو `category: 'lunch'` (توافق قديم).
 * يعيد null إذا كانت غير صالحة أو فارغة.
 */
function normalizeCategories(input) {
  const raw = Array.isArray(input?.categories)
    ? input.categories
    : typeof input?.categories === 'string'
      ? input.categories.split(',')
      : input?.category
        ? [input.category]
        : null;
  if (!raw) return null;
  const list = [...new Set(raw.map((c) => String(c).trim()).filter((c) => CATEGORIES.includes(c)))];
  return list.length ? list : null;
}

/** شرط SQL لتصفية وجبة تنتمي لفئة معيّنة (بحث آمن داخل CSV). */
function categoryFilter(category, column = 'm.categories') {
  return { clause: `(',' || ${column} || ',') LIKE ?`, param: `%,${category},%` };
}

module.exports = { parseCategories, normalizeCategories, categoryFilter };
