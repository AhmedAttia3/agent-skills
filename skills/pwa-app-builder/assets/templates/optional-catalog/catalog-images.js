#!/usr/bin/env node
'use strict';
/**
 * جلب صور الأطباق من ويكيميديا كومنز (رخص حرة فقط) وتخزينها محلياً مع الإسناد.
 *
 *   node scripts/catalog-images.js                # يجلب الصور الناقصة فقط
 *   node scripts/catalog-images.js --force        # يعيد جلب كل الصور
 *   node scripts/catalog-images.js --only=koshari
 *
 * لكل طبق:
 *  1) يبحث في كومنز بكلمات image_query،
 *  2) يستبعد كل رخصة غير حرة، ويرجّح: Public Domain/CC0 ← CC BY ← CC BY-SA، والدقة الأعلى،
 *     وتطابق اسم الملف مع اسم الطبق،
 *  3) ينزّل نسخة مصغّرة جاهزة (960px) إلى data/catalog-images/<slug>.jpg
 *     (لا نحتاج مكتبة معالجة صور: ويكيميديا تولّد المصغّرة بنفسها)،
 *  4) يخزّن المصوّر + الرخصة + رابط المصدر في جدول catalog_meals.
 */
const fs = require('fs');
const path = require('path');
const { all, get, run } = require('../server/db');
const { CATALOG_DIR, CATALOG_IMAGES_DIR } = require('../server/config');

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = '{{APP_NAME_EN}}CatalogBot/1.0 (local recipe catalog; respects CC licenses)';
const THUMB_WIDTH = 960;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0;

/** تثبيت صورة معيّنة من ملفات JSON عبر الحقل imageFile. */
function readPinnedImages() {
  const pins = new Map();
  if (!fs.existsSync(CATALOG_DIR)) return pins;
  for (const file of fs.readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8'));
      for (const meal of data.meals || []) {
        if (meal.imageFile) pins.set(meal.slug, meal.imageFile);
      }
    } catch {
      /* نتجاهل الملفات غير الصالحة — catalog-sync هو من يتحقق منها */
    }
  }
  return pins;
}

/** رتبة الرخصة: الأقل أفضل، و9 = غير مسموح. */
function licenseRank(license) {
  const lic = String(license || '').toLowerCase();
  if (!lic) return 9;
  if (lic.includes('public domain') || lic.includes('cc0')) return 0;
  if (/^cc by[ -]?\d/.test(lic)) return 1;
  if (/^cc by-sa[ -]?\d/.test(lic)) return 2;
  if (lic.includes('cc by-sa')) return 2;
  if (lic.includes('cc by')) return 1;
  return 9;
}

const clean = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function api(params, attempt = 1) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 || res.status >= 500) {
    // ويكيميديا تحدّ من المعدّل: ننتظر ثم نعيد المحاولة
    if (attempt <= 4) {
      const wait = attempt * 5000;
      console.log(`     ⏳ الخدمة مشغولة (${res.status}) — إعادة المحاولة بعد ${wait / 1000} ثانية…`);
      await new Promise((r) => setTimeout(r, wait));
      return api(params, attempt + 1);
    }
    throw new Error(`الخدمة مشغولة (${res.status}) — أعد تشغيل الأمر بعد قليل`);
  }
  if (!res.ok) throw new Error(`فشل الاتصال بويكيميديا (${res.status})`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('رد غير متوقع من ويكيميديا (ربما تقييد مؤقت للمعدّل)');
  }
}

