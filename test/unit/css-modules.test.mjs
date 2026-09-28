// Every animation a CSS module names must be defined in that module: the module
// renames it, so a @keyframes in globals.css never matches and the browser
// drops the animation silently. Three animations stopped this way once.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];
const KEYWORDS = new Set([
  "none", "infinite", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
  "forwards", "backwards", "both", "normal", "reverse", "alternate", "alternate-reverse",
  "running", "paused", "initial", "inherit", "unset", "important",
]);

function modules(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return modules(path);
    return name.endsWith(".module.css") ? [path] : [];
  });
}

/** The identifiers in an animation value that can only be a keyframes name. */
function namesIn(value) {
  return value
    .replace(/var\([^)]*\)|cubic-bezier\([^)]*\)|steps\([^)]*\)/g, " ")
    .split(/[\s,!]+/)
    .filter(t => /^(?!-?\d)[A-Za-z_-][\w-]*$/.test(t) && !KEYWORDS.has(t));
}

test("every animation a CSS module names is defined in that module", () => {
  const missing = [];
  for (const file of ROOTS.flatMap(modules)) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
    for (const [, value] of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
      for (const name of namesIn(value)) if (!defined.has(name)) missing.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], "a module names an animation it does not define");
});
