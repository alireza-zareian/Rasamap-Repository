"use client";
import { useState } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import type { Billboard } from "@/lib/types";
import { C, TYPE_LABEL, AVAILABILITY_LABEL } from "./constants";
import { Image as ImageIcon, X, AlertTriangle } from "lucide-react";
import type { LatLng } from "@/lib/domain/location";
import { LocationInput } from "@/components/LocationInput";
import { CitySelect } from "@/components/listing/CitySelect";

export function EditModal({ billboard, onClose, onSaved, onImageManager }: {
  billboard: Billboard;
  onClose: () => void;
  onSaved: (updated: Billboard) => void;
  onImageManager: (b: Billboard) => void;
}) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);
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

  const iS: React.CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", padding: "9px 12px", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const lS: React.CSSProperties = { fontSize: "0.72rem", color: C.muted, marginBottom: 5, display: "block" };

  const save = async () => {
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="ویرایش بیلبورد" tabIndex={-1} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "min(580px, 94vw)", maxHeight: "90vh", overflowY: "auto", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: "1rem", fontWeight: 700 }}>ویرایش #{billboard.id}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onImageManager(billboard)} style={{ fontSize: "0.78rem", padding: "5px 12px", borderRadius: 7, background: "rgba(139,92,246,0.1)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.3)", cursor: "pointer", fontFamily: C.font, display: "inline-flex", alignItems: "center", gap: 5 }}><ImageIcon size={13} /> تصاویر</button>
            <button type="button" aria-label="بستن فرم ویرایش" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
          </div>
        </div>
        <div className="admin-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}><label htmlFor="em-name" style={lS}>نام</label><input id="em-name" style={iS} value={form.name} onChange={set("name")} /></div>
          <div style={{ gridColumn: "1/-1" }}><label htmlFor="em-location" style={lS}>آدرس</label><input id="em-location" style={iS} value={form.location} onChange={set("location")} /></div>
          <div style={{ gridColumn: "1/-1" }}><CitySelect city={form.city} onChange={city => setForm(f => ({ ...f, city }))} /></div>
          <div><label htmlFor="em-price" style={lS}>قیمت (میلیون تومان)</label><input id="em-price" style={iS} value={form.price} onChange={set("price")} type="number" min="0" /></div>
          <div><label htmlFor="em-type" style={lS}>نوع</label><select id="em-type" style={iS} value={form.type} onChange={set("type")}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="em-availability" style={lS}>وضعیت</label><select id="em-availability" style={iS} value={form.availability} onChange={set("availability")}>{Object.entries(AVAILABILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="em-width" style={lS}>عرض (m)</label><input id="em-width" style={iS} value={form.width} onChange={set("width")} type="number" min="0" /></div>
          <div><label htmlFor="em-height" style={lS}>ارتفاع (m)</label><input id="em-height" style={iS} value={form.height} onChange={set("height")} type="number" min="0" /></div>
          <div><label htmlFor="em-agency" style={lS}>آژانس</label><input id="em-agency" style={iS} value={form.agency} onChange={set("agency")} /></div>
          <div><label htmlFor="em-phone" style={lS}>تلفن</label><input id="em-phone" style={iS} value={form.phone} onChange={set("phone")} /></div>
          <div style={{ gridColumn: "1/-1" }}><LocationInput value={place} onChange={setPlace} preview /></div>
          <div style={{ gridColumn: "1/-1" }}><label htmlFor="em-description" style={lS}>توضیحات</label><textarea id="em-description" style={{ ...iS, minHeight: 60, resize: "vertical" }} value={form.description} onChange={set("description")} /></div>
        </div>
        {error && <div style={{ marginTop: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, background: C.accent, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.85rem", fontWeight: 700, padding: 11, borderRadius: 9, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saved ? "ذخیره شد" : saving ? "در حال ذخیره..." : "ذخیره"}
          </button>
          <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.font, borderRadius: 9, cursor: "pointer" }}>انصراف</button>
        </div>
        <div style={{ marginTop: 12, padding: 10, background: "rgba(245,158,11,0.08)", borderRadius: 8, fontSize: "0.7rem", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>
          <AlertTriangle size={12} style={{ verticalAlign: "-2px" }} /> هرگز مختصات اصلی اسکرپر یا آدرس/نام اصلی منبع را بازنویسی نکنید مگر اشتباه باشند.
        </div>
      </div>
    </div>
  );
}
