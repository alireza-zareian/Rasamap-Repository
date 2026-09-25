/**
 * The `?next=` a sign-in page may send someone to afterwards, or null.
 *
 * Checking the string for a leading "/" and no "//" is not enough: browsers
 * read a backslash as a slash in an http URL, so "/\evil.example" passes that
 * check and resolves to http://evil.example/ — and router.push() follows an
 * off-site URL with a full navigation. That is an open redirect straight after
 * a real sign-in, which is what a phishing page wants. So the value is
 * resolved the way the browser will resolve it, and kept only if it stays on
 * this origin.
 */
export function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  // Control characters (tab, newline) are stripped by the URL parser, which
  // turns "/\t/evil.example" into "//evil.example".
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
