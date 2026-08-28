import { countHangulChars, findHangulHits, hasHangul } from "@/lib/hangul";
import {
  MAX_FINDINGS_PER_FILE,
  severityForKind,
  type Finding,
  type FindingKind,
} from "./types";
import { englishLocation, type FindingWhere } from "./where";

const AMP = "\u0026";

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replaceAll(`${AMP}lt;`, "<")
    .replaceAll(`${AMP}gt;`, ">")
    .replaceAll(`${AMP}quot;`, '"')
    .replaceAll(`${AMP}apos;`, "'")
    .replaceAll(`${AMP}amp;`, "&");
}

export function extractTaggedText(xml: string, localName: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    "gi",
  );
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const inner = match[1].replace(/<[^>]+>/g, "");
    const text = decodeXmlEntities(inner);
    if (text) out.push(text);
  }
  return out;
}

export function extractAttr(xml: string, attrName: string): string[] {
  const re = new RegExp(`\\b${attrName}="([^"]*)"`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1]);
    if (text) out.push(text);
  }
  return out;
}

let findingSeq = 0;

export function resetFindingSeq() {
  findingSeq = 0;
}

export function findingsFromText(
  text: string,
  location: string,
  kind: FindingKind,
  bucket: Finding[],
  where?: FindingWhere,
): void {
  if (!text || bucket.length >= MAX_FINDINGS_PER_FILE) return;
  if (!hasHangul(text)) return;
  const hits = findHangulHits(text, 48, 30);
  if (!hits.length) return;
  findingSeq += 1;
  const collapsed = text.replace(/\s+/g, " ").trim();
  bucket.push({
    id: `f-${findingSeq}`,
    severity: severityForKind(kind),
    kind,
    location: where ? englishLocation(where, location) : location,
    where,
    hangul: hits.map((h) => h.hangul).join(" "),
    snippet: collapsed.length <= 180 ? collapsed : hits[0].snippet,
  });
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.kind}|${finding.location}|${finding.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export function hangulInFindings(findings: Finding[]): number {
  return findings.reduce((n, f) => n + countHangulChars(f.hangul), 0);
}

export function describeOfficePath(path: string): { location: string; kind: FindingKind } | null {
  const p = path.replace(/\\/g, "/").replace(/^\//, "");

  if (/^docProps\/core\.xml$/i.test(p)) return { location: "Document properties", kind: "metadata" };
  if (/^docProps\/app\.xml$/i.test(p)) return { location: "App properties", kind: "metadata" };
  if (/^docProps\/custom\.xml$/i.test(p)) return { location: "Custom properties", kind: "metadata" };

  if (/word\/document[^/]*\.xml$/i.test(p)) return { location: "Body", kind: "body" };
  if (/word\/header\d*\.xml$/i.test(p)) return { location: "Header", kind: "header" };
  if (/word\/footer\d*\.xml$/i.test(p)) return { location: "Footer", kind: "footer" };
  if (/word\/comments\d*\.xml$/i.test(p)) return { location: "Comments", kind: "comment" };
  if (/word\/footnotes\.xml$/i.test(p)) return { location: "Footnotes", kind: "notes" };
  if (/word\/endnotes\.xml$/i.test(p)) return { location: "Endnotes", kind: "notes" };
  if (/word\/glossary\//i.test(p)) return { location: "Glossary", kind: "body" };

  const sheet = /xl\/worksheets\/sheet(\d+)\.xml$/i.exec(p);
  if (sheet) return { location: `Worksheet ${sheet[1]}`, kind: "body" };
  if (/xl\/sharedStrings\.xml$/i.test(p)) return { location: "Cell values", kind: "body" };
  if (/xl\/workbook\.xml$/i.test(p)) return { location: "Workbook", kind: "name" };
  if (/xl\/comments\d*\.xml$/i.test(p)) return { location: "Comments", kind: "comment" };
  if (/xl\/tables\//i.test(p)) return { location: "Table", kind: "name" };
  if (/xl\/drawings\//i.test(p)) return { location: "Drawing", kind: "name" };

  const slide = /ppt\/slides\/slide(\d+)\.xml$/i.exec(p);
  if (slide) return { location: `Slide ${slide[1]}`, kind: "body" };
  const notes = /ppt\/notesSlides\/notesSlide(\d+)\.xml$/i.exec(p);
  if (notes) return { location: `Slide ${notes[1]} notes`, kind: "notes" };
  if (/ppt\/slideMasters\//i.test(p)) return { location: "Slide master", kind: "master" };
  if (/ppt\/slideLayouts\//i.test(p)) return { location: "Slide layout", kind: "master" };
  if (/ppt\/comments\//i.test(p)) return { location: "Comments", kind: "comment" };
  if (/ppt\/charts\//i.test(p) || /\/charts\//i.test(p)) return { location: "Chart", kind: "body" };
  if (/ppt\/presentation\.xml$/i.test(p)) return { location: "Presentation", kind: "name" };

  if (/\/embeddings\//i.test(p)) return { location: `Embedded ${p.split("/").pop()}`, kind: "embedded" };
  if (/\.(xml|rels)$/i.test(p)) return { location: p, kind: "metadata" };
  return null;
}
