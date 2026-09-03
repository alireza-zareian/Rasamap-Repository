"use client";
import { useState } from "react";
import { Check, Share2, X } from "lucide-react";
import { copyText } from "@/lib/clipboard";

type State = "idle" | "copied" | "failed";

export default function ShareButton({ title }: { title: string }) {
  const [state, setState] = useState<State>("idle");

  /**
   * Share, or fall back to copying the link.
   *
   * Both `navigator.share` and `navigator.clipboard` require a secure context.
   * `localhost` is treated as one, so this always worked while developing; a
   * phone opening the same server over `http://<lan-ip>` gets neither, and the
   * old code called `navigator.clipboard.writeText` unguarded — it threw inside
   * the handler and the button did nothing at all, with no message.
   */
  const share = async () => {
    const url = window.location.href;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissed by the user, or refused — fall through to copying.
      }
    }

    const ok = await copyText(url);
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2200);
  };

  const label =
    state === "copied" ? <><Check size={13} /> کپی شد</>
    : state === "failed" ? <><X size={13} /> کپی نشد</>
    : <><Share2 size={13} /> اشتراک‌گذاری</>;

  const color =
    state === "copied" ? "var(--green)"
    : state === "failed" ? "#ef4444"
    : "var(--text-muted)";

  const background =
    state === "copied" ? "rgba(34,197,94,0.12)"
    : state === "failed" ? "rgba(239,68,68,0.12)"
    : "var(--bg-surface)";

  return (
    <button
      onClick={share}
      title={state === "failed" ? "مرورگر اجازهٔ کپی نداد — نشانی صفحه را دستی کپی کنید" : "اشتراک‌گذاری لینک"}
      style={{ fontSize: "0.72rem", padding: "4px 12px", borderRadius: 20, background, color, border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 5 }}
    >
      {label}
    </button>
  );
}
