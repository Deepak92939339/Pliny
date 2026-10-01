import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getEvaluationValue, summarizeAudits } from "./ui-audit-contract.mjs";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:3119";
const outPath = resolve(import.meta.dirname, "../artifacts/ui-unification/audit-results.json");
mkdirSync(resolve(import.meta.dirname, "../artifacts/ui-unification"), { recursive: true });

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

class CDPPageClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => res();
      this.ws.onerror = (err) => rej(err);
      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve: cbRes, reject: cbRej } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) cbRej(new Error(msg.error.message));
            else cbRes(msg.result);
          }
        } catch {
          // ignore parsing error
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function runAudit() {
  const chromeProc = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=9336",
    "--disable-gpu",
    "--no-sandbox",
  ]);
  let cdp;
  try {
  let list = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const listRes = await fetch("http://127.0.0.1:9336/json/list");
      list = await listRes.json();
      if (list && list.length > 0) break;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const pageTarget = list?.find((t) => t.type === "page");
  if (!pageTarget) {
    throw new Error("No page target found in Chrome DevTools");
  }

  cdp = new CDPPageClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  console.log("Connected directly to Chrome Page Target via CDP");

  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");

  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPages: pages.length,
      radiiPass: true,
      typeScalePass: true,
      blueEliminationPass: true,
      touchTargetsPass: true,
      desktopControlsPass: true,
      conversationColumnPass: true,
      flaggedRadii: [],
      flaggedFontSizes: [],
      flaggedBlue: [],
      flaggedTouchTargets: [],
      flaggedDesktopControls: [],
      flaggedConversationColumn: [],
    },
    pages: {},
  };

  for (const page of pages) {
    const pageKey = page.slug;
    console.log(`Auditing ${pageKey} (${page.path})...`);
    results.pages[pageKey] = {
      mobile: null,
      desktop: null,
    };

    // Audit Mobile (390x844)
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}${page.path}` });
    await new Promise((r) => setTimeout(r, 1000));

    const mobileAudit = await cdp.send("Runtime.evaluate", {
      expression: `(${auditDOMInBrowser.toString()})("mobile")`,
      returnByValue: true,
    });

    results.pages[pageKey].mobile = getEvaluationValue(mobileAudit, `${pageKey}/mobile`);

    // Audit Desktop (1440x900)
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}${page.path}` });
    await new Promise((r) => setTimeout(r, 1000));

    const desktopAudit = await cdp.send("Runtime.evaluate", {
      expression: `(${auditDOMInBrowser.toString()})("desktop")`,
      returnByValue: true,
    });

    results.pages[pageKey].desktop = getEvaluationValue(desktopAudit, `${pageKey}/desktop`);

  }


  results.summary = summarizeAudits(results.pages, pages.map((page) => page.slug));
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Audit complete! Saved results to ${outPath}`);
  if (!results.summary.pass) process.exitCode = 1;
  } finally {
    cdp?.close();
    chromeProc.kill("SIGTERM");
  }
}

// Function injected into browser runtime via evaluate
export function auditDOMInBrowser(mode) {
  const out = {
    radii: [],
    fontSizes: [],
    blueUsages: [],
    flaggedTouchTargets: [],
    flaggedDesktopControls: [],
    conversationColumnWidth: null,
    viewportWidth: window.innerWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  };

  const allElements = document.querySelectorAll("*");

  // Check blue in document stylesheets
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        const text = rule.cssText || "";
        if (text.includes("#0066CC") || text.includes("--blue") || text.includes("rgb(0, 102, 204)")) {
          out.blueUsages.push({ selector: rule.selectorText || "rule", text });
        }
      }
    } catch {
      // Cross-origin sheets can be ignored
    }
  }

  allElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || style.display === "none" || style.visibility === "hidden") {
      return;
    }

    // Blue check in computed colors
    const colors = [style.color, style.backgroundColor, style.borderColor, style.outlineColor];
    for (const c of colors) {
      if (c && (c.includes("0, 102, 204") || c === "#0066CC")) {
        out.blueUsages.push({ selector: el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""), color: c });
      }
    }

    // Radii check
    const rT = parseFloat(style.borderTopLeftRadius) || 0;
    if (rT > 0) {
      out.radii.push({ selector: el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""), val: rT });
    }

    // Font size check
    if (el.childNodes.length > 0 && Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0)) {
      const fs = parseFloat(style.fontSize) || 0;
      if (fs > 0) {
        out.fontSizes.push({ selector: el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""), val: fs, text: el.textContent.trim().slice(0, 30) });
      }
    }

    // Touch targets check on mobile
    if (mode === "mobile") {
      const isControl = el.matches("button, a, input, select, textarea, [role='button']");
      if (isControl && !el.closest("nav")?.classList.contains("hidden")) {
        const isInlineTextLink = el.tagName === "A" && el.parentElement && window.getComputedStyle(el.parentElement).display === "block" && el.parentElement.textContent.length > el.textContent.length + 20;
        const isInlineCitation = el.hasAttribute("data-inline-citation");
        const isTableCellChild = Boolean(el.closest("td, th"));
        const isHarness = Boolean(el.closest("[class*='harness'], [data-harness]"));
        const h = rect.height;
        if (!isInlineTextLink && !isInlineCitation && !isTableCellChild && !isHarness && (h < 44 || rect.width < 44)) {
          out.flaggedTouchTargets.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
            height: Math.round(h),
            width: Math.round(rect.width),
          });
        }
      }
    }

    // Desktop controls check
    if (mode === "desktop") {
      const isButton = el.matches("button, input[type='submit'], input[type='button'], .button, [role='button']");
      if (isButton && !el.hasAttribute("data-inline-citation") && !el.closest("[data-harness]")) {
        const h = rect.height;
        if (h > 0 && h < 32) {
          out.flaggedDesktopControls.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
            height: Math.round(h),
          });
        }
      }

      // Check conversation column
      const isInner = el.className && typeof el.className === "string" && el.className.includes("AskSurface_inner");
      if (isInner) {
        out.conversationColumnWidth = Math.round(rect.width);
      }
    }
  });

  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAudit().catch((err) => {
    console.error("Audit failed:", err);
    process.exitCode = 1;
  });
}
