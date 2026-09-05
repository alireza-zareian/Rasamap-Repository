"use client";
import { useEffect, useRef, useState } from "react";
import { X, ImagePlus, Check } from "lucide-react";
import { faNum } from "@/lib/format";

// One of the user's own submissions, with every field the edit form touches.
export interface EditableListing {
  id: number;
  name: string;
  description: string;
  phone: string;
  type: string;
  city: string;
  region: string;
  location: string;
  width: number;
  height: number;
  faces: number;
  price: number;
  plan: string;
  images: string[];
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const TYPES = ["billboard", "digital", "bridge", "station"];
const TYPE_LABEL: Record<string, string> = {
  billboard: "بیلبورد", digital: "دیجیتال", bridge: "عرشه پل", station: "ایستگاه",
};
const BASE_CITIES = ["تهران", "اصفهان", "زنجان", "مشهد", "شیراز", "تبریز", "اهواز"];

/** Read a picked file as a base64 data URL for the JSON request body. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * The submitter's edit form for a listing an admin sent back ("نیاز به اصلاح").
 * Same fields as /list-media, on one screen. Kept photos are sent back as their
 * existing URLs; newly picked ones as data URLs. Saving PATCHes
 * /api/listings/[id], which returns the row to the review queue.
 */
export default function EditListingModal({
  listing,
  onClose,
  onSaved,
}: {
  listing: EditableListing;
  onClose: () => void;
  onSaved: (updated: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    name: listing.name,
    desc: listing.description ?? "",
    phone: listing.phone ?? "",
    type: TYPES.includes(listing.type) ? listing.type : "billboard",
    city: listing.city,
    region: listing.region ?? "",
    location: listing.location ?? "",
    width: String(listing.width ?? ""),
    height: String(listing.height ?? ""),
    faces: String(listing.faces ?? "2"),
    price: String(listing.price ?? ""),
  });
  const [plan, setPlan] = useState<"free" | "featured">(listing.plan === "featured" ? "featured" : "free");
  const [keptUrls, setKeptUrls] = useState<string[]>(listing.images ?? []);
  const [newPhotos, setNewPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const s = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const cities = BASE_CITIES.includes(listing.city) ? BASE_CITIES : [listing.city, ...BASE_CITIES];
  const photoCount = keptUrls.length + newPhotos.length;

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Revoke object URLs for removed previews.
  useEffect(() => () => { newPhotos.forEach(p => URL.revokeObjectURL(p.preview)); }, [newPhotos]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photoCount;
    const picked: { file: File; preview: string }[] = [];
    let rejected = "";
    for (const file of files.slice(0, remaining)) {
      if (!ACCEPTED.includes(file.type)) { rejected = "فقط فرمت JPG، PNG یا WEBP پذیرفته می‌شود."; continue; }
      if (file.size > MAX_PHOTO_BYTES) { rejected = "حجم هر تصویر باید کمتر از ۲ مگابایت باشد."; continue; }
      picked.push({ file, preview: URL.createObjectURL(file) });
    }
    setError(rejected);
    setNewPhotos(prev => [...prev, ...picked]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function validate(): string | null {
    if (form.name.trim().length < 3) return "نام رسانه باید حداقل ۳ حرف باشد.";
    if (!/^09\d{9}$/.test(form.phone.trim())) return "شماره تماس معتبر وارد کنید (۰۹xxxxxxxxx).";
    if (form.region.trim().length < 1) return "منطقه / محله را وارد کنید.";
    if (form.location.trim().length < 3) return "آدرس دقیق را وارد کنید (حداقل ۳ حرف).";
    if (!(parseInt(form.width) > 0)) return "عرض رسانه را وارد کنید.";
    if (!(parseInt(form.height) > 0)) return "ارتفاع رسانه را وارد کنید.";
    if (!(parseInt(form.price) > 0)) return "قیمت پایه ماهانه را وارد کنید.";
    return null;
  }

  async function handleSave() {
    if (saving) return;
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);
    try {
      const fresh = await Promise.all(newPhotos.map(p => toDataUrl(p.file)));
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          desc: form.desc,
          phone: form.phone.trim(),
          type: form.type,
          city: form.city,
          region: form.region.trim(),
          location: form.location.trim(),
          width: parseInt(form.width),
          height: parseInt(form.height),
          faces: parseInt(form.faces),
          price: parseInt(form.price),
          plan,
          images: [...keptUrls, ...fresh],
        }),
      });
      if (res.status === 401) { window.location.href = "/login?next=/dashboard"; return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "خطا در ذخیره تغییرات"); return; }
      onSaved(data.listing);
    } catch {
      setError("خطا در اتصال به سرور. دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  const label: React.CSSProperties = { fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 5 };
  const field: React.CSSProperties = { width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", padding: "9px 12px", borderRadius: 8, outline: "none" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(6,10,18,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, width: "100%", maxWidth: 560, margin: "40px 0", direction: "rtl" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>ویرایش و ارسال مجدد آگهی</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "18px 20px" }}>
          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 14px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 14 }}>{error}</div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={label}>نام رسانه</label>
            <input value={form.name} onChange={e => s("name", e.target.value)} style={field} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>توضیحات</label>
            <textarea value={form.desc} onChange={e => s("desc", e.target.value)} rows={3} maxLength={1000} style={{ ...field, resize: "vertical", lineHeight: 1.8 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>شماره تماس</label>
            <input value={form.phone} onChange={e => s("phone", e.target.value)} dir="ltr" style={{ ...field, textAlign: "right" }} placeholder="09xxxxxxxxx" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>نوع رسانه</label>
              <select value={form.type} onChange={e => s("type", e.target.value)} style={field}>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>شهر</label>
              <select value={form.city} onChange={e => s("city", e.target.value)} style={field}>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>منطقه / محله</label>
            <input value={form.region} onChange={e => s("region", e.target.value)} style={field} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>آدرس دقیق</label>
            <input value={form.location} onChange={e => s("location", e.target.value)} style={field} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>عرض (متر)</label>
              <input value={form.width} onChange={e => s("width", e.target.value)} inputMode="numeric" style={field} />
            </div>
            <div>
              <label style={label}>ارتفاع (متر)</label>
              <input value={form.height} onChange={e => s("height", e.target.value)} inputMode="numeric" style={field} />
            </div>
            <div>
              <label style={label}>تعداد وجوه</label>
              <select value={form.faces} onChange={e => s("faces", e.target.value)} style={field}>
                {["1", "2", "4", "6"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>قیمت پایه ماهانه (میلیون تومان)</label>
            <input value={form.price} onChange={e => s("price", e.target.value)} inputMode="numeric" style={field} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>تصاویر ({faNum(photoCount)} از ۵)</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={handleFiles} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {keptUrls.map(url => (
                <div key={url} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "4/3", border: "1px solid var(--border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => setKeptUrls(prev => prev.filter(u => u !== url))}
                    style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {newPhotos.map((p, i) => (
                <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "4/3", border: "1px solid var(--border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => setNewPhotos(prev => prev.filter((_, j) => j !== i))}
                    style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photoCount < MAX_PHOTOS && (
                <button onClick={() => fileRef.current?.click()}
                  style={{ border: "2px dashed var(--border)", background: "none", borderRadius: 8, aspectRatio: "4/3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", fontSize: "0.68rem" }}>
                  <ImagePlus size={20} style={{ color: "var(--accent)" }} /> افزودن
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={label}>پلن</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["free", "featured"] as const).map(p => (
                <label key={p} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: plan === p ? "rgba(59,123,245,0.08)" : "var(--bg-surface)", border: `1.5px solid ${plan === p ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, cursor: "pointer", fontSize: "0.8rem" }}>
                  <input type="radio" checked={plan === p} onChange={() => setPlan(p)} style={{ accentColor: "var(--accent)" }} />
                  {p === "free" ? "رایگان" : "ویژه"}
                </label>
              ))}
            </div>
            {plan === "featured" && (
              <div style={{ fontSize: "0.72rem", color: "var(--accent-warm)", marginTop: 8, lineHeight: 1.8 }}>
                پرداخت آنلاین فعال نیست. آگهی در وضعیت «در انتظار پرداخت» می‌رود و پشتیبانی برای هماهنگی واریز تماس می‌گیرد.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, border: "1px solid var(--border)", background: "none", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.83rem", padding: "10px 16px", borderRadius: 8, cursor: saving ? "default" : "pointer" }}>
            انصراف
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, border: "none", background: saving ? "var(--border)" : "var(--accent)", color: "#fff", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700, padding: "10px 16px", borderRadius: 8, cursor: saving ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {saving ? "در حال ارسال..." : <><Check size={15} /> ذخیره و ارسال مجدد</>}
          </button>
        </div>
      </div>
    </div>
  );
}
