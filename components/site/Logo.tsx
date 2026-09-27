import Link from "next/link";
import styles from "./chrome.module.css";

/** The mark and the name, linking home. `sub` adds the domain under the name. */
export function Logo({ sub = false }: { sub?: boolean }) {
  return (
    <Link href="/" className={styles.logo} aria-label="رسامپ — صفحهٔ اصلی">
      <span className={styles.mark} aria-hidden="true">R</span>
      <span>
        <span className={`${styles.name} logo-shimmer`}>رسامپ</span>
        {sub && <span className={styles.domain}>Rasamap.ir</span>}
      </span>
    </Link>
  );
}
