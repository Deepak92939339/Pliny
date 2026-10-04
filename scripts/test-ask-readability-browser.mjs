import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Actual UI with synthetic, intercepted responses. Never a hosted/provider test.
const base = new URL(process.env.PLINY_UI_TEST_URL || "http://127.0.0.1:3123");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const { chromium } = await import(process.env.PLINY_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const output = resolve("artifacts/codex-readability-20261004");
mkdirSync(output, { recursive: true });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let reply;
let requestCount = 0;
await page.route("**/api/**", async (route) => {
  if (new URL(route.request().url()).pathname !== "/api/chat" || route.request().method() !== "POST") return route.abort();
  requestCount++;
  reply = async (status, body) => {
    reply = undefined;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  };
});
await page.route("**/*", async (route) => {
  if (new URL(route.request().url()).origin !== base.origin) return route.abort();
  await route.fallback();
});
const source = {
  id: "synthetic-chunk", documentId: "doc-1", collectionId: "coll-1", filename: "synthetic-ledger.csv",
  pageNumber: 1, chunkIndex: 0, fileKind: "csv", locationLabel: "Rows 2–9",
  content: "Company: Example PLC; City: Test Harbour; Country: Testland; Phone: 555-0100; Website: example.test",
  relevanceScore: 0.95, fusionScore: 0.95, retrievalMode: "hybrid",
};
const metadata = { maxOutputTokens: 1024, model: "synthetic", modelReason: "fixture", retrievalReason: "hybrid_match", evidenceStatus: "strong" };
const response = (question, answer) => ({
  collectionId: "coll-1", question, answer, status: "answered", metadata,
  sources: [source], citations: [{ id: "synthetic-citation", marker: "[[s.1]]", source, chunkId: source.id, documentId: source.documentId, filename: source.filename, pageNumber: 1 }],
});
const textarea = page.getByRole("textbox", { name: "Ask a question about your documents", exact: true });
const scroller = page.getByLabel("Questions and answers", { exact: true });
const entry = (question) => page.getByRole("article", { name: question, exact: true });
let checks = 0;
function pass(name) { checks++; console.log(`PASS ${name}`); }
async function waitReply() { await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((el) => el.textContent?.includes("Preparing"))); assert.ok(reply); }
async function submit(question) {
  await textarea.fill(question);
  await textarea.press("Control+Enter");
  await waitReply();
}
async function openExport(turn) { await turn.locator("summary").filter({ hasText: "Export this answer" }).click(); }
async function openHarness(path) {
  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Exclude the development toolbar so the application's 100dvh shell gets
  // the same viewport as the real route. No app CSS or content is overridden.
  await page.addStyleTag({ content: "[data-harness] { display: none !important; }" });
  // Server-rendered headings can appear before the client handlers are ready.
  await page.waitForFunction(() => {
    const input = document.querySelector("textarea");
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
  });
}
try {
  await openHarness("/ui-preview-harness?tab=workspace");
  await entry("What was the operating margin trend in Q3 and which division led profitability?").waitFor();
  assert.equal(await page.getByText("Flagship artifact", { exact: false }).count(), 0);
  assert.ok((await textarea.boundingBox()).height < 70);
  pass("ordinary answer has no automatic risk artifact; input is compact");

  const shortQuestion = "What city is Example PLC in?";
  await submit(shortQuestion);
  const pendingId = await entry(shortQuestion).getAttribute("data-turn-id");
  const position = await entry(shortQuestion).getByRole("heading").boundingBox();
  const readingBox = await scroller.boundingBox();
  assert.ok(position.y >= readingBox.y - 1 && position.y + position.height <= readingBox.y + readingBox.height);
  await reply(200, response(shortQuestion, "Example PLC is in Test Harbour [[s.1]]."));
  await entry(shortQuestion).getByText("Example PLC is in Test Harbour", { exact: false }).waitFor();
  assert.equal(await entry(shortQuestion).getAttribute("data-turn-id"), pendingId);
  pass("submission is brought into view and completion keeps the same turn identity");
  await entry(shortQuestion).getByRole("button", { name: /Source 1:/ }).click();
  await page.getByRole("button", { name: "Close source inspector", exact: true }).click();
  pass("inline citation still opens the source inspector");

  const longQuestion = "Summarise the synthetic ledger.";
  await submit(longQuestion);
  const longAnswer = Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}: Example PLC is located in Test Harbour. This synthetic paragraph exercises long-answer reading and scrolling [[s.1]].`).join("\n\n");
  await page.getByRole("button", { name: shortQuestion, exact: false }).click();
  const before = await scroller.evaluate((el) => el.scrollTop);
  await reply(200, response(longQuestion, longAnswer));
  await entry(longQuestion).getByText("Paragraph 24:", { exact: false }).waitFor();
  assert.ok(Math.abs(await scroller.evaluate((el) => el.scrollTop) - before) < 3, "Completion must not steal an older-turn reader's scroll.");
  pass("long answer completion does not jump a reader inspecting an older turn");

  await page.getByRole("button", { name: longQuestion, exact: false }).click();
  assert.equal(await entry(longQuestion).evaluate((el) => el === document.activeElement), true);
  pass("recent-question navigation targets and focuses the correct turn");
  await openExport(entry(longQuestion));
  const downloadPromise = page.waitForEvent("download");
  await entry(longQuestion).getByRole("button", { name: "This answer — Markdown", exact: true }).click();
  const download = await downloadPromise;
  const exported = readFileSync(await download.path(), "utf8");
  assert.ok(exported.includes(longQuestion));
  assert.ok(!exported.includes(shortQuestion));
  assert.ok(exported.includes("synthetic-ledger.csv"));
  pass("single-answer Markdown contains only selected question/answer and its source");
  const popupPromise = page.waitForEvent("popup");
  await entry(longQuestion).getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  const popup = await popupPromise;
  await popup.getByRole("button", { name: "Print / Save PDF" }).waitFor();
  assert.ok((await popup.locator("body").innerText()).includes(longQuestion));
  assert.ok(!(await popup.locator("body").innerText()).includes(shortQuestion));
  assert.equal(await popup.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
  await popup.close();
  pass("selected-answer print view opens with self-contained styles; no unrelated turns");

  await entry(longQuestion).locator("summary").filter({ hasText: "Reports" }).click();
  await entry(longQuestion).getByRole("button", { name: "Preview risk report", exact: true }).click();
  await entry(longQuestion).getByText("Flagship artifact", { exact: false }).waitFor();
  await entry(longQuestion).getByRole("button", { name: "Hide risk report preview", exact: true }).click();
  assert.equal(await entry(longQuestion).getByText("Flagship artifact", { exact: false }).count(), 0);
  pass("risk artifact remains available only when explicitly requested");

  await submit("Show the synthetic chart.");
  const chart = { type: "bar", title: "Synthetic counts", xKey: "label", series: [{ key: "count", label: "Count" }],
    data: [{ label: "A", count: 1 }, { label: "B", count: 2 }], sourceRefs: ["s.1"] };
  await reply(200, response("Show the synthetic chart.", `Synthetic counts [[s.1]].\n<chart>${JSON.stringify(chart)}</chart>`));
  await entry("Show the synthetic chart.").getByRole("heading", { name: "Synthetic counts" }).waitFor();
  pass("cited chart still renders inside its answer turn");

  await submit("Synthetic failed request");
  await reply(503, { error: "Synthetic service failure" });
  await entry("Synthetic failed request").getByRole("alert").waitFor();
  assert.equal(await entry("Synthetic failed request").getByRole("heading").innerText(), "Synthetic failed request");
  const count = requestCount;
  await entry("Synthetic failed request").getByRole("button", { name: "Retry question" }).click();
  await waitReply();
  assert.equal(requestCount, count + 1);
  await reply(200, response("Synthetic failed request", "Synthetic retry succeeded [[s.1]]."));
  await entry("Synthetic failed request").getByText("Synthetic retry succeeded", { exact: false }).waitFor();
  pass("failed request keeps its question and explicit Retry makes one request");

  for (const width of [375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await textarea.fill("One line\nTwo lines\nThree lines");
    assert.ok((await textarea.boundingBox()).height <= 120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const inputBox = await textarea.boundingBox();
    assert.ok(inputBox.x >= 0 && inputBox.x + inputBox.width <= width);
    await scroller.evaluate((el) => {
      const turn = Array.from(el.querySelectorAll("[data-turn-id]")).at(-1);
      el.scrollTop += turn.getBoundingClientRect().top - el.getBoundingClientRect().top - 16;
    });
    await page.screenshot({ path: resolve(output, `ask-${width}.png`) });
    pass(`${width}px multiline composer stays bounded and page has no horizontal overflow`);
  }

  await page.setViewportSize({ width: 390, height: 500 });
  assert.ok((await textarea.boundingBox()).y + (await textarea.boundingBox()).height <= 500);
  pass("composer remains reachable at reduced viewport height (not a real-device keyboard test)");
  await openHarness("/ui-preview-harness?tab=refusal");
  const refusal = page.getByRole("article");
  await refusal.getByRole("heading", { name: "I couldn’t answer this from the available workspace evidence." }).waitFor();
  await openExport(refusal);
  const refusedDownload = page.waitForEvent("download");
  await refusal.getByRole("button", { name: "This answer — Markdown" }).click();
  assert.match(readFileSync(await (await refusedDownload).path(), "utf8"), /Insufficient Evidence/);
  assert.equal(await refusal.getByText("Reports", { exact: true }).count(), 0);
  pass("refusal can be exported without falsely enabling source-backed reports");
  await openHarness("/ui-preview-harness?tab=workspace&state=empty");
  await page.getByText("Ask a question about your documents", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("article").count(), 0);
  pass("empty conversation remains understandable");
  await openHarness("/ui-preview-harness?tab=workspace&state=no-documents");
  await page.getByRole("heading", { name: "No documents yet" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ask", exact: true }).isDisabled(), true);
  pass("no-documents state cannot submit");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await textarea.evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
  assert.deepEqual(errors, []);
  pass("reduced motion respected and no browser page errors");
  console.log(`${checks} focused browser checks passed. All chat responses synthetic; provider calls: 0.`);
} finally { await browser.close(); }
