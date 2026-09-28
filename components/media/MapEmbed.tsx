"use client";
import { useState } from "react";
import { MapPin } from "lucide-react";
import styles from "./MapEmbed.module.css";

/**
 * Google's map of one point, loaded when the visitor asks for it.
 *
 * It used to load with every media page: a third-party frame that pulls in its
 * own scripts and tiles, hands Google the visitor's address before they chose
 * anything, and is often unreachable from an Iranian mobile line anyway. The
 * page already names the point and links to Neshan, Balad and Google, so the
 * frame is the optional extra, not the only way to the place.
 */
export default function MapEmbed({ lat, lng }: { lat: number; lng: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className={styles.facade} onClick={() => setOpen(true)}>
        <MapPin size={22} />
        <span>نمایش نقشه</span>
      </button>
    );
  }

  return (
    <iframe
      className={styles.frame}
      src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed&hl=fa`}
      allowFullScreen
      /* no-referrer: over http on the LAN the default sent Google a private host. */
      referrerPolicy="no-referrer"
      title="موقعیت رسانه روی نقشه"
    />
  );
}
