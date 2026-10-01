#!/usr/bin/env node
/**
 * WP8 (audit-r1, PLN-008): accessibility verification.
 *
 * Builds are expected beforehand (`npm run build`), then this script starts
 * `next start` with placeholder env and runs axe-core on the public pages at
 * 390px and 1440px. FAILS if any serious or critical violation is found
 * (contrast violations are what PLN-008 tracks).
 *
 * Usage: node scripts/check-a11y.mjs
 * Requires devDependencies: playwright (with chromium installed) + axe-core.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PORT = 3112;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ["/", "/login", "/signup", "/about", "/privacy", "/security", "/file-support"];
const VIEWPORTS = [
  { label: "390", width: 390, height: 844 },
  { label: "1440", width: 1440, height: 900 },
];

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn("[check-a11y] playwright is not installed — install with: npm i -D playwright axe-core && npx playwright install chromium");
    process.exit(2);
  }

  let axeSource;
  try {
    axeSource = await readFile(path.join(require.resolve("axe-core").replace(/axe\.js$/, "axe.min.js")), "utf8");
  } catch {
    axeSource = await readFile(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf8");
  }

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    },
    stdio: "ignore",
  });

  let browser;
  const failures = [];
  try {
    await waitForServer(BASE);
    browser = await chromium.launch();

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      for (const pagePath of PAGES) {
        const response = await page.goto(`${BASE}${pagePath}`, { waitUntil: "networkidle" });
        if (!response || response.status() >= 400) {
          throw new Error(`Missing required page ${pagePath} @${viewport.label} (HTTP ${response ? response.status() : "none"})`);
        }
        await page.addScriptTag({ content: axeSource });
        const results = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }));
        const serious = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
        if (serious.length > 0) {
          for (const violation of serious) {
            failures.push(`${pagePath} @${viewport.label}: ${violation.id} (${violation.impact}) — ${violation.help} — ${violation.nodes.length} node(s)`);
          }
        }
      }

      await context.close();
    }

    if (failures.length > 0) {
      console.error("[check-a11y] serious/critical violations:");
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
    } else {
      console.log("[check-a11y] zero serious/critical violations on public pages at 390px and 1440px.");
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("[check-a11y] failed:", error);
  process.exit(1);
});
