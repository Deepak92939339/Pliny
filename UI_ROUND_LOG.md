# Pliny UI Unification Round (U-series) — Log & Inventory

## 1. Initial State & Baseline Git Context
- Repository Root: `/Users/sandman/Desktop/RAG intelligence/pliny-antigravity-review`
- Branch: `fix/pliny-audit-r1-preview-20260930`
- Base Commit: `da124a4700960c05ab4a1af132a6a0238947fc9c`
- Initial Git Log:
  ```
  da124a4 chore(audit): record WP3 rate-limit retry fix and updated verification
  b528b1e fix(db): allow success and failed status rows to be counted for budget
  8c0dc1b fix(documents): content_sha256 collision handling & upload deduplication (WP5)
  ```

---

## 2. CSS Module Baseline Line Counts

| Module Path | Baseline Lines | Target Line Count (≤ 60% of baseline) |
|---|---|---|
| `src/components/auth/AuthView.module.css` | 755 | ≤ 453 |
| `src/components/workspace/DocumentsSurface.module.css` | 853 | ≤ 512 |
| `src/components/workspace/AskSurface.module.css` | 750 | ≤ 450 |
| `src/components/workspace/WorkspaceView.module.css` | 767 | ≤ 460 |
| `src/components/dashboard/DashboardView.module.css` | 668 | ≤ 400 |
| **Total** | **3,793** | **≤ 2,275 (≥ 40% reduction)** |

---

## 3. Comprehensive Baseline Design Token Inventory

### 3.1 Corner Radii
| Value | Context / Occurrences | Key Locations | Target Token |
|---|---|---|---|
| `2px` | 1 occurrence (TSX) | `src/components/landing/LandingView.tsx:237` | `--radius-sm` (6px) |
| `3px` | 1 CSS, 2 TSX | `src/components/auth/AuthView.module.css:696`, `LandingView.tsx:633` | `--radius-sm` (6px) |
| `4px` | 5 CSS, 4 TSX | `AuthView.module.css:494`, `LandingView.tsx:110` | `--radius-sm` (6px) |
| `5px` | 5 CSS, 2 TSX | `DashboardView.module.css:464`, `InfoPage.tsx:42` | `--radius-sm` (6px) |
| `6px` | 9 TSX | `LandingView.tsx:235` | `--radius-sm` (6px) |
| `7px` | 16 TSX | `src/app/dashboard/loading.tsx:7` | `--radius-md` (8px) |
| `8px` | 6 TSX | `LandingView.tsx:134` | `--radius-md` (8px) |
| `10px` | 18 CSS, 1 TSX | `AuthView.module.css:347`, `LandingView.tsx:493` | `--radius-lg` (12px) |
| `12px` | Standard | Various | `--radius-lg` (12px) |
| `14px` | 5 CSS | `AuthView.module.css:412` | `--radius-lg` (12px) / `--radius-xl` (16px) |
| `16px` | Composer/sheets | Target | `--radius-xl` (16px) |
| `18px` | 2 TSX | `src/app/dashboard/error.tsx:19` | `--radius-xl` (16px) |
| `999px` / `rounded-full` | 22 TSX | Badges, avatars, pills | `--radius-full` (999px) |

### 3.2 Font Sizes
| Value | Context / Occurrences | Problem / Violation | Target Token |
|---|---|---|---|
| `10px` | 19 CSS, 18 TSX | Breaks Apple HIG caption minimum (11px) | `--text-2xs` (11px / 0.6875rem) |
| `11px` | 32 CSS, 30 TSX | Mono labels, captions | `--text-2xs` (11px / 0.6875rem) |
| `12px` | 27 CSS, 24 TSX | Secondary text, helper labels | `--text-xs` (12px / 0.75rem) |
| `13px` | 52 CSS, 32 TSX | Compact UI labels | `--text-sm` (13px / 0.8125rem) |
| `14px` | 21 CSS, 10 TSX | Standard UI text | `--text-base` (14px / 0.875rem) |
| `15px` | 9 CSS, 5 TSX | Arbitrary intermediate | `--text-base` (14px) / `--text-md` (16px) |
| `16px` | Standard | Reading body, answer text | `--text-md` (16px / 1rem) |
| `17px` | 1 CSS, 1 TSX | Arbitrary reading text | `--text-md` (16px / 1rem) |
| `20px` | 5 CSS, 1 TSX | Section titles | `--text-lg` (20px / 1.25rem) |
| `21px` | 1 CSS | Arbitrary header | `--text-lg` (20px / 1.25rem) |
| `24px` | 1 CSS, 1 TSX | Subheadings | `--text-xl` (24px / 1.5rem) |
| `26px`–`34px` (clamp) | Headings | Arbitrary clamp expressions | `--text-2xl` (32px / 2rem) |
| `clamp(34px, 6.6vw, 76px)` | Display | Hero title | `clamp(40px, 6vw, 72px)` |

