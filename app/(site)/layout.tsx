import Topbar from "@/components/site/Topbar";
import BottomNav from "@/components/site/BottomNav";
import Footer from "@/components/site/Footer";
import StaffBar from "@/components/StaffBar";
import styles from "./site.module.css";

/**
 * The frame every public page shares: top bar, footer, and the phone's tab bar.
 * Sign-in screens and the panel live outside this group.
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
