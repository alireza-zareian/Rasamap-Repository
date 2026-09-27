"use client";
import { useState } from "react";
import Toast from "@/components/Toast";

/**
 * A short-lived "you may not do that" notice, for an action the viewer's role
 * does not allow. The server refuses the request either way; this only saves
 * a round-trip and says why the button did nothing. It is the site's own
 * toast, keyed per refusal so a second click restarts its timer.
 */
export function usePermissionNotice() {
  const [refusal, setRefusal] = useState<{ text: string; n: number } | null>(null);

  const deny = (text: string) => setRefusal(r => ({ text, n: (r?.n ?? 0) + 1 }));

  const notice = refusal
    ? <Toast key={refusal.n} message={refusal.text} type="error" onClose={() => setRefusal(null)} />
    : null;

  return { notice, deny };
}
