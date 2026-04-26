---
name: pdf-operations
description: Create, read, and modify PDF files. Use when generating PDF reports, invoices, or documents; when extracting text or metadata from existing PDFs; when merging, splitting, or annotating PDFs; or when converting HTML to PDF. Compatible with Claude Code, OpenCode, and Gemini CLI.
---

# PDF Operations

## Overview

Three tools cover all PDF work. Use the right one for the job:

| Task | Tool | Why |
|---|---|---|
| Create PDFs programmatically | `pdf-lib` | Pure JS, no browser, no native binaries — works everywhere |
| Read / extract text | `pdf-parse` | Lightweight text and metadata extraction |
| Render HTML → PDF | `playwright` | Already on `NODE_PATH`; best for styled reports and dashboards |
| Merge / split / fill forms | `pdf-lib` | Modify any existing PDF without re-rendering |
| CLI fallback (no npm) | `pdftotext`, `pandoc` | System tools when workspace deps unavailable |

---

## Setup

Install in the workspace. Both packages are pure JavaScript with no native binary dependencies.

```bash
npm install pdf-lib pdf-parse
```

`playwright` is already available — do **not** reinstall it:

```js
const { chromium } = require('playwright');  // resolves via NODE_PATH
```

---

## Creating PDFs with pdf-lib

Use `pdf-lib` when you need to generate structured documents programmatically: invoices, reports, certificates, form templates.

```js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function createInvoice(data, outputPath) {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);           // A4 in points (72pt = 1 inch)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;

  // Header
  page.drawText('INVOICE', {
    x: margin, y: height - 80,
    size: 28, font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`Invoice #${data.invoiceNumber}`, {
    x: margin, y: height - 115,
    size: 12, font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Divider line
  page.drawLine({
    start: { x: margin, y: height - 130 },
    end:   { x: width - margin, y: height - 130 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Line items
  let y = height - 170;
  for (const item of data.items) {
    page.drawText(item.description, { x: margin,       y, size: 11, font });
    page.drawText(`$${item.amount}`, { x: width - 120, y, size: 11, font });
    y -= 22;
  }

  // Total
  page.drawText(`Total: $${data.total}`, {
    x: width - 160, y: y - 20,
    size: 13, font: bold,
  });

  const bytes = await doc.save();
  fs.writeFileSync(outputPath, bytes);
}
```

### Common page sizes (in points, 72pt = 1 inch)

```js
const SIZES = {
  A4:     [595.28, 841.89],
  Letter: [612,    792],
  Legal:  [612,    1008],
};
```

### Embedding images

```js
const imageBytes = fs.readFileSync('logo.png');
const image      = await doc.embedPng(imageBytes);   // or embedJpg()
const { width: imgW, height: imgH } = image.scale(0.5);  // scale to 50%

page.drawImage(image, {
  x: margin, y: height - 60,
  width: imgW, height: imgH,
});
```

---

## Rendering HTML to PDF with Playwright

Use when the output needs full CSS styling, web fonts, charts, tables, or any layout that's easier to write as HTML.

```js
const { chromium } = require('playwright');  // already on NODE_PATH
const path = require('path');

async function htmlToPdf(htmlPath, outputPath) {
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  // Load local HTML file
  await page.goto('file://' + path.resolve(htmlPath));
  await page.waitForLoadState('networkidle');   // wait for fonts/images

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,       // include CSS background colors
    margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
  });

  await browser.close();
}
```

### Inject data into the HTML template before rendering

```js
async function renderReport(template, data, outputPath) {
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  // Set content directly instead of loading a file
  const html = template
    .replace('{{title}}', data.title)
    .replace('{{body}}',  data.body);

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  await browser.close();
}
```

### CSS tips for print-quality PDFs

```css
@page {
  size: A4;
  margin: 2cm;
}

/* Prevent page breaks inside cards or rows */
.card, tr {
  page-break-inside: avoid;
}

/* Force a page break before a section */
.chapter {
  page-break-before: always;
}

/* Hide browser-only UI elements */
@media print {
  .no-print { display: none; }
}
```

---

## Reading PDFs with pdf-parse

Use to extract text content and metadata from an existing PDF.

```js
const pdfParse = require('pdf-parse');
const fs = require('fs');

async function extractText(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const data   = await pdfParse(buffer);

  console.log('Pages:',    data.numpages);
  console.log('Info:',     data.info);       // title, author, subject, etc.
  console.log('Metadata:', data.metadata);
  console.log('Text:\n',   data.text);       // full extracted text

  return data.text;
}

