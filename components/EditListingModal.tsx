"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { fetchJson, FetchError, errorMessage, TIMEOUT_MS } from "@/lib/client/fetch-json";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import { MAX_LISTING_IMAGES } from "@/lib/domain/listing";
import { Button } from "@/components/ui/Button";
import form from "@/components/ui/form.module.css";
import { ListingFields } from "@/components/listing/ListingFields";
import { PhotoPicker } from "@/components/listing/PhotoPicker";
import { PlanPicker } from "@/components/listing/PlanPicker";
import { useListingForm, type ExistingListing } from "@/components/listing/use-listing-form";
import styles from "./EditListingModal.module.css";

/**
 * The submitter's edit form for a listing an admin sent back ("نیاز به اصلاح"):
 * the same fields as /list-media, on one screen. Saving PATCHes
 * /api/listings/[id], which returns the row to the review queue.
 */
export default function EditListingModal({
  listing: existing,
  onClose,
  onSaved,
}: {
  listing: ExistingListing & { id: number };
  onClose: () => void;
  onSaved: (updated: Record<string, unknown>) => void;
}) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);
  const listing = useListingForm(existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving) return;
    const problem = listing.checkAll() ?? (listing.photos.length === 0 ? "حداقل یک تصویر لازم است." : null);
    if (problem) { setError(problem); return; }
    setError("");
    setSaving(true);
    try {
      const data = await fetchJson<{ listing: Record<string, unknown> }>(`/api/listings/${existing.id}`, {
        // Photographs travel with this request, so it gets the upload budget.
        timeoutMs: TIMEOUT_MS.upload,
        method: "PATCH",
        body: listing.toFormData(),
      });
      onSaved(data.listing);
    } catch (err) {
      // A session that expired while this was open — a full reload, not a soft
      // push, because the dashboard behind it is now showing stale state.
      if (err instanceof FetchError && err.status === 401) {
        window.location.href = "/login?next=/dashboard";
        return;
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="elm-title" tabIndex={-1}
        className={styles.box} onClick={e => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 id="elm-title" className={styles.title}>ویرایش و ارسال مجدد آگهی</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="بستن"><X size={18} /></button>
        </div>
        <div className={styles.body}>
          {error && <div role="alert" className={form.error}>{error}</div>}
          <ListingFields group="basic" listing={listing} />
          <ListingFields group="place" listing={listing} />
          <ListingFields group="size" listing={listing} />
          <PhotoPicker photos={listing.photos} onChange={listing.setPhotos} max={MAX_LISTING_IMAGES} onError={setError} />
          <PlanPicker plan={listing.plan} onChange={listing.setPlan} />
        </div>
        <div className={styles.foot}>
          <Button className={styles.cancel} onClick={onClose} disabled={saving}>انصراف</Button>
          <Button intent="primary" className={styles.save} onClick={save} disabled={saving}>
            {saving ? "در حال ارسال…" : <><Check size={15} /> ذخیره و ارسال مجدد</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
