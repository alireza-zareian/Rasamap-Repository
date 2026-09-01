"use client";
import { useState } from "react";
import { Billboard } from "@/lib/data";
import BookingModal from "./BookingModal";

interface Props {
  billboard: Billboard;
}

export default function BillboardBookingCTA({ billboard }: Props) {
  const [open, setOpen] = useState(false);
  const available = billboard.status === "available";

  return (
    <>
      <button
        onClick={() => available && setOpen(true)}
        disabled={billboard.status === "inactive"}
        style={{
          display: "block", width: "100%", textAlign: "center",
          background: available ? "var(--accent)" : "var(--bg-surface)",
          color: available ? "#fff" : "var(--text-muted)",
          fontWeight: 700, fontSize: "0.9rem", padding: "13px",
          borderRadius: 10, marginBottom: 10,
          border: available ? "none" : "1px solid var(--border)",
          cursor: available ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        {available ? "رزرو این رسانه" : billboard.status === "inactive" ? "غیرفعال" : "مشاهده در جستجو"}
      </button>
      {open && (
        <BookingModal
          billboard={billboard}
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  );
}
