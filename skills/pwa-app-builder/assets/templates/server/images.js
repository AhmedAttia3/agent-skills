'use strict';
/** حفظ/حذف صور الوجبات على القرص داخل data/uploads */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR, MAX_IMAGE_BYTES, CATALOG_IMAGES_DIR } = require('./config');

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * يحفظ صورة قادمة كـ data URL ويُرجع اسم الملف، أو null إذا لم تكن صالحة.
 * المتصفح يصغّر الصورة مسبقاً (Canvas) لذا الحجم صغير.
 */
function saveImage(dataUrl, prefix = 'meal') {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  const ext = EXT_BY_MIME[mime.toLowerCase()];
  if (!ext) return null;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return filename;
}

/** يحذف صورة من القرص (يتجاهل الأخطاء). */
function removeImage(filename) {
  if (!filename) return;
  const target = path.join(UPLOADS_DIR, path.basename(filename));
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    /* ignore */
  }
}

/** ينسخ صورة موجودة (عند استيراد وجبة مشاركة) حتى لا تعتمد على صورة المستخدم الأصلي. */
function copyImage(filename) {
  if (!filename) return null;
  const source = path.join(UPLOADS_DIR, path.basename(filename));
  if (!fs.existsSync(source)) return null;
  const ext = path.extname(source).slice(1).toLowerCase() || 'jpg';
  const name = `meal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  try {
    fs.copyFileSync(source, path.join(UPLOADS_DIR, name));
    return name;
  } catch {
    return null;
  }
}

/** ينسخ صورة طبق من كتالوجنا إلى صور المستخدم (تصبح نسخته الخاصة). */
function copyCatalogImage(filename) {
  if (!filename) return null;
  const source = path.join(CATALOG_IMAGES_DIR, path.basename(filename));
  if (!fs.existsSync(source)) return null;
  const name = `meal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
  try {
    fs.copyFileSync(source, path.join(UPLOADS_DIR, name));
    return name;
  } catch {
    return null;
  }
}

module.exports = { saveImage, removeImage, copyImage, copyCatalogImage };