/** يجلب مرشّحي الصور لطبق معيّن. */
async function findCandidates(query, forcedTitle) {
  const params = forcedTitle
    ? { action: 'query', titles: forcedTitle, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: THUMB_WIDTH }
    : {
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: '6',
        gsrlimit: '10',
        prop: 'imageinfo',
        iiprop: 'url|size|extmetadata',
        iiurlwidth: THUMB_WIDTH,
      };
  const data = await api(params);
  const pages = Object.values(data.query?.pages || {});
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  return pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      const title = page.title.replace(/^File:/, '');
      const license = clean(meta.LicenseShortName?.value);
      const rank = licenseRank(license);
      const isImage = /\.(jpe?g|png)$/i.test(title);
      if (!isImage || rank === 9 || (info.width || 0) < 600) return null;
      const lower = title.toLowerCase();
      const nameMatch = tokens.some((t) => lower.includes(t)) ? 2 : 0;
      const bigBonus = (info.width || 0) >= 1500 ? 1 : 0;
      return {
        title,
        thumb: (info.thumburl || info.url || '').split('?')[0],
        page: info.descriptionurl || '',
        width: info.width,
        height: info.height,
        license,
        credit: clean(meta.Artist?.value).slice(0, 80) || clean(meta.Credit?.value).slice(0, 80) || 'غير معروف',
        score: rank - nameMatch - bigBonus,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || b.width - a.width);
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`فشل تنزيل الصورة (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1024) throw new Error('الصورة صغيرة جداً أو غير صالحة');
  fs.writeFileSync(dest, buffer);
  return buffer.length;
}

async function main() {
  const pins = readPinnedImages();
  const where = ["is_active = 1", "image_query <> ''"];
  const params = [ONLY];
  let sql = 'SELECT slug, name_ar, image_query, image_file FROM catalog_meals WHERE is_active = 1';
  if (ONLY) sql += ' AND slug = ?';
  sql += ' ORDER BY sort_order, id';
  let meals = all(sql, ONLY ? [ONLY] : []);
  if (!FORCE) meals = meals.filter((m) => !m.image_file);
  if (LIMIT) meals = meals.slice(0, LIMIT);

  if (!meals.length) {
    console.log('لا توجد أطباق تحتاج صوراً (استخدم --force لإعادة الجلب).');
    return;
  }

  fs.mkdirSync(CATALOG_IMAGES_DIR, { recursive: true });
  // ملف الإسناد: مصدر الحقيقة لأسماء الصور ورخصها (يُطبَّقه catalog-sync على أي قاعدة).
  const imagesFile = path.join(CATALOG_DIR, 'images.json');
  let imagesIndex = {};
  if (fs.existsSync(imagesFile)) {
    try {
      imagesIndex = JSON.parse(fs.readFileSync(imagesFile, 'utf8')).images || {};
    } catch {
      imagesIndex = {};
    }
  }
  console.log(`🖼️  جلب صور ${meals.length} طبقاً من ويكيميديا كومنز…\n`);
  let ok = 0;
  let failed = 0;

  for (const meal of meals) {
    const query = pins.get(meal.slug) || meal.image_query;
    try {
      const candidates = await findCandidates(meal.image_query, pins.get(meal.slug));
      if (!candidates.length) {
        console.log(`  ⚠️  ${meal.name_ar} (${meal.slug}): لا توجد صورة برخصة حرة — سيُستخدم الإيموجي.`);
        failed += 1;
        continue;
      }
      const best = candidates[0];
      const dest = path.join(CATALOG_IMAGES_DIR, `${meal.slug}.jpg`);
      const bytes = await download(best.thumb, dest);
      imagesIndex[meal.slug] = {
        file: `${meal.slug}.jpg`,
        credit: best.credit,
        license: best.license,
        source: best.page,
      };
      run(
        `UPDATE catalog_meals SET image_file = ?, image_credit = ?, image_license = ?, image_source = ?,
           updated_at = datetime('now') WHERE slug = ?`,
        [`${meal.slug}.jpg`, best.credit, best.license, best.page, meal.slug]
      );
      console.log(`  ✅ ${meal.name_ar} → ${best.title}`);
      console.log(`     ${best.width}×${best.height} · ${best.license} · ${best.credit} · ${Math.round(bytes / 1024)}KB`);
      console.log(`     ${best.page}`);
      if (candidates.length > 1) {
        console.log(`     (بدائل: ${candidates.slice(1, 3).map((c) => c.title).join(' | ')})`);
      }
      console.log('');
      ok += 1;
    } catch (err) {
      console.log(`  ❌ ${meal.name_ar} (${meal.slug}): ${err.message}\n`);
      failed += 1;
    }
    await new Promise((r) => setTimeout(r, 1200)); // تهدئة على خدمة ويكيميديا
  }

  fs.writeFileSync(
    imagesFile,
    JSON.stringify(
      { _note: 'إسناد صور الكتالوج (يُطبّقه catalog-sync تلقائياً على القاعدة).', images: imagesIndex },
      null,
      2
    ) + '\n'
  );
  console.log(`النتيجة: ${ok} صورة، ${failed} بلا صورة.`);
  console.log(`حُفظ الإسناد في data/catalog/images.json (${Object.keys(imagesIndex).length} صورة).`);
  console.log('راجع الصور بصرياً، وإن أردت تغيير صورة أضف "imageFile": "File:الاسم.jpg" في ملف JSON ثم أعد --force.');
}

main().catch((err) => {
  console.error('❌ ' + err.message);
  process.exit(1);
});
