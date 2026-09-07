#!/usr/bin/env python3
"""
build-image-variants.py — پیش‌ساختِ نسخه‌های کوچکِ تصویرها.

    python3 scripts/build-image-variants.py          ساختِ آنچه هنوز نیست
    python3 scripts/build-image-variants.py --force  ساختِ دوباره‌ی همه
    python3 scripts/build-image-variants.py --check   فقط گزارش، بدون نوشتن

── چرا این کار آفلاین انجام می‌شود ─────────────────────────────────
`next/image` می‌تواند تصویرها را در زمانِ درخواست تغییر اندازه بدهد، ولی این
یعنی کارِ پردازنده روی همان لپ‌تاپِ بی‌فنی که دمو رویش اجرا می‌شود (§۲۲).
نسخه‌ها یک بار اینجا ساخته می‌شوند و `image-loader.js` فقط نشانی‌شان را
برمی‌گرداند؛ سرور در زمان اجرا هیچ تصویری را باز نمی‌کند.

── چرا فقط دو عرض، و چرا این دو ────────────────────────────────────
هر ۴۱۶۵ تصویرِ منبع دقیقاً ۵۰۰×۵۰۰ است. پس بزرگ‌کردن بی‌معناست و تنها
جایی که صرفه دارد، قابی است که کوچک‌تر از ۵۰۰ نشان داده می‌شود:

    ۸۸ پیکسل   بندانگشتیِ حالتِ فهرستی   → با ۲۵۶ حتی روی نمایشگر ۲x پوشش دارد
    ۲۳۰ پیکسل  کارتِ «رسانه‌های مرتبط»   → ۲۵۶ برای ۱x، اصل برای ۲x
    ۲۸۰ پیکسل  گالریِ صفحهٔ نخست        → ۳۸۴ برای ۱x، اصل برای ۲x
    ۳۲۰+ پیکسل کارتِ شبکه و اسلایدشو    → همان اصلِ ۵۰۰

── چرا خروجیِ PNGها WebP است ───────────────────────────────────────
۲۳۱ تصویر PNG هستند و هر ۲۳۱ تا شفافیتِ واقعی دارند (بررسی شد) — برای همین
§۲۲a آن‌ها را به JPEG تبدیل نکرد. ولی همین‌ها با میانگین ۲۹۸ کیلوبایت،
۲۶٪ کلِ حجمِ تصویرها را در ۵٫۵٪ فایل‌ها می‌گیرند: صفحهٔ نخست ۱۹۱۸ کیلوبایت
تصویر می‌فرستد که ۱۵۸۵ تای آن فقط پنج فایلِ PNG است. WebP هم شفافیت را نگه
می‌دارد و هم ۹۱٪ کوچک‌تر است، پس برای PNGها هر سه عرض — از جمله عرضِ اصلی —
WebP ساخته می‌شود. JPEGها JPEG می‌مانند و در عرضِ اصلی اصلاً دست‌کاری
نمی‌شوند، تا مسیرِ رایج روی قالبی بماند که هر مرورگری می‌شناسد و بدونِ
فشرده‌سازیِ دوباره.

فایل‌های اصلی دست نمی‌خورند و هیچ ارجاعی در پایگاه داده عوض نمی‌شود.
"""
import os, sys
from PIL import Image

HERE   = os.path.dirname(os.path.abspath(__file__))
ROOT   = os.path.dirname(HERE)
SOURCE = os.path.join(ROOT, "public", "images", "scraped")

# Must stay in step with imageSizes/deviceSizes in next.config.ts and with
# image-loader.js — those three decide, together, which file a browser asks for.
WIDTHS = (256, 384)

# PNGs get one more, at the source resolution. Not a resize — a re-container.
# A 500-wide PNG here averages 298 KB and the same picture as WebP averages 26,
# with the transparency intact: 91% off, measured over a sample of 25. It is the
# largest single saving in the project's image weight, and unlike the smaller
# widths it helps a high-density phone too, which already asks for 500.
PNG_FULL_WIDTH = 500
JPEG_QUALITY = 82
WEBP_QUALITY = 80


def variant_name(filename: str) -> str:
    """A PNG's variant is WebP; everything else keeps its own container."""
    stem, ext = os.path.splitext(filename)
    return stem + (".webp" if ext.lower() == ".png" else ext)


def build(force: bool, check_only: bool) -> int:
    names = sorted(f for f in os.listdir(SOURCE) if os.path.isfile(os.path.join(SOURCE, f)))
    made = skipped = 0
    src_bytes = out_bytes = 0

    jobs = [(w, names) for w in WIDTHS]
    jobs.append((PNG_FULL_WIDTH, [n for n in names if n.lower().endswith(".png")]))

    for width, batch in jobs:
        outdir = os.path.join(SOURCE, f"w{width}")
        if not check_only:
            os.makedirs(outdir, exist_ok=True)

        for name in batch:
            src = os.path.join(SOURCE, name)
            dst = os.path.join(outdir, variant_name(name))

            if os.path.exists(dst) and not force:
                skipped += 1
                out_bytes += os.path.getsize(dst)
                src_bytes += os.path.getsize(src)
                continue
            if check_only:
                made += 1
                continue

            with Image.open(src) as im:
                im.load()
                # At the source width there is nothing to resample.
                small = im if im.width == width else im.resize(
                    (width, round(im.height * width / im.width)), Image.LANCZOS
                )
                if dst.endswith(".webp"):
                    small.save(dst, "WEBP", quality=WEBP_QUALITY, method=4)
                else:
                    small.convert("RGB").save(
                        dst, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
                    )
            made += 1
            src_bytes += os.path.getsize(src)
            out_bytes += os.path.getsize(dst)

    print(f"{len(names)} source images → {sum(len(b) for _, b in jobs)} variants")
    print(f"  built {made}, already present {skipped}")
    if out_bytes:
        print(f"  variants on disk: {out_bytes/1024/1024:.0f} MB "
              f"(the same pictures at full size are {src_bytes/1024/1024:.0f} MB)")
    return 0


if __name__ == "__main__":
    if not os.path.isdir(SOURCE):
        sys.exit(f"no image directory at {SOURCE}")
    sys.exit(build("--force" in sys.argv, "--check" in sys.argv))
