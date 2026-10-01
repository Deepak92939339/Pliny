import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const targetMode = process.argv[2] || "before"; // "before" or "after"
const baseDir = resolve(import.meta.dirname, `../artifacts/ui-unification/screenshots/${targetMode}`);
mkdirSync(baseDir, { recursive: true });

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
];

const pages = [
  { slug: "landing", path: "/" },
  { slug: "login", path: "/login" },
  { slug: "signup", path: "/signup" },
  { slug: "about", path: "/about" },
  { slug: "privacy", path: "/privacy" },
  { slug: "security", path: "/security" },
  { slug: "file-support", path: "/file-support" },
  { slug: "does-not-exist", path: "/does-not-exist" },
  { slug: "preview-workspace", path: "/__ui-preview?tab=workspace" },
  { slug: "preview-dashboard", path: "/__ui-preview?tab=dashboard" },
  { slug: "preview-refusal", path: "/__ui-preview?tab=refusal" },
  { slug: "preview-inspector", path: "/__ui-preview?tab=inspector" },
  { slug: "preview-chart", path: "/__ui-preview?tab=chart" },
];

const baseUrl = process.env.BASE_URL || "http://localhost:3119";

console.log(`Starting capture for ${pages.length} pages x ${viewports.length} viewports into ${baseDir}...`);

for (const page of pages) {
  const url = `${baseUrl}${page.path}`;
  // Warm up page first
  try {
    await fetch(url);
  } catch (err) {
    console.warn(`Warmup fetch failed for ${url}: ${err.message}`);
  }

  for (const vp of viewports) {
    const filename = `${page.slug}-${vp.name}.png`;
    const outPath = resolve(baseDir, filename);

    console.log(`Capturing ${filename}...`);
    try {
      execFileSync(
        chromePath,
        [
          "--headless=new",
          `--screenshot=${outPath}`,
          `--window-size=${vp.width},${vp.height}`,
          "--force-device-scale-factor=2",
          "--virtual-time-budget=2000",
          "--run-all-compositor-stages-before-draw",
          "--hide-scrollbars",
          url,
        ],
        { stdio: "pipe" },
      );
    } catch (err) {
      console.error(`Failed to capture ${filename}:`, err.message);
    }
  }
}

console.log(`Capture complete! All screenshots saved in ${baseDir}.`);
