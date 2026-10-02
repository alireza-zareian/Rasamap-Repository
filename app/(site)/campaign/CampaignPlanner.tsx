"use client";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, Link2, Printer, Plus, X, MapPin, Eye, Wallet, Gauge, Building2, Check, Share2 } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { typeLabels } from "@/lib/types";
import {
  CAMPAIGN_PERIODS, CAMPAIGN_PERIOD_KEYS, MAX_PICKED, budgetCheck, campaignTotals, parseBudget, type CampaignPeriod,
} from "@/lib/domain/campaign";
import { latinDigits } from "@/lib/domain/digits";
import { useCampaign } from "@/lib/client/use-campaign";
import { copyText } from "@/lib/client/clipboard";
import { faNum, faCompact } from "@/lib/format";
import { campaignHref } from "@/components/campaign/campaign-href";
import CampaignTable from "@/components/campaign/CampaignTable";
import PinMap, { type MapPoint } from "@/components/map/PinMap";
import MediaImage from "@/components/media/MediaImage";
import SearchBackLink from "@/components/media/SearchBackLink";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cssVar } from "@/components/ui/css-var";
import styles from "./campaign.module.css";

/**
 * The campaign planner (§40). The server hands over the media named in the
 * address, priced today; this adds the period, the totals, the map and the
 * editing. The visitor's own pick lives in localStorage (use-campaign.ts), and
 * the address follows it, so the address is always the plan — which is why
 * "copy link" can simply copy it.
 */

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every(x => b.includes(x));

/** Millions of toman, as a person says it: «۸۵۰ میلیون», «۱٫۲ میلیارد». */
function money(millions: number): string {
  return millions >= 1000
    ? `${faNum(Math.round(millions / 100) / 10)} میلیارد تومان`
    : `${faNum(Math.round(millions))} میلیون تومان`;
}

