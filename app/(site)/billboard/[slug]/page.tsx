import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Ruler, Square, Layers, MapPin, Check, ArrowRight, ExternalLink, ShieldCheck, Crosshair } from "lucide-react";
import { isPublished } from "@/lib/db/billboards";
import { getCachedBillboardBySlug, getCachedRelatedBillboards } from "@/lib/db/cached";
import { getActor } from "@/lib/auth/actor";
import BillboardGallery from "@/components/BillboardGallery";
import RelatedBillboards from "@/components/RelatedBillboards";
import ShareButton from "@/components/ShareButton";
import ReviewsSection from "@/components/ReviewsSection";
import TrafficMeter from "@/components/TrafficMeter";
import BillboardContact from "@/components/BillboardContact";
import { typeLabels, availabilityLabels, moderationLabels, DATA_SOURCES, type Billboard } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";
import { faNum, faCompact } from "@/lib/format";
import { mapLinks } from "@/lib/domain/location";
import { availabilityTone } from "@/components/ui/availability";
import { cssVar } from "@/components/ui/css-var";
import styles from "./detail.module.css";

const TYPE_LABEL = typeLabels as Record<string, string>;

/** Suggestions at the foot of the page — one marquee's worth. */
const RELATED_COUNT = 12;

/**
 * Structured data for one media item.
 *
 * A catalogue page in a search result is either a blue link or a card with the
 * photo, the price and the rating on it. This is the difference between the
 * two, and for a directory it is close to the whole SEO argument.
 *
 * Modelled as a Product with an Offer because that is what the page is: a
 * thing with a price and an availability, rented by the month.
 *
 * The price needs care. The catalogue stores millions of Toman — `price: 65`
 * means 65 million Toman a month — and schema.org wants an ISO 4217 currency,
 * of which Toman is not one. Iran's ISO code is IRR, the Rial, and one Toman is
 * ten Rial: hence the factor of ten million. Publishing 65 against "IRR" would
 * advertise a billboard for six Toman.
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
      // The listed rate is per month; the unit is what stops a crawler reading
      // it as a one-off purchase price.
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        priceCurrency: "IRR",
        price: b.price * 10_000_000,
        unitCode: "MON",
      },
      // Only what is known: a crawled board's state is not (see
      // availabilityFromFeed), and saying InStock for it would be a guess.
      ...(b.availability === "available" ? { availability: "https://schema.org/InStock" }
        : b.availability === "unknown" ? {}
        : { availability: "https://schema.org/OutOfStock" }),
      areaServed: { "@type": "City", name: b.city },
      ...(phoneAvailable ? { seller: { "@type": "Organization", name: b.agency || "رسامپ" } } : {}),
    },
    // Only when real reviews exist — a rating invented for the crawler is the
    // kind of thing that gets a site's rich results removed.
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

/** What "nearby" means from a media page — a comfortable ring rather than the
 *  widest the catalogue allows. The visitor can widen it on the results page. */
const NEARBY_RADIUS_KM = 5;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // The same cached read the page itself makes, so the two share one entry
  // instead of querying for the same record twice per visit. Always the public
  // view: a title and a social preview are for crawlers and shared links, and a
  // listing still under review has neither.
  const found = await getCachedBillboardBySlug(slug, false);
  if (!found) return { title: "رسانه یافت نشد | رسامپ" };
  const b = found.billboard;
  return {
    title: `${b.name} | رسامپ`,
    description: `${TYPE_LABEL[b.type] ?? b.type} در ${b.city} — ${b.width}×${b.height} متر — ${faNum(b.price)} میلیون تومان/ماه`,
    openGraph: {
      title: b.name,
      description: `${b.city} · ${TYPE_LABEL[b.type]} · ${faNum(b.price)} میلیون تومان`,
      ...(b.images?.[0] ? { images: [{ url: b.images[0] }] } : {}),
    },
  };
}

