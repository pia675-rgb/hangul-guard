import { findingsFromText } from "./xml";
import type { Finding } from "./types";
import { MAX_FINDINGS_PER_FILE } from "./types";
import { bandFromY } from "./where";

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

function extractHexUtf16Strings(buffer: ArrayBuffer): string[] {
  const ascii = new TextDecoder("latin1").decode(buffer);
  const out: string[] = [];
  const re = /<FEFF([0-9A-Fa-f]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ascii)) !== null) {
    const hex = match[1];
    let text = "";
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const cp = parseInt(hex.slice(i, i + 4), 16);
      if (Number.isFinite(cp)) text += String.fromCharCode(cp);
    }
    if (text) out.push(text);
  }
  return out;
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

export async function scanPdfBuffer(buffer: ArrayBuffer): Promise<Finding[]> {
  const encodedStrings = extractHexUtf16Strings(buffer);
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

    for (const text of encodedStrings) {
      const collapsed = text.replace(/\s+/g, " ").trim();
      if (findings.some((f) => f.snippet === collapsed)) continue;
      findingsFromText(text, "PDF encoded string", "metadata", findings, { headerName: "PDF encoded string" });
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

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
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
      lines.forEach((line, index) => {
        if (!line.text) return;
        findingsFromText(line.text, `Page ${pageNum} · line ${index + 1}`, "body", findings, {
          page: pageNum,
          line: index + 1,
          band: bandFromY(line.y, viewport.height),
        });
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
          shape: subtype || "Annotation",
        });
        findingsFromText(title, `Page ${pageNum} · annotation title`, "annotation", findings, {
          page: pageNum,
          shape: "Annotation title",
        });
        findingsFromText(rich, `Page ${pageNum} · annotation`, "annotation", findings, {
          page: pageNum,
          shape: "Annotation",
        });
      }
    }
  } finally {
    await pdf.destroy();
  }

  return findings;
}
