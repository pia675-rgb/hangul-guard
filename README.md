# English Guard

Scan PDF, Word, Excel, and PowerPoint files for leftover **non-English** text before a US delivery.

US-bound files must be English-only. The scanner flags Hangul, Han (Chinese/Japanese kanji), kana, Cyrillic, Arabic, and other non-Latin letters. Accented Latin (`café`, `naïve`) passes.

Files are opened in the browser only. Nothing is uploaded to a server.

## Use it

1. Drop `.pdf`, `.docx`, `.xlsx`, or `.pptx` files (folders work too).
2. Review flagged locations: body text, headers, notes, sheet names, shape names, document properties.
3. Export an English CSV/JSON report for a US team.

**Limits:** image-only scanned PDFs are not OCR’d. Legacy `.doc` / `.xls` / `.ppt` get a best-effort binary pass.

## Local / intranet pack

For an office network that cannot reach grok.me:

```bash
npm install
npm run build:local
```

That writes `EnglishGuard-Local.zip` (a single `EnglishGuard.html` plus a Korean readme). Unzip and open the HTML in Chrome or Edge. No install, no internet, no `.bat` / `.exe`.

See `local-app/사용설명.txt`.

## Run the web app locally (developers)

Needs Node.js 22.

```bash
npm install
npm run dev
```

```bash
npm run build
npm run typecheck
```

## Stack

React 19, TanStack Start, Tailwind v4, pdf.js, JSZip.
