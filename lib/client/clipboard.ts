/**
 * Copy text, and say whether it worked. `navigator.clipboard` exists only in a
 * secure context — localhost, not a phone at `http://192.168.x.x` (rule 9) — so
 * the old `execCommand("copy")` is the fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied permission, or an insecure context that still exposes the object.
  }

  // Deprecated, but the only way over plain HTTP: a throwaway textarea, selected and copied.
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    // Off-screen, but not display:none — the selection has to be real.
    el.style.position = "fixed";
    el.style.top = "-1000px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
