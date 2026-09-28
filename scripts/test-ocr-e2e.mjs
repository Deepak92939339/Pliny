// WP1 (PLN-009 S1) — real OCR end-to-end proof, env-gated: PLINY_OCR_E2E=1.
// Builds a synthetic 2-page IMAGE-ONLY PDF (the exact S1 reproduction shape:
// no extractable text, OCR is the only path), runs it through the real pdf
// processor with OCR enabled, and asserts it reaches a Ready-grade result
// inside the OCR time budget instead of hanging.
//
// Run: PLINY_OCR_E2E=1 OCR_ENABLED=true npm run test:ocr-e2e

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

const { pdfProcessor } = await import("../src/lib/document-processing/plugins/pdf.ts");
const { getOcrTimeBudgetMs } = await import("../src/lib/ocr/extractPdfWithOcr.ts");

const PAGE_LABELS = [
  [
    "MERIDIAN HARBOR LOGISTICS",
    "INCIDENT SUMMARY PAGE ONE",
    "SEVERITY HIGH AT BERTH SEVEN",
    "THE CRANE OPERATOR REPORTED A HYDRAULIC LEAK",
    "MAINTENANCE TEAMS ISOLATED THE POWER UNIT",
    "NO INJURIES WERE RECORDED DURING THE SHIFT",
    "INCIDENT REFERENCE INC-5517 WAS OPENED TODAY",
    "THE TERMINAL MANAGER SIGNED THE FIRST REPORT",
  ],
  [
    "MERIDIAN HARBOR LOGISTICS",
    "RECOVERY PLAN PAGE TWO",
    "RTO SIXTY MINUTES RPO FIFTEEN MINUTES",
    "ENGINEERS REPLACED THE FAILED SEAL KIT",
    "THE BERTH REOPENED AFTER SAFETY CHECKS",
    "CARGO OPERATIONS RESUMED BEFORE MIDNIGHT",
    "FOLLOW UP INSPECTION SCHEDULED NEXT WEEK",
    "OWNER NOTIFICATION WAS SENT TO THE CLIENT",
  ],
];

// Sandboxes and slim containers often have no default font families; register
// an explicit TTF so the synthetic scan actually contains drawn glyphs.
const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  "/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.t1",
];

function registerFixtureFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (existsSync(candidate)) {
      GlobalFonts.registerFromPath(candidate, "PlinyFixtureSans");
      return "PlinyFixtureSans";
    }
  }
  return "sans-serif";
}

function renderPageJpeg(lines) {
  const family = registerFixtureFont();
  const scale = 2;
  const width = 850 * scale;
  const height = 1100 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111111";
  context.textBaseline = "top";

  let y = 200 * scale;
  const maxWidth = width - 2 * 80 * scale;
  for (const line of lines) {
    // auto-fit: shrink the font until the line fits the page width
    let fontSize = 52 * scale;
    do {
      context.font = `bold ${fontSize}px ${family}`;
      fontSize -= 4;
    } while (context.measureText(line).width > maxWidth && fontSize > 16);
    context.fillText(line, 80 * scale, y);
    y += 140 * scale;
  }

  return canvas.toBuffer("image/jpeg", 0.92);
}

