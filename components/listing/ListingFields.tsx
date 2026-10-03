"use client";
import { useId } from "react";
import { Lightbulb } from "lucide-react";
import { typeLabels } from "@/lib/types";
import { derivedPrices } from "@/lib/domain/pricing";
import { faNum, faMillions, faApprox } from "@/lib/format";
import { LocationInput } from "@/components/listing/LocationInput";
import form from "@/components/ui/form.module.css";
import { CitySelect } from "./CitySelect";
import type { FieldGroup, ListingDraft, ListingForm } from "./use-listing-form";
import styles from "./listing.module.css";

/** The kinds of media an owner may list — every kind but vehicles, which only the crawler brings in. */
const LISTABLE_TYPES = ["billboard", "digital", "bridge", "station"] as const;
const FACE_OPTIONS = ["1", "2", "4", "6"];

/** One part of the listing form. The wizard shows one per step; the edit form shows all three. */
export function ListingFields({ group, listing }: { group: FieldGroup; listing: ListingForm }) {
  const id = useId();
  const { draft, set } = listing;

  const text = (key: keyof ListingDraft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={form.field}>
      <label htmlFor={`${id}-${key}`} className={form.label}>{label}</label>
      <input id={`${id}-${key}`} name={key} className={form.input} value={draft[key]} onChange={e => set(key, e.target.value)} {...props} />
    </div>
  );

  if (group === "basic") {
    return (
      <div className={styles.stack}>
        {text("name", "نام رسانه", { placeholder: "مثال: بیلبورد اتوبان همت", maxLength: 100 })}
        <div className={form.field}>
          <label htmlFor={`${id}-desc`} className={form.label}>توضیحات</label>
          <textarea id={`${id}-desc`} name="desc" className={form.input} rows={3} maxLength={1000} value={draft.desc}
            onChange={e => set("desc", e.target.value)} placeholder="دربارهٔ موقعیت و ویژگی‌های رسانه بنویسید…" />
        </div>
        {text("phone", "شماره تماس", { placeholder: "09xxxxxxxxx", inputMode: "tel", dir: "ltr", autoComplete: "tel" })}
      </div>
    );
  }

  if (group === "place") {
    return (
      <div className={styles.stack}>
        <div className={form.field}>
          <label htmlFor={`${id}-type`} className={form.label}>نوع رسانه</label>
          <select id={`${id}-type`} name="type" className={form.input} value={draft.type} onChange={e => set("type", e.target.value)}>
            {LISTABLE_TYPES.map(t => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>
        <CitySelect city={draft.city} onChange={city => set("city", city)} />
        {text("region", "منطقه / محله (اختیاری)", { placeholder: "مثال: منطقه ۳", maxLength: 100 })}
        {text("location", "آدرس دقیق", { placeholder: "مثال: خیابان ولیعصر، نبش میرداماد", maxLength: 200 })}
        <LocationInput value={listing.place} onChange={listing.setPlace} />
      </div>
    );
  }

  const monthly = Number.parseInt(draft.price, 10);
  const prices = monthly > 0 ? derivedPrices(monthly) : null;
  return (
    <div className={styles.stack}>
      <div className={styles.triple}>
        {text("width", "عرض (متر)", { placeholder: "12", inputMode: "numeric" })}
        {text("height", "ارتفاع (متر)", { placeholder: "4", inputMode: "numeric" })}
        <div className={form.field}>
          <label htmlFor={`${id}-faces`} className={form.label}>تعداد وجوه</label>
          <select id={`${id}-faces`} name="faces" className={form.input} value={draft.faces} onChange={e => set("faces", e.target.value)}>
            {FACE_OPTIONS.map(o => <option key={o} value={o}>{faNum(Number(o))}</option>)}
          </select>
        </div>
      </div>
      {text("price", "قیمت پایهٔ ماهانه (میلیون تومان)", { placeholder: "85", inputMode: "numeric" })}
      {prices && (
        <div className={styles.priceHint}>
          <Lightbulb size={14} /> هفتگی {faApprox(faMillions(prices.priceWeekly))} · سه‌ماهه {faApprox(faMillions(prices.priceQuarterly))} · سالانه {faApprox(faMillions(prices.priceYearly))}
        </div>
      )}
    </div>
  );
}
