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
    "Page",
    "Slide",
    "Sheet",
    "Cell",
    "Paragraph",
    "Line",
    "Table",
    "Row",
    "Column",
    "Area",
    "Non-English",
    "Context",
    "Non-English characters",
  ];
  const rows: string[][] = [header];
  for (const file of results) {
    if (file.status === "error") {
      rows.push([file.fileName, "error", file.ext, "", "", "", "", "", "", "", "", "", "", "", "", "", "", file.error ?? "", "0"]);
      continue;
    }
    if (file.findings.length === 0) {
      rows.push([file.fileName, "clear", file.ext, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "0"]);
      continue;
    }
    for (const finding of file.findings) {
      const w = finding.where ?? {};
      rows.push([
        file.fileName,
        "flagged",
        file.ext,
        finding.severity,
        finding.kind,
        finding.location,
        w.page != null ? String(w.page) : "",
        w.slide != null ? String(w.slide) : "",
        w.sheet ?? "",
        w.cell ?? "",
        w.paragraph != null ? String(w.paragraph) : "",
        w.line != null ? String(w.line) : "",
        w.table != null ? String(w.table) : "",
        w.row != null ? String(w.row) : "",
        w.column != null ? String(w.column) : "",
        w.band ?? w.shape ?? w.style ?? "",
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
      scanner: "English Guard",
      files: results.map((file) => ({
        fileName: file.fileName,
        status: file.status,
        type: file.ext,
        nonEnglishCharacters: file.hangulCount,
        error: file.error,
        findings: file.findings.map((f) => ({
          severity: f.severity,
          category: f.kind,
          location: f.location,
          page: f.where?.page,
          slide: f.where?.slide,
          sheet: f.where?.sheet,
          cell: f.where?.cell,
          paragraph: f.where?.paragraph,
          line: f.where?.line,
          table: f.where?.table,
          row: f.where?.row,
          column: f.where?.column,
          area: f.where?.band ?? f.where?.shape ?? f.where?.style,
          nonEnglish: f.hangul,
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
    `English Guard scan — ${results.length} file(s)`,
    `Flagged: ${flagged.length} · English-only: ${clear.length} · Errors: ${errors.length}`,
    "",
  ];
  if (flagged.length === 0 && errors.length === 0) {
    lines.push("No non-English text found in scanned files.");
    return lines.join("\n");
  }
  for (const file of flagged) {
    lines.push(
      `${file.fileName} — ${file.findings.length} finding(s), ${file.hangulCount} non-English character(s)`,
    );
    for (const f of file.findings.slice(0, 12)) {
      lines.push(`  [${f.severity}] ${f.location}: ${f.hangul}`);
    }
    if (file.findings.length > 12) lines.push(`  … ${file.findings.length - 12} more`);
  }
  for (const file of errors) {
    lines.push(`${file.fileName} — error: ${file.error}`);
  }
  return lines.join("\n");
}
