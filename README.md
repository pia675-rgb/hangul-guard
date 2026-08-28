# Hangul Guard

Scan PDF, Word, Excel, and PowerPoint files for leftover Hangul before a US delivery.

Files are opened in the browser only. Nothing is uploaded to a server.

## Use it

1. Drop `.pdf`, `.docx`, `.xlsx`, or `.pptx` files (folders work too).
2. Review flagged locations: body text, headers, notes, sheet names, shape names, document properties.
3. Export an English CSV/JSON report for a US team.

Hanja / Chinese / Japanese kana are ignored. Hangul only.

**Limits:** image-only scanned PDFs are not OCR’d. Legacy `.doc` / `.xls` / `.ppt` get a best-effort binary pass.

## Run locally

Needs Node.js 22.

```bash
npm install
npm run dev
```

Then open the URL the command prints.

```bash
npm run build
npm run typecheck
```

## Stack

React 19, TanStack Start, Tailwind v4, pdf.js, JSZip.

## License

Private project unless you change this.
