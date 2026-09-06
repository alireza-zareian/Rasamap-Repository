#!/usr/bin/env python3
"""
build.py — همهٔ خروجی‌های پایان‌نامه را می‌سازد.

    python3 build.py thesis      پایان‌نامه → thesis.pdf
    python3 build.py poster      پوستر     → poster.pdf
    python3 build.py codemap     نقشهٔ کد   → ../codemap.html
    python3 build.py all         هر سه
    python3 build.py supervisor "نام فارسی" "English Name"

پیش‌تر این کارها در هشت اسکریپت جدا بود (build-pdf.sh، build-pages.py،
build-folios.py، build-inject.py، build-poster.py، build-codemap.py،
build-codemap-html.py، set-supervisor.sh). هیچ‌کدام به‌تنهایی معنا نداشتند و
پیدا کردنِ اینکه کدام را باید زد، خودش یک مسئله شده بود.

── چرا ساختِ PDF سه پاس دارد ──────────────────────────────────────
مرورگر نمی‌داند یک عنوان روی کدام صفحه می‌افتد و Chrome هم به margin-box های
@page شماره نمی‌دهد. پس:
  ۱ چاپ با نشانه‌های نامرئی → از متن PDF می‌فهمیم هر عنوان کجا افتاده
  ۲ چاپ دوباره با اعداد تزریق‌شده، تکرار تا نگاشت به نقطهٔ ثابت برسد
    (افزودن عدد به فهرست، خودش صفحه‌بندی را کمی جابه‌جا می‌کند)
  ۳ ساخت یک لایهٔ شمارهٔ صفحه و روی‌هم‌گذاری آن با qpdf
نشانه‌ها بیرون از جریان متن‌اند، پس رندر نهایی می‌تواند بدونشان باشد و لایهٔ
متن PDF تمیز بماند، بی‌آنکه عددی جابه‌جا شود.
"""
import http.server, io, json, os, re, shutil, socketserver, subprocess, sys, tempfile, threading

HERE  = os.path.dirname(os.path.abspath(__file__))
DOCS  = os.path.dirname(HERE)
ROOT  = os.path.dirname(DOCS)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT   = 8879

FA = "۰۱۲۳۴۵۶۷۸۹"
fa = lambda n: "".join(FA[int(d)] for d in str(n))


# ══ سرور موقت ═══════════════════════════════════════════════════
# فونت و mermaid فایل محلی‌اند و مرورگر روی file:// آن‌ها را بلوکه می‌کند.
def serve():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=DOCS, **k)
        def log_message(s, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render(url, out):
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--no-pdf-header-footer", "--virtual-time-budget=30000",
                    "--run-all-compositor-stages-before-draw",
                    f"--print-to-pdf={out}", url],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def npages(pdf):
    return int(subprocess.run(["qpdf", "--show-npages", pdf],
                              capture_output=True, text=True, check=True).stdout.strip())


# ══ نگاشت عنوان‌ها به شمارهٔ صفحه ════════════════════════════════
def page_map(pdf, work):
    """از متن استخراج‌شده می‌فهمد هر عنوان روی کدام صفحه است."""
    txt = os.path.join(work, "t.txt")
    subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, txt], check=True)
    raw = io.open(txt, encoding="utf-8", errors="replace").read()
    # pdftotext نویسه‌های کنترل جهتِ متن را لابه‌لای نشانه‌ها می‌گذارد و
    # «PGMch1PGM» را به «PGMch1PG\u202c\u202cM» تبدیل می‌کند. اگر پاک نشوند،
    # همان یک نشانه گم می‌شود و چون مبدأ شماره‌گذاری به آن وابسته است، کلِ
    # فهرست بدون شمارهٔ صفحه می‌ماند.
    raw = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", raw)
    pages = raw.split("\f")
    # pdftotext بعد از هر صفحه یک form-feed می‌گذارد، پس تکهٔ آخر خالی است
    if pages and not pages[-1].strip():
        pages.pop()

    found = {}
    for i, page in enumerate(pages, start=1):
        # پایانهٔ نشانه گاهی ناقص استخراج می‌شود («PGMch1PG» به‌جای «PGMch1PGM»)،
        # مخصوصاً وقتی نشانه داخل یک تیتر درشت باشد. پس M پایانی اختیاری است و
        # مرزِ «واژه» تضمین می‌کند شناسه بیش از حد کش نیاید.
        for m in re.finditer(r"PGM([A-Za-z0-9_]+?)PGM?(?![A-Za-z0-9_])",
                             re.sub(r"[ \t]+", " ", page)):
            found.setdefault(m.group(1), i)

    if "ch1" not in found:
        print("   !! نشانهٔ ch1 پیدا نشد — فهرست‌ها بدون شمارهٔ صفحه", file=sys.stderr)
        return {"pages": {}, "offset": 0, "total": len(pages)}

    offset = found["ch1"] - 1          # صفحه‌های پیش‌متن، که شمارهٔ عربی نمی‌گیرند
    return {"pages": {k: v - offset for k, v in found.items() if v - offset >= 1},
            "offset": offset, "total": len(pages)}


