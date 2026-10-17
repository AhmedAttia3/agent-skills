#!/usr/bin/env bash
# نسخة احتياطية من قاعدة البيانات والصور (بلا أي تعديل على البيانات الأصلية).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="data/backups/$STAMP"
mkdir -p "$DEST"
for f in {{APP_SLUG}}.db {{APP_SLUG}}.db-wal {{APP_SLUG}}.db-shm; do
  [ -f "data/$f" ] && cp "data/$f" "$DEST/"
done
[ -d data/uploads ] && cp -r data/uploads "$DEST/uploads"
[ -d data/catalog-images ] && cp -r data/catalog-images "$DEST/catalog-images"
[ -d data/catalog ] && cp -r data/catalog "$DEST/catalog"
echo "✅ نسخة احتياطية في $DEST"
ls -1 data/backups | tail -3
