import assert from "node:assert/strict";
const base = new URL(process.env.PLINY_UI_TEST_URL || "http://127.0.0.1:3123");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
const { chromium } = await import(process.env.PLINY_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/*", route => {
  const request = route.request();
  if (request.method() !== "GET" || new URL(request.url()).origin !== base.origin || new URL(request.url()).pathname.startsWith("/api/")) return route.abort();
  return route.continue();
});
try {
  await page.goto(new URL("/ui-preview-harness?tab=dashboard&state=long", base).href);
  const button = page.getByRole("button", { name: "Open workspace navigation", exact: true });
  await button.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const rect = await button.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  assert.equal(await button.evaluate(el => getComputedStyle(el).translate), "0px 1px");
  // Layout boxes of neighboring text are unaffected by compositor translation.
  const heading = await page.getByRole("heading", { name: "Your workspaces", exact: true }).boundingBox();
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal(await button.evaluate(el => getComputedStyle(el).translate), "none");
  assert.deepEqual(await page.getByRole("heading", { name: "Your workspaces", exact: true }).boundingBox(), heading);
  const account = page.getByRole("button", { name: "Account menu", exact: true });
  await account.click();
  const menu = page.getByRole("menu", { name: "Account" });
  await menu.waitFor();
  assert.match(await menu.evaluate(el => getComputedStyle(el).animationName), /panelEnter/);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await account.click();
  await menu.waitFor();
  assert.equal(await menu.evaluate(el => getComputedStyle(el).animationName), "none");
  await page.keyboard.press("Escape");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  assert.equal(await button.evaluate(el => getComputedStyle(el).translate), "none");
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.goto(new URL("/login", base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const submit = page.getByRole("button", { name: /sign in/i }).last();
  await submit.waitFor();
  assert.ok(parseFloat(await submit.evaluate(el => getComputedStyle(el).transitionDuration)) <= .001);
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  assert.match(icon, /pliny-tab\.svg/);
  const response = await page.request.get(new URL(icon, base).href);
  assert.equal(response.status(), 200);
  assert.doesNotMatch(await response.text(), /<(?:path|text|image)\b/);
  assert.deepEqual(errors, []);
  // A bounded local frame-cadence sample, not a device-wide 60fps promise.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const frames = await page.evaluate(() => new Promise(resolve => {
    const gaps = [];
    let first;
    let previous;
    document.querySelector('button[aria-label="Show password"]')?.click();
    function sample(now) {
      first ??= now;
      if (previous !== undefined) gaps.push(now - previous);
      previous = now;
      if (now - first < 600) requestAnimationFrame(sample);
      else {
        gaps.sort((a, b) => a - b);
        resolve({ sampleCount: gaps.length, medianMs: gaps[Math.floor(gaps.length / 2)], p95Ms: gaps[Math.floor(gaps.length * .95)], maxMs: gaps.at(-1) });
      }
    }
    requestAnimationFrame(sample);
  }));
  console.log("Local login interaction frame-cadence sample:", JSON.stringify(frames));
  console.log("PASS press/release feedback, stable neighbor layout, menu entrance/Escape, reduced motion, login control and blank favicon");
} finally { await browser.close(); }
