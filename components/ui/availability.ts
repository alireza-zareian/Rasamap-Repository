import type { Availability } from "@/lib/types";

/** Each availability's colour, everywhere it is shown; `satisfies` requires every state. */
export const AVAILABILITY_TONE = {
  available: "var(--green)",
  busy:      "var(--red)",
  reserved:  "var(--accent-warm)",
  inactive:  "var(--text-muted)",
  unknown:   "var(--text-muted)",
} satisfies Record<Availability, string>;

export function availabilityTone(value: string): string {
  return Object.hasOwn(AVAILABILITY_TONE, value) ? AVAILABILITY_TONE[value as Availability] : "var(--text-muted)";
}