def inject(src, data, out, clean=False):
    html = io.open(src, encoding="utf-8").read()
    tag  = '<script src="../vendor/mermaid.min.js"></script>'
    assert tag in html, "برچسب mermaid پیدا نشد"
    js = "<script>window.__PAGES__=%s;%s</script>\n" % (
        json.dumps(data["pages"], ensure_ascii=False),
        "window.__CLEAN__=1;" if clean else "")
    io.open(out, "w", encoding="utf-8").write(html.replace(tag, js + tag, 1))


# ══ لایهٔ شمارهٔ صفحه ════════════════════════════════════════════
ABJAD = ["الف","ب","ج","د","ه","و","ز","ح","ط","ی","یا","یب","یج","ید","یه","یو","یز","یح","یط","ک"]

def folios(meta, out):
    """
    Chrome به margin-box های @page شماره نمی‌دهد، پس شماره‌ها یک لایهٔ جدا
    می‌شوند و با qpdf روی سند اصلی می‌نشینند. پیش‌متن با حروف ابجد شماره
    می‌خورد (همان روش قالب) و متن اصلی با رقم فارسی.
    """
    total, offset = meta["total"], meta["offset"]

    def label(p):
        if p == 1:                       # صفحهٔ عنوان شماره نمی‌گیرد
            return ""
        if p <= offset:
            i = p - 2
            return ABJAD[i] if i < len(ABJAD) else ""
        return fa(p - offset)

    body = "\n".join(f'<div class="pg">{label(p)}</div>' for p in range(1, total + 1))
    io.open(out, "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>folios</title><style>
@font-face{{font-family:"Vazirmatn";
  src:url("../vendor/vazirmatn-arabic-wght-normal.woff2") format("woff2-variations");
  font-weight:100 900;font-display:block;}}
@page{{ size:210mm 297mm; margin:0; }}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:"Vazirmatn",sans-serif}}
/* دقیقاً ۲۹۷ نباشد: گِردکردن زیرپیکسلی هر برگه را به دو صفحه سرریز می‌کرد */
.pg{{ width:210mm; height:295mm; overflow:hidden; break-after:page;
  display:flex; align-items:flex-end; justify-content:center;
  padding-bottom:14mm; font-size:10pt; color:#3C4757; }}
.pg:last-child{{break-after:auto}}
</style></head><body>
{body}
</body></html>""")


# ══ پایان‌نامه ══════════════════════════════════════════════════
def build_thesis():
    src, out = "thesis.html", "thesis.pdf"
    work = tempfile.mkdtemp()
    srv  = serve()
    base = f"http://127.0.0.1:{PORT}/thesis"
    tmp_html = os.path.join(HERE, ".numbered.html")
    tmp_fol  = os.path.join(HERE, ".folios.html")
    try:
        print("▸ پاس ۱ — چاپ با نشانه‌ها")
        p1 = os.path.join(work, "p1.pdf")
        render(f"{base}/{src}", p1)
        meta = page_map(p1, work)
        print(f"   {len(meta['pages'])} عنوان روی {meta['total']} صفحه")

        print("▸ پاس ۲ — چاپ با شماره‌های واقعی، تا نقطهٔ ثابت")
        p2 = os.path.join(work, "p2.pdf")
        for round_ in (1, 2, 3):
            inject(src, meta, tmp_html)
            render(f"{base}/.numbered.html", p2)
            again = page_map(p2, work)
            if again == meta:
                print(f"   نگاشت در تکرار {round_} پایدار شد")
                break
            print("   صفحه‌بندی جابه‌جا شد — تکرار دوباره")
            meta = again

        print("▸ رندر نهایی بدون نشانه")
        clean = os.path.join(work, "clean.pdf")
        inject(src, meta, tmp_html, clean=True)
        render(f"{base}/.numbered.html", clean)
        if npages(clean) != npages(p2):
            print("   !! تعداد صفحه فرق کرد — نسخهٔ با نشانه استفاده می‌شود")
            shutil.copy(p2, clean)

        print("▸ لایهٔ شمارهٔ صفحه")
        folios(meta, tmp_fol)
        fol = os.path.join(work, "folios.pdf")
        render(f"{base}/.folios.html", fol)

        subprocess.run(["qpdf", clean, "--overlay", fol, "--", out], check=True)
        print(f"✓ {out} — {fa(npages(out))} صفحه")
    finally:
        srv.shutdown()
        shutil.rmtree(work, ignore_errors=True)
        for f in (tmp_html, tmp_fol):
            if os.path.exists(f): os.remove(f)


def build_poster():
    srv = serve()
    try:
        render(f"http://127.0.0.1:{PORT}/thesis/poster.html", "poster.pdf")
        n = npages("poster.pdf")
        print(f"✓ poster.pdf — {fa(n)} صفحه" + ("  !! باید یک صفحه باشد" if n != 1 else ""))
    finally:
        srv.shutdown()


# ══ نقشهٔ کد ════════════════════════════════════════════════════
IMPORT_RE = re.compile(r"""(?:^|\n)\s*import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']""")
SKIP = {"node_modules", ".next", ".next-test", "backups", ".git", "docs", "scraper", "public"}

def _layer(path):
    if path == "proxy.ts":             return "edge"
    if path.startswith("app/api/"):    return "api"
    if path.startswith("app/"):        return "page"
    if path.startswith("components/"): return "ui"
    if path.startswith("lib/db/"):     return "data"
    if path.startswith("lib/auth/"):   return "auth"
    if path.startswith("lib/"):        return "lib"
    if path.startswith("prisma/"):     return "schema"
    return "other"

def _resolve(spec, from_file):
    if spec.startswith("@/"):    cand = spec[2:]
    elif spec.startswith("."):   cand = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    else:                        return None          # بستهٔ بیرونی
    for suffix in ("", ".ts", ".tsx", "/index.ts", "/index.tsx"):
        rel = (cand + suffix).replace(os.sep, "/")
        # پیمایش، پوشه‌هایی مثل .next را رد می‌کند ولی resolve آن‌ها را روی دیسک
        # پیدا می‌کرد و یالی به گرهی می‌ساخت که اصلاً در گراف نیست.
        # گراف فقط از فایل‌های TypeScript ساخته می‌شود؛ بدون این شرط، پسوند
        # خالی به import های CSS هم جواب می‌داد و گرهی می‌ساخت که وجود ندارد.
        if not rel.endswith((".ts", ".tsx")):
            continue
        if rel.split("/")[0] in SKIP or rel.startswith("."):
            continue
        if os.path.isfile(os.path.join(ROOT, rel)):
            return rel
    return None

def import_graph():
    """گراف وابستگی را از importهای واقعی می‌سازد — هیچ چیز حدس زده نمی‌شود."""
    files, edges = {}, []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith(".")]
        for n in names:
            if not n.endswith((".ts", ".tsx")): continue
            rel = os.path.relpath(os.path.join(base, n), ROOT)
            src = io.open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
            deps = sorted({t for m in IMPORT_RE.finditer(src)
                           if (t := _resolve(m.group(1), rel)) and t != rel})
            files[rel] = {"layer": _layer(rel), "lines": src.count("\n") + 1,
                          "client": '"use client"' in src[:400] or "'use client'" in src[:400],
                          "deps": deps}
            edges += [[rel, d] for d in deps]
    indeg = {}
    for a, b in edges: indeg[b] = indeg.get(b, 0) + 1
    for k, v in files.items(): v["usedBy"] = indeg.get(k, 0)
    return {"files": dict(sorted(files.items())), "edges": edges}

DESC = {
 "proxy.ts":"نگهبان لبه. هر درخواستی — چه صفحه چه API — پیش از هر چیز از اینجا می‌گذرد. ربات‌ها، درخواست بدون نشست به بخش مدیریت، و مبدأهای ناشناس همین‌جا رد می‌شوند.",
 "lib/db/client.ts":"تنها جایی که اتصال به پایگاه داده ساخته می‌شود. هر پرس‌وجوی پروژه در نهایت از همین یک نقطه رد می‌شود؛ به همین دلیل عوض کردن موتور پایگاه داده فقط همین فایل را درگیر می‌کند.",
 "lib/db/billboards.ts":"لایهٔ دسترسی دادهٔ رسانه‌ها. بزرگ‌ترین فایل غیرصفحه‌ای پروژه و مهم‌ترین‌شان: هم مسیرهای API و هم صفحهٔ جزئیات از همین توابع می‌خوانند، پس منطق پرس‌وجو یک بار نوشته شده.",
 "lib/auth/session.ts":"ساخت و خواندن توکن نشست. توکن با HS256 امضا می‌شود و در کوکی HttpOnly می‌نشیند تا کد صفحه نتواند بخواندش.",
 "lib/auth/rate-limit.ts":"سقف نرخ درخواست. شمارنده‌ها در حافظهٔ همین نمونه‌اند — برای یک نمونهٔ اجرایی درست است و برای چند نمونه به انبارهٔ مشترک نیاز دارد.",
 "lib/auth/client-ip.ts":"شناسهٔ کاربر برای سقف نرخ. نکته اینجاست که سرآیندهای قابل جعل نباید به‌تنهایی مبنا باشند، وگرنه مهاجم با عوض کردن یک سرآیند سقف را دور می‌زند.",
 "lib/auth/users.ts":"ورود و ثبت‌نام. گذرواژه با bcrypt و ضریب هزینهٔ ۱۲ درهم می‌شود، و برای شمارهٔ ناموجود هم یک مقایسهٔ ساختگی انجام می‌شود تا زمان پاسخ لو ندهد کدام شماره ثبت است.",
 "lib/auth/audit.ts":"رد ممیزی. هر تغییر مدیریتی با شناسهٔ مدیر، نشانی شبکه و جزئیات ثبت می‌شود.",
 "lib/auth/useCurrentUser.ts":"قلاب سمت مرورگر برای دانستن اینکه کاربر وارد شده یا نه.",
 "lib/api-log.ts":"پرارجاع‌ترین فایل پروژه. هر مسیر API از آن عبور می‌کند و برای هر درخواست یک سطر JSON با وضعیت و مدت زمان می‌نویسد.",
 "lib/api-error.ts":"پاسخ خطای یکسان برای همهٔ مسیرها. به کاربر پیام فارسی و یک شناسهٔ کوتاه می‌دهد و رد پشته را فقط در ثبت رخداد می‌گذارد.",
 "lib/api-rate-limit.ts":"پاسخ مشترک «تعداد درخواست زیاد». وجودش برای این است که چهار جور ۴۲۹ متفاوت در پروژه نداشته باشیم.",
 "lib/env.ts":"اعتبارسنجی متغیرهای محیطی هنگام بالا آمدن. اگر تنظیمی کم باشد برنامه همان‌جا می‌ایستد، به‌جای آنکه وسط کار کاربر خراب شود.",
 "lib/types.ts":"انواع دادهٔ دامنه، بدون هیچ داده‌ای. عمداً از lib/data.ts جدا شده تا صفحه‌ها با وارد کردن یک نوع، کل مجموعهٔ داده را به مرورگر نفرستند.",
 "lib/data.ts":"مجموعهٔ دادهٔ ایستا و گردآوری‌شده. فقط prisma/seed.ts آن را وارد می‌کند؛ وارد کردنش در کد صفحه یعنی چند مگابایت داده به مرورگر کاربر می‌رود.",
 "lib/idempotency.ts":"کلید یکتایی عملیات. اگر همان درخواست دوباره برسد، پاسخ ذخیره‌شده برمی‌گردد و رکورد دوم ساخته نمی‌شود.",
 "lib/uploads.ts":"پذیرش فایل از کاربر. نوع فایل از بایت‌های آغازین خودش تشخیص داده می‌شود، نه از ادعای مرورگر.",
 "lib/otp.ts":"رمز یک‌بارمصرف. فقط درهمِ کد ذخیره می‌شود، نه خود کد.",
 "lib/sms.ts":"لایهٔ پیامک. بدون کلید سرویس در حالت خواب می‌ماند: کد کامل است ولی پیامی ارسال نمی‌شود.",
 "lib/logger.ts":"ثبت ساخت‌یافته. هر رخداد یک شیء JSON در یک خط — برای چشم انسان بهینه نیست، برای پردازش ماشینی آماده است.",
 "lib/site-url.ts":"یک منبع واحد برای نشانی سایت. پیش‌تر چند جا به localhost برمی‌گشت و لینک‌ها روی تلفن همراه می‌شکست.",
 "lib/clipboard.ts":"نسخه‌برداری متن با مسیر جایگزین، چون واسط استاندارد مرورگر بیرون از بستر امن اصلاً وجود ندارد.",
 "lib/format.ts":"قالب‌بندی عدد و قیمت به فارسی.",
 "lib/iranLocations.ts":"فهرست استان‌ها و شهرهای ایران برای پالایه‌ها.",
 "lib/theme.tsx":"حالت روشن و تاریک.",
 "app/layout.tsx":"چیدمان ریشه. جهت راست‌به‌چپ، فونت و پوستهٔ مشترک همهٔ صفحه‌ها اینجا تعریف می‌شود.",
 "app/page.tsx":"صفحهٔ نخست. آمار و رسانه‌های شاخص را از API می‌گیرد.",
 "app/explore/page.tsx":"صفحهٔ جست‌وجو و پالایش؛ بزرگ‌ترین صفحهٔ پروژه. فهرست و نقشه را کنار هم نشان می‌دهد.",
 "app/billboard/[slug]/page.tsx":"تنها صفحه‌ای که مؤلفهٔ سمت سرور است: هنگام ساخت صفحه مستقیم لایهٔ داده را صدا می‌زند و HTML آماده می‌فرستد، بدون آنکه سرور به خودش درخواست HTTP بزند.",
 "app/dashboard/page.tsx":"پیشخوان کاربر: وضعیت آگهی‌های ثبت‌شده.",
 "app/list-media/page.tsx":"فرم چندمرحله‌ای ثبت آگهی با بارگذاری تصویر.",
 "app/compare/page.tsx":"مقایسهٔ کنار هم چند رسانه.",
 "app/admin/page.tsx":"پنل مدیریت: صف تأیید، رسانه‌ها، کاربران، کیفیت داده و رد ممیزی.",
 "app/global-error.tsx":"آخرین تور ایمنی. اگر همه چیز بشکند، کاربر به‌جای صفحهٔ سفید یک پیام فارسی با شناسهٔ پیگیری می‌بیند.",
 "app/error.tsx":"مرز خطا برای صفحه‌های کلاینتی.",
 "app/not-found.tsx":"صفحهٔ ۴۰۴ فارسی.",
 "app/api/billboards/route.ts":"فهرست رسانه‌ها با پالایش، مرتب‌سازی و صفحه‌بندی. مقدارهای مرتب‌سازی پیش از رسیدن به پرس‌وجو با فهرست مجاز سنجیده می‌شوند.",
 "app/api/billboards/[slug]/contact/route.ts":"دریافت شمارهٔ تماس مالک. عمداً POST است نه GET: هم یک رکورد درخواست می‌سازد، هم برداشت انبوه با حلقه روی نشانی‌ها را ناممکن می‌کند.",
 "app/api/auth/login/route.ts":"ورود کاربر. پیام خطا برای شمارهٔ ناموجود و گذرواژهٔ اشتباه یکسان است.",
 "app/api/listings/route.ts":"ثبت آگهی تازه. کلید یکتایی، تشخیص نوع فایل و ورود به صف بررسی همین‌جا انجام می‌شود.",
 "app/api/admin/listings/[id]/decision/route.ts":"تصمیم کارشناس دربارهٔ یک آگهی. تک‌شلیک است: تلاش دوم پاسخ تعارض می‌گیرد تا پلن ویژه دو بار اعطا نشود.",
 "app/api/reviews/route.ts":"ثبت نظر. نوشتن نظر و بازمحاسبهٔ میانگین امتیاز در یک تراکنش انجام می‌شوند.",
 "prisma/seed.ts":"پرکردن اولیهٔ پایگاه داده. تنها فایلی که lib/data.ts را وارد می‌کند.",
 "prisma/dedupe-billboards.ts":"یافتن و ادغام رکوردهای تکراری میان منابع مختلف.",
 "prisma/backfill-coordinates.ts":"ژئوکد کردن رکوردهایی که مختصات نداشتند.",
 "components/BillboardCard.tsx":"کارت هر رسانه در فهرست.",
 "components/TrafficMeter.tsx":"نمایش تخمین بازدید روزانه — نقطهٔ تمایز پروژه.",
 "components/BillboardContact.tsx":"دکمهٔ نمایش شمارهٔ تماس. شماره در HTML صفحه نیست و فقط در پاسخ همین درخواست می‌آید.",
 "components/ReviewsSection.tsx":"نمایش و ثبت نظرها.",
 "components/admin/constants.ts":"برچسب‌ها و رنگ‌های مشترک پنل مدیریت، تا یک وضعیت در چهار جا چهار اسم نداشته باشد.",
 "next.config.ts":"تنظیمات ساخت و سرآیندهای امنیتی.",
 "instrumentation.ts":"قلاب اجرا هنگام بالا آمدن سرور؛ اعتبارسنجی محیط از اینجا شروع می‌شود.",
}

def build_codemap():
    # قالبِ بازتولید در یک بازآراییِ مخزن حذف شد؛ خروجیِ ساخته‌شدهٔ آن،
    # docs/codemap.html، همچنان در مخزن هست و نسخهٔ معتبر است. تا وقتی قالب
    # برنگشته، این گام را رد می‌کنیم به‌جای آنکه build را متوقف کند.
    tpl_path = os.path.join(HERE, "codemap-template.html")
    if not os.path.exists(tpl_path):
        print("• codemap: قالب در مخزن نیست — docs/codemap.html دست‌نخورده می‌ماند")
        return
    data = import_graph()
    tpl  = io.open(tpl_path, encoding="utf-8").read()
    out  = (tpl.replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False))
               .replace("/*__DESC__*/", json.dumps(DESC, ensure_ascii=False)))
    dest = os.path.join(DOCS, "codemap.html")
    io.open(dest, "w", encoding="utf-8").write(out)
    print(f"✓ docs/codemap.html — {fa(len(data['files']))} فایل، "
          f"{fa(len(data['edges']))} یال، {fa(len(DESC))} توضیح")



