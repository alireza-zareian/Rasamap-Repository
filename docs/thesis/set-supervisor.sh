#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# نام استاد راهنما را در هر چهار جایی که ظاهر می‌شود می‌گذارد و خروجی‌های
# PDF را دوباره می‌سازد. جای نام در چند فایل است، پس دستی عوض کردنش یعنی
# احتمالِ جا انداختن یکی از آن‌ها.
#
#   ./set-supervisor.sh "دکتر نام خانوادگی"  ["Dr. Family Name"]
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

[[ $# -ge 1 ]] || { echo "کاربرد: $0 \"نام فارسی\" [\"English Name\"]"; exit 1; }
FA="$1"
EN="${2:-$1}"

python3 - "$FA" "$EN" <<'PY'
import io, sys
fa, en = sys.argv[1], sys.argv[2]
targets = {
    "thesis.html":            [('supervisor:    "«نام استاد راهنما»"',    f'supervisor:    "{fa}"'),
                               ('supervisor_en: "«Supervisor Name»"',      f'supervisor_en: "{en}"')],
    "poster-template.html":   [("«نام استاد راهنما»", fa)],
    "../defense-slides.html": [("«نام استاد راهنما»", fa)],
}
for path, subs in targets.items():
    s = io.open(path, encoding="utf-8").read()
    hits = 0
    for old, new in subs:
        hits += s.count(old)
        s = s.replace(old, new)
    io.open(path, "w", encoding="utf-8").write(s)
    print(f"  {hits} مورد در {path}")
PY

echo "▸ ساخت دوبارهٔ پایان‌نامه"
./build-pdf.sh >/dev/null
echo "▸ ساخت دوبارهٔ پوستر"
python3 build-poster.py >/dev/null
python3 -m http.server 8899 --directory .. >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=25000 --run-all-compositor-stages-before-draw \
  --print-to-pdf=poster.pdf "http://127.0.0.1:8899/thesis/poster.html" >/dev/null 2>&1

echo "✓ thesis.pdf و poster.pdf با نام «$FA» بازسازی شدند"
