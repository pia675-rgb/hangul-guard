import { hasHangul } from "@/lib/hangul";

export type RawPageText = {
  page: number;
  body: string[];
  annots: string[];
};

function decodeUtf16BeHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let start = 0;
  if (clean.length >= 4 && clean.slice(0, 4).toUpperCase() === "FEFF") start = 4;
  let text = "";
  for (let i = start; i + 3 < clean.length; i += 4) {
    const cp = parseInt(clean.slice(i, i + 4), 16);
    if (Number.isFinite(cp) && cp !== 0) text += String.fromCharCode(cp);
  }
  return text;
}

function decodePdfLiteral(inner: string): string {
  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function extractStrings(block: string): string[] {
  const out: string[] = [];
  const hexRe = /<([0-9A-Fa-f \t\n\r]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = hexRe.exec(block)) !== null) {
    const hex = match[1].replace(/\s+/g, "");
    if (hex.length < 4 || hex.length % 2 !== 0) continue;
    const text = decodeUtf16BeHex(hex);
    if (text && hasHangul(text)) out.push(text);
  }
  const litRe = /\((?:\\.|[^\\)])*\)/g;
  while ((match = litRe.exec(block)) !== null) {
    const text = decodePdfLiteral(match[0].slice(1, -1));
    if (text && hasHangul(text)) out.push(text);
  }
  return out;
}

function parseObjects(ascii: string): Map<number, string> {
  const map = new Map<number, string>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  const starts: Array<{ id: number; at: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(ascii)) !== null) {
    starts.push({ id: Number(match[1]), at: match.index + match[0].length });
  }
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i].at;
    const to = i + 1 < starts.length ? starts[i + 1].at : ascii.length;
    const chunk = ascii.slice(from, to);
    const end = chunk.lastIndexOf("endobj");
    map.set(starts[i].id, end >= 0 ? chunk.slice(0, end) : chunk);
  }
  return map;
}

function refsIn(source: string, key: string): number[] {
  const re = new RegExp(`/${key}\\s*(?:\\[([^\\]]*)\\]|(\\d+)\\s+\\d+\\s+R)`, "i");
  const match = re.exec(source);
  if (!match) return [];
  const blob = match[1] ?? `${match[2]} 0 R`;
  return [...blob.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
}

async function inflateMaybe(obj: string): Promise<string> {
  const streamAt = obj.search(/\bstream\r?\n/);
  if (streamAt < 0) return obj;
  const header = obj.slice(0, streamAt);
  const after = obj.slice(streamAt).replace(/^stream\r?\n/, "");
  const end = after.lastIndexOf("endstream");
  const payload = end >= 0 ? after.slice(0, end) : after;
  if (!/\/Filter\s*\/FlateDecode/i.test(header)) return `${header}\n${payload}`;
  try {
    const bytes = Uint8Array.from(payload, (ch) => ch.charCodeAt(0) & 0xff);
    const kinds: CompressionFormat[] = ["deflate", "deflate-raw"];
    for (const kind of kinds) {
      try {
        const ds = new DecompressionStream(kind);
        const stream = new Blob([bytes]).stream().pipeThrough(ds);
        const raw = new Uint8Array(await new Response(stream).arrayBuffer());
        return `${header}\n${new TextDecoder("latin1").decode(raw)}`;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* keep compressed */
  }
  return obj;
}

function collectPageIds(objects: Map<number, string>, nodeId: number, depth = 0): number[] {
  if (depth > 20) return [];
  const node = objects.get(nodeId);
  if (!node) return [];
  if (/\/Type\s*\/Pages\b/.test(node)) {
    return refsIn(node, "Kids").flatMap((id) => collectPageIds(objects, id, depth + 1));
  }
  if (/\/Type\s*\/Page\b/.test(node)) return [nodeId];
  const kids = refsIn(node, "Kids");
  if (kids.length) return kids.flatMap((id) => collectPageIds(objects, id, depth + 1));
  return [];
}

export async function extractPdfPageTexts(buffer: ArrayBuffer): Promise<RawPageText[]> {
  const ascii = new TextDecoder("latin1").decode(buffer);
  const objects = parseObjects(ascii);
  const inflated = new Map<number, string>();
  for (const [id, body] of objects) inflated.set(id, await inflateMaybe(body));

  const catalogId = (() => {
    const trailer = /trailer[\s\S]*?\/Root\s+(\d+)\s+\d+\s+R/i.exec(ascii);
    if (trailer) return Number(trailer[1]);
    for (const [id, body] of inflated) {
      if (/\/Type\s*\/Catalog\b/.test(body)) return id;
    }
    return 0;
  })();
  const pagesRoot = catalogId ? refsIn(inflated.get(catalogId) ?? "", "Pages")[0] : 0;
  const pageIds = pagesRoot
    ? collectPageIds(inflated, pagesRoot)
    : [...inflated.entries()].filter(([, body]) => /\/Type\s*\/Page\b/.test(body)).map(([id]) => id);

  const pages: RawPageText[] = [];
  pageIds.forEach((id, index) => {
    const page = inflated.get(id) ?? "";
    const body: string[] = [];
    const annots: string[] = [];
    for (const contentId of refsIn(page, "Contents")) {
      body.push(...extractStrings(inflated.get(contentId) ?? ""));
    }
    body.push(...extractStrings(page));
    for (const annotId of refsIn(page, "Annots")) {
      annots.push(...extractStrings(inflated.get(annotId) ?? ""));
    }
    pages.push({ page: index + 1, body: [...new Set(body)], annots: [...new Set(annots)] });
  });
  return pages;
}