### 3.3 Box Shadows
| Baseline Shadow | Occurrences | Problem | Target Token |
|---|---|---|---|
| `0 1px 2px rgba(12, 20, 39, 0.08)` | 1 CSS | Cold ink tint | `--shadow-1`: `0 1px 2px rgba(72,48,31,0.06)` |
| `0 16px 40px rgba(72, 48, 31, 0.14)` | 1 CSS | Inconsistent blur | `--shadow-2`: `0 8px 24px rgba(72,48,31,0.10)` |
| `0 16px 40px rgba(72, 48, 31, 0.12)` | 5 CSS | Inconsistent blur | `--shadow-2`: `0 8px 24px rgba(72,48,31,0.10)` |
| `0 12px 24px rgba(12, 20, 39, 0.14)` | 1 CSS | Cold ink tint | `--shadow-2`: `0 8px 24px rgba(72,48,31,0.10)` |
| `0 24px 60px rgba(12, 20, 39, 0.2)` | 3 CSS | Cold ink tint | `--shadow-3`: `0 24px 64px rgba(72,48,31,0.16)` |
| `0 0 0 3px rgba(0, 102, 204, 0.12)` | 2 CSS | Blue focus ring | `--focus-ring` (warm oxblood) |

### 3.4 Color Inconsistencies & Blue Accents
| File | Line | Usage | Correction |
|---|---|---|---|
| `src/components/auth/AuthView.module.css` | 18 | `--blue: #0066CC;` | Replace with `--accent-ink` |
| `src/components/auth/AuthView.module.css` | 203 | `0 0 0 3px rgba(0, 102, 204, 0.12)` | Replace with `--focus-ring` |
| `src/components/workspace/WorkspaceView.module.css` | 14 | `--blue: #0066CC;` | Replace with `--accent-ink` |
| `src/components/dashboard/DashboardView.module.css` | 16 | `--blue: #0066CC;` | Replace with `--accent-ink` |
| `src/components/workspace/DocumentsSurface.module.css` | 788 | Focus outline color `#0066CC` | Replace with `--focus-ring` |

### 3.5 Animation Performance Violations
| File | Line | Violation | Fix |
|---|---|---|---|
| `src/components/auth/AuthView.module.css` | 279 | `transition: width 1.6s` (layout trigger) | Convert to `transform: scaleX()` with `transform-origin: left` |
| `src/components/workspace/WorkspaceView.module.css` | 305 | `transition: width` (layout trigger) | Convert to `transform`-based slide and opacity fade |

---

## 4. Duplicate Component Styling Matrix Across Modules

| Component Concept | Primitives in `src/components/ui/` | Duplicated in `AuthView` | Duplicated in `DashboardView` | Duplicated in `WorkspaceView` | Duplicated in `DocumentsSurface` | Duplicated in `AskSurface` |
|---|---|---|---|---|---|---|
| **Buttons** | `Button.tsx` (incomplete variants) | `.primaryBtn`, `.secondaryBtn`, `.linkBtn` | `.createBtn`, `.actionBtn`, `.filterBtn` | `.sidebarBtn`, `.navBtn`, `.iconBtn` | `.uploadBtn`, `.processBtn`, `.deleteBtn` | `.sendBtn`, `.exportBtn`, `.citeBtn` |
| **Inputs** | `Input.tsx` (basic) | `.textInput`, `.passwordInput` | `.searchField`, `.modalInput` | `.inlineRename` | `.filterInput` | `.composerTextarea` |
| **Badges / Status** | `Badge.tsx` (simple) | `.statusBadge` | `.badge`, `.countPill` | `.privacyPill` | `.stagePill`, `.readyPill`, `.failedPill` | `.scorePill`, `.citationBadge` |
| **Cards** | `card.tsx` | `.authCard` | `.workspaceCard`, `.metricsCard` | `.paneCard` | `.documentRowCard` | `.turnCard`, `.refusalCard` |
| **Dialogs / Sheets** | `dialog.tsx`, `sheet.tsx` | Local modal CSS | `NewWorkspaceDialog` local CSS | Local modal CSS | Delete dialog local CSS | `SourceInspector` local CSS |

