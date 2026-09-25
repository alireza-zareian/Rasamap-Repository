// Catalogue search folding (lib/domain/search.ts) — no build, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foldSearchText, searchTokens, searchTextSql } from "../../lib/domain/search.ts";

test("Arabic letters, half-spaces and Persian digits fold to one spelling", () => {
  assert.equal(foldSearchText("شهرك قدس"), foldSearchText("شهرک قدس"));
  assert.equal(foldSearchText("شيراز"), "شیراز");
  assert.equal(foldSearchText("می\u200cرود"), "می رود");
  assert.equal(foldSearchText("منطقه ۵"), "منطقه 5");
  assert.equal(foldSearchText("Billboardiha"), "billboardiha");
});

test("a query becomes its words, without wildcards, at most five", () => {
  assert.deepEqual(searchTokens("  بیلبورد   تهران "), ["بیلبورد", "تهران"]);
  assert.deepEqual(searchTokens("%"), []);
  assert.deepEqual(searchTokens("a_b"), ["a", "b"]);
  assert.equal(searchTokens("۱ ۲ ۳ ۴ ۵ ۶ ۷").length, 5);
});

test("the migration generates searchText from exactly this fold", () => {
  const sql = readFileSync(new URL("../../prisma/migrations/20260925160000_add_search_text/migration.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(searchTextSql()), "SEARCH_FOLD changed without a migration that rewrites the column");
});
