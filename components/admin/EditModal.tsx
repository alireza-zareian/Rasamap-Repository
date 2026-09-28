"use client";
import { useState } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import type { Billboard } from "@/lib/types";
import { TYPE_LABEL, AVAILABILITY_LABEL } from "./constants";
import { Image as ImageIcon, AlertTriangle } from "lucide-react";
import type { LatLng } from "@/lib/domain/location";
import { LocationInput } from "@/components/listing/LocationInput";
import { CitySelect } from "@/components/listing/CitySelect";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import field from "@/components/ui/form.module.css";
import styles from "./BillboardForm.module.css";

export function EditModal({ billboard, onClose, onSaved, onImageManager }: {
  billboard: Billboard;
  onClose: () => void;
  onSaved: (updated: Billboard) => void;
  onImageManager: (b: Billboard) => void;
}) {
  const [form, setForm] = useState({
    name: billboard.name, location: billboard.location, city: billboard.city,
    type: billboard.type as string, availability: billboard.availability as string,
    price: billboard.price.toString(), description: billboard.description ?? "",
    agency: billboard.agency ?? "", phone: billboard.phone ?? "",
    width: billboard.width?.toString() ?? "", height: billboard.height?.toString() ?? "",
    faces: billboard.faces?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [place, setPlace] = useState<LatLng | null>(
    billboard.lat != null && billboard.lng != null ? { lat: billboard.lat, lng: billboard.lng } : null,
  );

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(""); setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name, location: form.location, city: form.city,
        type: form.type, availability: form.availability,
        lat: place?.lat ?? null, lng: place?.lng ?? null,
        price: parseFloat(form.price) || 0,
        description: form.description, agency: form.agency, phone: form.phone,
        ...(form.width  ? { width:  parseFloat(form.width) }  : {}),
        ...(form.height ? { height: parseFloat(form.height) } : {}),
        ...(form.faces  ? { faces:  parseInt(form.faces, 10) } : {}),
      };
      const data = await fetchJson<{ billboard: Billboard }>(`/api/admin/billboards/${billboard.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setSaved(true); onSaved(data.billboard);
      setTimeout(() => { setSaved(false); onClose(); }, 900);
    } catch (err) { setError(errorMessage(err)); setSaving(false); }
  };

  return (
    <Dialog title={`ویرایش #${billboard.id}`} onClose={onClose}>
      <form className={field.stack} onSubmit={save}>
        <Button size="sm" onClick={() => onImageManager(billboard)}><ImageIcon size={13} /> مدیریت تصاویر</Button>
        <div className={styles.grid}>
          <div className={`${field.field} ${styles.full}`}><label htmlFor="em-name" className={field.label}>نام</label><input id="em-name" className={field.input} value={form.name} onChange={set("name")} /></div>
          <div className={`${field.field} ${styles.full}`}><label htmlFor="em-location" className={field.label}>آدرس</label><input id="em-location" className={field.input} value={form.location} onChange={set("location")} /></div>
          <div className={styles.full}><CitySelect city={form.city} onChange={city => setForm(f => ({ ...f, city }))} /></div>
          <div className={field.field}><label htmlFor="em-price" className={field.label}>قیمت (میلیون تومان)</label><input id="em-price" className={field.input} value={form.price} onChange={set("price")} type="number" min="0" /></div>
          <div className={field.field}><label htmlFor="em-type" className={field.label}>نوع</label><select id="em-type" className={field.input} value={form.type} onChange={set("type")}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className={field.field}><label htmlFor="em-availability" className={field.label}>وضعیت</label><select id="em-availability" className={field.input} value={form.availability} onChange={set("availability")}>{Object.entries(AVAILABILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className={field.field}><label htmlFor="em-width" className={field.label}>عرض (متر)</label><input id="em-width" className={field.input} value={form.width} onChange={set("width")} type="number" min="0" /></div>
          <div className={field.field}><label htmlFor="em-height" className={field.label}>ارتفاع (متر)</label><input id="em-height" className={field.input} value={form.height} onChange={set("height")} type="number" min="0" /></div>
          <div className={field.field}><label htmlFor="em-faces" className={field.label}>وجه</label><input id="em-faces" className={field.input} value={form.faces} onChange={set("faces")} type="number" min="1" /></div>
          <div className={field.field}><label htmlFor="em-agency" className={field.label}>آژانس</label><input id="em-agency" className={field.input} value={form.agency} onChange={set("agency")} /></div>
          <div className={field.field}><label htmlFor="em-phone" className={field.label}>تلفن</label><input id="em-phone" className={`${field.input} ${field.ltr}`} value={form.phone} onChange={set("phone")} /></div>
          <div className={styles.full}><LocationInput value={place} onChange={setPlace} preview /></div>
          <div className={`${field.field} ${styles.full}`}><label htmlFor="em-description" className={field.label}>توضیحات</label><textarea id="em-description" className={field.input} rows={3} value={form.description} onChange={set("description")} /></div>
        </div>
        {error && <div role="alert" className={field.error}><AlertTriangle size={13} /> {error}</div>}
        <div className={field.row}>
          <Button type="submit" intent="primary" disabled={saving}>{saved ? "ذخیره شد" : saving ? "در حال ذخیره..." : "ذخیره"}</Button>
          <Button intent="quiet" onClick={onClose}>انصراف</Button>
        </div>
        <p className={styles.caution}>
          <AlertTriangle size={12} /> هرگز مختصات اصلی اسکرپر یا آدرس/نام اصلی منبع را بازنویسی نکنید مگر اشتباه باشند.
        </p>
      </form>
    </Dialog>
  );
}
