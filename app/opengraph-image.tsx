import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCachedSiteStats } from "@/lib/db/cached";
import { faNum } from "@/lib/format";

/**
 * The card Telegram, WhatsApp and X draw when someone shares the site.
 *
 * Until now they drew nothing — no image meant a bare grey box beside the
 * link, which for a product whose whole pitch is "see the media before you
 * call" is the worst possible first impression.
 *
 * Generated rather than a static file so the counts on it are the real ones,
 * and rendered at build time: the numbers move a few times a day and the
 * cached read (§25) keeps this from touching the database per share.
 *
 * Two things about Persian in this renderer, both learned by looking at the
 * output rather than by reading about it.
 *
 * The font has to be handed over as bytes, and it has to be a *static* TTF.
 * Given neither, the renderer reaches out to Google Fonts, which fails on a
 * machine without that reachable and silently produces a card with Persian
 * text drawn as blank boxes — worse than no card at all. The two files in
 * assets/fonts/ are the project's own Vazirmatn with the weight axis pinned:
 * scripts/build-og-fonts.py makes them from the woff2 that ships in
 * node_modules, because Satori reads neither woff2 nor a variable axis.
 */

/**
 * And Satori has no bidirectional layout. It shapes the glyphs correctly and
 * then places the words left to right, so a Persian sentence comes out with
 * its words in reverse order — legible letters, unreadable sentence, which is
 * worse than no card at all. `dir="rtl"` does not fix it.
 *
 * So a line is laid out explicitly: one element per word, in a row-reverse
 * flex box. That puts the first word on the right, which is what reading order
 * means here. It also means no automatic wrapping — a line is a line — which
 * is why the copy below is short by design.
 *
 * The same reversal happens one level down, around the zero-width non-joiner
 * that Persian uses to join parts of a word without a space: «یک‌جا» came out
 * as «جایک». So each word is split on it too and its parts reversed in place,
 * with no gap — which is exactly what the character means.
 */
const ZWNJ = "\u200c";

function Word({ text }: { text: string }) {
  if (!text.includes(ZWNJ)) return <div>{text}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse" }}>
      {text.split(ZWNJ).map((part, i) => (
        <div key={i}>{part}</div>
      ))}
    </div>
  );
}

function Line({ children, ...style }: { children: string } & React.CSSProperties) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", gap: 14, ...style }}>
      {children.split(" ").map((word, i) => (
        <Word key={i} text={word} />
      ))}
    </div>
  );
}

/** Cached across requests: the file is on disk and never changes at runtime. */
let fontCache: { regular: Buffer; bold: Buffer } | null = null;

async function fonts() {
  if (!fontCache) {
    const dir = join(process.cwd(), "assets", "fonts");
    const [regular, bold] = await Promise.all([
      readFile(join(dir, "Vazirmatn-Regular.ttf")),
      readFile(join(dir, "Vazirmatn-Bold.ttf")),
    ]);
    fontCache = { regular, bold };
  }
  return fontCache;
}
export const alt = "رسامپ — پلتفرم جامع رسانه‌های محیطی ایران";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [stats, { regular, bold }] = await Promise.all([getCachedSiteStats(), fonts()]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0A0E1A 0%, #0f1829 55%, #0A0E1A 100%)",
          padding: 64,
          direction: "rtl",
          fontFamily: "Vazirmatn",
        }}
      >
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 16,
              background: "#3B7BF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 40,
              fontWeight: 900,
            }}
          >
            R
          </div>
          <div style={{ color: "#fff", fontSize: 44, fontWeight: 800 }}>رسامپ</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Line color="#fff" fontSize={62} fontWeight={800}>
            بیلبوردهای ایران، یک‌جا و قابل جست‌وجو
          </Line>
          <Line color="#a2acc0" fontSize={31}>
            قیمت، بازدید روزانه و موقعیت هر رسانه
          </Line>
        </div>

        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 64 }}>
          {[
            { n: faNum(stats.total), l: "رسانه ثبت‌شده" },
            { n: faNum(stats.cityCount), l: "شهر" },
            { n: faNum(Math.round(stats.totalDailyReach / 1_000_000)) + "M", l: "تردد روزانه" },
          ].map((s) => (
            <div key={s.l} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ color: "#3B7BF5", fontSize: 52, fontWeight: 800 }}>{s.n}</div>
              <Line color="#7c8699" fontSize={26} gap={8}>{s.l}</Line>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Vazirmatn", data: regular, weight: 400, style: "normal" },
        { name: "Vazirmatn", data: bold, weight: 800, style: "normal" },
      ],
    },
  );
}