# ══ گراف وابستگی برای چاپ ═══════════════════════════════════════
LAYER_ORDER = ["edge", "page", "ui", "api", "auth", "lib", "data", "schema"]
LAYER_FA = {"edge":"Proxy", "page":"صفحه‌ها", "ui":"مؤلفه‌های رابط",
            "api":"API routes", "auth":"احراز هویت",
            "lib":"ابزارهای مشترک", "data":"Data Access Layer", "schema":"طرح‌واره"}
LAYER_COLOR = {"edge":"#2F6BE0","page":"#B57209","ui":"#0E8F5D","api":"#6247C4",
               "auth":"#BE185D","lib":"#C2410C","data":"#0E7490","schema":"#4D7C0F"}
HUBS = {"lib/api-log.ts":"api-log", "lib/auth/session.ts":"session",
        "lib/auth/client-ip.ts":"client-ip", "lib/auth/rate-limit.ts":"rate-limit",
        "lib/db/client.ts":"db/client",
        "lib/types.ts":"types", "lib/db/billboards.ts":"db/billboards",
        "proxy.ts":"proxy.ts", "components/admin/constants.ts":"admin/constants"}

def build_graph_svg():
    """
    گراف را به‌صورت لایه‌ای می‌کشد، نه نیرومحور.

    چیدمان نیرومحور در چاپ شبیه یک کلاف می‌شود: نقطه‌های بی‌برچسب، خط‌های
    درهم، و ظاهری که «تصادفی» به نظر می‌رسد. اینجا هر لایه یک نوار افقی است و
    جای هر گره معنا دارد — همان اطلاعات، ولی خوانا و قابل ارجاع.
    گره‌های کاملاً منفرد (نه وارد می‌کنند نه وارد می‌شوند) کنار گذاشته می‌شوند؛
    این‌ها فایل‌های قراردادی چارچوب‌اند (layout، loading، error) که چارچوب
    خودش صدایشان می‌زند و در گراف import دیده نمی‌شوند.

    کشیدنِ هر ۱۰۵ فایلِ متصل و ۳۹۸ یال، شکل را به یک کلاف تبدیل می‌کرد (۳۴ فایلِ
    مسیر که هرکدام چند چیز از auth/lib وارد می‌کنند، تنه‌ی این انبوهگی‌اند). پس
    از هر لایه فقط چند فایلِ بزرگ‌ترش نگه داشته می‌شود، به‌اضافهٔ فایل‌های
    نام‌گذاری‌شده (HUBS) که استدلالِ متن به آن‌ها ارجاع می‌دهد؛ یال‌ها هم فقط
    میانِ همین گره‌های نگه‌داشته کشیده می‌شوند.
    """
    PER_LAYER = 6
    g = import_graph()
    F, E = g["files"], g["edges"]
    connected = {k for k, v in F.items() if v["usedBy"] or v["deps"]}
    keep = {h for h in HUBS if h in connected}
    for l in LAYER_ORDER:
        big = sorted((k for k in connected if F[k]["layer"] == l),
                     key=lambda k: -F[k]["lines"])[:PER_LAYER]
        keep.update(big)
    edges = [(a, b) for a, b in E if a in keep and b in keep]
    dropped = len(connected) - len(keep)

    # TOP فضای بالای نوارهاست؛ کلیدِ خواندنِ شکل همان‌جا می‌نشیند تا خواننده
    # پیش از دیدنِ دایره‌ها بداند اندازه و جای هر دایره چه معنایی دارد.
    W, PAD_R, PAD_L, TOP, BAND = 1020, 150, 30, 70, 74
    layers = [l for l in LAYER_ORDER if any(F[k]["layer"] == l for k in keep)]
    H = TOP + BAND * len(layers) + 30
    yof = {l: TOP + BAND * i + BAND / 2 for i, l in enumerate(layers)}

    pos = {}
    for l in layers:
        ns = sorted([k for k in keep if F[k]["layer"] == l],
                    key=lambda k: -F[k]["usedBy"])
        span = W - PAD_R - PAD_L
        for i, k in enumerate(ns):
            # پرارجاع‌ترین‌ها وسط، بقیه به دو طرف — تا مرکزِ هر نوار معنا داشته باشد
            off = ((i + 1) // 2) * (1 if i % 2 else -1)
            pos[k] = (PAD_L + span / 2 + off * (span / (len(ns) + 1)), yof[l])

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
           f'font-family="Vazirmatn, sans-serif">',
           '<style>text{font-size:13px;fill:#3E4959}'
           '.hub{font-size:13.5px;font-weight:700;fill:#141A24}'
           '.key{font-size:12.5px;fill:#5C6B84}</style>']

    # کلیدِ خواندنِ شکل — یک خط، بالای همهٔ نوارها
    out.append(f'<text class="key" x="{W-14}" y="40" text-anchor="end">'
               f'هر دایره یک فایل است؛ هرچه فایل خط بیشتری داشته باشد دایره‌اش بزرگ‌تر است، '
               f'و هرچه به مرکزِ نوارش نزدیک‌تر باشد فایل‌های بیشتری آن را import می‌کنند.</text>')

    for i, l in enumerate(layers):                      # نوار هر لایه
        y = TOP + BAND * i
        out.append(f'<rect x="0" y="{y:.0f}" width="{W}" height="{BAND}" '
                   f'fill="{"#F7F9FC" if i % 2 else "#FFFFFF"}"/>')
        out.append(f'<text x="{W-14}" y="{y+BAND/2+5:.0f}" text-anchor="end" '
                   f'font-weight="700" fill="{LAYER_COLOR[l]}">{LAYER_FA[l]}</text>')
        n   = sum(1 for k in keep      if F[k]["layer"] == l)
        tot = sum(1 for k in connected if F[k]["layer"] == l)
        cnt = f"{fa(n)} فایل" if n == tot else f"{fa(n)} از {fa(tot)} فایلِ متصل"
        out.append(f'<text x="{W-14}" y="{y+BAND/2+21:.0f}" text-anchor="end" '
                   f'font-size="11" fill="#8B97A8">{cnt}</text>')

    for a, b in edges:                                   # یال‌ها
        x1, y1 = pos[a]; x2, y2 = pos[b]
        out.append(f'<path d="M{x1:.0f},{y1:.0f} C{x1:.0f},{(y1+y2)/2:.0f} '
                   f'{x2:.0f},{(y1+y2)/2:.0f} {x2:.0f},{y2:.0f}" fill="none" '
                   f'stroke="#AAB8CC" stroke-width="0.9" opacity="0.55"/>')

    for k in sorted(keep, key=lambda k: F[k]["usedBy"]):  # گره‌ها
        x, y = pos[k]
        r = max(3.2, min(13, (F[k]["lines"] ** 0.5) / 2.1))
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" '
                   f'fill="{LAYER_COLOR[F[k]["layer"]]}" stroke="#fff" stroke-width="1.2"/>')

    for k, name in HUBS.items():                          # برچسب فایل‌های محوری
        if k not in pos: continue
        x, y = pos[k]
        r = max(3.2, min(13, (F[k]["lines"] ** 0.5) / 2.1))
        out.append(f'<text class="hub" x="{x:.0f}" y="{y-r-5:.0f}" text-anchor="middle" '
                   f'stroke="#fff" stroke-width="3.5" paint-order="stroke">{name}</text>')

    out.append("</svg>")
    dest = os.path.join(HERE, "shots", "import-graph.svg")
    io.open(dest, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"✓ import-graph.svg — {fa(len(keep))} گره، {fa(len(edges))} یال "
          f"(از {fa(len(connected))} فایلِ متصل؛ {fa(dropped)} فایلِ کوچک‌ترِ هر لایه نمایش داده نشد)")


