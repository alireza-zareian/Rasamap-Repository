import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { many, UploadedFile } from "@/lib/http/form";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { replaceBillboardImages } from "@/lib/db/billboards";
import { faNum } from "@/lib/format";
import { MAX_BILLBOARD_IMAGES, maxUploadBodyBytes } from "@/lib/domain/listing";

// PUT /api/admin/billboards/[id]/images — replace the photo list (editor+), as
// a multipart form whose `photos` field is the new list in order: each entry a
// photo the record already has, or a new file.
export const PUT = defineRoute(
  {
    name: "admin/billboards/[id]/images",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    form: z.object({
      photos: many(z.union([z.string().min(1).max(300), UploadedFile]), MAX_BILLBOARD_IMAGES, `حداکثر ${faNum(MAX_BILLBOARD_IMAGES)} تصویر مجاز است`),
    }),
    maxBodyBytes: maxUploadBodyBytes(MAX_BILLBOARD_IMAGES),
  },
  async ({ params, body, audit }) => {
    const images = await replaceBillboardImages(params.id, body.photos, MAX_BILLBOARD_IMAGES);
    // A customer's listing can have its photos replaced here, so the change has
    // to be answerable afterwards like any other edit.
    await audit("billboard_images_update", { details: { billboardId: params.id, count: images.length } });
    return NextResponse.json({ images });
  },
);
