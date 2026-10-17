#!/usr/bin/env node
'use strict';
/**
 * مزامنة كتالوج الوصفات من ملفات data/catalog/*.json إلى قاعدة البيانات.
 *
 *   node scripts/catalog-sync.js            # مزامنة كاملة
 *   node scripts/catalog-sync.js --dry      # عرض ما سيحدث دون تعديل
 *
 * القواعد:
 *  - المفتاح الثابت للتحديث هو `slug` (إضافة/تعديل تلقائي بلا تكرار).
 *  - أي طبق موجود في القاعدة ولم يعد موجوداً في الملفات → يُعطَّل (is_active=0) لا يُحذف.
 *  - الصور لا تُمسّ هنا (انظر scripts/catalog-images.js).
 */
const fs = require('fs');
const path = require('path');
const { all, get, run } = require('../server/db');
const { CATALOG_DIR } = require('../server/config');
const { CATEGORIES } = require('../server/config');

const DRY = process.argv.includes('--dry');
const MEAL_TIMES = ['breakfast', 'lunch', 'dinner', 'snack'];

/** يقرأ كل ملفات الكتالوج (tags.json + ملفات الدفعات). */
function readCatalogFiles() {
  if (!fs.existsSync(CATALOG_DIR)) return { tags: [], meals: [] };
  const files = fs.readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json')).sort();
  const tags = [];
  const meals = [];
  for (const file of files) {
    const full = path.join(CATALOG_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      throw new Error(`ملف غير صالح JSON: ${file} — ${err.message}`);
    }
    if (Array.isArray(data.tags)) {
      tags.push(...data.tags.map((t) => ({ ...t, __file: file })));
    }
    if (Array.isArray(data.meals)) {
      const region = data.region || '';
      meals.push(...data.meals.map((m) => ({ ...m, region: m.region || region, __file: file })));
    }
  }
  return { tags, meals };
}

/** التحقق من صحة طبق قبل إدخاله. */
function validateMeal(meal, tagsBySlug, seenSlugs) {
  const errors = [];
  if (!meal.slug || !/^[a-z0-9-]+$/.test(meal.slug)) errors.push('slug غير صالح (حروف إنجليزية صغيرة وأرقام و-)');
  if (seenSlugs.has(meal.slug)) errors.push(`slug مكرر: ${meal.slug}`);
  if (!meal.nameAr) errors.push('nameAr مطلوب');
  if (!Array.isArray(meal.mealTimes) || !meal.mealTimes.length) errors.push('mealTimes مطلوب');
  for (const time of meal.mealTimes || []) {
    if (!MEAL_TIMES.includes(time)) errors.push(`وقت وجبة غير معروف: ${time}`);
  }
  if (!Array.isArray(meal.tags) || !meal.tags.length) errors.push('tags مطلوب');
  for (const tag of meal.tags || []) {
    if (!tagsBySlug.has(tag)) errors.push(`تصنيف غير معرّف: ${tag} (أضفه إلى tags.json)`);
  }
  if (!Array.isArray(meal.ingredients) || meal.ingredients.length < 3) errors.push('المكوّنات مطلوبة (3 على الأقل)');
  if (!Array.isArray(meal.steps) || meal.steps.length < 3) errors.push('الخطوات مطلوبة (3 على الأقل)');
  if (errors.length) throw new Error(`الطبق "${meal.slug || meal.nameAr || '؟'}" في ${meal.__file}:\n   - ${errors.join('\n   - ')}`);
}