// Minimal two-page PDF whose pages are JPEG images only (no text layer).
function buildImageOnlyPdf(jpegs) {
  const objects = [];
  const pageObjectNumbers = [];
  const imageObjectNumbers = [];
  const contentObjectNumbers = [];
  let nextNumber = 3;

  for (let index = 0; index < jpegs.length; index += 1) {
    imageObjectNumbers.push(nextNumber++);
  }
  for (let index = 0; index < jpegs.length; index += 1) {
    contentObjectNumbers.push(nextNumber++);
  }
  for (let index = 0; index < jpegs.length; index += 1) {
    pageObjectNumbers.push(nextNumber++);
  }

  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = new Map();

  function pushBytes(bytes) {
    chunks.push(bytes);
    offset += bytes.length;
  }

  pushBytes(enc.encode("%PDF-1.4\n"));

  function pushObject(number, body, streamBytes) {
    const head = enc.encode(`${number} 0 obj\n${body}\n`);
    const tail = enc.encode("endobj\n");
    offsets.set(number, offset);
    chunks.push(head);
    offset += head.length;
    if (streamBytes) {
      offsets.set(`stream-${number}`, offset);
      const streamHead = enc.encode("stream\n");
      chunks.push(streamHead);
      offset += streamHead.length;
      chunks.push(streamBytes);
      offset += streamBytes.length;
      const streamTail = enc.encode("\nendstream\n");
      chunks.push(streamTail);
      offset += streamTail.length;
    }
    chunks.push(tail);
    offset += tail.length;
  }

  pushObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  pushObject(2, `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${jpegs.length} >>`);

  jpegs.forEach((jpeg, index) => {
    const pageNumber = pageObjectNumbers[index];
    const imageNumber = imageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    // jpeg SOF0/SOF2 gives dimensions; canvas output is stable, parse minimally
    const { width, height } = readJpegSize(jpeg);
    const pageBody =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im0 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    pushObject(pageNumber, pageBody);
    pushObject(
      imageNumber,
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      jpeg
    );
    const contentText = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    pushObject(contentNumber, `<< /Length ${contentText.length} >>`, enc.encode(contentText));
  });

  const xrefOffset = offset;
  const size = 2 + jpegs.length * 3 + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let number = 1; number < size; number += 1) {
    xref += `${String(offsets.get(number)).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(enc.encode(xref + trailer));
  return Buffer.concat(chunks);
}

function readJpegSize(jpeg) {
  let cursor = 2;
  while (cursor < jpeg.length - 9) {
    if (jpeg[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    const marker = jpeg[cursor + 1];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: jpeg.readUInt16BE(cursor + 5), width: jpeg.readUInt16BE(cursor + 7) };
    }
    cursor += 2 + jpeg.readUInt16BE(cursor + 2);
  }
  throw new Error("Could not read JPEG size");
}

test("synthetic image-only PDF reaches Ready-grade output via OCR within budget", { skip: process.env.PLINY_OCR_E2E !== "1" ? "set PLINY_OCR_E2E=1" : false }, async () => {
  assert.equal(process.env.OCR_ENABLED, "true", "OCR must be enabled for this test.");
  const budgetMs = getOcrTimeBudgetMs();
  const jpegs = PAGE_LABELS.map(renderPageJpeg);
  const pdfBytes = new Uint8Array(buildImageOnlyPdf(jpegs));

  assert.equal(String.fromCharCode(...pdfBytes.slice(0, 5)), "%PDF-");
  assert.ok(pdfBytes.byteLength < 5 * 1024 * 1024);

  const stages = [];
  const startedAt = Date.now();
  const extracted = await pdfProcessor.extract({
    bytes: pdfBytes,
    filename: "synthetic-scanned.pdf",
    mimeType: "application/pdf",
    onStage: async (stage) => {
      stages.push(stage);
    },
  });
  const durationMs = Date.now() - startedAt;

  assert.ok(stages.includes("ocr_fallback"), `expected the OCR fallback stage, got ${stages.join(",")}`);
  assert.equal(extracted.kind, "pdf");
  assert.equal(extracted.pageCount, 2);
  assert.ok(["ocr", "pdf_hybrid_ocr"].includes(extracted.extractionMethod), `unexpected method ${extracted.extractionMethod}`);
  const text = extracted.plainText.toUpperCase();
  for (const phrase of ["MERIDIAN HARBOR LOGISTICS", "INCIDENT SUMMARY PAGE ONE", "RTO SIXTY MINUTES"]) {
    assert.ok(text.includes(phrase), `OCR text should contain "${phrase}", got: ${extracted.plainText.slice(0, 200)}`);
  }
  assert.ok(durationMs < budgetMs, `OCR took ${durationMs}ms, over the ${budgetMs}ms budget`);

  console.info(`[ocr-e2e] reached Ready-grade output in ${durationMs}ms (budget ${budgetMs}ms), method=${extracted.extractionMethod}, chars=${extracted.charCount}`);
});
