import type { CSSProperties } from "react";

/**
 * A style with one custom property, for a value known only at render time that
 * a module class reads as `var(--name)`. The cast is because React's style type
 * has no slot for custom properties.
 */
export function cssVar(name: `--${string}`, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}
