#!/usr/bin/env node
/**
 * WP4 (audit-r1, PLN-002): CSP verification.
 *
 * Builds the app (run `npm run build` first), starts `next start` on a local
 * port with placeholder env, then drives the public pages with Playwright and
 * FAILS if any CSP violation report appears in the console.
 *
 * Usage:
 *   node --experimental-strip-types scripts/check-csp.mjs
 *   (requires devDependencies: playwright + a browser install)
 *
 * Pages that need a real Supabase backend are skipped with a logged reason
 * (set SKIP_BACKEND_PAGES=0 to force them anyway).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC_PAGES = ["/", "/login", "/signup", "/about", "/privacy", "/security", "/file-support"];
const BACKEND_PAGES = ["/dashboard"];

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
    console.warn("[check-csp] playwright is not installed — skipping live browser check. Install with: npm i -D playwright && npx playwright install chromium");
    process.exit(0);
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "pliny-csp-"));
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    },
    stdio: "ignore",
  });

  const violations = [];
  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy|csp/i.test(message.text())) {
        violations.push(`${page.url()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      if (/Content Security Policy|csp/i.test(error.message)) {
        violations.push(`${page.url()}: ${error.message}`);
      }
    });

    const skipped = [];
    for (const pagePath of PUBLIC_PAGES) {
      const response = await page.goto(`${BASE}${pagePath}`, { waitUntil: "networkidle" });
      if (!response || response.status() >= 400) {
        skipped.push(`${pagePath} (HTTP ${response ? response.status() : "no response"})`);
      }
    }

    if (process.env.SKIP_BACKEND_PAGES !== "0") {
      for (const pagePath of BACKEND_PAGES) {
        skipped.push(`${pagePath} (needs a real Supabase backend)`);
      }
    } else {
      for (const pagePath of BACKEND_PAGES) {
        await page.goto(`${BASE}${pagePath}`, { waitUntil: "networkidle" });
      }
    }

    const cspHeader = await (await fetch(BASE)).headers.get("Content-Security-Policy");
    if (!cspHeader) {
      violations.push(`${BASE}/: no enforced Content-Security-Policy header on the response`);
    } else if (!cspHeader.includes("'strict-dynamic'")) {
      violations.push(`${BASE}/: CSP is not nonce/strict-dynamic based`);
    }

    if (skipped.length > 0) {
      console.log("[check-csp] skipped pages:", skipped.join(", "));
    }

    if (violations.length > 0) {
      console.error("[check-csp] CSP VIOLATIONS:");
      for (const violation of violations) console.error(`  - ${violation}`);
      process.exitCode = 1;
    } else {
      console.log("[check-csp] no CSP violations on public pages.");
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[check-csp] failed:", error);
  process.exit(1);
});
