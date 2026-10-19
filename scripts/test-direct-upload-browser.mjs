// Real-browser check of the upload dropzone against LOCAL infrastructure: real XHR byte progress,
// Retry after a dropped connection, oversize refusal, and "no file bytes reach the app server".
//
// Not part of test:deterministic: it needs a running local stack and a browser.
//   npm i --no-save playwright-core
//   CHROME_PATH="/path/to/chrome" PLINY_LOCAL_BASE_URL=http://localhost:3100 \
//     npm run test:direct-upload-browser
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { buildSizedPdfFixture } from "./fixtures/synthetic-files.mjs";

const MiB = 1024 * 1024;
const baseUrl = process.env.PLINY_LOCAL_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const chromePath = process.env.CHROME_PATH;

for (const [name, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, PLINY_LOCAL_BASE_URL: baseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey })) {
  assert.ok(value, `${name} must be configured.`);
}
for (const value of [baseUrl, supabaseUrl]) {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(value).hostname), "This test only runs against local infrastructure.");
}

const { chromium } = await import("playwright-core").catch(() => {
  throw new Error("playwright-core is not installed. Run: npm i --no-save playwright-core");
});

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const jar = new Map();
const client = createServerClient(supabaseUrl, anonKey, {
  cookies: {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { data: signUp, error: signUpError } = await client.auth.signUp({ email: `browser-${suffix}@example.test`, password: "Synthetic-browser-2026!" });
assert.ifError(signUpError);
const userId = signUp.user.id;
const { data: collection, error: collectionError } = await client.from("collections").insert({ default_processing_mode: "standard", name: `Browser ${suffix}`, user_id: userId }).select("id").single();
assert.ifError(collectionError);

let browser;
let passed = 0;
let activePage;
const step = async (name, fn) => {
  const started = Date.now();
  try {
    await fn();
  } catch (error) {
    if (process.env.PLINY_SCREENSHOT_PATH && activePage) await activePage.screenshot({ fullPage: true, path: process.env.PLINY_SCREENSHOT_PATH });
    throw error;
  }
  passed += 1;
  console.log(`  ok  ${name} (${Date.now() - started} ms)`);
};

try {
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  await context.addCookies(Array.from(jar, ([name, value]) => ({ name, url: baseUrl, value })));
  const page = await context.newPage();
  activePage = page;
  const appRequests = [];
  const uploadUrlRequests = [];
  page.on("request", (request) => {
    if (request.url().startsWith(baseUrl)) {
      appRequests.push({ bytes: Buffer.byteLength(request.postData() ?? ""), method: request.method(), url: request.url() });
      if (request.url().endsWith("/api/documents/upload-url")) uploadUrlRequests.push(JSON.parse(request.postData() ?? "{}"));
    }
  });

  await page.goto(`${baseUrl}/collection/${collection.id}`, { timeout: 120_000, waitUntil: "domcontentloaded" });
  // Once a workspace has a ready document it opens on "Ask a question"; switch to Documents.
  const showDocumentsTab = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await page.getByRole("button", { name: "Add documents" }).first().isVisible()) return;
      await page.getByRole("button", { name: /^Documents/ }).first().click(); // may land before hydration
      await page.waitForTimeout(500);
    }
    throw new Error("The Documents tab never opened.");
  };
  const openUploadDialog = async () => {
    // The first click can land before hydration; retry until the dialog (and its file input) exists.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await showDocumentsTab();
      await page.getByRole("button", { name: "Add documents" }).first().click();
      if ((await page.locator("input[type='file']").count()) > 0) return;
      await page.waitForTimeout(1000);
    }
    throw new Error("The Add documents dialog never opened.");
  };
  await openUploadDialog();
  const fileInput = page.locator("input[type='file']");
  const items = page.locator("ul[aria-label='Selected file progress'] > li");
  const cdp = await context.newCDPSession(page);
  const throttle = (uploadThroughput) =>
    cdp.send("Network.emulateNetworkConditions", { downloadThroughput: -1, latency: 20, offline: false, uploadThroughput });

  await step("14.9 MiB PDF: real, monotonic byte progress, then Ready", async () => {
    await throttle(3 * MiB);
    const bytes = buildSizedPdfFixture(Math.round(14.9 * MiB), { seed: "browser-big" });
    await fileInput.setInputFiles({ buffer: bytes, mimeType: "application/pdf", name: "big-report.pdf" });
    const samples = [];
    let shotTaken = false;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const status = await items.first().getAttribute("data-upload-status");
      if (status === "uploading") {
        const value = await page.locator("[role='progressbar']").first().getAttribute("aria-valuenow").catch(() => null);
        if (value !== null) samples.push(Number(value));
        if (process.env.PLINY_SHOT_DIR && Number(value) >= 40 && !shotTaken) {
          shotTaken = true;
          await page.screenshot({ path: `${process.env.PLINY_SHOT_DIR}/uploading.png` });
        }
      }
      if (status === "processing" || status === "ready" || status === "failed") break;
      await page.waitForTimeout(120);
    }
    const distinct = [...new Set(samples)];
    console.log(`      progress samples: ${distinct.join(" -> ")}`);
    assert.ok(distinct.filter((value) => value > 0 && value < 100).length >= 3, `expected several intermediate values, got ${distinct}`);
    assert.deepEqual(samples, [...samples].sort((a, b) => a - b), "progress must never go backwards");
    await throttle(-1);
    await page.waitForSelector("ul[aria-label='Selected file progress'] > li[data-upload-status='ready']", { timeout: 120_000 });
    await page.reload({ timeout: 120_000, waitUntil: "domcontentloaded" });
    await showDocumentsTab();
    // The table and the card list both render the row; only one is visible at a given width.
    await page.getByText("big-report.pdf").filter({ visible: true }).first().waitFor({ timeout: 60_000 });
    await page.getByText("Ready", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 60_000 });
  });

  await step("no request to the app server carried file bytes", async () => {
    const largest = Math.max(...appRequests.map((request) => request.bytes));
    assert.ok(largest < 8 * 1024, `largest app request body: ${largest} bytes`);
    assert.ok(appRequests.some((request) => request.url.endsWith("/api/documents/upload-url")));
    assert.ok(appRequests.some((request) => /\/api\/documents\/[0-9a-f-]{36}\/process$/.test(request.url)));
  });

  await step("a dropped connection ends in Failed (never stuck in Uploading) and Retry resumes the same row", async () => {
    await page.reload({ timeout: 120_000, waitUntil: "domcontentloaded" });
    await openUploadDialog();
    let blocked = 0;
    await page.route("**/storage/v1/object/upload/sign/**", (route) => {
      if (blocked < 1) {
        blocked += 1;
        return route.abort("connectionreset");
      }
      return route.continue();
    });
    await fileInput.setInputFiles({ buffer: buildSizedPdfFixture(Math.round(4.4 * MiB), { seed: "browser-retry" }), mimeType: "application/pdf", name: "retry-me.pdf" });
    const item = items.first();
    await page.waitForSelector("ul[aria-label='Selected file progress'] > li[data-upload-status='failed']", { timeout: 30_000 });
    assert.match(await item.innerText(), /upload did not finish/i);
    if (process.env.PLINY_SHOT_DIR) await page.screenshot({ path: `${process.env.PLINY_SHOT_DIR}/failed-retry.png` });
    await item.getByRole("button", { name: "Retry" }).click();
    await page.waitForSelector("ul[aria-label='Selected file progress'] > li[data-upload-status='ready']", { timeout: 60_000 });
    await page.unroute("**/storage/v1/object/upload/sign/**");
    const retried = uploadUrlRequests.filter((request) => request.filename === "retry-me.pdf");
    assert.equal(retried.length, 2, "one URL request per attempt");
    assert.equal(retried[1].document_id !== undefined, true, "the retry names the earlier row");
    const { data: rows } = await client.from("documents").select("id,status").eq("filename", "retry-me.pdf");
    assert.equal(rows.length, 1, "Retry must reuse the document row, not create a duplicate");
    assert.equal(rows[0].status, "ready");
  });

  await step("15.2 MiB is refused in the browser with a clear message and no request", async () => {
    await page.reload({ timeout: 120_000, waitUntil: "domcontentloaded" });
    await openUploadDialog();
    const before = uploadUrlRequests.length;
    await fileInput.setInputFiles({ buffer: Buffer.alloc(Math.round(15.2 * MiB), 0x25), mimeType: "application/pdf", name: "too-big.pdf" });
    const item = items.first();
    await item.waitFor();
    assert.equal(await item.getAttribute("data-upload-status"), "failed");
    assert.match(await item.innerText(), /File must be 15 MB or less\./);
    assert.equal(await item.getByRole("button", { name: "Retry" }).count(), 0, "a validation refusal has nothing to retry");
    await page.waitForTimeout(500);
    assert.equal(uploadUrlRequests.length, before, "nothing is requested for a refused file");
  });

  console.log(`Browser upload checks passed (${passed}).`);
} finally {
  await browser?.close();
  const { data } = await client.from("documents").select("storage_path");
  const paths = (data ?? []).map((row) => row.storage_path).filter(Boolean);
  if (paths.length > 0) await admin.storage.from("documents").remove(paths);
  await admin.auth.admin.deleteUser(userId);
}
