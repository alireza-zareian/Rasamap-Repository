/**
 * How search compares Persian text. One word arrives in several spellings:
 * many keyboards type Arabic ي and ك for ی and ک («كرج» found 1 of Karaj's 273
 * boards), a half-space is a space to a reader, Persian and Arabic digits are
 * Latin ones, and a tatweel changes nothing.
 *
 * Both sides fold through this one table: the stored `searchText` column, which
 * SQLite triggers fill (migration 20260925160000_add_search_text, written by
 * searchTextSql()), and the query, by searchTokens(). Changing the table needs
 * a migration that rewrites the column and the triggers.
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
 * A query as the words that must each appear — every word, not the phrase
 * («بیلبورد تهران» as a phrase found 5 of Tehran's 707). `%` and `_` are
 * wildcards to the database, so they are dropped. At most five words.
 */
export function searchTokens(query: string): string[] {
  return foldSearchText(query)
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * The expression the searchText triggers compute: the four searchable fields,
 * folded through SEARCH_FOLD. A unit test checks the migration still holds it.
 */
export function searchTextSql(): string {
  let expr = `"name" || ' ' || "city" || ' ' || "location" || ' ' || "agency"`;
  for (const [from, to] of SEARCH_FOLD) {
    const lit = (s: string) => (s === "\u200c" ? "char(8204)" : `'${s}'`);
    expr = `replace(${expr}, ${lit(from)}, '${to}')`;
  }
  return `lower(${expr})`;
}
