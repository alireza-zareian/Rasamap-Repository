"""
build-pages.py — از متن استخراج‌شدهٔ پاس یکم می‌فهمد هر عنوان روی کدام صفحه است.

pdftotext صفحه‌ها را با کاراکتر form-feed جدا می‌کند، پس شمردن آن‌ها شمارهٔ
صفحهٔ فیزیکی می‌دهد. شمارهٔ چاپی با آن یکی نیست: پیش‌متن (عنوان، چکیده،
فهرست‌ها) شماره‌گذاری عربی ندارد و صفحهٔ ۱ از فصل یکم شروع می‌شود، پس مبدأ را
از جای نشانهٔ «ch1» به دست می‌آوریم.
"""
import sys, re, json, io

txt = io.open(sys.argv[1], encoding="utf-8", errors="replace").read()
pages = txt.split("\f")
# pdftotext بعد از هر صفحه یک form-feed می‌گذارد، پس تکهٔ آخر همیشه خالی است
if pages and not pages[-1].strip():
    pages.pop()

# نشانه‌ها به شکل PGM<id>PGM چاپ شده‌اند. pdftotext ممکن است وسطشان فاصله یا
# شکست خط بگذارد، پس پیش از جست‌وجو فضای خالی حذف می‌شود.
found = {}
for i, page in enumerate(pages, start=1):
    for m in re.finditer(r"PGM\s*([A-Za-z0-9_]+?)\s*PGM", re.sub(r"[ \t]+", " ", page)):
        found.setdefault(m.group(1), i)

if "ch1" not in found:
    print("!! نشانهٔ ch1 پیدا نشد — فهرست‌ها بدون شمارهٔ صفحه ساخته می‌شوند", file=sys.stderr)
    json.dump({"pages": {}, "offset": 0, "total": len(pages)},
              open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
    sys.exit(0)

offset = found["ch1"] - 1              # صفحهٔ فیزیکی که پیش از صفحهٔ چاپیِ ۱ است
printed = {k: v - offset for k, v in found.items() if v - offset >= 1}

json.dump({"pages": printed, "offset": offset, "total": len(pages)},
          open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
print(f"   {len(printed)} عنوان روی {len(pages)} صفحه · مبدأ متن: صفحهٔ فیزیکی {offset + 1}")
