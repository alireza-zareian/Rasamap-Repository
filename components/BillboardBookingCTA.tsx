"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Billboard } from "@/lib/types";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import BookingModal from "./BookingModal";

interface Props {
  billboard: Billboard;
}

export default function BillboardBookingCTA({ billboard }: Props) {
  const [open, setOpen] = useState(false);
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const available = billboard.status === "available";

  const onBookClick = () => {
    if (!available || loading) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/billboard/${billboard.slug}`)}`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={onBookClick}
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
        {available
          ? (user || loading ? "رزرو این رسانه" : "برای رزرو وارد شوید")
          : billboard.status === "inactive" ? "غیرفعال" : "مشاهده در جستجو"}
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
