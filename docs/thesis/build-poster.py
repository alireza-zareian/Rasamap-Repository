"""پوستر A1 را می‌سازد و کد QR مخزن را به‌صورت SVG درون‌خطی درونش می‌گذارد."""
import sys, io, os, re
sys.path.insert(0, os.environ.get("QR_LIBS", ""))
import segno

REPO = "https://github.com/alireza-zareian/Rasamap-Repository"
# segno روی جریان بایتی می‌نویسد، نه متنی
buf = io.BytesIO()
segno.make(REPO, error="m").save(buf, kind="svg", scale=1, border=2,
                                 dark="#151A23", light=None, svgclass=None, xmldecl=False)
qr = buf.getvalue().decode("utf-8")
# segno فقط width/height می‌دهد و viewBox نمی‌گذارد؛ بدون viewBox، بزرگ کردن
# عنصر با CSS جعبه را بزرگ می‌کند ولی نقشِ داخلش در همان ۳۷ واحد می‌ماند.
m = re.search(r'width="(\d+)"\s+height="(\d+)"', qr)
qr = qr.replace(m.group(0), f'viewBox="0 0 {m.group(1)} {m.group(2)}"', 1)
qr = qr.replace("<svg ", '<svg class="qr" ', 1)

tpl = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "poster-template.html"), encoding="utf-8").read()
io.open("poster.html", "w", encoding="utf-8").write(tpl.replace("<!--QR-->", qr))
print("✓ poster.html")
