import { findingsFromText } from "./xml";
import type { Finding } from "./types";
import { MAX_FINDINGS_PER_FILE } from "./types";

type Pdfjs = typeof import("pdfjs-dist");

let pdfjsLoader: Promise<Pdfjs> | null = null;

async function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsLoader) {
    pdfjsLoader = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
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
      findingsFromText(stringField(info, key), `Properties · ${label}`, "metadata", findings);
    }

    for (const text of encodedStrings) {
      const collapsed = text.replace(/\s+/g, " ").trim();
      if (findings.some((f) => f.snippet === collapsed)) continue;
      findingsFromText(text, "PDF encoded string", "metadata", findings);
    }

    const outline = await pdf.getOutline().catch(() => null);
    const walkOutline = (items: Array<{ title?: string; items?: unknown[] }> | null, depth: number) => {
      if (!items) return;
      for (const item of items) {
        if (findings.length >= MAX_FINDINGS_PER_FILE) return;
        findingsFromText(item.title ?? "", `Bookmark${depth ? ` · L${depth}` : ""}`, "name", findings);
        if (item.items) walkOutline(item.items as Array<{ title?: string; items?: unknown[] }>, depth + 1);
      }
    };
    walkOutline(outline as Array<{ title?: string; items?: unknown[] }> | null, 0);

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      if (findings.length >= MAX_FINDINGS_PER_FILE) break;
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const chunks: string[] = [];
      for (const item of content.items) {
        if (item && typeof item === "object" && "str" in item && typeof item.str === "string") {
          chunks.push(item.str);
        }
      }
      const pageText = chunks.join(" ");
      findingsFromText(pageText, `Page ${pageNum}`, "body", findings);

      const annots = await page.getAnnotations().catch(() => []);
      for (const annot of annots) {
        const rec = asRecord(annot);
        const contents = stringField(rec, "contents") || stringField(rec, "Contents");
        const title = stringField(rec, "title") || stringField(rec, "Title");
        const rich = stringField(rec, "richText");
        findingsFromText(contents, `Page ${pageNum} · annotation`, "annotation", findings);
        findingsFromText(title, `Page ${pageNum} · annotation title`, "annotation", findings);
        findingsFromText(rich, `Page ${pageNum} · annotation`, "annotation", findings);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return findings;
}