---

## 5. U0 Deliverables & Baseline Screenshots
- Fixture harness: `src/app/__ui-preview/page.tsx`
- Unit test: `scripts/test-ui-preview-guard.mjs` (production guard & sitemap exclusion)
- 39 baseline screenshots captured in `artifacts/ui-unification/screenshots/before/`:
  - 13 pages/views: `/`, `/login`, `/signup`, `/about`, `/privacy`, `/security`, `/file-support`, `/does-not-exist`, `preview-workspace`, `preview-dashboard`, `preview-refusal`, `preview-inspector`, `preview-chart`
  - 3 viewports: 390×844 (mobile), 768×1024 (tablet), 1440×900 (desktop) at DPR 2.

---

## 6. U1 Deliverables & Token System
- Defined full token system in `src/app/globals.css` and `@theme inline` (concentric radii `--radius-xs` to `--radius-full`, type scale `--text-2xs` to `--text-2xl`, warm elevation `--shadow-1` to `--shadow-3`, `--focus-ring`, `--motion-*`).
- Complete elimination of blue accents (`#0066CC` / `--blue`) across all CSS modules.
- Delivered `deliverables/U1.patch`, `deliverables/U1-NOTES.md`, and `deliverables/pliny-ui-U1.zip`.

---

## 7. U2 Deliverables & Primitives
- Standardized `Button.tsx`: variants (`primary`, `secondary`, `ghost`, `destructive`, `link`), sizes (`sm`, `md`, `lg`), `loading` spinner state with `aria-busy`.
- Enhanced `Input.tsx`: icon slots, error message display with `aria-invalid` and `role="alert"`.
- Unified `Badge.tsx`: variants (`neutral`, `accent`, `ok`, `danger`, `mono-label`).
- Standardized `card.tsx`, `dialog.tsx`, and `sheet.tsx` with concentric radii and warm shadows.
- Implemented `SiteHeader.tsx` (64px height, 1200px max container, `BrandMark`, marketing/info variants).
- Added unit test `scripts/test-button-variants.mjs` (26/26 tests passing).
- Delivered `deliverables/U2.patch`, `deliverables/U2-NOTES.md`, and `deliverables/pliny-ui-U2.zip`.

---

## 8. U3 Deliverables & Surface Migrations
- Auth Surface (`f92092e`): 60fps GPU transform progress animation (`transform: scaleX()`), sub-11px font cleanup, tokenization.
- Landing & Info Pages (`2370d7b`): SiteHeader integration, `--container-prose` (720px) on info reading pages, tokenization.
- Dashboard Surface (`8489f3f`): Shared Card, Badge, and Button adoption; dead CSS pruned (-83 lines).
- Workspace Shell (`b688411`): 60fps instant sidebar width with opacity fade on desktop and GPU translate on mobile; header controls migrated to Badge/Button.
- Documents Surface (`6ca956a`): Unified `DocumentStatusBadge` for table and mobile cards; modernized dropzone and delete/process buttons; dead CSS pruned (-109 lines).
- Ask Surface & Source Inspector (`7d61141`): Centered 768px conversation column, Apple-grade composer (`--radius-xl`, `--shadow-2`), accessible screen-reader citation text, 16px reading text in Source Inspector, modernized ChartBlock and RiskEvidenceReportPreview. Removed light weight 300 from `Source_Serif_4` in `src/app/layout.tsx`.
- Delivered `deliverables/U3.patch`, `deliverables/U3-NOTES.md`, and `deliverables/pliny-ui-U3.zip`.

---

## 9. U4 Deliverables & Missing States
- Implemented branded 404 page (`src/app/not-found.tsx`) with `SiteHeader` (variant="info"), BrandMark, warm editorial copy, and primary "Back home" Button.
- Implemented root error boundary (`src/app/global-error.tsx`) as a client component wrapping `<html><body>`, branded error card with warm styling, and `reset()` Button.
- Refactored `src/app/error.tsx` to operate cleanly within the root layout without duplicate `<html><body>` tags.
- Unified route error, loading, and not-found states across dashboard and collection routes (`dashboard/loading.tsx`, `dashboard/error.tsx`, `collection/[id]/not-found.tsx`, `collection/[id]/error.tsx`, `collection/[id]/loading.tsx`).
- Delivered `deliverables/U4.patch`, `deliverables/U4-NOTES.md`, and `deliverables/pliny-ui-U4.zip`.

