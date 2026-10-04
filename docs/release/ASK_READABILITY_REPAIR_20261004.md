# Ask readability repair — 2026-10-04

## Scope and publication boundary

Packet A only: readable question/answer turns, navigation, compact composer and selected-answer exports. Existing October 3 deletion, header and sanitized embedding-error changes were preserved. Branch: `fix/pliny-audit-r1-preview-20260930`; starting HEAD: `68c12504ff54ace032f3a6e592a91af9474921e8`. This batch is local and uncommitted. No push, merge, deployment or production configuration change was performed.

## Changes

- `src/components/workspace/WorkspaceView.tsx`: pending/completed turn identity, duplicate-submit guard, eight recent questions navigating to their actual turns; failed questions retained for explicit retry.
- `src/components/workspace/AskSurface.tsx` and `.module.css`: chronological conversation, visible “You asked” headings, bounded composer, compact workspace header, scroll synchronization on submission/navigation without jumping on answer completion. Removed simulated preparation-stage claims. Reports remain available but the risk artifact is no longer injected into every answer.
- `src/components/workspace/WorkspaceView.module.css`: recent-question button styling; existing mobile header repair retained.
- Selected-answer Markdown and report copy/download use the complete report formatter, including question and source ledger. Refusals can be exported without enabling unsupported reports. “Print / Save as PDF” opens the existing selected-answer print flow, not a direct PDF generator.
- `src/lib/export/browserReportExport.ts`: self-contained print colors, mobile sizing and long-answer pagination.
- Development-only preview fixtures support empty/no-document states; the production guard remains unchanged.

## Evidence

- `npm run test:ask-browser`: 19 focused checks passed. Covers visible submitted question, stable turn identity, citation inspection, long-answer scroll retention, recent-question focus, selected Markdown/print scope, optional report, chart, explicit retry, 375/390/768/1440px overflow and composer bounds, refusal/empty/no-document states, reduced motion and absence of page errors.
- `npm run test:workspace-browser`: all 14 preserved interaction checks passed. Mocked deletion only; not proof of live storage/database persistence.
- Browser screenshots: ignored `artifacts/codex-readability-20261004/ask-{375,390,768,1440}.png`.
- All API responses in these browser checks are synthetic and intercepted. Nonlocal browser requests are blocked. The development toolbar is hidden to give the app its actual viewport; app content/styles are not overridden.
- Typecheck and lint passed; lint retains two existing unused-variable warnings.
- Report, history, UI preview guard and UI review regressions passed. Production build passed with the existing malformed generated CSS utility warning. Client-bundle forbidden-identifier/synthetic-marker scan and diff whitespace checks passed. Local servers and browsers opened for verification were closed.

## Limits and next work

This is not hosted/provider acceptance, measured 60fps performance, actual device-keyboard verification or full accessibility certification. Dashboard card clipping/loading geometry (Packet B), CSV evidence loss (Packet C), and measured motion refinement (Packet D) remain separate. No retrieval, privacy/refusal rules, runtime provider, budget or database change was made by Packet A. Review the local screen before authorizing publication or the next packet.

## Usage disclosure

Codex input/output/cache token counters and billed API-equivalent cost are not exposed to this session: unavailable, not estimated. External Pliny AI/embedding provider requests: **0**; external provider cost for these checks: **$0**. This does not mean Codex itself was free.
