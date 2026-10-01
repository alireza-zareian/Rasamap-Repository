"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * A destructive action that asks once, in place: the first press turns the
 * button into "are you sure? / cancel", and only the second deletes. For a
 * row of small actions, where a dialog would be heavier than the decision —
 * deleting a review used to happen on a single, possibly accidental, tap.
 * The question goes away by itself after a few seconds, or on Escape.
 */
const ASK_MS = 6000;

export function ConfirmButton({
  onConfirm, busy = false, question = "مطمئنید؟", confirmLabel = "بله، حذف شود", children, size = "sm",
}: {
  onConfirm: () => void;
  busy?: boolean;
  question?: string;
  confirmLabel?: string;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!asking) return;
    confirmRef.current?.focus();
    const t = setTimeout(() => setAsking(false), ASK_MS);
    return () => clearTimeout(t);
  }, [asking]);

  if (!asking || busy) {
    return <Button size={size} intent="danger" disabled={busy} onClick={() => setAsking(true)}>{children}</Button>;
  }
  return (
    <span role="group" aria-label={question} onKeyDown={e => { if (e.key === "Escape") setAsking(false); }}>
      <Button ref={confirmRef} size={size} intent="danger" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</Button>{" "}
      <Button size={size} intent="quiet" onClick={() => setAsking(false)}>انصراف</Button>
    </span>
  );
}
