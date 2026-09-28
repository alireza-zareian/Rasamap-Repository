import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import IntentLink from "@/components/ui/IntentLink";
import { Ruler, Square, Layers, MapPin, Check, ArrowRight, ExternalLink, ShieldCheck, Crosshair } from "lucide-react";
import { isPublished } from "@/lib/db/billboards";
import { getCachedBillboardBySlug, getCachedRelatedBillboards } from "@/lib/db/cached";
import BillboardGallery from "@/components/BillboardGallery";
import RelatedBillboards from "@/components/RelatedBillboards";
import ShareButton from "@/components/ShareButton";
import ReviewsSection from "@/components/ReviewsSection";
import SearchBackLink from "@/components/SearchBackLink";
import TrafficMeter from "@/components/TrafficMeter";
import BillboardContact from "@/components/BillboardContact";
import MapEmbed from "@/components/MapEmbed";
import { typeLabels, availabilityLabels, moderationLabels, DATA_SOURCES, type Billboard } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";
import { faNum, faCompact } from "@/lib/format";
import { mapLinks } from "@/lib/domain/location";
import { availabilityTone } from "@/components/ui/availability";
import { cssVar } from "@/components/ui/css-var";
import styles from "./detail.module.css";
import reveal from "@/components/ui/reveal.module.css";

const TYPE_LABEL = typeLabels as Record<string, string>;

/** Suggestions at the foot of the page — one marquee's worth. */
const RELATED_COUNT = 12;

/**
 * Structured data for one media item: a Product with a monthly Offer, which
 * lets a search result show the photo, price and rating (§30).
 *
 * Prices are stored in millions of Toman; schema.org wants ISO 4217, and
 * Toman is not a code. IRR is the Rial, ten to a Toman — hence × 10,000,000.
 */
function mediaJsonLd(b: Billboard, area: number, phoneAvailable: boolean) {
  const url = `${SITE_URL}/billboard/${b.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: b.name,
    description: b.description || `${TYPE_LABEL[b.type] ?? b.type} در ${b.city} — ${b.width}×${b.height} متر`,
    url,
    ...(b.images?.[0] ? { image: `${SITE_URL}${b.images[0]}` } : {}),
    category: TYPE_LABEL[b.type] ?? b.type,
    ...(b.agency ? { brand: { "@type": "Organization", name: b.agency } } : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "ابعاد", value: `${b.width}×${b.height} متر` },
      { "@type": "PropertyValue", name: "مساحت", value: `${area} مترمربع` },
      { "@type": "PropertyValue", name: "تردد روزانه", value: String(b.traffic?.daily ?? 0) },
    ],
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "IRR",
      price: b.price * 10_000_000,
      // Per month, not a one-off price.
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        priceCurrency: "IRR",
        price: b.price * 10_000_000,
        unitCode: "MON",
      },
      // Omitted when unknown (availabilityFromFeed) rather than guessed.
      ...(b.availability === "available" ? { availability: "https://schema.org/InStock" }
        : b.availability === "unknown" ? {}
        : { availability: "https://schema.org/OutOfStock" }),
      areaServed: { "@type": "City", name: b.city },
      ...(phoneAvailable ? { seller: { "@type": "Organization", name: b.agency || "رسامپ" } } : {}),
    },
    // Only from real reviews.
    ...(b.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: b.rating,
            reviewCount: b.reviewCount,
          },
        }
      : {}),
  };
}

/** The trail drawn above the title, for a search result to show instead of the URL. */
function breadcrumbJsonLd(b: Billboard) {
  const trail = [
    { name: "خانه", url: `${SITE_URL}/` },
    { name: "جستجو", url: `${SITE_URL}/explore` },
    { name: b.name, url: `${SITE_URL}/billboard/${b.slug}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.url })),
  };
}

/** "Nearby" from a media page; the results page can widen it. */
const NEARBY_RADIUS_KM = 5;

/** Title and description, always from the public view: a listing in review has none to give. */
export async function mediaMetadata(slug: string): Promise<Metadata> {
  const found = await getCachedBillboardBySlug(slug, false);
  if (!found) return { title: "رسانه یافت نشد | رسامپ" };
  const b = found.billboard;
  return {
    title: `${b.name} | رسامپ`,
    // The public address, which the staff preview (served under it) shares.
    alternates: { canonical: `/billboard/${b.slug}` },
    description: `${TYPE_LABEL[b.type] ?? b.type} در ${b.city} — ${b.width}×${b.height} متر — ${faNum(b.price)} میلیون تومان/ماه`,
    openGraph: {
      title: b.name,
      description: `${b.city} · ${TYPE_LABEL[b.type]} · ${faNum(b.price)} میلیون تومان`,
      ...(b.images?.[0] ? { images: [{ url: b.images[0] }] } : {}),
    },
  };
}

