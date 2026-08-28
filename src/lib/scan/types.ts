import type { FindingWhere } from "./where";

export type FileKind = "pdf" | "docx" | "xlsx" | "pptx" | "legacy" | "unknown";

export type FindingKind =
  | "body"
  | "header"
  | "footer"
  | "notes"
  | "comment"
  | "annotation"
  | "metadata"
  | "name"
  | "filename"
  | "master"
  | "embedded";

export type Severity = "high" | "medium" | "low";

export type Finding = {
  id: string;
  severity: Severity;
  kind: FindingKind;
  location: string;
  where?: FindingWhere;
  hangul: string;
  snippet: string;
};

export type FileScanResult = {
  id: string;
  fileName: string;
  fileSize: number;
  ext: string;
  kind: FileKind;
  status: "clear" | "flagged" | "error";
  error?: string;
  findings: Finding[];
  hangulCount: number;
  truncated: boolean;
  durationMs: number;
};

export const MAX_FINDINGS_PER_FILE = 200;
export const MAX_FILE_BYTES = 60 * 1024 * 1024;

export const OFFICE_EXT: Record<string, FileKind> = {
  pdf: "pdf",
  docx: "docx",
  docm: "docx",
  dotx: "docx",
  dotm: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  xltx: "xlsx",
  xltm: "xlsx",
  pptx: "pptx",
  pptm: "pptx",
  potx: "pptx",
  potm: "pptx",
  doc: "legacy",
  xls: "legacy",
  ppt: "legacy",
};

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function kindOf(name: string): FileKind {
  return OFFICE_EXT[extOf(name)] ?? "unknown";
}

export function isSupportedName(name: string): boolean {
  return kindOf(name) !== "unknown";
}

export function severityForKind(kind: FindingKind): Severity {
  switch (kind) {
    case "body":
    case "header":
    case "footer":
      return "high";
    case "notes":
    case "comment":
    case "annotation":
    case "embedded":
      return "medium";
    default:
      return "low";
  }
}
