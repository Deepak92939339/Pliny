import { createRequire } from "node:module";
import { createCanvas } from "@napi-rs/canvas";
import Tesseract from "tesseract.js";
import { DocumentProcessingError } from "../document-processing/types.ts";
import type { PageText } from "../chunker.ts";
import { logSafeStageInfo } from "../privacy/safeLogging.ts";

const require = createRequire(import.meta.url);
const englishLanguageData = require("@tesseract.js-data/eng") as {
  code: "eng";
  gzip: boolean;
  langPath: string;
};

const OCR_RENDER_SCALE = 2;

export const OCR_TIMEOUT_MESSAGE = "OCR took too long for this document. Try a smaller or clearer scan.";

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
  pageCount: number;
  pages: PageText[];
  pagesOcred: number;
  text: string;
};

/**
 * Minimal worker surface used by the OCR page loop. Injectable so tests can
 * supply a fake (slow or fast) OCR function.
 */
export type OcrWorkerLike = {
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  terminate?: () => Promise<unknown>;
};

export type RenderedOcrPage = {
  image: Buffer;
  pageNumber: number;
};

function getNumberEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) {
  const value = Number(env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

/**
 * WP1 step 2: total OCR budget. The owner must confirm the Vercel plan's
 * function limit exceeds this value; the default (240s) sits below the
 * maxDuration=300 the process-document route requests.
 */
export function getOcrTimeBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  return getNumberEnv(env, "OCR_TIME_BUDGET_MS", 240_000, 30_000, 280_000);
}

/** WP1 step 2: per-page OCR timeout (recognize + render). */
export function getOcrPageTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return getNumberEnv(env, "OCR_PAGE_TIMEOUT_MS", 60_000, 5_000, 240_000);
}

/**
 * Races a promise against a timeout, rejecting with the user-readable 408 OCR
 * timeout error instead of leaving the request hanging forever.
 */
export function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string = OCR_TIMEOUT_MESSAGE): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DocumentProcessingError(message, 408)), Math.max(timeoutMs, 1));
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * Runs OCR over already-rendered page images under the total budget and the
 * per-page timeout. Any timeout throws the 408 DocumentProcessingError and
 * terminates the worker, so the caller can never hang indefinitely.
 */
export async function ocrRenderedPages(
  pages: readonly RenderedOcrPage[],
  worker: OcrWorkerLike,
  options: { budgetMs: number; pageTimeoutMs: number; now?: () => number }
): Promise<{ pages: PageText[]; pagesOcred: number }> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const remainingBudget = () => options.budgetMs - (now() - startedAt);
  const ocrPages: PageText[] = [];

  for (const page of pages) {
    const remaining = remainingBudget();

    if (remaining <= 0) {
      await terminateWorker(worker);
      throw new DocumentProcessingError(OCR_TIMEOUT_MESSAGE, 408);
    }

    const pageTimeoutMs = Math.min(options.pageTimeoutMs, remaining);
    const pageStartedAt = now();

    try {
      const result = await raceWithTimeout(worker.recognize(page.image), pageTimeoutMs);
      ocrPages.push({
        pageNumber: page.pageNumber,
        text: normalizeText(result.data.text),
      });
      logSafeStageInfo("ocr", "page done", {
        durationMs: now() - pageStartedAt,
        pageNumber: page.pageNumber,
      });
    } catch (error) {
      await terminateWorker(worker);

      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      throw new DocumentProcessingError(OCR_TIMEOUT_MESSAGE, 408);
    }
  }

  logSafeStageInfo("ocr", "end", { durationMs: now() - startedAt, pagesOcred: ocrPages.length });

  return { pages: ocrPages, pagesOcred: ocrPages.length };
}

async function terminateWorker(worker: OcrWorkerLike) {
  try {
    await worker.terminate?.();
  } catch {
    // terminating an already-dead worker must never mask the original error
  }
}

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

export async function extractPdfWithOcr(pdfData: Uint8Array, { pageNumbers }: { pageNumbers: number[] }): Promise<OcrExtractionResult> {
  const budgetMs = getOcrTimeBudgetMs();
  const pageTimeoutMs = getOcrPageTimeoutMs();
  const budgetStartedAt = Date.now();

  logSafeStageInfo("ocr", "start", {
    budgetMs,
    pageCount: pageNumbers.length,
    pageTimeoutMs,
  });

  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfData),
    disableFontFace: true,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDocument = await loadingTask.promise;
  const pagesToProcess = Array.from(new Set(pageNumbers))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pdfDocument.numPages)
    .sort((left, right) => left - right);

  if (pagesToProcess.length === 0) {
    throw new Error("No valid PDF pages were selected for OCR.");
  }
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    cacheMethod: "none",
    gzip: englishLanguageData.gzip,
    langPath: englishLanguageData.langPath,
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      user_defined_dpi: "180",
    });

    const renderedPages: RenderedOcrPage[] = [];

    for (const pageNumber of pagesToProcess) {
      const remainingBudget = budgetMs - (Date.now() - budgetStartedAt);

      if (remainingBudget <= 0) {
        throw new DocumentProcessingError(OCR_TIMEOUT_MESSAGE, 408);
      }

      const page = await pdfDocument.getPage(pageNumber);

      try {
        const imageBuffer = await raceWithTimeout(renderPageToPng(page), Math.min(pageTimeoutMs, remainingBudget));
        renderedPages.push({ image: imageBuffer, pageNumber });
      } finally {
        page.cleanup();
      }
    }

    const ocrResult = await ocrRenderedPages(renderedPages, worker, {
      budgetMs: budgetMs - (Date.now() - budgetStartedAt) || -1,
      now: () => Date.now(),
      pageTimeoutMs,
    });
    const pages = ocrResult.pages;

    // If the budget ran out mid-loop, ocrRenderedPages already threw; keep the
    // successful pages only when the loop completed.
    const text = normalizeText(pages.map((page) => page.text).join(" "));

    return {
      pageCount: pdfDocument.numPages,
      pages,
      pagesOcred: ocrResult.pagesOcred,
      text,
    };
  } finally {
    await worker.terminate().catch(() => undefined);
    pdfDocument.cleanup();
    await pdfDocument.destroy().catch(() => undefined);
  }
}
