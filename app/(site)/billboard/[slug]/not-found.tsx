import { SearchX } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { ButtonLink } from "@/components/ui/Button";
import styles from "./detail.module.css";

/**
 * A media address that names nothing, or nothing any more — a board its owner
 * took down is the usual way here, from an old share or a search result. Inside
 * the site's frame, unlike the root 404, and the first way out is the catalogue.
 */
export default function MediaNotFound() {
  return (
    <main id="main" className={styles.page}>
      <StatusScreen
        icon={<SearchX size={52} strokeWidth={1.4} />}
        code="۴۰۴"
        title="این رسانه پیدا نشد"
        actions={<>
          <ButtonLink href="/explore" intent="primary">جستجوی رسانه</ButtonLink>
          <ButtonLink href="/">بازگشت به خانه</ButtonLink>
        </>}
      >
        ممکن است آگهی برداشته شده یا نشانی اشتباه باشد. رسانه‌های دیگر همین شهر در جستجو هستند.
      </StatusScreen>
    </main>
  );
}
