"use client";
import { useEffect } from "react";
import styles from "./Toast.module.css";

/** A short message that dismisses itself after a few seconds. */
export default function Toast({ message, type = "info", onClose }: {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return <div role="status" aria-live="polite" className={`${styles.toast} ${styles[type]}`}>{message}</div>;
}
