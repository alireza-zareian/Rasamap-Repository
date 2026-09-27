"use client";
import { useState } from "react";
import { ListingFieldsSchema, type ListingPlan } from "@/lib/domain/listing";
import type { LatLng } from "@/lib/domain/location";
import { photoForm } from "@/lib/client/photos";

/**
 * The state behind a listing form — the submission wizard and the
 * resubmission modal hold exactly the same thing, so they hold it here.
 *
 * Fields are kept as the strings the inputs produce; the shared schema
 * (lib/domain/listing.ts) coerces them, in the browser for each step and again
 * on the server, so the two cannot disagree about what is valid.
 */

/** A photo in the form: one the listing already has, or a new file with its preview. */
export type PhotoEntry = { kept: string } | { file: File; preview: string };

export const photoSrc = (p: PhotoEntry) => ("kept" in p ? p.kept : p.preview);

export interface ListingDraft {
  name: string; desc: string; phone: string;
  type: string; city: string; region: string; location: string;
  width: string; height: string; faces: string; price: string;
}

/** A saved listing, as the owner's dashboard hands it to the edit form. */
export interface ExistingListing {
  name: string; description: string | null; phone: string | null;
  type: string; city: string; region: string | null; location: string | null;
  width: number; height: number; faces: number; price: number;
  plan: string; images: string[]; lat: number | null; lng: number | null;
}

/** Which fields each part of the form holds. The wizard shows one part per step. */
export const FIELD_GROUPS = {
  basic: ["name", "desc", "phone"],
  place: ["type", "city", "region", "location"],
  size:  ["width", "height", "faces", "price"],
} as const satisfies Record<string, readonly (keyof ListingDraft)[]>;

export type FieldGroup = keyof typeof FIELD_GROUPS;

const EMPTY: ListingDraft = {
  name: "", desc: "", phone: "", type: "billboard", city: "تهران", region: "", location: "",
  width: "", height: "", faces: "2", price: "",
};

function fromExisting(l: ExistingListing): ListingDraft {
  return {
    name: l.name, desc: l.description ?? "", phone: l.phone ?? "",
    type: l.type, city: l.city, region: l.region ?? "", location: l.location ?? "",
    width: String(l.width), height: String(l.height), faces: String(l.faces), price: String(l.price),
  };
}

export function useListingForm(existing?: ExistingListing) {
  const [draft, setDraft] = useState<ListingDraft>(existing ? fromExisting(existing) : EMPTY);
  const [place, setPlace] = useState<LatLng | null>(
    existing?.lat != null && existing.lng != null ? { lat: existing.lat, lng: existing.lng } : null,
  );
  const [photos, setPhotos] = useState<PhotoEntry[]>((existing?.images ?? []).map(kept => ({ kept })));
  const [plan, setPlan] = useState<ListingPlan>(existing?.plan === "featured" ? "featured" : "free");

  const set = (key: keyof ListingDraft, value: string) => setDraft(d => ({ ...d, [key]: value }));

  /** The first problem with one part of the form, in the words the server would use, or null. */
  const check = (group: FieldGroup): string | null => {
    const keys = Object.fromEntries(FIELD_GROUPS[group].map(k => [k, true])) as Record<(typeof FIELD_GROUPS)[FieldGroup][number], true>;
    const parsed = ListingFieldsSchema.pick(keys).safeParse(draft);
    if (!parsed.success) return parsed.error.errors[0]?.message ?? "اطلاعات این بخش کامل نیست.";
    return null;
  };

  /** Every part at once, for the one-screen edit form. */
  const checkAll = (): string | null => check("basic") ?? check("place") ?? check("size");

  /** The multipart body POST /api/listings and PATCH /api/listings/[id] read. */
  const toFormData = (): FormData =>
    photoForm(
      { ...draft, plan, ...(place ? { lat: place.lat, lng: place.lng } : {}) },
      photos.map(p => ("kept" in p ? p.kept : p.file)),
    );

  return { draft, set, setDraft, place, setPlace, photos, setPhotos, plan, setPlan, check, checkAll, toFormData };
}

export type ListingForm = ReturnType<typeof useListingForm>;
