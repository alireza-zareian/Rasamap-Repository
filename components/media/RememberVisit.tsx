"use client";
import { useEffect } from "react";
import { rememberViewed, type ViewedMedia } from "@/lib/client/recently-viewed";

/** Adds this media page to the browser's recently viewed list; draws nothing. */
export default function RememberVisit({ item }: { item: ViewedMedia }) {
  const { slug, name, city, type, price, image } = item;
  useEffect(() => {
    rememberViewed({ slug, name, city, type, price, ...(image ? { image } : {}) });
  }, [slug, name, city, type, price, image]);
  return null;
}
