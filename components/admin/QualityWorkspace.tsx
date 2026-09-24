"use client";
import { useState } from "react";
import type { Billboard } from "@/lib/types";
import { QualityPanel } from "./QualityPanel";
import { EditModal } from "./EditModal";
import { ImageManager } from "./ImageManager";
import { usePermissionNotice } from "./PermissionNotice";

/**
 * The quality checks, with the edit and photo dialogs a fix opens. The rows
 * arrive from the server with the page; a fix updates them in place.
 */
export function QualityWorkspace({ initial, canEdit }: { initial: Billboard[]; canEdit: boolean }) {
  const [billboards, setBillboards] = useState(initial);
  const [editTarget, setEditTarget] = useState<Billboard | null>(null);
  const [imgTarget, setImgTarget] = useState<Billboard | null>(null);
  const { notice, deny } = usePermissionNotice();

  return (
    <>
      {notice}
      <QualityPanel billboards={billboards} onFix={canEdit ? setEditTarget : () => deny("دسترسی ویرایش ندارید")} />
      {editTarget && (
        <EditModal
          billboard={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={updated => setBillboards(prev => prev.map(b => b.id === updated.id ? updated : b))}
          onImageManager={b => { setEditTarget(null); setImgTarget(b); }}
        />
      )}
      {imgTarget && <ImageManager billboard={imgTarget} onClose={() => setImgTarget(null)} />}
    </>
  );
}
