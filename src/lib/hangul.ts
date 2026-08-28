/**
 * English-only check for US-bound files.
 * Flags letters that are not Latin (Hangul, Han, kana, Cyrillic, Arabic, …).
 * Accented Latin (café, naïve) and punctuation/symbols pass.
 */
export type HangulHit = {
  index: number;
  length: number;
  hangul: string;
  snippet: string;
};

export function isNonEnglishChar(ch: string): boolean {
  if (/\p{Script=Hangul}/u.test(ch)) return true;
  if (/\p{Script=Han}/u.test(ch)) return true;
  if (/\p{Script=Hiragana}/u.test(ch)) return true;
  if (/\p{Script=Katakana}/u.test(ch)) return true;
  if (!/\p{L}/u.test(ch)) return false;
  return !/\p{Script=Latin}/u.test(ch) && !/\p{Script=Common}/u.test(ch);
}

export function isHangulCodePoint(cp: number): boolean {
  return isNonEnglishChar(String.fromCodePoint(cp));
}

export function hasHangul(text: string): boolean {
  if (!text) return false;
  for (const ch of text) {
    if (isNonEnglishChar(ch)) return true;
  }
  return false;
}

export function countHangulChars(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (isNonEnglishChar(ch)) n += 1;
  }
  return n;
}

export function findHangulHits(text: string, context = 42, limit = 200): HangulHit[] {
  if (!text) return [];
  const hits: HangulHit[] = [];
  let run = "";
  let runStart = -1;
  let i = 0;
  const flush = () => {
    if (!run || hits.length >= limit) {
      run = "";
      runStart = -1;
      return;
    }
    const from = Math.max(0, runStart - context);
    const to = Math.min(text.length, runStart + run.length + context);
    let snippet = text.slice(from, to).replace(/\s+/g, " ").trim();
    if (from > 0) snippet = `…${snippet}`;
    if (to < text.length) snippet = `${snippet}…`;
    hits.push({ index: runStart, length: run.length, hangul: run, snippet });
    run = "";
    runStart = -1;
  };
  for (const ch of text) {
    if (isNonEnglishChar(ch)) {
      if (runStart < 0) runStart = i;
      run += ch;
    } else {
      flush();
    }
    i += ch.length;
  }
  flush();
  return hits;
}

export function highlightHangul(snippet: string): { text: string; hangul: boolean }[] {
  const parts: { text: string; hangul: boolean }[] = [];
  let buf = "";
  let flagged = false;
  const push = () => {
    if (!buf) return;
    parts.push({ text: buf, hangul: flagged });
    buf = "";
  };
  for (const ch of snippet) {
    const next = isNonEnglishChar(ch);
    if (buf && next !== flagged) push();
    flagged = next;
    buf += ch;
  }
  push();
  return parts;
}
