"use client";
import { useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import type { Billboard } from "@/lib/types";
import type { LatLng } from "@/lib/domain/location";
import { LocationInput } from "@/components/LocationInput";
import { CitySelect } from "@/components/listing/CitySelect";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import field from "@/components/ui/form.module.css";
import { TYPE_LABEL } from "./constants";
import styles from "./BillboardForm.module.css";

const EMPTY = { name: "", location: "", city: "تهران", type: "billboard", price: "", agency: "", phone: "", description: "", width: "12", height: "4", faces: "1" };

/**
 * A media item added by hand. The same city picker and map-link box as the
 * edit dialog: this one used to take a free-text city and two bare
 * coordinate boxes, so a board created here could be filed under a city no
 * filter knew.
 */
export function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Billboard) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [place, setPlace] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { setError("نام الزامی است"); return; }
    if (!form.location.trim()) { setError("آدرس الزامی است"); return; }
    if (!form.price || isNaN(Number(form.price))) { setError("قیمت معتبر وارد کنید"); return; }
    setError(""); setSaving(true);
    try {
      const data = await fetchJson<{ billboard: Billboard }>("/api/admin/billboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim(),
          city: form.city,
          type: form.type,
          price: parseInt(form.price, 10),
          agency: form.agency.trim(),
          phone: form.phone.trim(),
          description: form.description.trim(),
          width: parseInt(form.width, 10) || 12,
          height: parseInt(form.height, 10) || 4,
          faces: parseInt(form.faces, 10) || 1,
          ...(place ? { lat: place.lat, lng: place.lng } : {}),
        }),
      });
      onCreated(data.billboard);
      onClose();
    } catch (err) { setError(errorMessage(err)); setSaving(false); }
  };

  const req = <span className={styles.required}>*</span>;

  return (
    <Dialog icon={<Plus size={17} />} title="بیلبورد جدید" onClose={onClose}>
      <form className={field.stack} onSubmit={create}>
        <div className={styles.grid}>
          <div className={`${field.field} ${styles.full}`}><label htmlFor="cm-name" className={field.label}>نام {req}</label><input id="cm-name" className={field.input} value={form.name} onChange={set("name")} placeholder="بیلبورد اتوبان..." /></div>
          <div className={`${field.field} ${styles.full}`}><label htmlFor="cm-location" className={field.label}>آدرس {req}</label><input id="cm-location" className={field.input} value={form.location} onChange={set("location")} placeholder="اتوبان همت، تقاطع..." /></div>
          <div className={styles.full}><CitySelect city={form.city} onChange={city => setForm(f => ({ ...f, city }))} /></div>
          <div className={field.field}><label htmlFor="cm-price" className={field.label}>قیمت ماهانه (میلیون تومان) {req}</label><input id="cm-price" className={field.input} value={form.price} onChange={set("price")} type="number" min="0" placeholder="15" /></div>
          <div className={field.field}><label htmlFor="cm-type" className={field.label}>نوع</label><select id="cm-type" className={field.input} value={form.type} onChange={set("type")}>{Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className={`${styles.size} ${styles.full}`}>
            <div className={field.field}><label htmlFor="cm-width" className={field.label}>عرض (متر)</label><input id="cm-width" className={field.input} value={form.width} onChange={set("width")} type="number" min="1" /></div>
            <div className={field.field}><label htmlFor="cm-height" className={field.label}>ارتفاع (متر)</label><input id="cm-height" className={field.input} value={form.height} onChange={set("height")} type="number" min="1" /></div>
            <div className={field.field}><label htmlFor="cm-faces" className={field.label}>وجه</label><input id="cm-faces" className={field.input} value={form.faces} onChange={set("faces")} type="number" min="1" /></div>
          </div>
          <div className={field.field}><label htmlFor="cm-agency" className={field.label}>آژانس</label><input id="cm-agency" className={field.input} value={form.agency} onChange={set("agency")} placeholder="آژانس رسانه‌ای..." /></div>
          <div className={field.field}><label htmlFor="cm-phone" className={field.label}>تلفن</label><input id="cm-phone" className={`${field.input} ${field.ltr}`} value={form.phone} onChange={set("phone")} placeholder="021-XXXXXXXX" /></div>
          <div className={styles.full}><LocationInput value={place} onChange={setPlace} preview /></div>
          <div className={`${field.field} ${styles.full}`}><label htmlFor="cm-description" className={field.label}>توضیحات</label><textarea id="cm-description" className={field.input} rows={3} value={form.description} onChange={set("description")} placeholder="موقعیت ممتاز..." /></div>
        </div>
        {error && <div role="alert" className={field.error}><AlertTriangle size={13} /> {error}</div>}
        <div className={field.row}>
          <Button type="submit" intent="success" disabled={saving}>{saving ? "در حال ایجاد..." : "ایجاد بیلبورد"}</Button>
          <Button intent="quiet" onClick={onClose}>انصراف</Button>
        </div>
      </form>
    </Dialog>
  );
}
