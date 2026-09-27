import styles from "./auth.module.css";

/**
 * Sign-in and password reset: a card in the middle of the page, without the
 * site's header and footer — there is nothing to navigate to from here that
 * the card's own "back" link does not cover.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.frame}>{children}</main>;
}
