import styles from "./auth.module.css";

/** Sign-in and password reset: a centred card, without the site's header and footer. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.frame}>{children}</main>;
}