# ══ نام استاد راهنما ════════════════════════════════════════════
def set_supervisor(fa_name, en_name):
    """
    نام در چند فایل تکرار شده، پس دستی عوض کردنش یعنی احتمالِ جا انداختن یکی.
    """
    targets = {
        "thesis.html": [('supervisor:    "«نام استاد راهنما»"',  f'supervisor:    "{fa_name}"'),
                        ('supervisor_en: "«Supervisor Name»"',    f'supervisor_en: "{en_name}"')],
        "poster.html":            [("«نام استاد راهنما»", fa_name)],
        "../defense-slides.html": [("«نام استاد راهنما»", fa_name)],
    }
    for rel, subs in targets.items():
        p = os.path.join(HERE, rel)
        s = io.open(p, encoding="utf-8").read()
        n = sum(s.count(old) for old, _ in subs)
        for old, new in subs: s = s.replace(old, new)
        io.open(p, "w", encoding="utf-8").write(s)
        print(f"  {fa(n)} مورد در {rel}")
    build_thesis(); build_poster()


# ══ ورودی ═══════════════════════════════════════════════════════
if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    os.chdir(HERE)
    if   cmd == "thesis":  build_thesis()
    elif cmd == "poster":  build_poster()
    elif cmd == "codemap": build_codemap(); build_graph_svg()
    elif cmd == "all":     build_codemap(); build_graph_svg(); build_thesis(); build_poster()
    elif cmd == "supervisor":
        if len(sys.argv) < 3:
            sys.exit('کاربرد: python3 build.py supervisor "نام فارسی" ["English Name"]')
        set_supervisor(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else sys.argv[2])
    else:
        sys.exit(__doc__)
