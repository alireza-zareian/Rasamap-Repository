// docs/api.md as HTML, for staff only: it names every limit and defence, so to
// anyone else the address does not exist (404, not 403). A small escape-first
// renderer covers exactly what api.md uses; no markdown dependency.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import styles from "./api-docs.module.css";

export const metadata: Metadata = {
  title: "مرجع API — رسامپ",
  robots: { index: false, follow: false },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  // order matters: escape is already done by the caller
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = esc(md).split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    // horizontal rule
    if (/^---+$/.test(line.trim())) { out.push("<hr />"); i++; continue; }

    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }

    // table: header row, separator row, then body rows
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = (r: string) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) { rows.push(cells(lines[i])); i++; }
      out.push(
        '<div class="tw"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table></div>",
      );
      continue;
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // fenced code
    if (line.trim().startsWith("```")) {
      i++;
      const buf: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }

    // paragraph (collect until blank)
    const buf: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|---+$|\s*[-*]\s|```)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }

  return out.join("\n");
}

/** Rendered once: the file ships with the build and cannot change while the server runs. */
const renderApiDocs = unstable_cache(
  async (): Promise<string> => {
    try {
      return mdToHtml(await readFile(join(process.cwd(), "docs", "api.md"), "utf8"));
    } catch {
      return "<p>مرجع API در دسترس نیست.</p>";
    }
  },
  ["api-docs-html"],
  { revalidate: false },
);

export default async function ApiDocsPage() {
  if ((await getActor())?.kind !== "staff") notFound();
  const html = await renderApiDocs();

  return (
    <main className={styles.doc} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
