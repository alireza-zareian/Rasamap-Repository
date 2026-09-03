/**
 * Copy text to the clipboard, in a browser that may not have a clipboard.
 *
 * `navigator.clipboard` (and `navigator.share`) exist only in a **secure
 * context**. `localhost` counts as one, so both work on the developer's own
 * machine — but a phone opening the same server at `http://192.168.x.x` does
 * not, and there `navigator.clipboard` is plain `undefined`. Calling it threw
 * inside a click handler, which left the button silently doing nothing while it
 * had always worked on the laptop.
 *
 * So: try the modern API, fall back to the old `execCommand("copy")` trick,
 * which needs no secure context, and report honestly whether either worked
 * instead of showing a "copied!" that did not happen.
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

  // Legacy path: a throwaway textarea, selected and copied. Deprecated, but it
  // is the only thing that works over plain HTTP, and it is why the button
  // still does something on a phone on the local network.
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
