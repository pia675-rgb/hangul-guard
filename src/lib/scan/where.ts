export type PageBand = "top" | "middle" | "bottom";

export type FindingWhere = {
  page?: number;
  slide?: number;
  sheet?: string;
  cell?: string;
  paragraph?: number;
  line?: number;
  table?: number;
  row?: number;
  column?: number;
  band?: PageBand;
  shape?: string;
  style?: string;
  headerName?: string;
};

function push(parts: string[], value: string | undefined) {
  if (value) parts.push(value);
}

export function englishLocation(where: FindingWhere, fallback: string): string {
  const parts: string[] = [];
  if (where.page != null) parts.push(`Page ${where.page}`);
  if (where.slide != null) parts.push(`Slide ${where.slide}`);
  if (where.sheet) parts.push(`Sheet ${where.sheet}`);
  if (where.cell) parts.push(`Cell ${where.cell}`);
  if (where.table != null) parts.push(`Table ${where.table}`);
  if (where.row != null) parts.push(`Row ${where.row}`);
  if (where.column != null) parts.push(`Col ${where.column}`);
  if (where.paragraph != null) parts.push(`Paragraph ${where.paragraph}`);
  if (where.line != null) parts.push(`Line ${where.line}`);
  if (where.band === "top") parts.push("Top");
  if (where.band === "middle") parts.push("Middle");
  if (where.band === "bottom") parts.push("Bottom");
  push(parts, where.style);
  push(parts, where.shape);
  push(parts, where.headerName);
  return parts.length ? parts.join(" · ") : fallback;
}

export function displayLocation(
  where: FindingWhere | undefined,
  fallback: string,
  lang: "ko" | "en",
): string {
  if (!where) return fallback;
  if (lang === "en") return englishLocation(where, fallback);
  const parts: string[] = [];
  if (where.page != null) parts.push(`${where.page}페이지`);
  if (where.slide != null) parts.push(`슬라이드 ${where.slide}`);
  if (where.sheet) parts.push(`시트 ${where.sheet}`);
  if (where.cell) parts.push(`셀 ${where.cell}`);
  if (where.table != null) parts.push(`표 ${where.table}`);
  if (where.row != null) parts.push(`${where.row}행`);
  if (where.column != null) parts.push(`${where.column}열`);
  if (where.paragraph != null) parts.push(`문단 ${where.paragraph}`);
  if (where.line != null) parts.push(`${where.line}번째 줄`);
  if (where.band === "top") parts.push("위쪽");
  if (where.band === "middle") parts.push("중간");
  if (where.band === "bottom") parts.push("아래쪽");
  push(parts, where.style);
  push(parts, where.shape);
  push(parts, where.headerName);
  return parts.length ? parts.join(" · ") : fallback;
}

export function groupKey(where?: FindingWhere, location = ""): string {
  if (where?.page != null) return `page:${where.page}`;
  if (where?.slide != null) return `slide:${where.slide}`;
  if (where?.sheet) return `sheet:${where.sheet}`;
  if (where?.table != null) return `table:${where.table}`;
  if (where?.paragraph != null) return "body";
  if (where?.headerName) return `part:${where.headerName}`;
  const head = location.split("·")[0]?.trim() || "other";
  return `part:${head}`;
}

export function groupTitle(key: string, lang: "ko" | "en"): string {
  const [kind, value] = key.split(":");
  if (kind === "page") return lang === "ko" ? `${value}페이지` : `Page ${value}`;
  if (kind === "slide") return lang === "ko" ? `슬라이드 ${value}` : `Slide ${value}`;
  if (kind === "sheet") return lang === "ko" ? `시트 ${value}` : `Sheet ${value}`;
  if (kind === "table") return lang === "ko" ? `표 ${value}` : `Table ${value}`;
  if (key === "body") return lang === "ko" ? "본문" : "Body";
  return value || (lang === "ko" ? "기타" : "Other");
}

export function summarizePlaces(wheres: Array<FindingWhere | undefined>, lang: "ko" | "en"): string {
  const pages = new Set<number>();
  const slides = new Set<number>();
  const sheets = new Set<string>();
  for (const where of wheres) {
    if (!where) continue;
    if (where.page != null) pages.add(where.page);
    if (where.slide != null) slides.add(where.slide);
    if (where.sheet) sheets.add(where.sheet);
  }
  const parts: string[] = [];
  if (pages.size) {
    const list = [...pages].sort((a, b) => a - b).join(", ");
    parts.push(lang === "ko" ? `${list}페이지` : `Pages ${list}`);
  }
  if (slides.size) {
    const list = [...slides].sort((a, b) => a - b).join(", ");
    parts.push(lang === "ko" ? `슬라이드 ${list}` : `Slides ${list}`);
  }
  if (sheets.size) {
    const list = [...sheets].join(", ");
    parts.push(lang === "ko" ? `시트 ${list}` : `Sheets ${list}`);
  }
  return parts.join(" · ");
}

export function bandFromY(y: number, height: number): PageBand {
  if (height <= 0) return "middle";
  const t = y / height;
  if (t >= 0.66) return "top";
  if (t <= 0.34) return "bottom";
  return "middle";
}
