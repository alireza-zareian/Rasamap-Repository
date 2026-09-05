#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# build-pdf.sh — HTML را به PDF آمادهٔ تحویل تبدیل می‌کند.
#
# مرورگر نمی‌داند یک عنوان روی کدام صفحه می‌افتد و Chrome هم به margin-box
# های @page شماره نمی‌دهد. پس ساخت سه مرحله دارد:
#
#   ۱  چاپ با نشانه‌های نامرئی → از متن PDF می‌فهمیم هر عنوان کجا افتاده
#   ۲  چاپ دوباره با اعداد تزریق‌شده، تکرار تا نگاشت به نقطهٔ ثابت برسد
#      (افزودن عدد به فهرست، خودش صفحه‌بندی را کمی جابه‌جا می‌کند)
#   ۳  ساخت یک لایهٔ شمارهٔ صفحه و روی‌هم‌گذاری آن با qpdf
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="${1:-thesis.html}"
OUT="${SRC%.html}.pdf"
WORK="$(mktemp -d)"
cleanup(){ rm -rf "$WORK" ./.numbered.html ./.folios.html; [[ -n "${SRV:-}" ]] && kill "$SRV" 2>/dev/null || true; }
trap cleanup EXIT

# فونت و mermaid فایل محلی‌اند و مرورگر روی file:// آن‌ها را بلوکه می‌کند.
python3 -m http.server 8877 --directory .. >/dev/null 2>&1 & SRV=$!
sleep 1
BASE="http://127.0.0.1:8877/thesis"

render(){ "$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
                    --virtual-time-budget=30000 --run-all-compositor-stages-before-draw \
                    --print-to-pdf="$2" "$1" >/dev/null 2>&1; }

echo "▸ پاس ۱ — چاپ با نشانه‌ها"
render "$BASE/$SRC" "$WORK/p1.pdf"
pdftotext -enc UTF-8 "$WORK/p1.pdf" "$WORK/p1.txt"
python3 build-pages.py "$WORK/p1.txt" "$WORK/pages.json"

echo "▸ پاس ۲ — چاپ با شماره‌های واقعی، تا رسیدن به نقطهٔ ثابت"
for round in 1 2 3; do
  python3 build-inject.py "$SRC" "$WORK/pages.json" ./.numbered.html
  render "$BASE/.numbered.html" "$WORK/p2.pdf"
  pdftotext -enc UTF-8 "$WORK/p2.pdf" "$WORK/p2.txt"
  python3 build-pages.py "$WORK/p2.txt" "$WORK/pages2.json" >/dev/null
  if cmp -s "$WORK/pages.json" "$WORK/pages2.json"; then
    echo "   نگاشت در تکرار $round پایدار شد"
    break
  fi
  echo "   صفحه‌بندی جابه‌جا شد — تکرار دوباره"
  mv "$WORK/pages2.json" "$WORK/pages.json"
done

# رندر نهایی بدون نشانه: چون نشانه‌ها بیرون از جریان متن‌اند، صفحه‌بندی
# تغییر نمی‌کند و لایهٔ متن PDF از رشته‌های کمکی پاک می‌ماند.
echo "▸ رندر نهایی بدون نشانه"
python3 build-inject.py "$SRC" "$WORK/pages.json" ./.numbered.html --clean
render "$BASE/.numbered.html" "$WORK/clean.pdf"
if [[ "$(qpdf --show-npages "$WORK/clean.pdf")" != "$(qpdf --show-npages "$WORK/p2.pdf")" ]]; then
  echo "   !! تعداد صفحه فرق کرد — نسخهٔ با نشانه استفاده می‌شود"
  cp "$WORK/p2.pdf" "$WORK/clean.pdf"
fi

echo "▸ پاس ۳ — لایهٔ شمارهٔ صفحه"
python3 build-folios.py "$WORK/pages.json" ./.folios.html
render "$BASE/.folios.html" "$WORK/folios.pdf"

qpdf "$WORK/clean.pdf" --overlay "$WORK/folios.pdf" -- "$OUT"
echo "✓ $OUT — $(qpdf --show-npages "$OUT") صفحه"
