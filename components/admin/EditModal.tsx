"use client";
import { useState } from "react";
import type { Billboard } from "@/lib/types";
import { C, TYPE_LABEL, STATUS_LABEL } from "./constants";
import { Image as ImageIcon, X, MapPin, AlertTriangle } from "lucide-react";

function parseGoogleMapsUrl(url: string): { lat: string; lng: string } | null {
  const patterns = [
    /@([-\d.]+),([-\d.]+)/,
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /[?&]ll=([-\d.]+),([-\d.]+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (lat >= 24 && lat <= 40 && lng >= 44 && lng <= 64) {
        return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
      }
    }
  }
  return null;
}

export function EditModal({ billboard, onClose, onSaved, onImageManager }: {
  billboard: Billboard;
  onClose: () => void;
  onSaved: (updated: Billboard) => void;
  onImageManager: (b: Billboard) => void;
}) {
  const [form, setForm] = useState({
    name: billboard.name, location: billboard.location, city: billboard.city,
    type: billboard.type as string, status: billboard.status as string,
    lat: billboard.lat?.toString() ?? "", lng: billboard.lng?.toString() ?? "",
    price: billboard.price.toString(), description: billboard.description ?? "",
    agency: billboard.agency ?? "", phone: billboard.phone ?? "",
    width: billboard.width?.toString() ?? "", height: billboard.height?.toString() ?? "",
    faces: billboard.faces?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const iS: React.CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", padding: "9px 12px", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const lS: React.CSSProperties = { fontSize: "0.72rem", color: C.muted, marginBottom: 5, display: "block" };

  const save = async () => {
    const lat = form.lat ? parseFloat(form.lat) : undefined;
    const lng = form.lng ? parseFloat(form.lng) : undefined;
    if (lat !== undefined && (lat < 24 || lat > 40)) { setError("عرض جغرافیایی باید ۲۴–۴۰ باشد"); return; }
    if (lng !== undefined && (lng < 44 || lng > 64)) { setError("طول جغرافیایی باید ۴۴–۶۴ باشد"); return; }
    setError(""); setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name, location: form.location, city: form.city,
        type: form.type, status: form.status,
        lat: lat ?? null, lng: lng ?? null,
        price: parseFloat(form.price) || 0,
        description: form.description, agency: form.agency, phone: form.phone,
        ...(form.width  ? { width:  parseFloat(form.width) }  : {}),
        ...(form.height ? { height: parseFloat(form.height) } : {}),
        ...(form.faces  ? { faces:  parseInt(form.faces, 10) } : {}),
      };
      const res = await fetch(`/api/admin/billboards/${billboard.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ذخیره‌سازی"); setSaving(false); return; }
      setSaved(true); onSaved(data.billboard);
      setTimeout(() => { setSaved(false); onClose(); }, 900);
    } catch { setError("خطای شبکه"); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "min(580px, 94vw)", maxHeight: "90vh", overflowY: "auto", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: "1rem", fontWeight: 700 }}>ویرایش #{billboard.id}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onImageManager(billboard)} style={{ fontSize: "0.78rem", padding: "5px 12px", borderRadius: 7, background: "rgba(139,92,246,0.1)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.3)", cursor: "pointer", fontFamily: C.font, display: "inline-flex", alignItems: "center", gap: 5 }}><ImageIcon size={13} /> تصاویر</button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
          </div>
        </div>
        <div className="admin-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>نام</label><input style={iS} value={form.name} onChange={set("name")} /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>آدرس</label><input style={iS} value={form.location} onChange={set("location")} /></div>
          <div><label style={lS}>شهر</label><input style={iS} value={form.city} onChange={set("city")} /></div>
          <div><label style={lS}>قیمت (میلیون تومان)</label><input style={iS} value={form.price} onChange={set("price")} type="number" min="0" /></div>
          <div><label style={lS}>نوع</label><select style={iS} value={form.type} onChange={set("type")}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label style={lS}>وضعیت</label><select style={iS} value={form.status} onChange={set("status")}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label style={lS}>عرض (m)</label><input style={iS} value={form.width} onChange={set("width")} type="number" min="0" /></div>
          <div><label style={lS}>ارتفاع (m)</label><input style={iS} value={form.height} onChange={set("height")} type="number" min="0" /></div>
          <div><label style={lS}>آژانس</label><input style={iS} value={form.agency} onChange={set("agency")} /></div>
          <div><label style={lS}>تلفن</label><input style={iS} value={form.phone} onChange={set("phone")} /></div>
          <div style={{ gridColumn: "1/-1", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: C.green, fontWeight: 700, marginBottom: 10 }}><MapPin size={13} /> مختصات — ایران: lat ۲۴–۴۰ | lng ۴۴–۶۴</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={lS}>عرض (lat)</label><input style={iS} value={form.lat} onChange={set("lat")} placeholder="35.6892" /></div>
              <div><label style={lS}>طول (lng)</label><input style={iS} value={form.lng} onChange={set("lng")} placeholder="51.3890" /></div>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
              <input
                style={{ ...iS, flex: 1, fontSize: "0.75rem", direction: "ltr" }}
                value={mapsUrl}
                onChange={e => { setMapsUrl(e.target.value); setUrlError(""); }}
                placeholder="https://www.google.com/maps/@35.6892,51.389,15z"
              />
              <button
                type="button"
                onClick={() => {
                  const parsed = parseGoogleMapsUrl(mapsUrl);
                  if (parsed) {
                    setForm(f => ({ ...f, lat: parsed.lat, lng: parsed.lng }));
                    setMapsUrl("");
                    setUrlError("");
                  } else {
                    setUrlError("مختصات ایران پیدا نشد — URL را بررسی کنید");
                  }
                }}
                style={{ flexShrink: 0, fontSize: "0.75rem", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.12)", color: C.green, cursor: "pointer", fontFamily: C.font, fontWeight: 700, whiteSpace: "nowrap" }}
              >
                استخراج
              </button>
            </div>
            {urlError && <div style={{ marginTop: 5, fontSize: "0.7rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 5 }}><AlertTriangle size={12} /> {urlError}</div>}
            <div style={{ marginTop: 6, fontSize: "0.68rem", color: C.muted, lineHeight: 1.6 }}>
              Google Maps را باز کنید ← روی نقطه راست‌کلیک کنید ← «چه چیزی اینجاست؟» ← URL صفحه را paste کنید
            </div>
            {form.lat && form.lng && parseFloat(form.lat) >= 24 && parseFloat(form.lng) >= 44 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: "0.68rem", color: C.muted, marginBottom: 5 }}>
                  پیش‌نمایش — اگه نقطه اشتباهه، lat/lng بالا رو تصحیح کن یا URL جدید paste کن:
                </div>
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <iframe
                    src={`https://maps.google.com/maps?q=${form.lat},${form.lng}&z=14&output=embed&hl=fa`}
                    width="100%" height="200"
                    style={{ display: "block", border: "none" }}
                    loading="lazy"
                    title="پیش‌نمایش موقعیت"
                  />
                </div>
                <div style={{ marginTop: 6, fontSize: "0.68rem", display: "flex", gap: 12 }}>
                  <a href={`https://www.google.com/maps?q=${form.lat},${form.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>↗ باز در Google Maps</a>
                  <span style={{ color: C.muted }}>lat: {form.lat} | lng: {form.lng}</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>توضیحات</label><textarea style={{ ...iS, minHeight: 60, resize: "vertical" }} value={form.description} onChange={set("description")} /></div>
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
