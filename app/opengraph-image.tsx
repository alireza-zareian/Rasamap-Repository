import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCachedSiteStats } from "@/lib/db/cached";
import { faNum } from "@/lib/format";

/**
 * The card Telegram, WhatsApp and X show for a shared link, with the real
 * counts (read through the cache, so a share does not reach the database).
 *
 * Persian in this renderer (Satori), learned from its output (§30):
 *
 * The font must be passed as bytes, as a static TTF; otherwise it fetches from
 * Google Fonts and, where that is unreachable, draws blank boxes.
 * assets/fonts/ holds Vazirmatn with the weight pinned, made by
 * scripts/build-og-fonts.py — Satori reads neither woff2 nor a variable axis.
 */

/**
 * Satori has no bidirectional layout: words come out left to right, so a
 * Persian sentence reads backwards, and `dir="rtl"` does not help. A line is
 * therefore one element per word in a row-reverse flex box, with no wrapping —
 * hence the short copy. The same reversal happens around a zero-width
 * non-joiner («یک‌جا» became «جایک»), so each word's parts are reversed too.
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
