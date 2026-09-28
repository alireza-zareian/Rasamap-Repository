import { Megaphone, Monitor, Milestone, Train, Bus } from "lucide-react";
import type { BillboardType } from "@/lib/types";

// The media-type icons, the same ones the no-photo placeholder uses.
const MAP: Record<BillboardType, React.ComponentType<{ size?: number; color?: string }>> = {
  billboard: Megaphone,
  digital: Monitor,
  bridge: Milestone,
  station: Train,
  vehicle: Bus,
};

export function TypeIcon({ type, size = 20, color }: { type: string; size?: number; color?: string }) {
  const Icon = MAP[type as BillboardType] ?? Megaphone;
  return <Icon size={size} color={color} />;
}
