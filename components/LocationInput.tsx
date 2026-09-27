"use client";
import { useId, useState } from "react";
import { MapPin, ExternalLink, X } from "lucide-react";
import { mapLinks, parseMapLocation, type LatLng } from "@/lib/domain/location";
import { Button } from "@/components/ui/Button";
import form from "@/components/ui/form.module.css";
import styles from "./LocationInput.module.css";

/**
 * Where a media item stands, from a pasted map link or two numbers
 * (lib/domain/location.ts reads Google Maps, Neshan, Balad and OpenStreetMap).
 * Used by the listing wizard, the resubmission form and the admin edit form.
 *
 * `preview` embeds a Google map of the point, for staff confirming a pin;
 * the public forms show links instead, so nothing loads until asked for.
 */
export function LocationInput({
  value,
  onChange,
  preview = false,
}: {
  value: LatLng | null;
  onChange: (next: LatLng | null) => void;
  preview?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const read = () => {
    const parsed = parseMapLocation(text);
    if (!parsed) {
      setError("موقعیتی در ایران در این متن پیدا نشد. لینکِ «اشتراک‌گذاری موقعیت» از نشان، بلد یا گوگل‌مپ را بچسبانید، یا دو عدد عرض و طول جغرافیایی را بنویسید.");
      return;
    }
    setError("");
    setText("");
    onChange(parsed);
  };

  const links = value ? mapLinks(value) : null;

  return (
    <div className={form.field}>
      <label htmlFor={id} className={form.label}>موقعیت روی نقشه (اختیاری)</label>
      <div className={form.row}>
        <input
          id={id}
          className={`${form.input} ${form.ltr}`}
          value={text}
          onChange={e => { setText(e.target.value); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); read(); } }}
          placeholder="https://neshan.org/maps/@35.7,51.4,16z  ·  35.7, 51.4"
        />
        <Button intent="success" onClick={read} disabled={!text.trim()}>
          <MapPin size={14} /> ثبت موقعیت
        </Button>
      </div>
      <div className={form.hint}>
        در اپ نقشه روی محل رسانه نگه دارید، «اشتراک‌گذاری» را بزنید و لینک را این‌جا بچسبانید. بدون موقعیت، رسانه روی نقشه و در جست‌وجوی «نزدیک من» دیده نمی‌شود.
      </div>
      {error && <div role="alert" className={form.error}>{error}</div>}
      {value && links && (
        <>
          <div className={form.success}>
            <MapPin size={14} /> موقعیت ثبت شد
            <span className={styles.coords}>{value.lat}, {value.lng}</span>
            <Button intent="quiet" size="sm" onClick={() => onChange(null)} aria-label="حذف موقعیت" className={styles.clear}>
              <X size={12} /> حذف
            </Button>
          </div>
          <div className={styles.links}>
            <a href={links.neshan} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> نشان</a>
            <a href={links.balad} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> بلد</a>
            <a href={links.google} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> گوگل‌مپ</a>
          </div>
          {preview && (
            <div className={styles.preview}>
              {/* Not lazy: it renders only once there is a point to confirm. */}
              <iframe src={`https://maps.google.com/maps?q=${value.lat},${value.lng}&z=15&output=embed&hl=fa`} title="پیش‌نمایش موقعیت" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
