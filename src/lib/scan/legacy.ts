import { isHangulCodePoint } from "@/lib/hangul";
import { findingsFromText } from "./xml";
import type { Finding } from "./types";
import { MAX_FINDINGS_PER_FILE } from "./types";

function isPrintableSnippet(cp: number): boolean {
  return (
    isHangulCodePoint(cp) ||
    (cp >= 0x20 && cp <= 0x7e) ||
    cp === 0x09 ||
    cp === 0x0a ||
    cp === 0x0d ||
    (cp >= 0xa0 && cp <= 0x24f) ||
    (cp >= 0x2010 && cp <= 0x2027)
  );
}

function pushRun(findings: Finding[], hangul: string, snippet: string, location: string) {
  if (hangul.length < 2 || findings.length >= MAX_FINDINGS_PER_FILE) return;
  findingsFromText(hangul.length >= 2 ? `${snippet}` : hangul, location, "body", findings);
}

/**
 * Best-effort scan of OLE .doc / .xls / .ppt. Requires two consecutive Hangul
 * syllables in UTF-16LE (or a UTF-8 Hangul run of 2+) to avoid binary noise.
 */
export function scanLegacyBinary(buffer: ArrayBuffer): Finding[] {
  const bytes = new Uint8Array(buffer);
  const findings: Finding[] = [];

  let i = 0;
  while (i + 1 < bytes.length && findings.length < MAX_FINDINGS_PER_FILE) {
    const cp = bytes[i] | (bytes[i + 1] << 8);
    if (!isHangulCodePoint(cp)) {
      i += 2;
      continue;
    }
    const start = i;
    let run = String.fromCodePoint(cp);
    i += 2;
    while (i + 1 < bytes.length) {
      const next = bytes[i] | (bytes[i + 1] << 8);
      if (!isHangulCodePoint(next)) break;
      run += String.fromCodePoint(next);
      i += 2;
    }
    if (run.length < 2) continue;

    const ctxFrom = Math.max(0, start - 40);
    const ctxTo = Math.min(bytes.length - 1, i + 40);
    let snippet = "";
    for (let j = ctxFrom - (ctxFrom % 2); j < ctxTo; j += 2) {
      const c = bytes[j] | (bytes[j + 1] << 8);
      if (isPrintableSnippet(c)) snippet += String.fromCodePoint(c);
      else snippet += " ";
    }
    snippet = snippet.replace(/\s+/g, " ").trim();
    pushRun(findings, run, snippet || run, "Binary text (legacy Office)");
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const before = findings.length;
  findingsFromText(utf8, "UTF-8 text (legacy Office)", "body", findings);
  // Drop UTF-8 hits that are single-char noise from binary; keep runs already filtered by findHangulHits
  if (findings.length > before) {
    const kept = findings.slice(0, before);
    for (const f of findings.slice(before)) {
      if (f.hangul.length >= 2) kept.push(f);
    }
    findings.length = 0;
    findings.push(...kept);
  }

  return findings;
}
