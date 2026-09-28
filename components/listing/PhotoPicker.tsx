"use client";
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { preparePhotos } from "@/lib/client/photos";
import { faNum } from "@/lib/format";
import form from "@/components/ui/form.module.css";
import { photoSrc, type PhotoEntry } from "./use-listing-form";
import styles from "./listing.module.css";

/**
 * The photo list: kept photos and new ones, the first being the cover. New
 * files are shrunk in the browser before they are shown (lib/client/photos.ts),
 * so what is previewed is what will be sent.
 */
export function PhotoPicker({ photos, onChange, max, onError }: {
  photos: PhotoEntry[];
  onChange: (next: PhotoEntry[]) => void;
  max: number;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setPreparing(true);
    const { files: ready, error } = await preparePhotos(files, max - photos.length);
    setPreparing(false);
    onError(error);
    onChange([...photos, ...ready.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const remove = (i: number) => {
    const gone = photos[i];
    if (!("kept" in gone)) URL.revokeObjectURL(gone.preview);
    onChange(photos.filter((_, j) => j !== i));
  };

  return (
    <div className={form.field}>
      <span className={form.label}>تصاویر ({faNum(photos.length)} از {faNum(max)}) — اولی تصویر اصلی است</span>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className={styles.hidden} onChange={pick} />
      <div className={styles.photos}>
        {photos.map((p, i) => (
          <div key={photoSrc(p)} className={styles.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or an upload, not a catalogue image */}
            <img src={photoSrc(p)} alt="" />
            {i === 0 && <span className={styles.first}>اصلی</span>}
            <button type="button" className={styles.remove} onClick={() => remove(i)} aria-label={`حذف تصویر ${faNum(i + 1)}`}>
              <X size={13} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          // A button: with the file input hidden, this is the keyboard's way in.
          <button type="button" className={styles.add} onClick={() => input.current?.click()} disabled={preparing}>
            <ImagePlus size={22} /> {preparing ? "در حال آماده‌سازی…" : "افزودن تصویر"}
          </button>
        )}
      </div>
      <div className={form.hint}>
        JPG، PNG یا WEBP — عکس گوشی را مستقیم انتخاب کنید؛ پیش از ارسال در همین مرورگر کوچک می‌شود و اطلاعات مکانِ ذخیره‌شده در آن حذف می‌شود.
      </div>
    </div>
  );
}
