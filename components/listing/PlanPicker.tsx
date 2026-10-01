"use client";
import { Check, Lightbulb } from "lucide-react";
import type { ListingPlan } from "@/lib/domain/listing";
import { PLANS } from "./plans";
import styles from "./listing.module.css";

/** Free or featured. There is no payment gateway — §18 — so featured waits for a transfer staff confirm. */
export function PlanPicker({ plan, onChange }: { plan: ListingPlan; onChange: (plan: ListingPlan) => void }) {
  return (
    <div className={styles.stack}>
      <div className={styles.plans} role="radiogroup" aria-label="پلن آگهی">
        {PLANS.map(p => (
          <label key={p.key} className={`${styles.plan} ${plan === p.key ? styles.planActive : ""}`}>
            <div className={styles.planHead}>
              <input type="radio" name="plan" checked={plan === p.key} onChange={() => onChange(p.key)} />
              <span className={styles.planTitle}>پلن {p.title}</span>
              <span className={styles.planPrice}>{p.price}</span>
            </div>
            <div className={styles.perks}>
              {p.perks.map(perk => <div key={perk} className={styles.perk}><Check size={12} /> {perk}</div>)}
            </div>
          </label>
        ))}
      </div>
      {plan === "featured" && (
        <div className={styles.note}>
          <Lightbulb size={14} />
          <span>
            پرداخت آنلاین فعال نیست. پس از ثبت، آگهی در وضعیت «در انتظار پرداخت» قرار می‌گیرد و شمارهٔ کارت از
            طریق پشتیبانی اعلام می‌شود. با تأیید واریز توسط ادمین، آگهی منتشر شده و نشان «ویژه» می‌گیرد.
          </span>
        </div>
      )}
    </div>
  );
}
