"use client";
import { useState } from "react";
import Toast from "@/components/ui/Toast";

/**
 * A brief "your role cannot do that" toast. The server refuses anyway; this
 * saves the round-trip. Keyed per refusal, so a second click restarts it.
 */
export function usePermissionNotice() {
  const [refusal, setRefusal] = useState<{ text: string; n: number } | null>(null);

  const deny = (text: string) => setRefusal(r => ({ text, n: (r?.n ?? 0) + 1 }));

  const notice = refusal
    ? <Toast key={refusal.n} message={refusal.text} type="error" onClose={() => setRefusal(null)} />
    : null;

  return { notice, deny };
}
