"""
build-folios.py — یک PDF هم‌اندازه می‌سازد که تنها محتوایش شمارهٔ صفحه است.

Chrome به margin-box های @page شماره‌گذاری نمی‌دهد، بنابراین شماره‌ها به‌صورت
یک لایهٔ جدا ساخته و با qpdf روی سند اصلی گذاشته می‌شوند. پیش‌متن با حروف
ابجد شماره می‌خورد (همان روش قالب) و متن اصلی با رقم فارسی.
"""
import sys, json, io

meta   = json.load(open(sys.argv[1], encoding="utf-8"))
total  = meta["total"]
offset = meta["offset"]

FA = "۰۱۲۳۴۵۶۷۸۹"
fa = lambda n: "".join(FA[int(d)] for d in str(n))
ABJAD = ["الف", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط", "ی",
         "یا", "یب", "یج", "ید", "یه", "یو", "یز", "یح", "یط", "ک"]

def label(physical):
    """صفحهٔ اول (عنوان) شماره نمی‌گیرد؛ بقیهٔ پیش‌متن ابجد، متن اصلی رقم."""
    if physical == 1:
        return ""
    if physical <= offset:
        i = physical - 2
        return ABJAD[i] if i < len(ABJAD) else ""
    return fa(physical - offset)

folios = "\n".join(
    f'<div class="pg">{label(p)}</div>' for p in range(1, total + 1)
)

io.open(sys.argv[2], "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>folios</title><style>
@font-face{{font-family:"Vazirmatn";
  src:url("../vendor/vazirmatn-arabic-wght-normal.woff2") format("woff2-variations");
  font-weight:100 900;font-display:block;}}
@page{{ size:176mm 250mm; margin:0; }}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:"Vazirmatn",sans-serif}}
.pg{{
  /* دقیقاً ۲۵۰ نباشد: گِردکردن زیرپیکسلی هر برگه را به دو صفحه سرریز می‌کرد
     و لایهٔ شماره دو برابر صفحهٔ سند می‌شد. */
  width:176mm; height:248mm; overflow:hidden; break-after:page;
  display:flex; align-items:flex-end; justify-content:center;
  padding-bottom:20mm; font-size:10pt; color:#3C4757;
}}
.pg:last-child{{break-after:auto}}
</style></head><body>
{folios}
</body></html>""")
print(f"   لایهٔ شماره برای {total} صفحه ساخته شد")
