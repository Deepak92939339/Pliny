# Evaluation

Pliny separates deterministic engineering evidence from limited provider-backed acceptance. Passing a build or deployment does not by itself prove answer quality, complete privacy detection or provider retention behavior.

## Current evidence

| Area | Result | What was verified |
| --- | --- | --- |
| Offline evaluation | **14/14 passed** | Citation contracts, prompt-injection sanitization, chart provenance, document scoping, inventory behavior, insufficient-evidence refusal, spreadsheet facts and grounded charts |
| Privacy/database acceptance | **59/59 passed twice** | Clean migration rebuilds, anonymous ACL denial, owner/non-owner isolation, RLS, grants, immutable modes, masked projections, retrieval functions and `vector(1024)` |
| Ingestion | **Passed** | PDF, DOCX, XLSX, CSV, HTML, Markdown and TXT validation/extraction; provenance-preserving chunks; bounded OCR and embedding failure behavior |
| Retrieval | **Passed** | Mode-aware lexical RPCs, semantic retrieval, deterministic fusion, document scoping, mixed-mode privacy boundary, acronym/title alternatives and broad-context refusal |
| Citations and evidence | **Passed** | Marker parsing, source resolution, chart source references, multi-document coverage, repair constraints and insufficient-evidence behavior |
| Privacy payloads | **Passed deterministically** | Original detected identifiers excluded from mocked embedding, transformed-query, generation and citation-repair payloads; missing masked projections fail closed |
| Browser bundle | **Passed** | Local Production bundle and deployed browser assets contained no server-only pseudonym key name or provider/service-role secret indicators |
| Protected Production APIs | **Passed** | Unauthenticated chat, search, processing and upload requests were rejected before accepting content or calling providers |
| Production browser acceptance | **Passed for scoped flows** | Sequential two-file upload, safe Markdown report rendering, CTO/title retrieval, citation resolution to the correct PDF page and exact excerpt |
| Build quality | **Passed** | ESLint, TypeScript and the Next.js Production build at the released application commit |

## Offline evaluation composition

The automated 14-case suite contains seven unit/contract checks and seven mocked integration checks.

Unit/contract coverage:

- supported policy answers with valid citations;
- invalid marker rejection;
- prompt-injection source sanitization;
- missing or invalid chart source references;
- mixed grounded prose and unsupported-chart rejection;
- valid grounded chart acceptance.

Mocked integration coverage:

- multi-document citation resolution;
- explicit filename scoping;
- owner corpus inventory behavior;
- false filename rejection;
- unsupported-fact refusal;
- spreadsheet numeric fidelity;
- grounded chart values and source references.

The suite is deterministic and credential-free. Its live end-to-end section remains separately labelled and is not counted in 14/14.

## Production acceptance witnesses

- Two selected files were retained as separate queue items, processed sequentially and reached ready state with distinct private Storage paths and one complete embedded chunk each.
- Currency and percentage Markdown rendered as formatted text in both the answer and Risk and Evidence Report, with a DOM regression proving no literal bold markers and no raw-HTML rendering path.
- The query “Who is the CTO?” retrieved the synthetic sentence “Aster Quill serves as Chief Technology Officer of ExampleCo Test,” identified Aster Quill, and resolved its citation to the correct synthetic PDF, page 1 and exact excerpt.
- Unrelated acronym and “October” negative controls retained structured insufficient-evidence behavior.

## What the evidence does not prove

- The provider-backed quality sample is too small for a broad quality or reliability claim.
- The deterministic privacy fixtures cover supported patterns, not all possible personal or confidential information.
- The tests do not verify Voyage account-level retention or training opt-out status.
- RAG evaluation reduces uncertainty; it does not eliminate hallucinations, extraction errors or retrieval misses.
- Performance and cost have not been benchmarked at enterprise-scale document or tenant volumes.

## Reproducibility boundary

The public repository is presented as an engineering case study rather than an installation template. The durable reports retain exact release witnesses, while this document summarizes only claims that remain supported by current code and acceptance evidence.

Related documents: [Architecture](./architecture.md) · [Security & Privacy](./security-and-privacy.md) · [Limitations](./limitations.md)
