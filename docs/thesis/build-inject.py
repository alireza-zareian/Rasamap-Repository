"""build-inject.py — نگاشت شمارهٔ صفحه را داخل یک نسخهٔ موقت از HTML تزریق می‌کند."""
import sys, io, json

src, pages, out = sys.argv[1:4]
clean = len(sys.argv) > 4 and sys.argv[4] == "--clean"
html = io.open(src, encoding="utf-8").read()
data = json.load(open(pages, encoding="utf-8"))
inject = "<script>window.__PAGES__=%s;%s</script>\n" % (
    json.dumps(data["pages"], ensure_ascii=False),
    "window.__CLEAN__=1;" if clean else "")
tag = '<script src="../vendor/mermaid.min.js"></script>'
assert tag in html, "برچسب mermaid پیدا نشد"
io.open(out, "w", encoding="utf-8").write(html.replace(tag, inject + tag, 1))
