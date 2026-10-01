import assert from "node:assert/strict";
import test from "node:test";

// WP1 — Document processing never gets stuck (PLN-009 S1, PLN-003 S2).
// These tests import the new resilience modules; they must fail before the fix exists.

const { findStaleProcessingDocuments, getStaleProcessingTimeoutMinutes, STALE_PROCESSING_MESSAGE } = await import(
  "../src/lib/documents/staleProcessing.ts"
);

const { runProcessingWithTerminalState } = await import("../src/lib/documents/processingTerminalState.ts");

const {
  getOcrPageTimeoutMs,
  getOcrTimeBudgetMs,
  ocrRenderedPages,
  raceWithTimeout,
} = await import("../src/lib/ocr/extractPdfWithOcr.ts");

const { getProcessFailureMessage } = await import("../src/lib/uploads/processFailureMessage.ts");

const { DocumentProcessingError } = await import("../src/lib/document-processing/types.ts");

const NOW = new Date("2026-09-28T12:00:00.000Z");

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// (a) Stale-processing watchdog decision (pure, injectable clock)
// ---------------------------------------------------------------------------

test("getStaleProcessingTimeoutMinutes: default, clamp and fallback", () => {
  assert.equal(getStaleProcessingTimeoutMinutes({}), 10);
  assert.equal(getStaleProcessingTimeoutMinutes({ STALE_PROCESSING_MINUTES: "3" }), 3);
  assert.equal(getStaleProcessingTimeoutMinutes({ STALE_PROCESSING_MINUTES: "0" }), 1);
  assert.equal(getStaleProcessingTimeoutMinutes({ STALE_PROCESSING_MINUTES: "9999" }), 120);
  assert.equal(getStaleProcessingTimeoutMinutes({ STALE_PROCESSING_MINUTES: "not-a-number" }), 10);
});

test("findStaleProcessingDocuments marks only non-terminal docs past the timeout", () => {
  const rows = [
    // stale: started long ago
    { id: "stale-started", status: "processing", processing_started_at: minutesAgo(11), created_at: minutesAgo(12) },
    // stale: never started, old created_at (upload 429 case, PLN-003)
    { id: "stale-never-started", status: "processing", processing_started_at: null, created_at: minutesAgo(11) },
    // fresh: within the window
    { id: "fresh", status: "processing", processing_started_at: minutesAgo(9), created_at: minutesAgo(9) },
    // boundary: exactly at the timeout is NOT stale (must be strictly older)
    { id: "boundary", status: "processing", processing_started_at: minutesAgo(10), created_at: minutesAgo(10) },
    // terminal states are never stale
    { id: "ready", status: "ready", processing_started_at: minutesAgo(60), created_at: minutesAgo(61) },
    { id: "failed", status: "failed", processing_started_at: minutesAgo(60), created_at: minutesAgo(61) },
  ];

  const stale = findStaleProcessingDocuments(rows, NOW);
  assert.deepEqual(
    stale.map((row) => row.id).sort(),
    ["stale-never-started", "stale-started"]
  );
});

test("findStaleProcessingDocuments respects a custom timeout and falls back to created_at", () => {
  const rows = [
    { id: "old-but-under-custom", status: "processing", processing_started_at: null, created_at: minutesAgo(20) },
    { id: "over-custom", status: "processing", processing_started_at: null, created_at: minutesAgo(31) },
  ];

  const stale = findStaleProcessingDocuments(rows, NOW, 30);
  assert.deepEqual(stale.map((row) => row.id), ["over-custom"]);
});

test("stale message is user readable and asks for retry", () => {
  assert.equal(typeof STALE_PROCESSING_MESSAGE, "string");
  assert.ok(STALE_PROCESSING_MESSAGE.includes("Retry"));
});

// ---------------------------------------------------------------------------
// (b) Processing wrapper always reaches a terminal state on thrown errors
// ---------------------------------------------------------------------------

test("runProcessingWithTerminalState marks the document failed when run throws", async () => {
  const calls = [];
  const failure = new Error("boom");

  await assert.rejects(
    runProcessingWithTerminalState({
      run: async () => {
        throw failure;
      },
      markFailed: async (error) => {
        calls.push(error);
      },
    }),
    (error) => error === failure
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0], failure);
});

test("runProcessingWithTerminalState does not call markFailed on success and never masks markFailed errors", async () => {
  let markFailedCalls = 0;

  const value = await runProcessingWithTerminalState({
    run: async () => "ok",
    markFailed: async () => {
      markFailedCalls += 1;
    },
  });
  assert.equal(value, "ok");
  assert.equal(markFailedCalls, 0);

  const original = new Error("original");
  await assert.rejects(
    runProcessingWithTerminalState({
      run: async () => {
        throw original;
      },
      markFailed: async () => {
        throw new Error("mark-failed-also-exploded");
      },
    }),
    (error) => error === original
  );
});

// ---------------------------------------------------------------------------
// (c) OCR budget and per-page timeout (inject a fake OCR function)
// ---------------------------------------------------------------------------

