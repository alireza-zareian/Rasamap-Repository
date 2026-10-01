import type Link from "next/link";
import type { ComponentProps } from "react";
import IntentLink from "./IntentLink";
import styles from "./button.module.css";

type Intent = "primary" | "secondary" | "quiet" | "danger" | "success";

interface Look {
  intent?: Intent;
  size?: "md" | "sm";
  block?: boolean;
}

function classes({ intent = "secondary", size = "md", block = false }: Look, extra?: string): string {
  return [styles.button, styles[intent], size === "sm" && styles.sm, block && styles.block, extra]
    .filter(Boolean)
    .join(" ");
}

/** A button. `type` defaults to "button", so a button inside a form never submits it by accident. */
export function Button({ intent, size, block, className, type = "button", ...rest }: Look & ComponentProps<"button">) {
  return <button type={type} className={classes({ intent, size, block }, className)} {...rest} />;
}

/**
 * A link that looks like a button. It prefetches on intent (IntentLink), not
 * on sight: a page shows several, and each prefetch is a render on the server.
 * The header's "list media" button alone, prefetched for a signed-out visitor,
 * was a redirect to the sign-in page and that page's payload on every view.
 */
export function ButtonLink({ intent, size, block, className, ...rest }: Look & ComponentProps<typeof Link>) {
  return <IntentLink className={classes({ intent, size, block }, className)} {...rest} />;
}
