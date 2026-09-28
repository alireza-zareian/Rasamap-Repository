import { User } from "lucide-react";
import { cssVar } from "@/components/ui/css-var";
import styles from "./UserAvatar.module.css";

/**
 * The signed-in person's initial in a circle — there are no profile photos.
 * `toUpperCase` is for Latin names; Persian has no case.
 */
export default function UserAvatar({ name, size = 42 }: { name: string; size?: number }) {
  const letter = name.trim().charAt(0).toUpperCase();
  return (
    <div aria-hidden className={styles.avatar} style={cssVar("--size", `${size}px`)}>
      {/* Every account has a name; the icon covers a blank one anyway. */}
      {letter || <User size={size * 0.5} />}
    </div>
  );
}