function main() {
  const { tags, meals } = readCatalogFiles();
  const tagsBySlug = new Map(tags.map((t) => [t.slug, t]));
  const seenSlugs = new Set();

  for (const meal of meals) {
    validateMeal(meal, tagsBySlug, seenSlugs);
    seenSlugs.add(meal.slug);
  }

  // إسناد الصور من data/catalog/images.json (يولّده catalog-images.js)
  let imagesIndex = {};
  const imagesFile = path.join(CATALOG_DIR, 'images.json');
  if (fs.existsSync(imagesFile)) {
    try {
      imagesIndex = JSON.parse(fs.readFileSync(imagesFile, 'utf8')).images || {};
    } catch {
      throw new Error('ملف data/catalog/images.json غير صالح');
    }
  }

  let added = 0;
  let updated = 0;
  let disabled = 0;
  let tagsSynced = 0;

  if (!DRY) run('BEGIN');

  /* 1) التصنيفات */
  for (const tag of tags) {
    const existing = get('SELECT slug FROM catalog_tags WHERE slug = ?', [tag.slug]);
    run(
      `INSERT INTO catalog_tags (slug, name_ar, name_en, emoji, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(slug) DO UPDATE SET
         name_ar = excluded.name_ar, name_en = excluded.name_en,
         emoji = excluded.emoji, sort_order = excluded.sort_order, is_active = 1`,
      [tag.slug, tag.nameAr || tag.slug, tag.nameEn || '', tag.emoji || '🍽️', Number(tag.sortOrder) || 0]
    );
    if (!existing) tagsSynced += 1;
  }
  const tagSlugs = tags.map((t) => t.slug);
  if (tagSlugs.length) {
    run(
      `UPDATE catalog_tags SET is_active = 0 WHERE slug NOT IN (${tagSlugs.map(() => '?').join(',')})`,
      tagSlugs
    );
  }

  /* 2) الأطباق */
  let order = 0;
  for (const meal of meals) {
    order += 10;
    const values = [
      meal.slug,
      meal.nameAr,
      meal.nameEn || '',
      (meal.aliases || []).join(','),
      meal.shortDesc || '',
      (meal.ingredients || []).join('\n'),
      (meal.steps || []).join('\n'),
      (meal.mealTimes || []).join(','),
      (meal.tags || []).join(','),
      meal.region || '',
      Number(meal.prepMinutes) || null,
      Number(meal.servings) || null,
      meal.emoji || '🍽️',
      meal.imageQuery || '',
      order,
    ];
    const exists = get('SELECT id FROM catalog_meals WHERE slug = ?', [meal.slug]);
    const image = imagesIndex[meal.slug] || {};
    run(
      `INSERT INTO catalog_meals
         (slug, name_ar, name_en, aliases, short_desc, ingredients, steps, meal_times, tags,
          region, prep_minutes, servings, emoji, image_query, sort_order,
          image_file, image_credit, image_license, image_source, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(slug) DO UPDATE SET
         name_ar = excluded.name_ar, name_en = excluded.name_en, aliases = excluded.aliases,
         short_desc = excluded.short_desc, ingredients = excluded.ingredients, steps = excluded.steps,
         meal_times = excluded.meal_times, tags = excluded.tags, region = excluded.region,
         prep_minutes = excluded.prep_minutes, servings = excluded.servings, emoji = excluded.emoji,
         image_query = excluded.image_query, sort_order = excluded.sort_order,
         image_file = COALESCE(excluded.image_file, catalog_meals.image_file),
         image_credit = COALESCE(NULLIF(excluded.image_credit, ''), catalog_meals.image_credit),
         image_license = COALESCE(NULLIF(excluded.image_license, ''), catalog_meals.image_license),
         image_source = COALESCE(NULLIF(excluded.image_source, ''), catalog_meals.image_source),
         is_active = 1, updated_at = datetime('now')`,
      [...values, image.file || null, image.credit || '', image.license || '', image.source || '']
    );
    if (exists) updated += 1;
    else added += 1;
  }

  /* 3) تعطيل ما أُزيل من الملفات */
  const activeSlugs = meals.map((m) => m.slug);
  const stale = all(
    activeSlugs.length
      ? `SELECT slug FROM catalog_meals WHERE is_active = 1 AND slug NOT IN (${activeSlugs.map(() => '?').join(',')})`
      : 'SELECT slug FROM catalog_meals WHERE is_active = 1',
    activeSlugs
  );
  for (const row of stale) {
    run("UPDATE catalog_meals SET is_active = 0, updated_at = datetime('now') WHERE slug = ?", [row.slug]);
    disabled += 1;
  }

  if (!DRY) run('COMMIT');

  const total = get('SELECT COUNT(*) AS n FROM catalog_meals WHERE is_active = 1').n;
  console.log(`${DRY ? '🔍 تجربة (بلا تعديل)' : '✅ تمت المزامنة'}`);
  console.log(`   أطباق: +${added} جديد، ${updated} محدّث، ${disabled} معطّل — الإجمالي النشط: ${total}`);
  console.log(`   تصنيفات: ${tags.length} (${tagsSynced} جديد)`);
  if (disabled) console.log('   ℹ️  المعطّل لا يُحذف: يبقى محفوظاً ويمكن إعادته بإرجاع الطبق إلى ملفات JSON.');
}

try {
  main();
} catch (err) {
  console.error('❌ فشلت المزامنة:\n' + err.message);
  process.exit(1);
}
