"use client";
import { useState, useRef, useEffect } from "react";
import { fetchJson, errorMessage, TIMEOUT_MS } from "@/lib/client/fetch-json";
import { Lightbox } from "./Lightbox";
import type { Billboard } from "@/lib/types";
import { Badge } from "./Badge";
import { Image as ImageIcon, FolderOpen, ArrowUp } from "lucide-react";
import { photoForm, preparePhotos } from "@/lib/client/photos";
import { MAX_BILLBOARD_IMAGES } from "@/lib/domain/listing";
import { faNum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import field from "@/components/ui/form.module.css";
import styles from "./ImageManager.module.css";

/** A photo in the list: one the record already has (its address), or a new file with its preview. */
type Entry = { kept: string } | { file: File; preview: string };

const src = (e: Entry) => ("kept" in e ? e.kept : e.preview);

export function ImageManager({ billboard, onClose }: { billboard: Billboard; onClose: () => void }) {
  const [images, setImages] = useState<Entry[]>((billboard.images ?? []).map(kept => ({ kept })));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Each preview holds its file in memory until released.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach(URL.revokeObjectURL), []);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setUploading(true); setError("");
    const { files: ready, error: rejected } = await preparePhotos(files, MAX_BILLBOARD_IMAGES - images.length);
    const added = ready.map(file => ({ file, preview: URL.createObjectURL(file) }));
    previews.current.push(...added.map(a => a.preview));
    setImages(p => [...p, ...added]);
    setError(rejected);
    setUploading(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const data = await fetchJson<{ images: string[] }>(`/api/admin/billboards/${billboard.id}/images`, {
        timeoutMs: TIMEOUT_MS.upload,
        method: "PUT",
        body: photoForm({}, images.map(e => ("kept" in e ? e.kept : e.file))),
      });
      setImages(data.images.map(kept => ({ kept })));
      onClose();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const move = (from: number, to: number) =>
    setImages(p => { const a = [...p]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });

  return (
    <Dialog
      icon={<ImageIcon size={15} />}
      title={`تصاویر — #${billboard.id}`}
      onClose={onClose}
      footer={<>
        <Button intent="primary" onClick={handleSave} disabled={saving || uploading}>
          {saving ? "در حال ذخیره…" : `ذخیره (${faNum(images.length)} تصویر)`}
        </Button>
        <Button intent="quiet" onClick={onClose}>انصراف</Button>
      </>}
    >
      {error && <div role="alert" className={field.error}>{error}</div>}

      {/* A button, so the keyboard reaches the file picker. */}
      <button type="button" className={styles.pick} onClick={() => fileRef.current?.click()} disabled={uploading}>
        <FolderOpen size={22} />
        {uploading ? "در حال آماده‌سازی…" : `کلیک برای انتخاب (JPG/PNG/WEBP، حداکثر ${faNum(MAX_BILLBOARD_IMAGES)} تصویر)`}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} hidden />

      {images.length === 0 ? (
        <p className={styles.empty}>هیچ تصویری ندارد</p>
      ) : (
        <ul className={styles.grid}>
          {images.map((entry, i) => (
            <li key={i} className={styles.tile} draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragIdx === null || dragIdx === i) return;
                move(dragIdx, i);
                setDragIdx(null);
              }}
            >
              <button type="button" className={styles.zoom} onClick={() => setLightbox(src(entry))} aria-label={`بزرگ‌نمایی تصویر ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(entry)} alt="" loading="lazy" decoding="async" />
              </button>
              {i === 0 && <Badge text="اصلی" tone="var(--green)" />}
              <div className={styles.tileActions}>
                {/* Dragging is mouse-only; this is the same reorder for a keyboard or a finger. */}
                {i > 0 && (
                  <Button size="sm" intent="quiet" title="انتقال به بالا" aria-label={`انتقال تصویر ${i + 1} به بالا`} onClick={() => move(i, i - 1)}>
                    <ArrowUp size={12} />
                  </Button>
                )}
                <Button size="sm" intent="danger" onClick={() => setImages(p => p.filter((_, j) => j !== i))}>حذف</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </Dialog>
  );
}
