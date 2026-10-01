import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(import.meta.dirname, "../src/app/__ui-preview/page.tsx");
assert.equal(existsSync(pagePath), true, "UI preview harness page must exist at src/app/__ui-preview/page.tsx");

const pageSource = readFileSync(pagePath, "utf8");

// 1. Static assertion: must guard against production usage
assert.equal(
  /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*["']production["']\s*\)\s*\{\s*notFound\(\);?\s*\}/.test(pageSource),
  true,
  "UiPreviewContent must strictly call notFound() when process.env.NODE_ENV === 'production'",
);

// 2. Static assertion: must import notFound from next/navigation
assert.equal(
  /import\s*\{[^}]*notFound[^}]*\}\s*from\s*["']next\/navigation["']/.test(pageSource),
  true,
  "UiPreviewContent must import notFound from next/navigation",
);

// 3. Sitemap / robot assertion: if sitemap or robots file exists, __ui-preview must not be included
const sitemapCandidates = [
  resolve(import.meta.dirname, "../src/app/sitemap.ts"),
  resolve(import.meta.dirname, "../src/app/sitemap.xml"),
  resolve(import.meta.dirname, "../public/sitemap.xml"),
];

for (const candidate of sitemapCandidates) {
  if (existsSync(candidate)) {
    const sitemapContent = readFileSync(candidate, "utf8");
    assert.equal(
      sitemapContent.includes("__ui-preview"),
      false,
      `Sitemap at ${candidate} must never include __ui-preview route`,
    );
  }
}

console.log("UI preview production guard and exclusion tests passed.");
