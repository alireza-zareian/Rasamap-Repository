// The public layout's skip link points at #main. A page whose <main> lost the
// id would leave the link doing nothing, silently, for keyboard users only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function tsx(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsx(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

test("every public page's <main> is the skip link's target", () => {
  const layout = readFileSync("app/(site)/layout.tsx", "utf8");
  assert.match(layout, /href="#main"/);
  // Pages, and the components a page renders its <main> through (the
  // dashboard's lived in components/account and had lost the id). The panel's
  // shell is outside the public layout and has no skip link to point at it.
  const files = [...tsx("app/(site)"), ...tsx("components").filter(f => !f.startsWith(join("components", "admin")))];
  const missing = files
    .flatMap(file => [...readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/<main\b[^>]*>/g)]
      .filter(m => !/\bid="main"/.test(m[0]))
      .map(() => file));
  assert.deepEqual(missing, []);
});
