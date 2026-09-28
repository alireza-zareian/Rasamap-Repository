import type { Metadata } from "next";
import { Heart, LogIn } from "lucide-react";
import { getActor } from "@/lib/auth/actor";
import { listFavorites } from "@/lib/db/favorites";
import { ButtonLink } from "@/components/ui/Button";
import SavedResults from "./SavedResults";
import styles from "./saved.module.css";

export const metadata: Metadata = {
  title: "ذخیره‌شده‌ها | رسامپ",
  robots: { index: false, follow: false },
};

/**
 * A customer's saved media, read on the server (§40). A guest is shown why
 * there is nothing yet and the way to sign in; staff accounts have no list.
 */
export default async function SavedPage() {
  const actor = await getActor();
  const items = actor?.kind === "customer" ? await listFavorites(actor) : [];

  return (
    <main className={styles.page}>
      <h1 className={styles.title}><Heart size={22} /> ذخیره‌شده‌ها</h1>
      <p className={styles.lede}>رسانه‌هایی که برای بعد نگه داشته‌اید، تازه‌ترین در اول</p>

      {actor?.kind === "customer" ? (
        <SavedResults items={items} />
      ) : (
        <div className={styles.empty}>
          <Heart size={44} strokeWidth={1.4} className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>{actor ? "حساب همکاران فهرست ذخیره ندارد" : "برای ذخیرهٔ رسانه وارد شوید"}</h2>
          <p className={styles.emptyText}>
            روی قلبِ هر رسانه بزنید تا این‌جا بماند. فهرست به حسابتان بسته است، پس از هر دستگاهی که وارد شوید همراهتان است.
          </p>
          {!actor && <ButtonLink href="/login?next=/saved" intent="primary"><LogIn size={15} /> ورود یا ثبت‌نام</ButtonLink>}
        </div>
      )}
    </main>
  );
}
