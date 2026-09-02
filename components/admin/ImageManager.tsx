"use client";
import { useState, useRef } from "react";
import type { Billboard } from "@/lib/types";
import { C } from "./constants";
import { Badge } from "./Badge";
import { Image as ImageIcon, X, FolderOpen } from "lucide-react";

export function ImageManager({ billboard, onClose }: { billboard: Billboard; onClose: () => void }) {
  const [images, setImages] = useState<string[]>(billboard.images ?? []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_MB = 5;

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter(f => ALLOWED.has(f.type) && f.size <= MAX_MB * 1024 * 1024);
    if (!valid.length) { setError("فقط JPG/PNG/WEBP تا ۵MB"); return; }
    setUploading(true); setError("");
    Promise.all(valid.map(f => new Promise<string>(res => {
      const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f);
    }))).then(urls => { setImages(p => [...p, ...urls]); setUploading(false); });
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/admin/billboards/${billboard.id}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ذخیره تصاویر"); return; }
      // Replace in-memory data URLs with saved server paths
      const saved = data.images as string[];
      setImages(saved);
      onClose();
    } catch { setError("خطای شبکه"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: "0.95rem" }}><ImageIcon size={15} /> تصاویر — #{billboard.id}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: C.red, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${C.accent}`, borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", marginBottom: 16, background: "rgba(255,77,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, color: C.muted }}><FolderOpen size={22} /></div>
          <div style={{ fontSize: "0.82rem", color: C.muted }}>{uploading ? "پردازش..." : "کلیک برای انتخاب (JPG/PNG/WEBP، max 5MB)"}</div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} style={{ display: "none" }} />
        </div>

        {images.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: "0.82rem" }}>هیچ تصویری ندارد</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {images.map((src, i) => (
              <div key={i} draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx === null || dragIdx === i) return;
                  setImages(p => { const a = [...p]; const [x] = a.splice(dragIdx, 1); a.splice(i, 0, x); return a; });
                  setDragIdx(null);
                }}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 6, alignItems: "center", cursor: "grab" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 6 }} loading="lazy" />
                {i === 0 && <Badge text="اصلی" color={C.green} bg="rgba(34,197,94,0.12)" />}
                <div style={{ display: "flex", gap: 4 }}>
                  {i > 0 && <button onClick={() => setImages(p => { const a = [...p]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })} style={{ fontSize: "0.7rem", padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer" }}>↑</button>}
                  <button onClick={() => setImages(p => p.filter((_, j) => j !== i))} style={{ fontSize: "0.7rem", padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)", background: "none", color: "#ef4444", cursor: "pointer" }}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            style={{ flex: 1, background: saving ? C.border : C.accent, border: "none", color: "#fff", fontFamily: C.font, fontWeight: 700, padding: 10, borderRadius: 9, cursor: saving ? "default" : "pointer", fontSize: "0.85rem" }}>
            {saving ? "در حال ذخیره..." : `ذخیره (${images.length} تصویر)`}
          </button>
          <button onClick={onClose} style={{ padding: "10px 18px", background: "none", border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.font, borderRadius: 9, cursor: "pointer" }}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
