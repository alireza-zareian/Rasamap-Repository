/**
 * The `?next=` to go to after sign-in, or null. A leading "/" is not enough:
 * browsers read "/\evil.example" as http://evil.example/ — an open redirect
 * right after a real sign-in. So it is resolved as the browser would, and kept
 * only if it stays on this origin.
 */
export function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  // The URL parser strips tabs and newlines: "/\t/evil.example" becomes "//evil.example".
  if (/[\u0000-\u001f\\]/.test(raw)) return null;

  const base = "http://same.origin";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  return url.pathname + url.search + url.hash;
}
