// Self-hosted API reference — renders docs/api.md as HTML at request time.
// No external CDN, no markdown dependency: a small, escaped-first renderer that
// covers exactly the constructs api.md uses (headings, tables, code, bold,
// links, rules, lists, paragraphs).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";

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

export default async function ApiDocsPage() {
  let html = "";
  try {
    const md = await readFile(join(process.cwd(), "docs", "api.md"), "utf8");
    html = mdToHtml(md);
  } catch {
    html = "<p>مرجع API در دسترس نیست.</p>";
  }

  return (
    <div style={{ direction: "rtl", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", background: "var(--bg-deep, #0b0f17)", color: "var(--text-main, #e6e9ef)", minHeight: "100vh" }}>
      <style>{`
        .apidoc { max-width: 980px; margin: 0 auto; padding: 48px 20px 80px; line-height: 1.85; }
        .apidoc h1 { font-size: 1.7rem; font-weight: 800; margin: 0 0 4px; }
        .apidoc h2 { font-size: 1.2rem; font-weight: 700; margin: 40px 0 10px; padding-top: 12px; border-top: 1px solid var(--border, #23293a); }
        .apidoc h3 { font-size: 1rem; font-weight: 700; margin: 24px 0 8px; }
        .apidoc p { margin: 10px 0; color: var(--text-muted, #a2acc0); }
        .apidoc code { background: var(--bg-surface, #161c28); border: 1px solid var(--border, #23293a); border-radius: 5px; padding: 1px 6px; font-size: 0.82em; font-family: ui-monospace, monospace; direction: ltr; display: inline-block; }
        .apidoc pre { background: var(--bg-surface, #161c28); border: 1px solid var(--border, #23293a); border-radius: 10px; padding: 14px 16px; overflow-x: auto; direction: ltr; }
        .apidoc pre code { background: none; border: none; padding: 0; }
        .apidoc a { color: var(--accent, #3b7bf5); }
        .apidoc ul { margin: 10px 0; padding-inline-start: 22px; color: var(--text-muted, #a2acc0); }
        .apidoc hr { border: none; border-top: 1px solid var(--border, #23293a); margin: 28px 0; }
        .apidoc .tw { overflow-x: auto; margin: 14px 0; }
        .apidoc table { border-collapse: collapse; width: 100%; font-size: 0.84rem; }
        .apidoc th, .apidoc td { border: 1px solid var(--border, #23293a); padding: 8px 10px; text-align: right; vertical-align: top; }
        .apidoc th { background: var(--bg-surface, #161c28); font-weight: 700; }
      `}</style>
      <div className="apidoc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
