/**
 * Hangul-only detection. CJK ideographs (Hanja / Kanji / Hanzi) are intentionally
 * ignored — US-bound Chinese or Japanese copy should not trip this scanner.
 */
export const HANGUL_CHAR_RE =
  /[\u1100-\u11FF\u3130-\u318F\u3200-\u321E\u3260-\u327F\uA960-\uA97F\uAC00-\uD7A3\uD7B0-\uD7FF\uFFA0-\uFFDC]/u;

const HANGUL_RUN_RE =
  /[\u1100-\u11FF\u3130-\u318F\u3200-\u321E\u3260-\u327F\uA960-\uA97F\uAC00-\uD7A3\uD7B0-\uD7FF\uFFA0-\uFFDC]+/gu;

export type HangulHit = {
  index: number;
  length: number;
  hangul: string;
  snippet: string;
};

export function isHangulCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f) ||
    (cp >= 0x3200 && cp <= 0x321e) ||
    (cp >= 0x3260 && cp <= 0x327f) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xd7b0 && cp <= 0xd7ff) ||
    (cp >= 0xffa0 && cp <= 0xffdc)
  );
}

export function hasHangul(text: string): boolean {
  return HANGUL_CHAR_RE.test(text);
}

export function countHangulChars(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isHangulCodePoint(cp)) n += 1;
  }
  return n;
}

export function findHangulHits(text: string, context = 42, limit = 200): HangulHit[] {
  if (!text) return [];
  const hits: HangulHit[] = [];
  const re = new RegExp(HANGUL_RUN_RE.source, "gu");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const hangul = match[0];
    const index = match.index;
    const from = Math.max(0, index - context);
    const to = Math.min(text.length, index + hangul.length + context);
    let snippet = text.slice(from, to).replace(/\s+/g, " ").trim();
    if (from > 0) snippet = `…${snippet}`;
    if (to < text.length) snippet = `${snippet}…`;
    hits.push({ index, length: hangul.length, hangul, snippet });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function highlightHangul(snippet: string): { text: string; hangul: boolean }[] {
  const parts: { text: string; hangul: boolean }[] = [];
  const re = new RegExp(HANGUL_RUN_RE.source, "gu");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(snippet)) !== null) {
    if (match.index > last) {
      parts.push({ text: snippet.slice(last, match.index), hangul: false });
    }
    parts.push({ text: match[0], hangul: true });
    last = match.index + match[0].length;
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), hangul: false });
  return parts;
}
