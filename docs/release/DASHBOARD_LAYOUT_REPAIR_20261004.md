# Packet B — dashboard layout, 2026-10-04

## Local scope

Branch `fix/pliny-audit-r1-preview-20260930`, committed HEAD `68c12504ff54ace032f3a6e592a91af9474921e8`. Packet A and October 3 local changes were preserved. No commit, push, deployment, configuration change or production write was made.

## Findings and repair

- Previously `.wName` used `white-space: nowrap` and mobile grid cards had automatic minimum widths. Long workspace names could expand the card behind its clipped container. Names now wrap, including unbroken identifiers, with explicit shrinkable grid/flex children.
- Desktop tables previously used automatic layout; long names could force the table wider. Fixed column layout and bounded cells keep full names and delete controls inside the list. Sidebar labels remain intentionally ellipsized with full-name titles.
- `ReadyBadge` previously showed Ready for every collection, including empty ones. `CollectionListItem` contains only total document count, not ingestion readiness. Removed that unsupported status column/badge instead of inventing a readiness calculation.
- The loading route previously used a centered, separate layout without the dashboard sidebar. New `DashboardLoadingView` shares the dashboard CSS shell, headings, list origin and responsive breakpoints. Loading-only placeholders are noninteractive and announced by a status message; their pulse stops under reduced motion.
- A shared `button:not(...)` rule overrode the dashboard's intended minimum height above mobile width. Scoped dashboard selectors now preserve 44px create controls and loading geometry without changing global button styles.

## Verification

`npm run test:dashboard-browser`: **20 checks passed**. Real local components, synthetic fixtures; remote traffic and mutation requests blocked.

- Long unbroken/spaced names fit at 320, 375, 390, 768, 899, 900, 1024 and 1440px. Full names wrap inside cells/cards; delete controls remain within the viewport and at least 44px; no horizontal page overflow or unverified Ready badges.
- Loading title, topbar and list x/y/width match the finished layout within 2px at all eight widths. This tests layout anchors, not zero CLS for every variable-sized workspace list.
- Drawer/account Escape dismissal, drawer focus restoration, create/delete confirmation open/cancel, empty/error states and reduced-motion loading verified. Zero browser page errors and zero mutation requests. Actual creation/deletion persistence and hosted authorization were not tested.
- Initial agent-browser check confirmed meaningful content and no framework error overlay. Mobile and desktop result screenshots were visually inspected.
- Typecheck, lint (zero errors, two pre-existing unused-variable warnings), UI preview production guard, UI review and whitespace checks passed.
- Production build passed. Existing malformed generated CSS utility warning remains. Local development server and verification browsers were closed after the checks.

Screenshots remain ignored under `artifacts/codex-dashboard-20261004/`: `dashboard-390.png`, `dashboard-1440.png`, `loading-390.png`, `loading-1440.png`. The development toolbar was hidden to give the actual app its viewport; app content/styles were not overridden.

## Remaining work / usage

Packet C CSV evidence loss and Packet D measured motion remain separate. No provider, retrieval, privacy, refusal, budget, database or authentication behavior was changed by Packet B. Preview publication requires explicit authorization.

External Pliny provider requests: **0**, external provider cost **$0**. Codex input/output/cache counts and API-equivalent billed cost are unavailable to this session; no estimated or fabricated totals. This does not mean Codex itself cost $0.