// Extract text from a specific page range
async function extractPages(pdfPath, from, to) {
  const buffer = fs.readFileSync(pdfPath);
  let pageCount = 0;

  const data = await pdfParse(buffer, {
    pagerender: (pageData) => {
      pageCount++;
      if (pageCount >= from && pageCount <= to) {
        return pageData.getTextContent().then(tc =>
          tc.items.map(i => i.str).join(' ')
        );
      }
      return Promise.resolve('');
    }
  });

  return data.text;
}
```

**Limitation:** `pdf-parse` extracts text in reading order but cannot reconstruct table structures or positioned layouts. For complex layout analysis, use `pymupdf` (Python) or a commercial API.

---

## Modifying PDFs with pdf-lib

### Merge multiple PDFs into one

```js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function mergePdfs(inputPaths, outputPath) {
  const merged = await PDFDocument.create();

  for (const filePath of inputPaths) {
    const bytes = fs.readFileSync(filePath);
    const doc   = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }

  fs.writeFileSync(outputPath, await merged.save());
}
```

### Extract a page range (split a PDF)

```js
async function extractPages(inputPath, pageNumbers, outputPath) {
  const bytes = fs.readFileSync(inputPath);
  const src   = await PDFDocument.load(bytes);
  const out   = await PDFDocument.create();

  const pages = await out.copyPages(src, pageNumbers.map(n => n - 1)); // 0-indexed
  pages.forEach(p => out.addPage(p));

  fs.writeFileSync(outputPath, await out.save());
}
```

### Fill a PDF form

```js
async function fillForm(templatePath, fields, outputPath) {
  const bytes = fs.readFileSync(templatePath);
  const doc   = await PDFDocument.load(bytes);
  const form  = doc.getForm();

  // List all field names in a form:
  // form.getFields().forEach(f => console.log(f.getName()));

  for (const [name, value] of Object.entries(fields)) {
    const field = form.getFieldMaybe(name);
    if (!field) continue;

    if (field.constructor.name === 'PDFTextField')    field.setText(String(value));
    if (field.constructor.name === 'PDFCheckBox')     value ? field.check() : field.uncheck();
    if (field.constructor.name === 'PDFDropdown')     field.select(String(value));
  }

  form.flatten();   // make fields non-editable in the output
  fs.writeFileSync(outputPath, await doc.save());
}
```

### Add a watermark to every page

```js
async function addWatermark(inputPath, text, outputPath) {
  const bytes = fs.readFileSync(inputPath);
  const doc   = await PDFDocument.load(bytes);
  const font  = await doc.embedFont(require('pdf-lib').StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x:        width / 2 - 100,
      y:        height / 2,
      size:     52,
      font,
      color:    require('pdf-lib').rgb(0.85, 0.85, 0.85),
      opacity:  0.35,
      rotate:   require('pdf-lib').degrees(45),
    });
  }

  fs.writeFileSync(outputPath, await doc.save());
}
```

---

## CLI Fallbacks

Use when `npm install` is not possible or when processing PDFs from the shell.

```bash
# Extract text (requires poppler-utils)
# macOS:  brew install poppler
# Linux:  apt-get install poppler-utils
pdftotext input.pdf output.txt
pdftotext -f 2 -l 5 input.pdf -   # pages 2–5 to stdout

# Get page count and metadata
pdfinfo input.pdf

# HTML/Markdown to PDF via pandoc
# macOS:  brew install pandoc
pandoc report.md -o report.pdf
pandoc report.html -o report.pdf --pdf-engine=wkhtmltopdf

# Merge PDFs (ghostscript)
gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -sOutputFile=merged.pdf a.pdf b.pdf
```

---

## Verification

Before delivering any PDF output:

```bash
# Confirm the file is a valid PDF (magic bytes check)
file output.pdf
# → output.pdf: PDF document, version 1.7

# Check page count and metadata
node -e "
const pdfParse = require('pdf-parse');
const fs = require('fs');
pdfParse(fs.readFileSync('output.pdf')).then(d => {
  console.log('Pages:', d.numpages);
  console.log('Has text:', d.text.trim().length > 0);
});
"
```

- [ ] File opens without errors in a PDF viewer
- [ ] Page count matches expectation
- [ ] Text is selectable (not a scanned image)
- [ ] Images and fonts render correctly
- [ ] Form fields (if any) are filled and flattened
- [ ] File size is reasonable (< 5MB for text-heavy docs; flag if larger)
- [ ] No sensitive data included unintentionally