export default function CampaignPlanner({ items, requested, period, budget: initialBudget }: {
  items: CatalogueItem[];
  /** The slugs the address named; more than `items` when some are gone. */
  requested: string[];
  period: CampaignPeriod;
  /** Millions of toman, from `?b=`; null for no budget. */
  budget: number | null;
}) {
  const router = useRouter();
  const { items: picked, setItems, ready } = useCampaign();
  const [periodNow, setPeriodNow] = useState(period);
  // What is typed, so a half-typed or Persian-digit value stays as written.
  const [budgetText, setBudgetText] = useState(initialBudget !== null ? faNum(initialBudget).replace(/٬/g, "") : "");
  const budget = parseBudget(latinDigits(budgetText));
  const [hover, setHover] = useState<string | null>(null);
  const [shared, setShared] = useState<"copied" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();
  const [shown, hide] = useOptimistic(items, (state, slug: string) => state.filter(i => i.slug !== slug));

  const slugs = items.map(i => i.slug);
  const pickedSlugs = picked.map(p => p.slug);
  const missing = requested.length - items.length;
  // The address is the visitor's own plan (what they asked for, before any went missing).
  const own = sameSet(requested, pickedSlugs);
  const foreign = ready && !own && requested.length > 0 && picked.length > 0;

  useEffect(() => {
    if (!ready) return;
    if (requested.length === 0) {
      // The bare /campaign: go to the address of the visitor's own plan.
      if (picked.length > 0) router.replace(campaignHref(pickedSlugs, periodNow, budget));
      return;
    }
    if (own || picked.length === 0) {
      // Keep the saved copy in step with today's prices, and drop what is gone;
      // an empty pick simply adopts the plan it was sent.
      setItems(items);
      if (missing > 0) router.replace(campaignHref(slugs, periodNow, budget), { scroll: false });
    }
    // Only when the server's answer changes: the pick itself is what this writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items]);

  const totals = useMemo(() => campaignTotals(shown, periodNow), [shown, periodNow]);
  const { label: periodLabel, price: periodPrice } = CAMPAIGN_PERIODS[periodNow];
  const fit = budget !== null ? budgetCheck(shown.map(periodPrice), budget) : null;

  const choosePeriod = (p: CampaignPeriod) => {
    setPeriodNow(p);
    // The prices are all on the page already: only the address needs to know.
    window.history.replaceState(null, "", campaignHref(slugs, p, budget));
  };

  // The budget lives in the address too, so a shared plan carries it.
  const chooseBudget = (text: string) => {
    const clean = latinDigits(text).replace(/\D/g, "").slice(0, 7);
    setBudgetText(clean);
    window.history.replaceState(null, "", campaignHref(slugs, periodNow, parseBudget(clean)));
  };

  const remove = (slug: string) => {
    const rest = slugs.filter(s => s !== slug);
    if (own) setItems(prev => prev.filter(p => p.slug !== slug));
    startTransition(() => {
      hide(slug);
      router.replace(campaignHref(rest, periodNow, budget), { scroll: false });
    });
  };

  const share = async () => {
    const url = window.location.origin + campaignHref(slugs, periodNow, budget);
    // A phone offers its own share sheet; elsewhere the link is copied.
    if (navigator.share) {
      try { await navigator.share({ title: "طرح کمپین رسامپ", url }); return; } catch { /* dismissed: fall back to copying */ }
    }
    setShared((await copyText(url)) ? "copied" : "failed");
    setTimeout(() => setShared(null), 2500);
  };

  // The same array until the plan changes: PinMap memoises on it, and hovering
  // a pin or a row re-renders this page (§44).
  const points: MapPoint[] = useMemo(() => shown.flatMap((b, i) =>
    b.lat != null && b.lng != null ? [{ slug: b.slug, name: b.name, lat: b.lat, lng: b.lng, label: faNum(i + 1) }] : []), [shown]);

  const tiles = [
    { Icon: Wallet, label: `هزینهٔ ${periodLabel}`, value: money(totals.cost), tone: "var(--accent-warm)" },
    { Icon: Eye, label: "بینندهٔ روزانه (تخمین)", value: faCompact(totals.dailyViews), tone: "var(--accent)" },
    { Icon: Megaphone, label: `نمایش در ${periodLabel}`, value: faCompact(totals.impressions), tone: "var(--green-accent)" },
    { Icon: Gauge, label: "هزینهٔ هر هزار نمایش", value: totals.cpm != null ? `${faNum(totals.cpm)} تومان` : "—", tone: "var(--purple)" },
    { Icon: Building2, label: "شهر", value: faNum(totals.cities.length), tone: "var(--text-muted)" },
  ];

  return (
    <main id="main" className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}><Megaphone size={24} /> طرح کمپین</h1>
          <p className={styles.lede}>
            {shown.length > 0
              ? <>{faNum(shown.length)} رسانه در {faNum(totals.cities.length)} شهر، برای {periodLabel}</>
              : "چند رسانه را کنار هم بگذارید و هزینه و بازدیدشان را یکجا ببینید"}
          </p>
          {/* The date the page was printed, so a PDF says when its prices were read. */}
          <p className={styles.printOnly} suppressHydrationWarning>رسامپ — {new Date().toLocaleDateString("fa-IR")}</p>
        </div>
        {shown.length > 0 && (
          <div className={`${styles.tools} ${styles.noPrint}`}>
            <Button size="sm" onClick={share}>
              {shared === "copied" ? <><Check size={14} /> کپی شد</> : shared === "failed" ? "کپی نشد" : <><Share2 size={14} /> اشتراک</>}
            </Button>
            <Button size="sm" onClick={() => window.print()}><Printer size={14} /> چاپ / PDF</Button>
            {shown.length < MAX_PICKED && (
              <SearchBackLink className={styles.addMore}><Plus size={14} /> افزودن رسانه</SearchBackLink>
            )}
          </div>
        )}
      </header>

      {foreign && (
        <div className={`${styles.notice} ${styles.noPrint}`} role="status">
          <Link2 size={15} />
          <span>این طرح از یک لینک باز شده و با طرحِ ذخیره‌شدهٔ شما فرق دارد.</span>
          <Button size="sm" intent="primary" onClick={() => setItems(items)}>ذخیره به‌جای طرح من</Button>
          <Button size="sm" intent="quiet" onClick={() => router.replace(campaignHref(pickedSlugs, periodNow, budget))}>طرح خودم</Button>
        </div>
      )}
      {missing > 0 && (
        <div className={styles.notice} role="status">
          <X size={15} /> {faNum(missing)} رسانه از این طرح دیگر در سایت نیست و کنار گذاشته شد.
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={<Megaphone size={44} strokeWidth={1.4} />} tone="var(--accent-warm)" title="هنوز رسانه‌ای در طرح نیست"
          action={<ButtonLink href="/explore" intent="primary">رفتن به جستجو</ButtonLink>}>
          در صفحهٔ جستجو دکمهٔ «+ کمپین» را روی هر رسانه بزنید — تا {faNum(MAX_PICKED)} رسانه.
          این‌جا هزینهٔ کل، بازدید روزانه، هزینهٔ هر هزار نمایش و موقعیتشان روی نقشه را یکجا می‌بینید.
        </EmptyState>
      ) : (
        <div className={pending ? styles.busy : undefined}>
          <div className={`${styles.periods} ${styles.noPrint}`} role="radiogroup" aria-label="دورهٔ اکران">
            {CAMPAIGN_PERIOD_KEYS.map(p => {
              const { label } = CAMPAIGN_PERIODS[p];
              return (
                <button key={p} type="button" role="radio" aria-checked={p === periodNow}
                  className={styles.period} onClick={() => choosePeriod(p)}>
                  {label}
                </button>
              );
            })}
          </div>

          <section className={styles.tiles} aria-label="جمع کمپین">
            {tiles.map(t => (
              <div key={t.label} className={styles.tile} style={cssVar("--tone", t.tone)}>
                <t.Icon size={18} className={styles.tileIcon} />
                <div className={styles.tileValue}>{t.value}</div>
                <div className={styles.tileLabel}>{t.label}</div>
              </div>
            ))}
          </section>

          <section className={styles.budget} aria-labelledby="budget-label">
            <div className={styles.budgetHead}>
              <label id="budget-label" htmlFor="campaign-budget" className={styles.budgetLabel}>
                <Wallet size={16} /> بودجهٔ {periodLabel}
              </label>
              <div className={styles.budgetField}>
                <input id="campaign-budget" className={styles.budgetInput} value={budgetText}
                  onChange={e => chooseBudget(e.target.value)} inputMode="numeric" dir="ltr" autoComplete="off"
                  placeholder="مثلاً ۵۰۰" aria-describedby="budget-result" />
                <span>میلیون تومان</span>
              </div>
            </div>
            {fit && budget !== null ? (
              <div id="budget-result" className={styles.budgetResult} role="status" data-over={fit.left < 0 || undefined}>
                <div className={styles.budgetBar} aria-hidden="true">
                  <div className={styles.budgetFill} style={{ width: `${Math.min(100, Math.round((totals.cost / budget) * 100))}%` }} />
                </div>
                {fit.left >= 0 ? (
                  <p><Check size={14} /> {faNum(Math.round((totals.cost / budget) * 100))}٪ بودجه — {money(fit.left)} می‌ماند.</p>
                ) : (
                  <p>
                    <X size={14} /> {money(-fit.left)} بیش از بودجه.
                    {fit.dropToFit !== null && (
                      <> با برداشتنِ «{shown[fit.dropToFit].name}» در بودجه می‌مانید.{" "}
                        <Button size="sm" intent="quiet" className={styles.noPrint} onClick={() => remove(shown[fit.dropToFit!].slug)}>برداشتن</Button>
                      </>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p id="budget-result" className={styles.budgetHint}>بودجه را بنویسید تا ببینید طرح در آن جا می‌شود یا نه.</p>
            )}
          </section>

          <div className={styles.split}>
            <ol className={styles.list}>
              {shown.map((b, i) => (
                <li key={b.slug}
                  className={`${styles.item} ${hover === b.slug ? styles.itemOn : ""}`}
                  onMouseEnter={() => setHover(b.slug)} onMouseLeave={() => setHover(null)}>
                  <span className={styles.index}>{faNum(i + 1)}</span>
                  <div className={styles.thumb}>
                    <MediaImage src={b.images?.[0]} alt="" type={b.type} sizes="88px" iconSize={22} />
                  </div>
                  <div className={styles.itemBody}>
                    <Link href={`/billboard/${b.slug}`} className={styles.itemName}>{b.name}</Link>
                    <div className={styles.itemMeta}>
                      <MapPin size={11} /> {b.city} · {typeLabels[b.type]} · ~{faCompact(b.traffic.estimatedViews)} بیننده/روز
                    </div>
                    <div className={styles.share} aria-hidden="true">
                      <div className={styles.shareFill} style={{ width: `${Math.round(totals.shares[i] * 100)}%` }} />
                    </div>
                  </div>
                  <div className={styles.itemCost}>
                    <strong>{money(periodPrice(b))}</strong>
                    <span>{faNum(Math.round(totals.shares[i] * 100))}٪ بودجه</span>
                  </div>
                  <button type="button" className={`${styles.remove} ${styles.noPrint}`} onClick={() => remove(b.slug)}
                    aria-label={`حذف «${b.name}» از طرح`}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ol>

            <div className={styles.mapCard}>
              <div className={styles.mapHead}><MapPin size={14} /> موقعیت رسانه‌ها</div>
              <div className={styles.mapBox}>
                <PinMap points={points} active={hover} onHover={setHover} ariaLabel="نقشهٔ رسانه‌های کمپین" />
              </div>
              {points.length < shown.length && (
                <p className={styles.mapNote}>
                  {faNum(shown.length - points.length)} رسانه مختصاتِ قابل‌اتکا ندارد و روی نقشه نیامده است.
                </p>
              )}
            </div>
          </div>

          {shown.length >= 2 && (
            <section className={styles.compare}>
              <h2 className={styles.sectionTitle}>کنار هم</h2>
              <CampaignTable items={shown} />
            </section>
          )}

          <p className={styles.fine}>
            بیننده و نمایش، تخمینِ مدلِ ترافیکِ رسامپ‌اند (جمعیت شهر، نوع رسانه و موقعیت)، نه شمارشِ واقعی.
            قیمت‌ها همان قیمت‌های آگهی‌اند و قرارداد مستقیماً با صاحب هر رسانه بسته می‌شود.
          </p>
        </div>
      )}
    </main>
  );
}
