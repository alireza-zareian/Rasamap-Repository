"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A short-lived "you may not do that" notice, for an action the viewer's role
 * does not allow. The server refuses the request either way; this only saves
 * a round-trip and says why the button did nothing.
 */
export function usePermissionNotice() {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const deny = (text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 3000);
  };

  const notice = message ? (
    <div role="alert" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#ef4444", color: "#fff", padding: "10px 24px", borderRadius: 10, fontWeight: 700, fontSize: "0.88rem", zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
      {message}
    </div>
  ) : null;

  return { notice, deny };
}
