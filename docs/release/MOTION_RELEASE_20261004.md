# Packet D — interaction feedback and release

Owner authorized Packet D, Git publication and Production deployment on 2026-10-04. This release combines the preserved October 3 repairs and Packets A/B/C/D; no runtime provider, budget, auth, schema or Production data change is intended.

## Motion and tab icon

Removed blanket transitions on every descendant/container; only interactive elements receive general color feedback. Ordinary buttons use a shared 150ms, 1px compositor-only press/release translation. Popup anchors and inline citations remain stationary. Removed duplicated shared Button and auth-specific pressed transforms to avoid compounded movement. Account menus use a restrained 4px/opacity entrance; scrims fade. Reduced-motion users get no press displacement or shell entrance animation. No new dependency, bounce, page-scale effect or simulated progress.

The owner requested removal of the browser-tab P. Metadata and manifest now select a versioned transparent SVG, preventing browser fallback to the old mark. Page branding is retained. Browser favicon caches may require closing/reopening the tab.

## Verification boundaries

`scripts/test-motion-browser.mjs` uses local synthetic fixtures and blocks non-GET/remote/API requests. It verifies actual pressed/released computed styles, unchanged neighboring heading geometry, menu entrance/Escape, reduced motion, login control and served blank SVG. Initial test locator incorrectly selected a stationary dialog anchor; corrected to an ordinary navigation button. Initial login compilation exceeded the default timeout; navigation now waits for DOM content with a 60s compilation allowance.

Combined dashboard, Ask and workspace browser suites must pass before publication, alongside typecheck/lint, all deterministic suites, 36-case provider-free evaluation, UI-review checks, production build, browser-bundle privacy and whitespace checks. Existing CSS/unused-variable warnings are not silently treated as newly fixed.

All browser suites passed: 20 dashboard, 19 Ask and 14 workspace interaction checks, plus motion checks. A 600ms local login interaction frame-cadence sample recorded 26 intervals, median 16.7ms, p95 16.8ms and a 200ms maximum interval. This demonstrates why **stable 60fps is not claimed**: a development-browser sample includes a stall and is not a representative Production performance trace. Physical mobile-keyboard and authenticated hosted acceptance remain unverified. Production post-deploy checks are read-only. Ask the CSV question again after deployment; old saved answers do not regenerate automatically. Existing intact labelled-row chunks can benefit without re-upload; legacy incomplete chunks may require separately authorized reprocessing.

## Release sequence

Review the complete combined diff and exclude secrets, local environment files, caches, fixture screenshots and unrelated files. Commit and push the permitted repair branch, open an auditable PR, then merge through GitHub after gates pass. Vercel must build the main revision using Production environment values; do not promote a staging-built preview. Record the immutable deployment URL and status before declaring it live. Previous Production deployment is the rollback target if a new public-route regression is reproduced.

External Pliny AI/embedding calls: 0; provider spend: $0. Codex input/output/cache counters and billed/API-equivalent cost are unavailable. Hosted document answering remains a separate acceptance check, not implied by public page health.
