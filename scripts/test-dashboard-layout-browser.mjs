import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Local fixtures only. Block remote traffic and all mutation requests.
const base = new URL(process.env.PLINY_UI_TEST_URL || "http://127.0.0.1:3123");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const { chromium } = await import(process.env.PLINY_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const output = resolve("artifacts/codex-dashboard-20261004");
mkdirSync(output, { recursive: true });
const errors = [];
let mutationRequests = 0;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request();
  if (request.method() !== "GET") { mutationRequests++; return route.abort(); }
  if (new URL(request.url()).origin !== base.origin || new URL(request.url()).pathname.startsWith("/api/")) return route.abort();
  await route.continue();
});
let checks = 0;
const pass = (label) => { checks++; console.log(`PASS ${label}`); };
async function open(state) {
  await page.goto(new URL(`/ui-preview-harness?tab=dashboard&state=${state}`, base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Your workspaces", exact: true }).waitFor();
  await page.addStyleTag({ content: "[data-harness] { display:none !important; }" });
  if (state !== "loading") await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Open workspace navigation"]');
    return button && Object.keys(button).some((key) => key.startsWith("__reactProps$"));
  });
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}
async function geometry() {
  return {
    title: await page.getByRole("heading", { name: "Your workspaces", exact: true }).boundingBox(),
    list: await page.locator('[class*="workspaceList"]').boundingBox(),
    topbar: await page.locator('header[class*="topbar"]').boundingBox(),
  };
}
try {
  for (const width of [320, 375, 390, 768, 899, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await open("long");
    await noOverflow();
    const names = page.locator('main[class*="canvas"] a[href^="/collection/"]:visible');
    assert.equal(await names.count(), 2);
    for (const name of await names.all()) {
      assert.equal(await name.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const parent = el.closest("td,li").getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth + 1 && rect.left >= parent.left && rect.right <= parent.right + 1 && getComputedStyle(el).whiteSpace !== "nowrap";
      }), true, "Full workspace names must wrap within their card/cell.");
    }
    for (const button of await page.locator('main[class*="canvas"] button[aria-label^="Delete"]:visible').all()) {
      const box = await button.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.width >= 44 && box.height >= 44);
    }
    assert.equal(await page.getByText("Ready", { exact: true }).count(), 0);
    const loaded = await geometry();
    if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(output, `dashboard-${width}.png`), fullPage: true });
    pass(`${width}px long names, delete controls and list fit; no unverified Ready badges`);
    await open("loading");
    await page.getByRole("status").filter({ hasText: "Loading your workspaces" }).waitFor();
    await noOverflow();
    const loading = await geometry();
    for (const key of ["title", "list", "topbar"]) {
      for (const axis of ["x", "y", "width"]) assert.ok(Math.abs(loaded[key][axis] - loading[key][axis]) <= 2, `${width}px ${key}.${axis}: loaded ${loaded[key][axis]}, loading ${loading[key][axis]}`);
    }
    if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(output, `loading-${width}.png`), fullPage: true });
    pass(`${width}px loading shell/header/list alignment matches finished dashboard`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open("long");
  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: "Close workspace navigation" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "Open workspace navigation" }).evaluate((el) => el === document.activeElement), true);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menu", { name: "Account" }).waitFor();
  await page.keyboard.press("Escape");
  pass("mobile drawer and account menu close with Escape and drawer restores focus");
  await page.locator('main[class*="canvas"]').getByRole("button", { name: "New workspace", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.locator('main button[aria-label^="Delete"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  pass("create and long-name delete confirmations open/cancel without mutations or clipped content");
  await open("empty");
  await page.getByRole("heading", { name: "No workspaces yet" }).waitFor();
  await noOverflow();
  await open("error");
  await page.getByLabel("Workspace list error").waitFor();
  await page.getByRole("button", { name: "Try again" }).waitFor();
  await noOverflow();
  pass("empty and failure states fit on mobile and expose their next action");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("loading");
  assert.equal(await page.locator('[class*="skeletonName"]').first().evaluate((el) => getComputedStyle(el).animationName), "none");
  assert.deepEqual(errors, []);
  assert.equal(mutationRequests, 0);
  pass("reduced motion stops loading pulse; no page errors or mutation requests");
  console.log(`${checks} dashboard checks passed. Synthetic fixtures; provider calls: 0.`);
} finally { await browser.close(); }
