import type { FileScanResult } from "./types";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(results: FileScanResult[]): string {
  const header = [
    "File",
    "Status",
    "Type",
    "Severity",
    "Category",
    "Location",
    "Hangul",
    "Context",
    "Hangul characters",
  ];
  const rows: string[][] = [header];
  for (const file of results) {
    if (file.status === "error") {
      rows.push([file.fileName, "error", file.ext, "", "", "", "", file.error ?? "", "0"]);
      continue;
    }
    if (file.findings.length === 0) {
      rows.push([file.fileName, "clear", file.ext, "", "", "", "", "", "0"]);
      continue;
    }
    for (const finding of file.findings) {
      rows.push([
        file.fileName,
        "flagged",
        file.ext,
        finding.severity,
        finding.kind,
        finding.location,
        finding.hangul,
        finding.snippet,
        String(file.hangulCount),
      ]);
    }
  }
  return `\uFEFF${rows.map((r) => r.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}

export function toJson(results: FileScanResult[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scanner: "Hangul Guard",
      files: results.map((file) => ({
        fileName: file.fileName,
        status: file.status,
        type: file.ext,
        hangulCharacters: file.hangulCount,
        error: file.error,
        findings: file.findings.map((f) => ({
          severity: f.severity,
          category: f.kind,
          location: f.location,
          hangul: f.hangul,
          context: f.snippet,
        })),
      })),
    },
    null,
    2,
  );
}

export function englishSummary(results: FileScanResult[]): string {
  const flagged = results.filter((r) => r.status === "flagged");
  const clear = results.filter((r) => r.status === "clear");
  const errors = results.filter((r) => r.status === "error");
  const lines = [
    `Hangul Guard scan — ${results.length} file(s)`,
    `Flagged: ${flagged.length} · Clear: ${clear.length} · Errors: ${errors.length}`,
    "",
  ];
  if (flagged.length === 0 && errors.length === 0) {
    lines.push("No Hangul found in scanned files.");
    return lines.join("\n");
  }
  for (const file of flagged) {
    lines.push(`${file.fileName} — ${file.findings.length} finding(s), ${file.hangulCount} Hangul character(s)`);
    for (const f of file.findings.slice(0, 8)) {
      lines.push(`  [${f.severity}] ${f.location}: ${f.hangul}`);
    }
    if (file.findings.length > 8) lines.push(`  … ${file.findings.length - 8} more`);
  }
  for (const file of errors) {
    lines.push(`${file.fileName} — error: ${file.error}`);
  }
  return lines.join("\n");
}
