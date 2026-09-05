"""
build-poster.py — پوستر A1 را از قالب می‌سازد و کد QR مخزن را درونش می‌گذارد.

QR یک بار ساخته و در qr-repo.svg نگه داشته شده است، نه اینکه هر بار از یک
کتابخانه تولید شود: نشانی مخزن ثابت است، و وابسته کردن ساختِ پوستر به یک
بستهٔ پایتون یعنی روی هر ماشین دیگری این اسکریپت می‌شکند.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
read = lambda n: io.open(os.path.join(HERE, n), encoding="utf-8").read()

qr = read("qr-repo.svg").replace("<svg ", '<svg class="qr" ', 1)
out = read("poster-template.html").replace("<!--QR-->", qr)
io.open(os.path.join(HERE, "poster.html"), "w", encoding="utf-8").write(out)
print("✓ poster.html")
