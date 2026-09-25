/**
 * How catalogue search compares Persian text.
 *
 * The same word reaches the database in more than one spelling. Windows' and
 * several Android keyboards type the Arabic ي and ك where Persian has ی and ک,
 * and the crawled data carries both, so «كرج» found 1 of Karaj's 273 boards and
 * «شيراز» none of Shiraz's 72 (measured on the demo database). A half-space
 * (ZWNJ) and a space are the same break to a reader, Persian and Arabic digits
 * are the same numbers as Latin ones, and a tatweel stretches a letter without
 * changing it.
 *
 * So both sides are folded through one table: the stored text in the
 * `searchText` column, which SQLite triggers fill from this table (migration
 * 20260925160000_add_search_text — searchTextSql() below wrote them), and the
 * visitor's query by searchTokens(). Change the table and a migration must
 * rewrite the column and the triggers, or the two sides stop matching.
 */
export const SEARCH_FOLD: readonly (readonly [from: string, to: string])[] = [
  ["ي", "ی"], ["ى", "ی"], ["ك", "ک"], ["ة", "ه"], ["ۀ", "ه"],
  ["ـ", ""], ["\u200c", " "],
  ..."۰۱۲۳۴۵۶۷۸۹".split("").map((d, i) => [d, String(i)] as const),
  ..."٠١٢٣٤٥٦٧٨٩".split("").map((d, i) => [d, String(i)] as const),
];

/** Fold one string the way the searchText column is folded. */
export function foldSearchText(text: string): string {
  let out = text;
  for (const [from, to] of SEARCH_FOLD) out = out.split(from).join(to);
  return out.toLowerCase();
}

/**
 * A visitor's query as the words to look for, each of which must appear.
 *
 * Every word, not the phrase: «بیلبورد تهران» used to need those two words
 * side by side in one field and found 5 of Tehran's 707 boards. `%` and `_`
 * are dropped because the database reads them as wildcards — a search for «%»
 * returned the whole catalogue. At most five words, so one request cannot
 * become an arbitrarily long chain of LIKE scans.
 */
export function searchTokens(query: string): string[] {
  return foldSearchText(query)
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * The SQLite expression the searchText triggers compute: the four
 * searchable fields, joined by spaces, folded through SEARCH_FOLD. Kept here so
 * the table and the SQL cannot be written separately; it is what the migration
 * holds, and a unit test checks the two still agree.
 */
export function searchTextSql(): string {
  let expr = `"name" || ' ' || "city" || ' ' || "location" || ' ' || "agency"`;
  for (const [from, to] of SEARCH_FOLD) {
    const lit = (s: string) => (s === "\u200c" ? "char(8204)" : `'${s}'`);
    expr = `replace(${expr}, ${lit(from)}, '${to}')`;
  }
  return `lower(${expr})`;
}
