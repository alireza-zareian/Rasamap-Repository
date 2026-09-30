import Topbar from "@/components/site/Topbar";
import BottomNav from "@/components/site/BottomNav";
import Footer from "@/components/site/Footer";
import StaffBar from "@/components/site/StaffBar";
import styles from "./site.module.css";

/**
 * The frame every public page shares: top bar, footer, and the phone's tab bar.
 * Sign-in screens and the panel live outside this group. The skip link is the
 * first thing a keyboard reaches; every page's <main> carries id="main" (guard
 * test in test/unit/skip-link.test.mjs).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.site}>
      <a href="#main" className={styles.skip}>پرش به محتوای اصلی</a>
      <Topbar />
      {children}
      <Footer />
      <BottomNav />
      <StaffBar />
    </div>
  );
}
