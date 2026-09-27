"use client";
import { useState } from "react";
import { Check, Share2, X } from "lucide-react";
import { copyText } from "@/lib/client/clipboard";
import styles from "./detail.module.css";

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

  return (
    <button
      type="button"
      className={styles.share}
      data-state={state}
      onClick={share}
      title={state === "failed" ? "مرورگر اجازهٔ کپی نداد — نشانی صفحه را دستی کپی کنید" : "اشتراک‌گذاری لینک"}
    >
      {label}
    </button>
  );
}
