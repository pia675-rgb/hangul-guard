import { findingsFromText } from "./xml";
import type { Finding } from "./types";
import { MAX_FINDINGS_PER_FILE } from "./types";
import { bandFromY } from "./where";
import { extractPdfPageTexts } from "./pdf-raw";

type Pdfjs = typeof import("pdfjs-dist");

let pdfjsLoader: Promise<Pdfjs> | null = null;
let workerBlobUrl: string | null = null;

async function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsLoader) {
    pdfjsLoader = (async () => {
      const pdfjs = await import("pdfjs-dist");
      try {
        const workerMod = await import("pdfjs-dist/build/pdf.worker.min.mjs?raw");
        const source = typeof workerMod.default === "string" ? workerMod.default : String(workerMod);
        if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl);
        workerBlobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        pdfjs.GlobalWorkerOptions.workerSrc = workerBlobUrl;
      } catch {
        const isFile = typeof location !== "undefined" && location.protocol === "file:";
        if (!isFile) {
          const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        }
      }
      return pdfjs;
    })();
  }
  return pdfjsLoader;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function stringField(obj: Record<string, unknown> | null, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

type TextRun = { str: string; x: number; y: number };

function groupLines(runs: TextRun[]): Array<{ y: number; text: string }> {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = [];
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - run.y) <= 3.2) {
      last.parts.push({ x: run.x, str: run.str });
    } else {
      lines.push({ y: run.y, parts: [{ x: run.x, str: run.str }] });
    }
  }
  return lines.map((line) => ({
    y: line.y,
    text: line.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}

function alreadyHas(findings: Finding[], text: string): boolean {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return findings.some((f) => f.snippet === collapsed || f.hangul === collapsed);
}

export async function scanPdfBuffer(buffer: ArrayBuffer): Promise<Finding[]> {
  const rawPages = await extractPdfPageTexts(buffer).catch(() => []);
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer.slice(0)),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const findings: Finding[] = [];

  try {
    const meta = await pdf.getMetadata().catch(() => null);
    const info = asRecord(meta?.info);
    const pairs: Array<[string, string]> = [
      ["Title", "Title"],
      ["Author", "Author"],
      ["Subject", "Subject"],
      ["Keywords", "Keywords"],
      ["Creator", "Creator"],
      ["Producer", "Producer"],
    ];
    for (const [key, label] of pairs) {
      findingsFromText(stringField(info, key), `Properties · ${label}`, "metadata", findings, {
        headerName: `Properties · ${label}`,
      });
    }

    const outline = await pdf.getOutline().catch(() => null);
    const walkOutline = (items: Array<{ title?: string; items?: unknown[] }> | null, depth: number) => {
      if (!items) return;
      for (const item of items) {
        if (findings.length >= MAX_FINDINGS_PER_FILE) return;
        findingsFromText(item.title ?? "", `Bookmark${depth ? ` · L${depth}` : ""}`, "name", findings, {
          headerName: "Bookmark",
          style: depth ? `Level ${depth}` : undefined,
        });
        if (item.items) walkOutline(item.items as Array<{ title?: string; items?: unknown[] }>, depth + 1);
      }
    };
    walkOutline(outline as Array<{ title?: string; items?: unknown[] }> | null, 0);

    const pageCount = pdf.numPages;
    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      if (findings.length >= MAX_FINDINGS_PER_FILE) break;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!item || typeof item !== "object" || !("str" in item)) continue;
        const rec = item as { str?: string; transform?: number[] };
        if (typeof rec.str !== "string" || !rec.str) continue;
        const x = rec.transform?.[4] ?? 0;
        const y = rec.transform?.[5] ?? 0;
        runs.push({ str: rec.str, x, y });
      }
      const lines = groupLines(runs);
      let lineHits = 0;
      lines.forEach((line, index) => {
        if (!line.text) return;
        const before = findings.length;
        findingsFromText(line.text, `Page ${pageNum} · line ${index + 1}`, "body", findings, {
          page: pageNum,
          line: index + 1,
          band: bandFromY(line.y, viewport.height),
        });
        if (findings.length > before) lineHits += 1;
      });

      const annots = await page.getAnnotations().catch(() => []);
      for (const annot of annots) {
        const rec = asRecord(annot);
        const contents = stringField(rec, "contents") || stringField(rec, "Contents");
        const title = stringField(rec, "title") || stringField(rec, "Title");
        const rich = stringField(rec, "richText");
        const subtype = stringField(rec, "subtype") || stringField(rec, "Subtype");
        findingsFromText(contents, `Page ${pageNum} · annotation`, "annotation", findings, {
          page: pageNum,
          shape: subtype || "Comment",
        });
        findingsFromText(title, `Page ${pageNum} · annotation title`, "annotation", findings, {
          page: pageNum,
          shape: "Comment title",
        });
        findingsFromText(rich, `Page ${pageNum} · annotation`, "annotation", findings, {
          page: pageNum,
          shape: "Comment",
        });
      }

      const raw = rawPages.find((p) => p.page === pageNum);
      if (raw) {
        raw.annots.forEach((text) => {
          if (alreadyHas(findings, text)) return;
          findingsFromText(text, `Page ${pageNum} · annotation`, "annotation", findings, {
            page: pageNum,
            shape: "Comment",
          });
        });
        if (lineHits === 0) {
          raw.body.forEach((text, index) => {
            if (alreadyHas(findings, text)) return;
            findingsFromText(text, `Page ${pageNum} · line ${index + 1}`, "body", findings, {
              page: pageNum,
              line: index + 1,
            });
          });
        }
      }
    }
  } finally {
    await pdf.destroy();
  }

  return findings;
}
