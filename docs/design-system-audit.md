# Pliny AI Design System Audit

This note records the final UI refinement pass for Pliny AI.

## Spacing

- Primary spacing follows Tailwind's 4px grid.
- One-off pixel values were removed from app and component classes.
- Workspace column widths are defined as design tokens:
  - left document rail: `17rem` / 272px
  - right source inspector: `21rem` / 336px
- Interactive controls are sized around practical tap targets where layout allows.

## Type

- Inter is loaded with `next/font`.
- JetBrains Mono remains available for code-like metadata, but is not overused.
- Reading text uses 16px where practical, especially assistant answers and source text.
- Captions and metadata use 12px or 14px with clear contrast.
- Landing display type uses a restrained large size with tight tracking.

## Color

- Global color tokens use OKLCH.
- Dark mode is the designed default.
- Light mode uses a white page base with tinted sidebars and white cards, so layout regions remain distinct.
- Surface steps are monotonic:
  - `--surface-0`
  - `--surface-1`
  - `--surface-2`
  - `--surface-3`
  - `--surface-overlay`
- Emerald is reserved for primary actions, focus rings, active citations, active sources, and ready states.
- Purple, violet, indigo, and blue-gradient visual patterns are not used.

## Motion

- Motion uses a 50ms-based duration scale.
- Default interaction timing uses `--ease-standard`.
- Message entry motion is subtle and limited to opacity plus an 8px vertical offset.
- Citation hover scale is capped at 1.02.
- Reduced-motion preferences are respected globally.

## Layout

- Desktop workspace uses three panels:
  - document rail
  - centered conversation column
  - source inspector
- The conversation column is constrained to a comfortable reading width.
- The active chat/composer column uses `max-w-prose` to keep answers near a 65-character reading line.
- The composer remains bottom anchored.
- On smaller viewports, documents move into the main column and the source inspector opens as a bottom sheet.

## Remaining Limitations

- Retrieval uses keyword and broad-context fallback by default; semantic retrieval is available only when embeddings are enabled and populated.
- Light mode is supported, but dark mode is the primary designed experience.
- Some shadcn/Base UI primitives retain framework-specific animation classes because they are part of the component behavior.
- CSP is still report-only and should be tightened after preview testing.

## Checklist

- 4px spacing grid: yes
- Inter via `next/font`: yes
- OKLCH tokens: yes
- Accent usage restrained: yes
- Source inspector responsive: yes
- Composer bottom anchored: yes
- No mock imports: yes
- No FontInjector: yes
