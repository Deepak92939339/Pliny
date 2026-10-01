# Independent corrective verification — 2026-10-01

Scope: repair the reviewed Gemini candidate on the existing feature branch and publish Preview only. Parent candidate: `57e76dfb4979ffc3ba0754997a8b956b9d9f6775`. No runtime provider changes, new dependencies, database changes, main push, merge or Production promotion.

## Reproduced defects and repairs

- **Pricing:** a null entry in `AI_MODEL_PRICING_JSON` crashed `getModelRates`. `src/lib/ai/budgetGuard.ts` now rejects null, arrays and primitive entries before destructuring and uses the existing conservative fallback. The null regression failed before the repair; malformed-entry cases pass afterward.
- **Deletion:** `src/app/api/documents/[id]/route.ts` proceeded when the limiter blocked for missing Redis configuration or Redis error. Actual transpiled route tests reproduced 204 instead of 503. All blocked decisions now stop deletion; rate limits return 429 with Retry-After and infrastructure failures return 503. Ten document-management checks pass. No live deletion was performed.
- **CSP:** local browser testing showed an HTML-root nonce hydration warning. Next's installed renderer extracts script nonces from the forwarded request CSP, which middleware previously omitted. `src/middleware.ts` now forwards that policy; `src/app/layout.tsx` no longer stamps the HTML root. Actual middleware regression failed before and passes after. Production HTTP inspection found all 27 landing script tags carrying the response policy nonce, with no unsafe-eval. Reference: https://nextjs.org/docs/app/guides/content-security-policy.
- **Typography:** ambiguous Tailwind `text-[var(--text-...)]` utilities compiled as color instead of size. Five workspace components now use explicit length utilities. Independent inspector rendering confirms 11px/12px metadata, instead of inherited 16px.
- **Hit areas:** mobile landing header links/menu now measure at least 44px in both dimensions. Shared standalone buttons have a 32px desktop minimum and 44px mobile/coarse-pointer minimum. Inline citations are explicitly marked and exempt. Mobile menu Escape dismissal and focus restoration were exercised.
- **Fixture and root error:** dev inspector wrapper no longer forces a 380px container around a wider inspector; harness toolbar wraps. Root error imports its own global stylesheet. This confirms source delivery, not a deliberately induced live root failure.
- **Evidence pipeline:** undefined mobile height, missing-result handling, SVG class handling, 32px mobile threshold, unchecked width and ignored desktop flags are corrected. New deterministic UI regression tests cover these cases. Report verdicts derive from actual completeness/flags rather than hardcoded PASS. Missing Playwright/required pages now fail checks instead of succeeding silently.
- **Packaging:** a tracked-source-only packager rejects environment files, credentials, caches and session artifacts, and refuses to append to an existing archive. The historical `pliny-ui-FINAL.zip` is not approved for sharing.

## Independently executed checks

Typecheck passed; lint passed with two existing unused-variable warnings. All 26 deterministic suites, additional UI-review regressions, 36 release evaluation cases, production build, client-bundle secret canary scan and diff whitespace gate passed. Tests are synthetic/mocked, not live model acceptance. External provider requests: **0**.

Local browser: landing at 390x844, menu Escape/focus restoration, login, branded 404 and production fixture denial. Landing header dimensions: home 56.06x44, sign-in 44x44, request access 124.29x44, menu 44x44. Landing has no horizontal overflow. A local 127.0.0.1 dashboard prefetch encountered a cross-origin localhost redirect; hosted redirect behavior must be checked independently. No claim of a fully clean local console is made from that run.

## Publication and remaining acceptance

Use the existing `fix/pliny-audit-r1-preview-20260930` branch and existing Pliny Vercel project. Supabase URL/anon-key overrides are scoped to this branch's Preview environment and point to the isolated staging project. No Production environment values changed. The staging project has no test user yet; Production credentials do not grant access to it.

Remaining: staging test user, Redis isolation confirmation, authenticated hosted upload/OCR/retrieval/citation/refusal/delete flows, full breakpoint/axe collection and measured performance traces. The five CSS modules still total 3443 vs 3793 baseline lines, a **9.23%** reduction, not 40%. Historical audit JSON is incomplete (11/26); regenerated report honestly remains INCOMPLETE. Preview publication is not Production release approval.
