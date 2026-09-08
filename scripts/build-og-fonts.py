#!/usr/bin/env python3
"""
build-og-fonts.py — فونتِ کارتِ اشتراک‌گذاری را می‌سازد.

    python3 scripts/build-og-fonts.py

`next/og` تصویرِ Open Graph را با Satori رسم می‌کند، و Satori نه woff2 می‌خواند
و نه فونتِ متغیر (variable). فونتی هم که به آن داده نشود، از اینترنت (Google
Fonts) گرفته می‌شود — که روی ماشینِ بدونِ دسترسی شکست می‌خورد و کارت را با
متنِ فارسیِ جعبه‌ای تحویل می‌دهد؛ بدتر از نداشتنِ کارت.

پس همان Vazirmatnِ خودِ پروژه (که در node_modules هست) با محورِ وزن ثابت‌شده
به دو TTF ایستا تبدیل می‌شود. خروجی در assets/fonts/ کامیت می‌شود چون بخشی از
بیلد است، نه یک وابستگیِ نصب‌شدنی.

نیازمندی: pip install fonttools brotli
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(
    ROOT, "node_modules", "@fontsource-variable", "vazirmatn",
    "files", "vazirmatn-arabic-wght-normal.woff2",
)
OUT_DIR = os.path.join(ROOT, "assets", "fonts")

# Only the two weights the card draws with. Every extra weight is a file in the
# build for nothing.
WEIGHTS = {400: "Vazirmatn-Regular", 800: "Vazirmatn-Bold"}

if __name__ == "__main__":
    if not os.path.exists(SRC):
        raise SystemExit(f"source font not found: {SRC}\nrun npm install first")
    os.makedirs(OUT_DIR, exist_ok=True)
    for weight, name in WEIGHTS.items():
        inst = instantiateVariableFont(TTFont(SRC), {"wght": weight}, inplace=False)
        inst.flavor = None          # plain TTF, not woff2
        dst = os.path.join(OUT_DIR, name + ".ttf")
        inst.save(dst)
        print(f"  {os.path.relpath(dst, ROOT)}  {os.path.getsize(dst) // 1024} KB")
