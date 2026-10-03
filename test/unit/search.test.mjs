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
  assert.equal(foldSearchText("آزادی"), foldSearchText("ازادی"));
  assert.equal(foldSearchText("أ إ"), "ا ا");
});

test("a query becomes its words, without wildcards, at most five", () => {
  assert.deepEqual(searchTokens("  بیلبورد   تهران "), ["بیلبورد", "تهران"]);
  assert.deepEqual(searchTokens("%"), []);
  assert.deepEqual(searchTokens("a_b"), ["a", "b"]);
  assert.equal(searchTokens("۱ ۲ ۳ ۴ ۵ ۶ ۷").length, 5);
});

test("the latest search migration generates searchText from exactly this fold", () => {
  const sql = readFileSync(new URL("../../prisma/migrations/20261002120000_search_fold_alef/migration.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(searchTextSql()), "SEARCH_FOLD changed without a migration that rewrites the column");
});

test("PostgreSQL's generated searchText folds the same letters", () => {
  const script = readFileSync(new URL("../../scripts/to-postgres.mjs", import.meta.url), "utf8");
  const [, from, to] = script.match(/"agency",\s*'([^']*)',\s*'([^']*)'\)/);
  const decode = s => s.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const pgFold = text => {
    const f = decode(from);
    return [...text].map(c => (f.includes(c) ? (to[f.indexOf(c)] ?? "") : c)).join("").toLowerCase();
  };
  const sample = "شهرك آزادی أ إ ۱۲ ٣ نیم\u200cفاصله ـ ة ۀ ى";
  assert.equal(pgFold(sample), foldSearchText(sample));
});
