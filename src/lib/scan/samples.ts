import JSZip from "jszip";

function xml(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? String(values[i] ?? "") : ""), "");
}

function contentTypes(overrides: string[]): string {
  return xml`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${overrides.join("\n  ")}
</Types>`;
}

function relsRoot(officeTarget: string): string {
  return xml`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${officeTarget}"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function coreProps(title: string, creator = "Hangul Guard Samples"): string {
  return xml`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(creator)}</dc:creator>
</cp:coreProperties>`;
}

function appProps(): string {
  return xml`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Hangul Guard</Application>
</Properties>`;
}

function escapeXml(value: string): string {
  const amp = "\u0026";
  return value
    .replace(/&/g, `${amp}amp;`)
    .replace(/</g, `${amp}lt;`)
    .replace(/>/g, `${amp}gt;`)
    .replace(/"/g, `${amp}quot;`);
}

async function zipToFile(name: string, type: string, files: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [path, body] of Object.entries(files)) zip.file(path, body);
  const blob = await zip.generateAsync({ type: "blob", mimeType: type });
  return new File([blob], name, { type });
}

async function buildDocx(name: string, paragraphs: string[], title: string): Promise<File> {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`)
    .join("");
  return zipToFile(name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", {
    "[Content_Types].xml": contentTypes([
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]),
    "_rels/.rels": relsRoot("word/document.xml"),
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`,
    "docProps/core.xml": coreProps(title),
    "docProps/app.xml": appProps(),
  });
}

async function buildXlsx(
  name: string,
  title: string,
  sheets: { name: string; rows: string[][] }[],
): Promise<File> {
  const sst: string[] = [];
  const indexOf = (s: string) => {
    const i = sst.indexOf(s);
    if (i >= 0) return i;
    sst.push(s);
    return sst.length - 1;
  };

  const sheetFiles: Record<string, string> = {};
  const sheetTags: string[] = [];
  const rels: string[] = [];

  sheets.forEach((sheet, i) => {
    const n = i + 1;
    rels.push(
      `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
    );
    sheetTags.push(`<sheet name="${escapeXml(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`);
    const rowsXml = sheet.rows
      .map((row, r) => {
        const cells = row
          .map((value, c) => {
            const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
            return `<c r="${ref}" t="s"><v>${indexOf(value)}</v></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    sheetFiles[`xl/worksheets/sheet${n}.xml`] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  });

  const sstXml = sst.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join("");

  return zipToFile(name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", {
    "[Content_Types].xml": contentTypes([
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      ...sheets.map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      ),
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]),
    "_rels/.rels": relsRoot("xl/workbook.xml"),
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags.join("")}</sheets></workbook>`,
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">${sstXml}</sst>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`,
    "docProps/core.xml": coreProps(title),
    "docProps/app.xml": appProps(),
    ...sheetFiles,
  });
}

async function buildPptx(
  name: string,
  title: string,
  slideTexts: string[],
  shapeName: string,
): Promise<File> {
  const slideXml = (text: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name="ShapeTree"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="${escapeXml(shapeName)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const sldIdLst = slideTexts
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");

  const presRels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    ...slideTexts.map(
      (_, i) =>
        `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
    ),
  ].join("");

  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypes([
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
      ...slideTexts.map(
        (_, i) =>
          `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      ),
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]),
    "_rels/.rels": relsRoot("ppt/presentation.xml"),
    "ppt/_rels/presentation.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`,
    "ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${sldIdLst}</p:sldIdLst></p:presentation>`,
    "ppt/slideMasters/slideMaster1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name="ShapeTree"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldMaster>`,
    "ppt/slideLayouts/slideLayout1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name="ShapeTree"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>`,
    "docProps/core.xml": coreProps(title),
    "docProps/app.xml": appProps(),
  };

  slideTexts.forEach((text, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slideXml(text);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  });

  return zipToFile(name, "application/vnd.openxmlformats-officedocument.presentationml.presentation", files);
}

function encodeUtf16BeHex(str: string): string {
  let hex = "FEFF";
  for (let i = 0; i < str.length; i += 1) {
    hex += str.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return hex;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfFile(name: string, opts: { lines: string[]; title: string; annotation?: string }): File {
  const encoder = new TextEncoder();
  const header = "%PDF-1.4\n%\x80\x80\x80\x80\n";
  const content =
    "BT /F1 14 Tf 72 720 Td\n" +
    opts.lines
      .map((line, i) => (i === 0 ? `(${pdfEscape(line)}) Tj` : `0 -20 Td (${pdfEscape(line)}) Tj`))
      .join("\n") +
    "\nET";

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >>${opts.annotation ? " /Annots [7 0 R]" : ""} >>\nendobj\n`,
    `4 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `6 0 obj\n<< /Title <${encodeUtf16BeHex(opts.title)}> /Author <${encodeUtf16BeHex("Hangul Guard")}> >>\nendobj\n`,
  ];
  if (opts.annotation) {
    objects.push(
      `7 0 obj\n<< /Type /Annot /Subtype /Text /Rect [72 640 120 680] /Contents <${encodeUtf16BeHex(opts.annotation)}> /Name /Comment >>\nendobj\n`,
    );
  }

  const chunks: Uint8Array[] = [encoder.encode(header)];
  const offsets: number[] = [0];
  let offset = encoder.encode(header).length;
  for (const obj of objects) {
    offsets.push(offset);
    const bytes = encoder.encode(obj);
    chunks.push(bytes);
    offset += bytes.length;
  }

  const xrefStart = offset;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return new File([out], name, { type: "application/pdf" });
}

export async function buildSampleFiles(): Promise<File[]> {
  const cleanDoc = await buildDocx(
    "US_Project_Brief.docx",
    [
      "North America launch brief",
      "All customer-facing copy in this document is English-only.",
      "Owners: Product, Legal, Localization QA.",
    ],
    "US Project Brief",
  );

  const dirtyDoc = await buildDocx(
    "API_Spec_v3.docx",
    [
      "Authentication flow (draft)",
      "Clients must send a Bearer token on every request.",
      "참고: 토큰 만료는 다음 주 미팅에서 확정합니다.",
      "参考：来週の会議で確定します。",
      "Error catalog is still under review.",
    ],
    "API Spec v3",
  );

  const dirtyXlsx = await buildXlsx("FY26_Budget.xlsx", "FY26 Budget", [
    {
      name: "Summary",
      rows: [
        ["Line", "Amount"],
        ["Cloud", "120000"],
        ["Staff", "840000"],
      ],
    },
    {
      name: "매출",
      rows: [
        ["월", "실적"],
        ["Jan", "₩ 한글 메모 포함"],
        ["Feb", "91000"],
      ],
    },
  ]);

  const dirtyPpt = await buildPptx(
    "Kickoff_Deck.pptx",
    "Kickoff Deck",
    ["Agenda", "Timeline and owners", "Open questions"],
    "텍스트 상자 1",
  );

  const dirtyPdf = buildPdfFile("Security_Policy.pdf", {
    lines: ["Security Policy", "This page is English-only body text.", "Review before customer delivery."],
    title: "보안 정책 초안",
    annotation: "내부용 한글 주석",
  });

  const cleanPdf = buildPdfFile("Release_Notes.pdf", {
    lines: ["Release notes 1.4", "No outstanding localization issues."],
    title: "Release Notes",
  });

  return [cleanDoc, dirtyDoc, dirtyXlsx, dirtyPpt, dirtyPdf, cleanPdf];
}