export default async function BillboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A reviewer needs to see a submission the way an advertiser eventually will,
  // not only as rows in a form — so a staff member may open a listing that is
  // still pending, and gets told plainly that it is. The check happens here, on
  // the server: the page is rendered before anything reaches the browser, so
  // there is no moment where the markup exists and the permission does not.
  const isStaff = (await getActor())?.kind === "staff";

  // A staff view is read uncached, so a reviewer's view of a listing still
  // under review can never be stored where a visitor would be handed it.
  const found = await getCachedBillboardBySlug(slug, isStaff);
  if (!found) notFound();
  const { billboard: b, phoneAvailable } = found;

  const unpublished = !isPublished(b.moderation);

  // Suggestions for the foot of the page — same neighbourhood or same media
  // type, narrowed to what those cards draw.
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
    <div className={styles.page}>
      {/* Escaping "<" is not decoration: without it a name containing
          "</script>" would end the tag early and turn catalogue data into
          markup. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(mediaJsonLd(b, area, phoneAvailable)).replace(/</g, "\\u003c"),
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
        <Link href="/explore">جستجو</Link>
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

              <BillboardGallery images={allImgs} name={b.name} type={b.type} />

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
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>توضیحات</h2>
                  <p>{b.description}</p>
                </section>
              )}

              {b.features?.length > 0 && (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>ویژگی‌ها</h2>
                  <ul className={styles.tags}>
                    {b.features.map((f, i) => <li key={i} className={`${styles.tag} ${styles.feature}`}><Check size={12} /> {f}</li>)}
                  </ul>
                </section>
              )}

              {b.nearbyLandmarks?.length > 0 && (
                <section className={styles.panel}>
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

                {/* Rasamap lists media it does not own, so there is no checkout
                    here: the next step is talking to the owner. The phone
                    number is fetched from an authed endpoint only when a
                    signed-in user asks for it — never embedded in the page. */}
                <BillboardContact hasPhone={phoneAvailable} agency={b.agency} slug={b.slug} />

                <div className={styles.direct}>اجاره و قرارداد مستقیماً با صاحب رسانه انجام می‌شود. رسامپ واسطهٔ مالی نیست.</div>

                <Link href="/explore" className={styles.back}><ArrowRight size={13} /> بازگشت به جستجو</Link>
              </div>

              {/* A crawled row is the source's published listing. Naming and
                  linking the source is the credit it is owed, and tells the
                  visitor where to check what this page says. */}
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
                <iframe
                  src={`https://maps.google.com/maps?q=${at.lat},${at.lng}&z=15&output=embed&hl=fa`}
                  /* No loading="lazy": on a phone the frame sits just below the
                     fold, and Chrome on Android shrinks the lazy pre-load
                     distance on a slow connection, so it was never requested
                     on a first view (AGENTS.md rule 9). */
                  allowFullScreen
                  /* no-referrer: over plain http on a LAN address the default
                     handed Google a private host as referrer — the one input
                     that differed between the laptop and a phone. */
                  referrerPolicy="no-referrer"
                  title="موقعیت رسانه روی نقشه"
                />
                {/* The embed is Google's and often unreachable from an Iranian
                    mobile line, and a failed cross-origin frame cannot be
                    detected. So the way out is always shown: the coordinates,
                    and the two Iranian map apps next to Google. */}
                <div className={styles.mapFoot}>
                  <span className={styles.coords}>
                    مختصات: <span>{at.lat.toFixed(5)}, {at.lng.toFixed(5)}</span>
                  </span>
                  <div className={styles.mapLinks}>
                    {/* A radial search that needs no geolocation permission and
                        no secure context — both missing on the LAN demo. */}
                    <Link href={`/explore?lat=${at.lat.toFixed(6)}&lng=${at.lng.toFixed(6)}&radiusKm=${NEARBY_RADIUS_KM}`} className={styles.mapLink}>
                      <Crosshair size={10} /> رسانه‌های نزدیک این نقطه
                    </Link>
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
    </div>
  );
}
