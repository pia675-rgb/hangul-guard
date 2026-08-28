import { countHangulChars, findHangulHits, hasHangul } from "@/lib/hangul";
import { hangulInFindings, resetFindingSeq, dedupeFindings } from "./xml";
import { scanOfficeBuffer } from "./office";
import { scanPdfBuffer } from "./pdf";
import { scanLegacyBinary } from "./legacy";
import {
  MAX_FILE_BYTES,
  MAX_FINDINGS_PER_FILE,
  extOf,
  kindOf,
  type FileKind,
  type FileScanResult,
  type Finding,
} from "./types";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function scanBuffer(buffer: ArrayBuffer, name: string, kind: FileKind): Promise<Finding[]> {
  if (kind === "pdf") return scanPdfBuffer(buffer);
  if (kind === "docx" || kind === "xlsx" || kind === "pptx") {
    return scanOfficeBuffer(buffer, kind, scanBuffer);
  }
  if (kind === "legacy") return scanLegacyBinary(buffer);
  return [];
}

export async function scanFile(file: File): Promise<FileScanResult> {
  const started = performance.now();
  const ext = extOf(file.name);
  const kind = kindOf(file.name);
  const id = newId();
  resetFindingSeq();

  const base: Omit<FileScanResult, "status" | "findings" | "hangulCount" | "truncated" | "durationMs"> = {
    id,
    fileName: file.name,
    fileSize: file.size,
    ext,
    kind,
  };

  if (kind === "unknown") {
    return {
      ...base,
      status: "error",
      error: "Unsupported file type. Use PDF, Word, Excel, or PowerPoint.",
      findings: [],
      hangulCount: 0,
      truncated: false,
      durationMs: Math.round(performance.now() - started),
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ...base,
      status: "error",
      error: `File is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`,
      findings: [],
      hangulCount: 0,
      truncated: false,
      durationMs: Math.round(performance.now() - started),
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const findings = dedupeFindings(await scanBuffer(buffer, file.name, kind));

    if (hasHangul(file.name)) {
      const hits = findHangulHits(file.name);
      if (hits.length && findings.length < MAX_FINDINGS_PER_FILE) {
        findings.unshift({
          id: `fn-${id}`,
          severity: "low",
          kind: "filename",
          location: "File name",
          hangul: hits.map((h) => h.hangul).join(" "),
          snippet: file.name,
        });
      }
    }

    const truncated = findings.length >= MAX_FINDINGS_PER_FILE;
    const hangulCount = hangulInFindings(findings) || countHangulChars(file.name);
    return {
      ...base,
      status: findings.length > 0 ? "flagged" : "clear",
      findings,
      hangulCount,
      truncated,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read this file.";
    return {
      ...base,
      status: "error",
      error: message,
      findings: [],
      hangulCount: 0,
      truncated: false,
      durationMs: Math.round(performance.now() - started),
    };
  }
}

export { isSupportedName, kindOf } from "./types";
export type { FileScanResult, Finding, FindingKind, Severity, FileKind } from "./types";