/**
 * One media item's page. Rendered by two routes: ./page.tsx for everyone, with
 * `staffPreview` false and no cookie read, so it can be served from the cache;
 * and ./preview/page.tsx, where proxy.ts sends a staff session, which may open
 * a listing still in review to see it as a visitor will.
 */
export default async function MediaPage({ slug, staffPreview }: { slug: string; staffPreview: boolean }) {
  const found = await getCachedBillboardBySlug(slug, staffPreview);
  if (!found) notFound();
  const { billboard: b, phoneAvailable } = found;

  const unpublished = !isPublished(b.moderation);

  const related = await getCachedRelatedBillboards(b, RELATED_COUNT);

  const allImgs: string[] = [
    ...(b.images ?? []),
    ...((b.allImages ?? []).filter(u => !(b.images ?? []).includes(u))),
  ];
  const tone = cssVar("--tone", availabilityTone(b.availability));
  const area = b.width * b.height;
  const source = b.source && b.source !== "manual" ? DATA_SOURCES[b.source] : undefined;
  const at = b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null;
  const links = at ? mapLinks(at) : null;

  return (
    <main className={styles.page}>
      {/* "<" escaped, or a name containing "</script>" would end the tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([mediaJsonLd(b, area, phoneAvailable), breadcrumbJsonLd(b)]).replace(/</g, "\\u003c"),
        }}
      />

      {/* Only a staff session can reach an unpublished row at all. */}
      {unpublished && (
        <div className={styles.preview}>
          <div className={styles.previewInner}>
            <span className={styles.previewTag}><ShieldCheck size={15} /> پیش‌نمایش همکاران</span>
            <span>این آگهی هنوز <b>{moderationLabels[b.moderation] ?? b.moderation}</b> است و برای بازدیدکنندگان دیده نمی‌شود.</span>
            <Link href="/admin/listings" className={styles.previewLink}>رفتن به صف تأیید ←</Link>
          </div>
        </div>
      )}

      <nav className={styles.crumbs} aria-label="مسیر صفحه">
        <Link href="/">خانه</Link>
        <span aria-hidden>›</span>
        <SearchBackLink>جستجو</SearchBackLink>
        <span aria-hidden>›</span>
        <span>{b.name}</span>
      </nav>

      <div className={styles.wrap}>
        <div className={styles.grid}>
          <div className={styles.main}>
            <div className={styles.head}>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{b.name}</h1>
                <div className={styles.badges}>
                  <span className={`${styles.badge} ${styles.typeBadge}`}>{TYPE_LABEL[b.type] ?? b.type}</span>
                  <span className={`${styles.badge} ${styles.statusBadge}`} style={tone}>{availabilityLabels[b.availability] ?? b.availability}</span>
                  <ShareButton title={b.name} />
                </div>
              </div>
              <div className={styles.address}>{b.location}</div>

              <BillboardGallery images={allImgs} name={b.name} type={b.type} slug={b.slug} />

              <div className={styles.specs}>
                {[
                  { icon: <Ruler size={13} />, label: "ابعاد", val: `${faNum(b.width)}×${faNum(b.height)} متر` },
                  { icon: <Square size={13} />, label: "مساحت", val: `${faNum(area)} مترمربع` },
                  { icon: <Layers size={13} />, label: "وجه", val: `${faNum(b.faces)} وجه` },
                  { icon: <MapPin size={13} />, label: "شهر", val: b.city },
                ].map(s => (
                  <div key={s.label} className={styles.spec}>
                    {s.icon}
                    <strong>{s.val}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.body}>
              {b.traffic && (
                <section>
                  <h2 className={styles.sectionHead}>
                    آنالیز ترافیک <span className={styles.estimate}>تخمین هوشمند</span>
                  </h2>
                  <div className={styles.traffic}>
                    <div className={styles.meter}><TrafficMeter traffic={b.traffic} /></div>
                    <div className={styles.stats}>
                      {[
                        { label: "تردد روزانه", val: b.traffic.daily ? faCompact(b.traffic.daily) : "—" },
                        { label: "بینندگان تخمینی", val: b.traffic.estimatedViews ? faCompact(b.traffic.estimatedViews) : "—" },
                        { label: "امتیاز دیده شدن", val: b.traffic.viewabilityScore ? `${faNum(b.traffic.viewabilityScore)}/۱۰۰` : "—" },
                        { label: "اوج ترافیک", val: b.traffic.peakHour || "—" },
                        { label: "سطح تراکم", val: b.traffic.congestionLevel ? `${faNum(b.traffic.congestionLevel)}/۱۰` : "—" },
                        { label: "عابران پیاده", val: b.traffic.pedestrian ? faCompact(b.traffic.pedestrian) : "—" },
                      ].map(item => (
                        <div key={item.label} className={styles.stat}>
                          <strong>{item.val}</strong>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className={styles.footnote}>
                    * اعداد ترافیک بر اساس جمعیت شهر، نوع رسانه، و موقعیت مکانی تخمین زده شده‌اند — داده واقعی ممکن است متفاوت باشد.
                  </p>
                </section>
              )}

              {b.description && (
                <section className={`${styles.panel} ${reveal.reveal}`}>
                  <h2 className={styles.panelTitle}>توضیحات</h2>
                  <p>{b.description}</p>
                </section>
              )}

              {b.features?.length > 0 && (
                <section className={`${styles.panel} ${reveal.reveal}`}>
                  <h2 className={styles.panelTitle}>ویژگی‌ها</h2>
                  <ul className={styles.tags}>
                    {b.features.map((f, i) => <li key={i} className={`${styles.tag} ${styles.feature}`}><Check size={12} /> {f}</li>)}
                  </ul>
                </section>
              )}

              {b.nearbyLandmarks?.length > 0 && (
                <section className={`${styles.panel} ${reveal.reveal}`}>
                  <h2 className={styles.panelTitle}>مکان‌های اطراف</h2>
                  <ul className={styles.tags}>
                    {b.nearbyLandmarks.map((lm, i) => <li key={i} className={styles.tag}><MapPin size={12} /> {lm}</li>)}
                  </ul>
                </section>
              )}

              <ReviewsSection billboardId={b.id} />
            </div>
          </div>

          <aside className={styles.side}>
            <div className={styles.sticky}>
              <div className={styles.priceCard}>
                <div className={styles.priceLine}>
                  <span className={styles.price}>{faNum(b.price)}</span>
                  <span className={styles.priceUnit}>میلیون تومان / ماه</span>
                  <span className={styles.priceNote}>حدسی · متغیر</span>
                </div>

                <div className={styles.tiers}>
                  {[
                    { label: "هفتگی", val: b.priceWeekly },
                    { label: "سه‌ماهه", val: b.priceQuarterly },
                    { label: "سالانه", val: b.priceYearly },
                  ].map(p => (
                    <div key={p.label} className={styles.tier}>
                      <strong>{p.val != null ? faNum(p.val) : "—"}</strong>
                      <span>{p.label}</span>
                    </div>
                  ))}
                </div>

                {/* No checkout: the next step is the owner. The phone is fetched
                    on request by a signed-in visitor, never in the page (§23). */}
                <BillboardContact hasPhone={phoneAvailable} agency={b.agency} slug={b.slug} />

                <div className={styles.direct}>اجاره و قرارداد مستقیماً با صاحب رسانه انجام می‌شود. رسامپ واسطهٔ مالی نیست.</div>

                <SearchBackLink className={styles.back}><ArrowRight size={13} /> بازگشت به نتایج جستجو</SearchBackLink>
              </div>

              {/* A crawled row credits and links its source. */}
              {source && (
                <div className={styles.source}>
                  اطلاعات این رسانه از{" "}
                  <a href={source.site} target="_blank" rel="noopener noreferrer nofollow">{source.name}</a>
                  {b.scrapedAt && <> · به‌روزرسانی {new Date(b.scrapedAt).toLocaleDateString("fa-IR")}</>}
                </div>
              )}
            </div>

            {at && links && (
              <div className={styles.map}>
                <div className={styles.mapHead}>موقعیت</div>
                <MapEmbed lat={at.lat} lng={at.lng} />
                {/* Google's embed is often unreachable from an Iranian mobile
                    line, and a failed frame cannot be detected — so the
                    coordinates and the Iranian map apps are always shown. */}
                <div className={styles.mapFoot}>
                  <span className={styles.coords}>
                    مختصات: <span>{at.lat.toFixed(5)}, {at.lng.toFixed(5)}</span>
                  </span>
                  <div className={styles.mapLinks}>
                    {/* No geolocation needed — unavailable over http on the LAN. */}
                    <IntentLink href={`/explore?lat=${at.lat.toFixed(6)}&lng=${at.lng.toFixed(6)}&radiusKm=${NEARBY_RADIUS_KM}`} className={styles.mapLink}>
                      <Crosshair size={10} /> رسانه‌های نزدیک این نقطه
                    </IntentLink>
                    <a href={links.neshan} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>نشان <ExternalLink size={10} /></a>
                    <a href={links.balad} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>بلد <ExternalLink size={10} /></a>
                    <a href={links.google} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>گوگل مپ <ExternalLink size={10} /></a>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      <RelatedBillboards items={related} />
    </main>
  );
}