test("ocr env budgets are clamped to sane bounds", () => {
  assert.equal(getOcrTimeBudgetMs({}), 240_000);
  assert.equal(getOcrTimeBudgetMs({ OCR_TIME_BUDGET_MS: "500" }), 30_000);
  assert.equal(getOcrTimeBudgetMs({ OCR_TIME_BUDGET_MS: "99999999" }), 280_000);
  assert.equal(getOcrTimeBudgetMs({ OCR_TIME_BUDGET_MS: "garbage" }), 240_000);
  assert.equal(getOcrPageTimeoutMs({}), 60_000);
  assert.equal(getOcrPageTimeoutMs({ OCR_PAGE_TIMEOUT_MS: "1" }), 5_000);
});

test("raceWithTimeout rejects with a 408 DocumentProcessingError on timeout", async () => {
  await assert.rejects(
    raceWithTimeout(new Promise(() => {}), 10, "OCR took too long for this document. Try a smaller or clearer scan."),
    (error) => {
      assert.ok(error instanceof DocumentProcessingError);
      assert.equal(error.status, 408);
      assert.equal(error.message, "OCR took too long for this document. Try a smaller or clearer scan.");
      return true;
    }
  );
});

test("ocrRenderedPages throws the 408 timeout when a fake slow page exceeds the page budget", async () => {
  const terminated = [];
  const slowWorker = {
    recognize: () => new Promise(() => {}),
    terminate: async () => {
      terminated.push(true);
    },
  };

  await assert.rejects(
    ocrRenderedPages([{ pageNumber: 1, image: Buffer.alloc(4) }], slowWorker, {
      budgetMs: 60_000,
      pageTimeoutMs: 15,
      now: () => Date.now(),
    }),
    (error) => {
      assert.ok(error instanceof DocumentProcessingError);
      assert.equal(error.status, 408);
      assert.equal(error.message, "OCR took too long for this document. Try a smaller or clearer scan.");
      return true;
    }
  );

  // give the terminate call a tick to land
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(terminated.length, 1);
});

test("ocrRenderedPages enforces the total OCR budget across pages", async () => {
  let calls = 0;
  const worker = {
    recognize: async () => {
      calls += 1;
      return { data: { text: "page text" } };
    },
  };

  await assert.rejects(
    ocrRenderedPages(
      [
        { pageNumber: 1, image: Buffer.alloc(4) },
        { pageNumber: 2, image: Buffer.alloc(4) },
      ],
      worker,
      { budgetMs: -1, pageTimeoutMs: 60_000, now: () => Date.now() }
    ),
    (error) => {
      assert.ok(error instanceof DocumentProcessingError);
      assert.equal(error.status, 408);
      return true;
    }
  );

  assert.equal(calls, 0);
});

test("ocrRenderedPages returns normalized page text for fast fake workers", async () => {
  const worker = {
    recognize: async (image) => {
      assert.ok(Buffer.isBuffer(image) || image instanceof Uint8Array);
      return { data: { text: "  hello   world  " } };
    },
  };

  const result = await ocrRenderedPages(
    [
      { pageNumber: 2, image: Buffer.alloc(4) },
      { pageNumber: 1, image: Buffer.alloc(4) },
    ],
    worker,
    { budgetMs: 60_000, pageTimeoutMs: 60_000, now: () => Date.now() }
  );

  assert.equal(result.pagesOcred, 2);
  assert.deepEqual(
    result.pages.map((page) => page.pageNumber),
    [2, 1]
  );
  assert.equal(result.pages[0].text, "hello world");
});

// ---------------------------------------------------------------------------
// (e) Client process-call failure mapping (WP1 step 5, Retry-After ready for WP3)
// ---------------------------------------------------------------------------

test("getProcessFailureMessage maps 429 with Retry-After to a human wait time", () => {
  const response = { ok: false, status: 429, headers: { get: (name) => (name === "Retry-After" ? "90" : null) } };
  assert.equal(getProcessFailureMessage(response, { error: "You have reached the document processing limit for now." }), "Upload limit reached. Try again in 2 minutes.");

  const secondsResponse = { ok: false, status: 429, headers: { get: (name) => (name === "Retry-After" ? "45" : null) } };
  assert.equal(getProcessFailureMessage(secondsResponse, {}), "Upload limit reached. Try again in 45 seconds.");
});

test("getProcessFailureMessage falls back to the server message without Retry-After", () => {
  const response = { ok: false, status: 429, headers: { get: () => null } };
  assert.equal(
    getProcessFailureMessage(response, { error: "You have reached the document processing limit for now." }),
    "You have reached the document processing limit for now."
  );
});

test("getProcessFailureMessage covers 5xx and empty bodies", () => {
  const serverError = { ok: false, status: 500, headers: { get: () => null } };
  assert.equal(getProcessFailureMessage(serverError, {}), "Processing couldn't start. Retry.");
  assert.equal(getProcessFailureMessage(serverError, { error: "Storage is unhappy." }), "Storage is unhappy.");

  const networkish = { ok: false, status: 0, headers: { get: () => null } };
  assert.equal(getProcessFailureMessage(networkish, {}), "Processing couldn't start. Retry.");
});
