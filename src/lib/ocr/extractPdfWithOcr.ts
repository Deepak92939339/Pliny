import { createRequire } from "node:module";
import { createCanvas } from "@napi-rs/canvas";
import Tesseract from "tesseract.js";
import type { PageText } from "@/lib/chunker";

const require = createRequire(import.meta.url);
const englishLanguageData = require("@tesseract.js-data/eng") as {
  code: "eng";
  gzip: boolean;
  langPath: string;
};

const OCR_RENDER_SCALE = 2;

type PdfPageForRendering = {
  cleanup: () => void;
  getViewport: (options: { scale: number }) => {
    height: number;
    width: number;
  };
  render: (options: {
    background?: string;
    canvas: HTMLCanvasElement | null;
    canvasContext?: CanvasRenderingContext2D;
    viewport: unknown;
  }) => {
    promise: Promise<unknown>;
  };
};

type PdfDocumentForRendering = {
  cleanup: () => void;
  destroy: () => Promise<void>;
  getPage: (pageNumber: number) => Promise<PdfPageForRendering>;
  numPages: number;
};

type PdfJsModule = {
  getDocument: (options: {
    data: Uint8Array;
    disableFontFace?: boolean;
    disableWorker?: boolean;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
  }) => {
    promise: Promise<PdfDocumentForRendering>;
  };
};

export type OcrExtractionResult = {
  maxPages: number;
  pageCount: number;
  pages: PageText[];
  pagesOcred: number;
  text: string;
  truncated: boolean;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

async function renderPageToPng(page: PdfPageForRendering) {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);

  await page.render({
    background: "white",
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

export async function extractPdfWithOcr(pdfData: Uint8Array, { maxPages }: { maxPages: number }): Promise<OcrExtractionResult> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfData),
    disableFontFace: true,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDocument = await loadingTask.promise;
  const pagesToProcess = Math.max(1, Math.min(pdfDocument.numPages, maxPages));
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    cacheMethod: "none",
    gzip: englishLanguageData.gzip,
    langPath: englishLanguageData.langPath,
  });
  const pages: PageText[] = [];

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      user_defined_dpi: "180",
    });

    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);

      try {
        const imageBuffer = await renderPageToPng(page);
        const result = await worker.recognize(imageBuffer);
        const text = normalizeText(result.data.text);

        pages.push({
          pageNumber,
          text,
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await worker.terminate().catch(() => undefined);
    pdfDocument.cleanup();
    await pdfDocument.destroy().catch(() => undefined);
  }

  const text = normalizeText(pages.map((page) => page.text).join(" "));

  return {
    maxPages,
    pageCount: pdfDocument.numPages,
    pages,
    pagesOcred: pagesToProcess,
    text,
    truncated: pdfDocument.numPages > pagesToProcess,
  };
}
