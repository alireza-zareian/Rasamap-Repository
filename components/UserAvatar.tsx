import { User } from "lucide-react";

/**
 * The signed-in person's initial in a circle.
 *
 * There is no photo upload and there will not be one for a listings site, so a
 * letter is the whole identity mark. It lives here rather than inline because
 * the dashboard shows it twice — the sidebar profile card and the greeting —
 * and two copies of a circle drift into two different circles.
 *
 * `toUpperCase` is for Latin fixtures and staff emails; Persian has no case, so
 * it is a no-op on the names this actually renders.
 */
export default function UserAvatar({ name, size = 42 }: { name: string; size?: number }) {
  const letter = name.trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: "rgba(59,123,245,0.15)", border: "2px solid rgba(59,123,245,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: size * 0.42, color: "var(--accent)",
      }}
    >
      {/* An account cannot be created without a name, but a blank circle would
          be the one state nobody notices was broken. */}
      {letter || <User size={size * 0.5} />}
    </div>
  );
}
