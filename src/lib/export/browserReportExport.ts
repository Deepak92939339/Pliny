"use client";

import { formatGeneratedReportMarkdown, formatSourcesForMarkdown } from "@/lib/export/reportExport";
import type { GeneratedReport } from "@/types";

export function downloadMarkdownFile(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function openPrintReport(report: GeneratedReport) {
  const printWindow = window.open("", "_blank", "width=920,height=1100");

  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintDocument(report));
  printWindow.document.close();
  printWindow.document.getElementById("print-button")?.addEventListener("click", () => {
    printWindow.print();
  });
  printWindow.focus();

  return true;
}

function buildPrintDocument(report: GeneratedReport) {
  const sourcesMarkdown = formatSourcesForMarkdown(report.sources);
  const markdown = formatGeneratedReportMarkdown(report);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title)} - Vector</title>
  <style>
    :root {
      color: #171717;
      background: #ffffff;
      font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: #ffffff;
      color: #171717;
    }
    main {
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 40px 64px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 36px;
      border-bottom: 1px solid #d8d8d8;
      padding-bottom: 18px;
    }
    .brand {
      color: #17202a;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .print-button {
      border: 1px solid #ba5c3d;
      border-radius: 6px;
      background: #ba5c3d;
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
    }
    h1 {
      margin: 0 0 12px;
      color: #17202a;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      line-height: 1.12;
      letter-spacing: -0.025em;
    }
    .meta {
      margin: 0 0 28px;
      color: #60646c;
      font-size: 13px;
      line-height: 1.6;
    }
    section {
      margin-top: 28px;
      page-break-inside: avoid;
    }
    h2 {
      margin: 0 0 10px;
      color: #17202a;
      font-size: 15px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.75;
    }
    .source-list {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .source {
      border: 1px solid #d8d8d8;
      border-radius: 8px;
      padding: 12px 14px;
      page-break-inside: avoid;
    }
    .note {
      border-top: 1px solid #d8d8d8;
      padding-top: 14px;
      color: #4b5563;
      font-size: 13px;
      line-height: 1.7;
    }
    @media print {
      main {
        max-width: none;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div class="brand">Vector</div>
      <button class="print-button no-print" id="print-button" type="button">Print / Save PDF</button>
    </div>
    <h1>${escapeHtml(report.title)}</h1>
    <p class="meta">
      Workspace: ${escapeHtml(report.workspaceName || "Workspace")}<br />
      Generated: ${escapeHtml(report.generatedAt)}
    </p>
    ${
      report.question
        ? `<section>
      <h2>${report.template === "due_diligence_summary" || report.template === "risk_report" ? "Review Question" : "Question"}</h2>
      <pre>${escapeHtml(report.question)}</pre>
    </section>`
        : ""
    }
    <section>
      <h2>Report</h2>
      <pre>${escapeHtml(report.content || "No report content returned.")}</pre>
    </section>
    <section>
      <h2>Sources</h2>
      <ul class="source-list">
        ${sourcesMarkdown
          .split("\n")
          .map((line) => `<li class="source">${escapeHtml(line)}</li>`)
          .join("")}
      </ul>
    </section>
    <section class="note">
      <strong>Verification note:</strong> ${escapeHtml(report.verificationNote)}
    </section>
    <section class="note no-print">
      <strong>Markdown copy:</strong>
      <pre>${escapeHtml(markdown)}</pre>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
