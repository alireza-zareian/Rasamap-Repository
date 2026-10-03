// A secret with a default at the point of use (`process.env.AUTH_SECRET ?? ""`)
// signs with an empty key whenever a process skipped the boot check, and
// nothing says so. The key is read through authSecret() in lib/env.ts, which
// throws instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [path] : [];
  });
}

test("AUTH_SECRET is read only by lib/env.ts", () => {
  const files = [...sources("app"), ...sources("lib"), ...sources("components"), "proxy.ts", "server.mjs"];
  const readers = files.filter(file =>
    file !== join("lib", "env.ts") && /process\.env\.AUTH_SECRET|process\.env\[["']AUTH_SECRET/.test(readFileSync(file, "utf8")));
  assert.deepEqual(readers, []);
});
