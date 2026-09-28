import "server-only";
import { prisma } from "./client";
import { getPublishedBillboardsByIds, published, toCatalogueItem } from "./billboards";
import { conflict, isUniqueViolation, notFound } from "@/lib/domain/errors";
import type { CustomerActor } from "@/lib/domain/actor";
import type { CatalogueItem } from "@/lib/types";
import { faNum } from "@/lib/format";

/**
 * A customer's saved media (§40). One row per (account, media): the primary key
 * is the pair, so saving twice — two tabs, a double tap — is still one row.
 * Only published media can be saved; one taken down stays saved but is not
 * listed until it returns.
 */

/** A ceiling on one account's rows, far past what a person keeps. */
export const MAX_FAVORITES = 200;

/** The slugs this customer has saved and the public can see, for the hearts on a page. */
export async function listFavoriteSlugs(actor: CustomerActor): Promise<string[]> {
  const rows = await prisma.favorite.findMany({
    where:   { userId: actor.id, billboard: published },
    select:  { billboard: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
    take:    MAX_FAVORITES,
  });
  return rows.map((r) => r.billboard.slug);
}

/** The saved media themselves, newest first, as cards draw them. */
export async function listFavorites(actor: CustomerActor): Promise<CatalogueItem[]> {
  const rows = await prisma.favorite.findMany({
    where:   { userId: actor.id },
    select:  { billboardId: true },
    orderBy: { createdAt: "desc" },
    take:    MAX_FAVORITES,
  });
  const media = await getPublishedBillboardsByIds(rows.map((r) => r.billboardId));
  return media.map(toCatalogueItem);
}

async function publishedIdBySlug(slug: string): Promise<number> {
  const row = await prisma.billboard.findFirst({ where: { slug, ...published }, select: { id: true } });
  if (!row) throw notFound("رسانه یافت نشد");
  return row.id;
}

/**
 * Save a media item. Idempotent: saving what is already saved changes nothing.
 * The ceiling is checked after the insert, in the same transaction, so two
 * saves at once cannot both slip under it — the one that crosses it is undone.
 */
export async function addFavorite(actor: CustomerActor, slug: string): Promise<void> {
  const billboardId = await publishedIdBySlug(slug);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.favorite.upsert({
        where:  { userId_billboardId: { userId: actor.id, billboardId } },
        update: {},
        create: { userId: actor.id, billboardId },
      });
      const count = await tx.favorite.count({ where: { userId: actor.id } });
      if (count > MAX_FAVORITES) {
        throw conflict(`حداکثر ${faNum(MAX_FAVORITES)} رسانه را می‌توانید ذخیره کنید؛ چند مورد قدیمی را بردارید.`);
      }
    });
  } catch (err) {
    // The other of two simultaneous first saves wrote the row: the outcome asked for.
    if (isUniqueViolation(err)) return;
    throw err;
  }
}

/** Unsave. Idempotent, and a slug that names nothing is simply not saved. */
export async function removeFavorite(actor: CustomerActor, slug: string): Promise<void> {
  await prisma.favorite.deleteMany({ where: { userId: actor.id, billboard: { slug } } });
}
