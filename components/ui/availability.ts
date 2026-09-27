import type { Availability } from "@/lib/types";

/**
 * The colour each availability is shown in — on a card, the media page, the
 * analytics tab and the panel. There were four copies of this, each missing a
 * different state; `satisfies` now makes the compiler ask for every one.
 */
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
