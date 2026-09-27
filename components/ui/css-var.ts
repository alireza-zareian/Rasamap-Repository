import type { CSSProperties } from "react";

/**
 * A style carrying one CSS custom property, for a value only known at render
 * time (a status colour, a category tint) that a module class then reads as
 * `var(--name)`. React's style type has no slot for custom properties, hence
 * the cast — written once here instead of at every call.
 */
export function cssVar(name: `--${string}`, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}
