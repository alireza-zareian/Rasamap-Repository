"""
build-codemap.py — گراف واقعی وابستگی فایل‌های پروژه را از روی import ها می‌سازد.

هیچ چیزی حدس زده نمی‌شود: هر یال یک `import` واقعی در کد است. مسیرهای «@/» به
ریشهٔ پروژه نگاشت می‌شوند و بستهٔ‌های node_modules کنار گذاشته می‌شوند، چون
هدف نقشه، فهمیدنِ خودِ پروژه است نه کتابخانه‌ها.
"""
import os, re, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = (".ts", ".tsx")
SKIP = {"node_modules", ".next", ".next-test", "backups", ".git", "docs", "scraper", "public"}

IMPORT_RE = re.compile(r"""(?:^|\n)\s*import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']""")

def walk():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith(".")]
        for f in files:
            if f.endswith(EXT):
                yield os.path.relpath(os.path.join(base, f), ROOT)

def resolve(spec, from_file):
    """یک specifier را به مسیر واقعی فایل در مخزن تبدیل می‌کند، یا None."""
    if spec.startswith("@/"):
        cand = spec[2:]
    elif spec.startswith("."):
        cand = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    else:
        return None                      # بستهٔ بیرونی
    for suffix in ("", ".ts", ".tsx", "/index.ts", "/index.tsx"):
        p = cand + suffix
        if os.path.isfile(os.path.join(ROOT, p)):
            return p.replace(os.sep, "/")
    return None

def layer(path):
    if path == "proxy.ts":                      return "edge"
    if path.startswith("app/api/"):             return "api"
    if path.startswith("app/"):                 return "page"
    if path.startswith("components/"):          return "ui"
    if path.startswith("lib/db/"):              return "data"
    if path.startswith("lib/auth/"):            return "auth"
    if path.startswith("lib/"):                 return "lib"
    if path.startswith("prisma/"):              return "schema"
    return "other"

files, edges = {}, []
for rel in sorted(walk()):
    src = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
    deps = []
    for m in IMPORT_RE.finditer(src):
        t = resolve(m.group(1), rel)
        if t and t != rel:
            deps.append(t)
    files[rel] = {
        "layer": layer(rel),
        "lines": src.count("\n") + 1,
        "client": '"use client"' in src[:400] or "'use client'" in src[:400],
        "deps": sorted(set(deps)),
    }
    for d in set(deps):
        edges.append([rel, d])

# چند کیست پرارجاع‌ترین فایل‌ها؟ (درجهٔ ورودی)
indeg = {}
for a, b in edges:
    indeg[b] = indeg.get(b, 0) + 1
for k, v in files.items():
    v["usedBy"] = indeg.get(k, 0)

out = {"files": files, "edges": edges}
json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print(f"{len(files)} فایل · {len(edges)} یال import")
print("\nپرارجاع‌ترین‌ها (چند فایل به آن وابسته‌اند):")
for k, v in sorted(files.items(), key=lambda x: -x[1]["usedBy"])[:14]:
    print(f"  {v['usedBy']:>3} ← {k}  ({v['lines']} خط، لایهٔ {v['layer']})")
print("\nتوزیع لایه‌ها:")
from collections import Counter
for lay, n in Counter(v["layer"] for v in files.values()).most_common():
    print(f"  {lay:<8} {n}")
