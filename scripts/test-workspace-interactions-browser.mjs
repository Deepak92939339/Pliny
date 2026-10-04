import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Local synthetic harness only. No hosted auth, database writes or providers.
const base = new URL(process.env.PLINY_UI_TEST_URL || "http://127.0.0.1:3123");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "This suite must only target localhost.");
const { chromium } = await import(process.env.PLINY_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = resolve("artifacts/codex-repair-20261003");
mkdirSync(output, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let responseStatus = 204;
const deletes = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  if (request.method() === "DELETE") {
    deletes.push(new URL(request.url()).pathname);
    await route.fulfill(responseStatus === 204
      ? { status: 204 }
      : { status: responseStatus, contentType: "application/json", body: JSON.stringify({ error: "Synthetic deletion failure. Try again." }) });
  } else {
    await route.abort();
  }
});
// Prevent accidental browser-side traffic to services while exercising fixtures.
await page.route("**/*", async (route) => {
  if (new URL(route.request().url()).origin !== base.origin) return route.abort();
  await route.fallback();
});
let checks = 0;
function passed(name) { checks += 1; console.log(`PASS ${name}`); }
async function visible(locator) { await locator.waitFor({ state: "visible" }); }
async function closed(locator) { await locator.waitFor({ state: "hidden" }); }
const dialog = page.getByRole("dialog", { name: "Delete document", exact: true });
async function openDelete(filename) {
  const trigger = page.getByRole("button", { name: `Actions for ${filename}`, exact: true });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Delete document", exact: true }).click();
  await visible(dialog);
  return trigger;
}
try {
  await page.goto(new URL("/ui-preview-harness?tab=workspace", base).href);
  await page.getByRole("button", { name: "Documents 3", exact: true }).click();
  await visible(page.getByRole("heading", { name: "Documents", exact: true }));
  passed("synthetic Documents surface renders");

  const failed = "incident-ledger-2026.csv";
  let trigger = await openDelete(failed);
  const countBeforeCancel = deletes.length;
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await closed(dialog);
  assert.equal(deletes.length, countBeforeCancel);
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  passed("Cancel sends no DELETE and restores focus");

  trigger = await openDelete(failed);
  await page.keyboard.press("Escape");
  await closed(dialog);
  assert.equal(deletes.length, countBeforeCancel);
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  passed("Escape sends no DELETE and restores focus");

  responseStatus = 403;
  await openDelete(failed);
  await dialog.getByRole("button", { name: "Delete document", exact: true }).click();
  await visible(dialog.getByRole("alert"));
  assert.match(await dialog.getByRole("alert").innerText(), /Synthetic deletion failure/);
  assert.equal(deletes.length, 1);
  passed("pointer confirm emits one DELETE and keeps server errors visible");
  responseStatus = 204;
  await dialog.getByRole("button", { name: "Delete document", exact: true }).focus();
  await page.keyboard.press("Enter");
  await closed(dialog);
  assert.equal(deletes.length, 2);
  assert.equal(deletes[1], "/api/documents/doc-3");
  passed("keyboard retry emits one DELETE and closes on 204");

  for (const filename of ["financial-performance-q3.pdf", "scanned-contract-appendix.pdf"]) {
    const before = deletes.length;
    await openDelete(filename);
    await dialog.getByRole("button", { name: "Delete document", exact: true }).click();
    await closed(dialog);
    assert.equal(deletes.length, before + 1);
    passed(`pointer confirm works for ${filename}`);
  }

  const account = page.getByRole("button", { name: "Open account menu", exact: true });
  for (const selected of [false, true]) {
    if (selected) await page.getByRole("row").filter({ hasText: failed }).click();
    await account.click();
    await page.getByRole("menuitem", { name: "All workspaces", exact: true }).click({ trial: true });
    assert.equal(await page.getByRole("menuitem", { name: "Export transcript", exact: true }).isVisible(), false);
    await page.keyboard.press("Escape");
    passed(`desktop account menu clickable with details ${selected ? "selected" : "empty"}`);
  }
  await page.screenshot({ path: resolve(output, "documents-desktop.png") });
  await page.getByRole("button", { name: "Close document details", exact: true }).click();

  for (const width of [375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const brand = page.locator("main > header").getByRole("link", { name: "Pliny", exact: true });
    const brandBox = await brand.boundingBox();
    const accountBox = await account.boundingBox();
    assert.ok(brandBox && accountBox && brandBox.x + brandBox.width <= accountBox.x);
    assert.equal(await page.locator("main > header").evaluate((header) => {
      const brand = header.querySelector("a").getBoundingClientRect();
      return Array.from(header.querySelectorAll("button")).filter((el) => el.getBoundingClientRect().width > 0)
        .every((el) => { const box = el.getBoundingClientRect(); return box.right <= brand.left || box.left >= brand.right; });
    }), true, "No visible header button may overlap the brand.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await account.click();
    const exportItem = page.getByRole("menuitem", { name: "Export transcript", exact: true });
    assert.equal(await exportItem.isVisible(), width <= 640);
    await page.getByRole("menuitem", { name: "All workspaces", exact: true }).click({ trial: true });
    await page.keyboard.press("Escape");
    await page.screenshot({ path: resolve(output, `documents-${width}.png`) });
    passed(`${width}px header has no overflow; account/export actions remain reachable`);
    if (width === 390) {
      await openDelete(failed);
      const before = deletes.length;
      await dialog.getByRole("button", { name: "Delete document", exact: true }).click();
      await closed(dialog);
      assert.equal(deletes.length, before + 1);
      passed("mobile card delete confirm emits exactly one DELETE");
    }
  }
  assert.deepEqual(errors, []);
  passed("no browser page errors");
  console.log(`${checks} browser checks passed; DELETE responses mocked, no live deletion/persistence claim.`);
} finally {
  await browser.close();
}
