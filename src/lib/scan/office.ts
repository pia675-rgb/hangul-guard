import JSZip from "jszip";
import { findingsFromText, decodeXmlEntities, extractTaggedText, extractAttr, describeOfficePath } from "./xml";
import type { Finding, FileKind } from "./types";
import { MAX_FINDINGS_PER_FILE } from "./types";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\//, "");
}

function zipFile(zip: JSZip, path: string) {
  const direct = zip.file(path);
  if (direct) return direct;
  const lower = normalizePath(path).toLowerCase();
  const match = zip.filter((name) => normalizePath(name).toLowerCase() === lower);
  return match[0] ?? null;
}

async function readString(zip: JSZip, path: string): Promise<string | null> {
  const file = zipFile(zip, path);
  if (!file || file.dir) return null;
  return file.async("string");
}

function relTarget(baseDir: string, target: string): string {
  const t = target.replace(/\\/g, "/");
  if (t.startsWith("/")) return t.slice(1);
  const base = baseDir.replace(/\/+$/, "");
  const parts = `${base}/${t}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function parseRels(relsXml: string, baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /Id="([^"]+)"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(relsXml)) !== null) {
    const id = match[1] || match[4];
    const target = match[2] || match[3];
    if (id && target && !target.startsWith("http")) {
      map.set(id, relTarget(baseDir, target.split("?")[0] ?? target));
    }
  }
  return map;
}

function cap(bucket: Finding[]): boolean {
  return bucket.length >= MAX_FINDINGS_PER_FILE;
}

async function scanGenericXml(zip: JSZip, findings: Finding[], skip: Set<string>) {
  const files = Object.values(zip.files);
  for (const file of files) {
    if (file.dir || cap(findings)) continue;
    const path = normalizePath(file.name);
    if (skip.has(path) || skip.has(path.toLowerCase())) continue;
    if (!/\.(xml|rels|vml|txt)$/i.test(path)) continue;
    const xml = await file.async("string");
    const desc = describeOfficePath(path);
    if (!desc) continue;
    for (const text of extractTaggedText(xml, "t")) {
      findingsFromText(text, desc.location, desc.kind, findings);
      if (cap(findings)) return;
    }
    for (const attr of ["name", "descr", "title", "alt", "displayName"]) {
      for (const value of extractAttr(xml, attr)) {
        findingsFromText(value, `${desc.location} · ${attr}`, desc.kind === "body" ? "name" : desc.kind, findings);
        if (cap(findings)) return;
      }
    }
  }
}

async function scanDocx(zip: JSZip, findings: Finding[]) {
  const skip = new Set<string>();
  const main = await readString(zip, "word/document.xml");
  if (main) {
    skip.add("word/document.xml");
    const tokenRe = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    let para = 0;
    let table = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(main)) !== null) {
      if (cap(findings)) break;
      const chunk = match[0];
      if (chunk.startsWith("<w:tbl")) {
        table += 1;
        const rows = chunk.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
        rows.forEach((rowXml, rowIndex) => {
          const cells = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
          cells.forEach((cellXml, colIndex) => {
            const text = extractTaggedText(cellXml, "t").join("");
            findingsFromText(text, `Table ${table} · R${rowIndex + 1}C${colIndex + 1}`, "body", findings, {
              table,
              row: rowIndex + 1,
              column: colIndex + 1,
            });
          });
        });
        continue;
      }
      const text = extractTaggedText(chunk, "t").join("");
      if (!text.trim()) continue;
      para += 1;
      const styleRaw = /<w:pStyle[^>]*w:val="([^"]+)"/i.exec(chunk)?.[1] ?? "";
      const style = headingLabel(styleRaw);
      findingsFromText(text, `Body · paragraph ${para}`, "body", findings, {
        paragraph: para,
        style,
      });
    }
  }

  const named: Array<[string, Finding["kind"], string]> = [
    ["word/comments.xml", "comment", "Comments"],
    ["word/footnotes.xml", "notes", "Footnotes"],
    ["word/endnotes.xml", "notes", "Endnotes"],
  ];
  for (const [path, kind, label] of named) {
    const xml = await readString(zip, path);
    if (!xml) continue;
    skip.add(path);
    const texts = extractTaggedText(xml, "t");
    texts.forEach((text, i) => {
      findingsFromText(text, `${label} · ${i + 1}`, kind, findings, {
        headerName: label,
        line: i + 1,
      });
    });
  }

  for (const file of Object.values(zip.files)) {
    const path = normalizePath(file.name);
    const header = /^word\/(header)(\d*)\.xml$/i.exec(path);
    const footer = /^word\/(footer)(\d*)\.xml$/i.exec(path);
    const hf = header ?? footer;
    if (!hf) continue;
    skip.add(path);
    const xml = await file.async("string");
    const kind = header ? "header" : "footer";
    const n = hf[2] || "1";
    const label = header ? `Header ${n}` : `Footer ${n}`;
    findingsFromText(extractTaggedText(xml, "t").join(""), label, kind, findings, { headerName: label });
  }

  await scanCoreProps(zip, findings, skip);
  await scanGenericXml(zip, findings, skip);
}

function headingLabel(style: string): string | undefined {
  if (!style) return undefined;
  const compact = style.replace(/\s+/g, "");
  if (/^Heading1$|^제목1$/i.test(compact)) return "Heading 1";
  if (/^Heading2$|^제목2$/i.test(compact)) return "Heading 2";
  if (/^Heading3$|^제목3$/i.test(compact)) return "Heading 3";
  if (/^Title$|^제목$/i.test(compact)) return "Title";
  if (/^Subtitle$|^부제/i.test(compact)) return "Subtitle";
  return undefined;
}

async function scanCoreProps(zip: JSZip, findings: Finding[], skip: Set<string>) {
  const core = await readString(zip, "docProps/core.xml");
  if (core) {
    skip.add("docProps/core.xml");
    const fields: Array<[string, string]> = [
      ["title", "Title"],
      ["subject", "Subject"],
      ["creator", "Author"],
      ["description", "Description"],
      ["keywords", "Keywords"],
      ["lastModifiedBy", "Last modified by"],
      ["category", "Category"],
    ];
    for (const [tag, label] of fields) {
      const values = extractTaggedText(core, tag);
      findingsFromText(values.join(" "), `Properties · ${label}`, "metadata", findings);
    }
  }
  const app = await readString(zip, "docProps/app.xml");
  if (app) {
    skip.add("docProps/app.xml");
    findingsFromText(extractTaggedText(app, "Company").join(" "), "Properties · Company", "metadata", findings);
    findingsFromText(extractTaggedText(app, "Manager").join(" "), "Properties · Manager", "metadata", findings);
    findingsFromText(extractTaggedText(app, "HeadingPairs").join(" "), "Properties · Headings", "metadata", findings);
    findingsFromText(extractTaggedText(app, "TitlesOfParts").join(" "), "Properties · Part titles", "metadata", findings);
  }
  const custom = await readString(zip, "docProps/custom.xml");
  if (custom) {
    skip.add("docProps/custom.xml");
    findingsFromText(extractTaggedText(custom, "lpwstr").join("\n"), "Custom properties", "metadata", findings);
  }
}

async function scanXlsx(zip: JSZip, findings: Finding[]) {
  const skip = new Set<string>();
  const wb = await readString(zip, "xl/workbook.xml");
  const rels = await readString(zip, "xl/_rels/workbook.xml.rels");
  const relMap = rels ? parseRels(rels, "xl") : new Map<string, string>();
  skip.add("xl/_rels/workbook.xml.rels");

  const sheets: { name: string; path: string }[] = [];
  if (wb) {
    skip.add("xl/workbook.xml");
    const sheetRe = /<sheet\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = sheetRe.exec(wb)) !== null) {
      const tag = match[0];
      const name = decodeXmlEntities(/name="([^"]*)"/i.exec(tag)?.[1] ?? "");
      const rId = /r:id="([^"]*)"/i.exec(tag)?.[1] ?? /id="([^"]*)"/i.exec(tag)?.[1] ?? "";
      const path = relMap.get(rId) ?? "";
      if (name) findingsFromText(name, "Sheet name", "name", findings, { sheet: name });
      if (path) sheets.push({ name: name || path, path });
    }
    const defined = extractTaggedText(wb, "definedName");
    for (const name of defined) {
      findingsFromText(name, "Defined name", "name", findings);
    }
  }

  const sstXml = await readString(zip, "xl/sharedStrings.xml");
  const sst: string[] = [];
  if (sstXml) {
    skip.add("xl/sharedStrings.xml");
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    let si: RegExpExecArray | null;
    while ((si = siRe.exec(sstXml)) !== null) {
      sst.push(extractTaggedText(si[1], "t").join(""));
    }
  }

  for (const sheet of sheets) {
    const xml = await readString(zip, sheet.path);
    if (!xml) continue;
    skip.add(sheet.path);
    const headerTags = ["oddHeader", "evenHeader", "firstHeader", "oddFooter", "evenFooter", "firstFooter"];
    for (const tag of headerTags) {
      const kind = tag.toLowerCase().includes("footer") ? "footer" : "header";
      findingsFromText(extractTaggedText(xml, tag).join(""), `${sheet.name} · ${tag}`, kind, findings, {
        sheet: sheet.name,
        headerName: tag.toLowerCase().includes("footer") ? "Footer" : "Header",
      });
    }
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(xml)) !== null) {
      if (cap(findings)) break;
      const attrs = cell[1];
      const body = cell[2];
      const ref = /(?:^|\s)r="([^"]+)"/i.exec(attrs)?.[1] ?? "";
      const type = /(?:^|\s)t="([^"]+)"/i.exec(attrs)?.[1] ?? "";
      let value = "";
      if (type === "s") {
        const idx = Number(/<v>(\d+)<\/v>/i.exec(body)?.[1]);
        value = Number.isFinite(idx) ? (sst[idx] ?? "") : "";
      } else if (type === "inlineStr") {
        value = extractTaggedText(body, "t").join("");
      } else if (type === "str") {
        value = decodeXmlEntities(/<v>([^<]*)<\/v>/i.exec(body)?.[1] ?? "");
      }
      const formula = decodeXmlEntities(/<f\b[^>]*>([\s\S]*?)<\/f>/i.exec(body)?.[1] ?? "");
      const loc = ref ? `${sheet.name}!${ref}` : sheet.name;
      findingsFromText(value, loc, "body", findings, { sheet: sheet.name, cell: ref || undefined });
      findingsFromText(formula, `${loc} · formula`, "body", findings, {
        sheet: sheet.name,
        cell: ref || undefined,
        shape: "Formula",
      });
    }
  }

  for (const file of Object.values(zip.files)) {
    const path = normalizePath(file.name);
    if (/^xl\/comments\d*\.xml$/i.test(path)) {
      skip.add(path);
      const xml = await file.async("string");
      const commentRe = /<comment\b([^>]*)>([\s\S]*?)<\/comment>/gi;
      let comment: RegExpExecArray | null;
      while ((comment = commentRe.exec(xml)) !== null) {
        const ref = /ref="([^"]+)"/i.exec(comment[1])?.[1] ?? "";
        const text = extractTaggedText(comment[2], "t").join("");
        findingsFromText(text, ref ? `Comment ${ref}` : "Comments", "comment", findings, {
          cell: ref || undefined,
          headerName: "Comment",
        });
      }
    }
  }

  await scanCoreProps(zip, findings, skip);
  await scanGenericXml(zip, findings, skip);
}

async function scanPptx(zip: JSZip, findings: Finding[]) {
  const skip = new Set<string>();
  const files = Object.values(zip.files);

  for (const file of files) {
    if (file.dir || cap(findings)) continue;
    const path = normalizePath(file.name);

    const slide = /ppt\/slides\/slide(\d+)\.xml$/i.exec(path);
    if (slide) {
      skip.add(path);
      const xml = await file.async("string");
      const n = Number(slide[1]);
      const shapes = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/gi) ?? [xml];
      shapes.forEach((shapeXml, index) => {
        const ph = /<p:ph\b[^>]*>/i.exec(shapeXml)?.[0] ?? "";
        const phType = /type="([^"]+)"/i.exec(ph)?.[1] ?? "";
        const name = extractAttr(shapeXml, "name")[0] ?? "";
        const role = pptRole(phType, name, index);
        const texts = extractTaggedText(shapeXml, "t");
        const joined = texts.join("");
        findingsFromText(joined, `Slide ${n} · ${role}`, "body", findings, {
          slide: n,
          shape: role,
        });
        if (name && name !== role) {
          findingsFromText(name, `Slide ${n} · shape name`, "name", findings, {
            slide: n,
            shape: name,
          });
        }
        for (const descr of extractAttr(shapeXml, "descr")) {
          findingsFromText(descr, `Slide ${n} · alt text`, "name", findings, {
            slide: n,
            shape: "Alt text",
          });
        }
      });
      continue;
    }

    const notes = /ppt\/notesSlides\/notesSlide(\d+)\.xml$/i.exec(path);
    if (notes) {
      skip.add(path);
      const xml = await file.async("string");
      findingsFromText(extractTaggedText(xml, "t").join("\n"), `Slide ${notes[1]} notes`, "notes", findings, {
        slide: Number(notes[1]),
        headerName: "Speaker notes",
      });
      continue;
    }

    if (/ppt\/slideMasters\/.+\.xml$/i.test(path) || /ppt\/slideLayouts\/.+\.xml$/i.test(path)) {
      skip.add(path);
      const xml = await file.async("string");
      const loc = path.includes("slideMasters") ? "Slide master" : "Slide layout";
      findingsFromText(extractTaggedText(xml, "t").join("\n"), loc, "master", findings, { headerName: loc });
      for (const name of extractAttr(xml, "name")) {
        findingsFromText(name, `${loc} · shape name`, "name", findings, { headerName: loc, shape: name });
      }
    }
  }

  await scanCoreProps(zip, findings, skip);
  await scanGenericXml(zip, findings, skip);
}

async function scanEmbeddings(
  zip: JSZip,
  findings: Finding[],
  scanNested: (bytes: ArrayBuffer, name: string, kind: FileKind) => Promise<Finding[]>,
) {
  for (const file of Object.values(zip.files)) {
    if (file.dir || cap(findings)) continue;
    const path = normalizePath(file.name);
    const m = /\/embeddings\/([^/]+\.(?:docx|docm|xlsx|xlsm|pptx|pptm|pdf))$/i.exec(path);
    if (!m) continue;
    const nestedName = m[1];
    const bytes = await file.async("arraybuffer");
    const ext = nestedName.split(".").pop()?.toLowerCase() ?? "";
    const kind: FileKind =
      ext === "pdf" ? "pdf" : ext.startsWith("xls") ? "xlsx" : ext.startsWith("ppt") ? "pptx" : "docx";
    const nested = await scanNested(bytes, nestedName, kind);
    for (const f of nested) {
      if (cap(findings)) break;
      findings.push({
        ...f,
        id: `${f.id}-emb`,
        kind: "embedded",
        location: `Embedded ${nestedName} · ${f.location}`,
        severity: "medium",
      });
    }
  }
}

export async function scanOfficeBuffer(
  buffer: ArrayBuffer,
  kind: FileKind,
  scanNested: (bytes: ArrayBuffer, name: string, kind: FileKind) => Promise<Finding[]>,
): Promise<Finding[]> {
  const zip = await JSZip.loadAsync(buffer);
  const findings: Finding[] = [];
  if (kind === "docx") await scanDocx(zip, findings);
  else if (kind === "xlsx") await scanXlsx(zip, findings);
  else if (kind === "pptx") await scanPptx(zip, findings);
  await scanEmbeddings(zip, findings, scanNested);
  return findings;
}

function pptRole(phType: string, _name: string, index: number): string {
  switch (phType) {
    case "title":
    case "ctrTitle":
      return "Title";
    case "subTitle":
      return "Subtitle";
    case "body":
      return "Body";
    case "dt":
      return "Date";
    case "ftr":
      return "Footer";
    case "hdr":
      return "Header";
    case "sldNum":
      return "Slide number";
    default:
      return `Text box ${index + 1}`;
  }
}
