"use client";
import { useState } from "react";
import type { Billboard } from "@/lib/types";
import { C, TYPE_LABEL } from "./constants";
import { Plus, X, AlertTriangle } from "lucide-react";

const EMPTY = { name: "", location: "", city: "", type: "billboard", price: "", agency: "", phone: "", description: "", width: "12", height: "4", faces: "1", lat: "", lng: "" };

export function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Billboard) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const iS: React.CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", padding: "9px 12px", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const lS: React.CSSProperties = { fontSize: "0.72rem", color: C.muted, marginBottom: 5, display: "block" };

  const create = async () => {
    if (!form.name.trim()) { setError("نام الزامی است"); return; }
    if (!form.location.trim()) { setError("آدرس الزامی است"); return; }
    if (!form.city.trim()) { setError("شهر الزامی است"); return; }
    if (!form.price || isNaN(Number(form.price))) { setError("قیمت معتبر وارد کنید"); return; }
    setError(""); setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        location: form.location.trim(),
        city: form.city.trim(),
        type: form.type,
        price: parseInt(form.price, 10),
        agency: form.agency.trim(),
        phone: form.phone.trim(),
        description: form.description.trim(),
        width: parseInt(form.width, 10) || 12,
        height: parseInt(form.height, 10) || 4,
        faces: parseInt(form.faces, 10) || 1,
        ...(form.lat ? { lat: parseFloat(form.lat) } : {}),
        ...(form.lng ? { lng: parseFloat(form.lng) } : {}),
      };
      const res = await fetch("/api/admin/billboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ایجاد"); setSaving(false); return; }
      onCreated(data.billboard);
      onClose();
    } catch { setError("خطای شبکه"); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "min(580px, 94vw)", maxHeight: "90vh", overflowY: "auto", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "1rem", fontWeight: 700 }}><Plus size={17} /> بیلبورد جدید</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
        </div>
        <div className="admin-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>نام <span style={{ color: C.accent }}>*</span></label><input style={iS} value={form.name} onChange={set("name")} placeholder="بیلبورد اتوبان..." /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>آدرس <span style={{ color: C.accent }}>*</span></label><input style={iS} value={form.location} onChange={set("location")} placeholder="اتوبان همت، تقاطع..." /></div>
          <div><label style={lS}>شهر <span style={{ color: C.accent }}>*</span></label><input style={iS} value={form.city} onChange={set("city")} placeholder="تهران" /></div>
          <div><label style={lS}>قیمت ماهانه (میلیون تومان) <span style={{ color: C.accent }}>*</span></label><input style={iS} value={form.price} onChange={set("price")} type="number" min="0" placeholder="15" /></div>
          <div><label style={lS}>نوع</label><select style={iS} value={form.type} onChange={set("type")}>{Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><label style={lS}>عرض (m)</label><input style={iS} value={form.width} onChange={set("width")} type="number" min="1" /></div>
            <div><label style={lS}>ارتفاع (m)</label><input style={iS} value={form.height} onChange={set("height")} type="number" min="1" /></div>
            <div><label style={lS}>وجه</label><input style={iS} value={form.faces} onChange={set("faces")} type="number" min="1" /></div>
          </div>
          <div><label style={lS}>آژانس</label><input style={iS} value={form.agency} onChange={set("agency")} placeholder="آژانس رسانه‌ای..." /></div>
          <div><label style={lS}>تلفن</label><input style={iS} value={form.phone} onChange={set("phone")} placeholder="021-XXXXXXXX" /></div>
          <div><label style={lS}>عرض جغرافیایی (lat)</label><input style={iS} value={form.lat} onChange={set("lat")} placeholder="35.6892" /></div>
          <div><label style={lS}>طول جغرافیایی (lng)</label><input style={iS} value={form.lng} onChange={set("lng")} placeholder="51.3890" /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>توضیحات</label><textarea style={{ ...iS, minHeight: 60, resize: "vertical" }} value={form.description} onChange={set("description")} placeholder="موقعیت ممتاز..." /></div>
        </div>
        {error && <div style={{ marginTop: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={create} disabled={saving} style={{ flex: 1, background: C.green, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.85rem", fontWeight: 700, padding: 11, borderRadius: 9, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "در حال ایجاد..." : "ایجاد بیلبورد"}
          </button>
          <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.font, borderRadius: 9, cursor: "pointer" }}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
