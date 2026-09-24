import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { replaceBillboardImages } from "@/lib/db/billboards";
import { maxUploadBodyBytes } from "@/lib/uploads";

const MAX_ADMIN_IMAGES = 10;

// PUT /api/admin/billboards/[id]/images — replace the photo list (editor+).
export const PUT = defineRoute(
  {
    name: "admin/billboards/[id]/images",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z.object({ images: z.array(z.string().min(1)).max(MAX_ADMIN_IMAGES) }),
    maxBodyBytes: maxUploadBodyBytes(MAX_ADMIN_IMAGES),
  },
  async ({ params, body }) => {
    const images = await replaceBillboardImages(params.id, body.images);
    return NextResponse.json({ images });
  },
);
