import Topbar from "@/components/site/Topbar";
import BottomNav from "@/components/site/BottomNav";
import Footer from "@/components/site/Footer";
import StaffBar from "@/components/StaffBar";
import styles from "./site.module.css";

/**
 * The frame every public page shares: the top bar, the page, the footer, and on
 * a phone the tab bar. Each page used to place its own Topbar and Footer (and
 * the landing page its own copy of both), so the chrome is here once and a page
 * is only its content. Sign-in screens and the panel live outside this group.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.site}>
      <Topbar />
      {children}
      <Footer />
      <BottomNav />
      <StaffBar />
    </div>
  );
}
