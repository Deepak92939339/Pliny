# Pliny architecture

Pliny is a private, source-grounded document intelligence workspace. This document describes the implemented system at release commit `8987e383c563a2b054507e50110317e32995f356`; planned components are marked explicitly.

The provider integrations are replaceable boundaries. Voyage is the current embedding processor and Anthropic is the current answer processor. GLM is planned, not implemented.

## View 1 — System topology

```mermaid
flowchart LR
  Owner["Authenticated owner"]

  subgraph Client["Browser — owner-visible boundary"]
    UI["React 19 interface<br/>workspace, citations, reports"]
    Inspector["Source Inspector<br/>original owner-visible evidence"]
    Export["Report and export UI<br/>masked by default in privacy mode"]
  end

  subgraph Runtime["Vercel — server-only application boundary"]
    Next["Next.js 15 App Router"]
    Routes["Node.js Route Handlers<br/>upload, process, search, chat"]
    Processors["Document processor registry<br/>PDF · DOCX · XLSX · CSV · HTML · MD · TXT"]
    Retrieval["Retrieval engine<br/>scope · alternatives · fusion · ranking"]
    Evidence["Evidence-sufficiency validator"]
    Citations["Citation validator<br/>bounded repair path"]
    Reports["Report and export pipeline"]
    Pseudonyms["HMAC pseudonymisation<br/>document-scoped, server-only"]
    SafeLogs["Safe stage logging"]
  end

  subgraph Supabase["Supabase — identity, storage and database boundary"]
    Auth["Supabase Auth"]
    Storage["Private documents bucket<br/>owner-prefixed exact paths"]
    DB["PostgreSQL<br/>collections · documents · chunks · chat · usage"]
    Vector["pgvector<br/>vector(1024)"]
    Lexical["Generated PostgreSQL tsvector columns<br/>original and provider-safe GIN indexes"]
    Access["RLS ownership policies<br/>explicit role grants · anon DML denied"]
  end

  subgraph External["External processing boundaries"]
    Upstash["Upstash Redis<br/>rate-limit counters only"]
    Voyage["Voyage<br/>document/query embeddings"]
    Anthropic["Anthropic<br/>bounded answer generation"]
    GLM["GLM<br/>planned — not implemented"]
  end

  Reconcile["Storage reconciliation tooling<br/>two witnesses · signed manifest · exact-path cleanup"]

  Owner --> UI
  UI --> Next --> Routes
  Routes --> Auth
  Routes --> Storage
  Routes --> Processors
  Processors --> Pseudonyms
  Processors --> Voyage
  Processors --> DB
  DB --- Vector
  DB --- Lexical
  Access --- DB
  Retrieval --> DB
  Retrieval --> Voyage
  Routes --> Retrieval --> Evidence
  Evidence -->|"sufficient"| Anthropic
  Evidence -->|"insufficient: no answer-provider call"| UI
  Anthropic --> Citations --> Reports --> UI
  UI --> Inspector
  UI --> Export
  Routes -->|"upload/process rate checks"| Upstash
  Routes --> SafeLogs
  Reconcile --> Storage
  Reconcile --> DB
```

Application code runs in the Vercel-hosted Next.js runtime. Browser code can hold the public Supabase client credential, but server-only provider credentials and the pseudonym key remain outside the client bundle. Supabase RLS and explicit grants remain authoritative even when application ownership filters are also present.

## View 2 — Document ingestion lifecycle

```mermaid
flowchart TB
  A1["1 · Authenticated upload request<br/>React dropzone → Next.js multipart Route Handler"]
  A2["2 · Workspace ownership verification<br/>Supabase Auth getUser + collection owner filter"]
  A3["3 · Rate-limit enforcement<br/>Upstash Redis sliding window; Production fails closed"]
  A4["4 · Batch boundary<br/>React coordinator accepts 1–5 files and sends them sequentially"]
  A5["5 · Size, extension and MIME validation<br/>react-dropzone + Zod + processor plugin validators"]
  A6["6 · Private Storage path<br/>owner UUID / collection UUID / random UUID-safe filename"]
  A7["7 · Document row creation<br/>Supabase PostgreSQL status=processing"]
  A8["8 · Processing mode capture<br/>workspace default copied with privacy policy version"]
  A9["9 · Processor selection<br/>TypeScript registry by extension and MIME; plugin signature validation where applicable"]

  subgraph Extract["Extraction and provenance"]
    A10["10 · PDF native extraction<br/>pdf-parse"]
    A11["11 · Bounded OCR fallback<br/>pdf.js rendering + Tesseract.js, selected pages only"]
    A12["12 · Other formats<br/>Mammoth DOCX · read-excel-file XLSX · CSV parser · parse5 HTML · MD/TXT processors"]
    A13["13 · Provenance-preserving normalization<br/>source sanitization + pages, headings, rows, sheets and block metadata"]
    A14["14 · Chunk construction<br/>~500-token targets, ~50-token overlap, 200-chunk ceiling"]
  end

  subgraph Projection["Processing-mode projection"]
    A15["15 · Standard or privacy-minimised branch<br/>immutable document mode"]
    A16["16 · Document-scoped HMAC pseudonyms<br/>Node.js crypto, server-only key"]
    A17["17 · Provider-safe content and metadata<br/>deterministic detector + masked projection"]
  end

  subgraph Index["Embedding and indexing"]
    A18["18 · Batch embedding request<br/>Voyage HTTPS, bounded batches, complete-set requirement"]
    A19["19 · Vector persistence<br/>PostgreSQL vector(1024)"]
    A20["20 · Lexical materialization<br/>generated original/provider-safe tsvector + GIN indexes"]
    A21["21 · Ready transition<br/>complete chunk upsert, stale-chunk removal, document status update"]
  end

  A22["22 · Failure and compensation<br/>exact uploaded object removed if row creation fails; processing failures persist a safe failed stage"]
  A23["23 · Client completion<br/>queued/uploading/processing/ready/failed per file + router refresh"]

  A1 --> A2 --> A3 --> A4 --> A5 --> A6 --> A7 --> A8 --> A9
  A9 -->|"PDF"| A10
  A10 -->|"sparse pages"| A11
  A10 -->|"sufficient native text"| A13
  A11 --> A13
  A9 -->|"DOCX/XLSX/CSV/HTML/MD/TXT"| A12 --> A13
  A13 --> A14 --> A15
  A15 -->|"standard"| A18
  A15 -->|"privacy_minimised"| A16 --> A17 --> A18
  A18 --> A19 --> A20 --> A21 --> A23
  A5 -. "reject" .-> A22
  A6 -. "row insert fails" .-> A22
  A9 -. "extract/index/embed fails" .-> A22 --> A23
```

Important implementation details:

- The browser coordinates the bounded batch; each file still crosses the authenticated server boundary independently, so partial success is visible and no file is silently discarded.
- Processor-specific ceilings are stricter than the outer 15 MB upload ceiling where appropriate: HTML, Markdown and TXT are 5 MB; CSV is 10 MB; PDF, DOCX and XLSX are 15 MB.
- Native PDF extraction is preferred. OCR runs only when enabled and only for sparse pages, with a bounded page count.
- Chunks retain source location metadata. Standard chunks use original text for embedding; privacy-minimised chunks use provider-safe text and mark the embedding projection accordingly.
- Embedding is all-or-fail for the current document. A document is not marked ready with a partial vector set.
- PostgreSQL generates lexical material from stored columns. Privacy retrieval excludes original filenames from its provider-safe lexical weighting.
- Deleting an application row is not represented here as automatic Storage cleanup. Separate reconciliation tooling detects and controls orphan removal.

## View 3 — Query-to-answer lifecycle

```mermaid
flowchart TB
  Q1["1 · Authenticated chat request<br/>Next.js Node.js Route Handler + Zod"]
  Q2["2 · Owner/workspace verification<br/>Supabase Auth + owner-filtered collection lookup"]
  Q3["3 · Request and daily budget boundaries<br/>persistent ai_usage_events + minute/day/cost limits"]
  Q4["4 · Document scope resolution<br/>inventory, filename and cross-document intent"]
  Q5["5 · Participating document modes<br/>ready owner-scoped documents"]
  Q6["6 · Strictest boundary<br/>any privacy-minimised document makes the request privacy-minimised"]
  Q7["7 · Query normalization"]
  Q8["8 · Stop-word treatment"]
  Q9["9 · Bounded acronym/title alternatives<br/>deterministic known-role mapping"]
  Q10["10 · Document-scoped privacy query transform<br/>HMAC pseudonyms when required"]
  Q11["11 · Vector query embedding<br/>Voyage, transformed query in privacy mode"]
  Q12["12 · Mode-aware lexical RPC<br/>original or provider-safe generated tsvector"]
  Q13["13 · Semantic retrieval<br/>pgvector cosine RPC, collection/document/owner scoped"]
  Q14["14 · Lexical retrieval<br/>PostgreSQL websearch_to_tsquery + GIN"]
  Q15["15 · Rank fusion<br/>normalized 55% semantic · 35% lexical · 10% deterministic boost"]
  Q16["16 · RLS and ownership enforcement<br/>authenticated grants + auth.uid predicates"]
  Q17["17 · Retrieval reason<br/>hybrid / semantic / direct lexical / broad fallback / empty"]
  Q18["18 · Broad-context fallback<br/>visible as weak context, never sufficient by itself"]
  Q19["19 · Evidence sufficiency<br/>bounded size, lexical/semantic support, document coverage"]
  Refusal["20 · Structured refusal<br/>no answer-provider call; reason + closest matches"]
  Q21["21 · Bounded source envelope<br/>selected chunks clamped by count and characters"]
  Q22["22 · Privacy payload assertion<br/>detected originals forbidden when privacy-minimised"]
  Q23["23 · Answer generation<br/>Anthropic today; replaceable provider boundary"]
  Q24["24 · Citation parsing<br/>[[s.X]] and page markers"]
  Q25["25 · Citation validation<br/>resolvable source IDs, chart refs and document coverage"]
  Q26["26 · Bounded citation repair<br/>one additional Anthropic call only when eligible; same masked context in privacy mode"]
  Q27["27 · Persistence<br/>question, answer, citations and usage in PostgreSQL"]
  Q28["28 · Safe Markdown rendering<br/>tokenized React elements, no raw model HTML"]
  Q29["29 · Source Inspector<br/>citation → exact owner-visible filename, location and excerpt"]
  Q30["30 · Report/export<br/>grounded report, Markdown/print; masked default in privacy mode"]
  GLM["GLM generation<br/>planned — not implemented"]

  Q1 --> Q2 --> Q4 --> Q5 --> Q6 --> Q7 --> Q8 --> Q9 --> Q10
  Q10 --> Q11 --> Q13
  Q10 --> Q12 --> Q14
  Q13 --> Q15
  Q14 --> Q15 --> Q16 --> Q17 --> Q18 --> Q19
  Q19 -->|"insufficient"| Refusal --> Q27
  Q19 -->|"sufficient"| Q3
  Q3 -->|"blocked"| Refusal
  Q3 -->|"allowed"| Q21 --> Q22 --> Q23 --> Q24 --> Q25
  Q25 -->|"valid"| Q27
  Q25 -->|"repair eligible"| Q26 --> Q25
  Q25 -->|"invalid after repair"| Refusal
  Q27 --> Q28 --> Q29 --> Q30
  GLM -. "future provider option" .-> Q23
```

The diagram preserves the implemented execution order even where a numbered requirement is checked later: answer-provider minute, daily and cost budgets are evaluated after evidence sufficiency so refused questions do not consume an Anthropic budget. The refusal branch does not call Anthropic. Query embeddings can still have occurred before evidence sufficiency is decided when semantic retrieval is enabled. Privacy-minimised requests transform both retrieval queries and generation context; a missing required masked projection fails closed.

## View 4 — Privacy, security and failure boundaries

```mermaid
flowchart LR
  subgraph Browser["Browser boundary"]
    B1["Authenticated session UI"]
    B2["Owner-visible original evidence"]
    B3["Masked default privacy export"]
    B4["Public Supabase client credential only"]
  end

  subgraph Server["Vercel server-only boundary"]
    S1["Auth and owner checks"]
    S2["Rate and budget enforcement"]
    S3["Deterministic identifier detection"]
    S4["Document-scoped HMAC pseudonym generation"]
    S5["Bounded provider payload builders"]
    S6["Evidence and citation validators"]
    S7["Safe metadata logs<br/>no passages, mappings, provider bodies or secrets"]
    S8["Browser-bundle secret scan"]
    Key["Server-only pseudonym key"]
  end

  subgraph Data["Supabase protected data boundary"]
    Auth["Supabase Auth"]
    Files["Private Storage<br/>original files"]
    Original["PostgreSQL<br/>original chunks + provenance"]
    Masked["PostgreSQL<br/>provider-safe chunks + metadata"]
    Indexes["vector(1024) + original/masked lexical indexes"]
    RLS["RLS tenant boundary<br/>explicit authenticated grants<br/>anonymous private-table DML denied"]
  end

  subgraph Providers["External boundaries"]
    V["Voyage<br/>original or masked text/query by mode"]
    A["Anthropic<br/>bounded original or masked question/context by mode"]
    U["Upstash<br/>user-scoped rate-limit key and counters"]
  end

  subgraph Operations["Guarded maintenance boundary"]
    O1["Orphan inventory"]
    O2["Two observations + grace period"]
    O3["HMAC-signed cleanup manifest"]
    O4["Exact-path deletion<br/>hard batch ceiling"]
  end

  B1 --> S1 --> Auth
  B4 -. "public client configuration" .-> B1
  S1 --> Files
  S1 --> Original
  RLS --- Original
  RLS --- Masked
  RLS --- Files
  Original --> S3
  Key --> S4
  S3 --> S4 --> Masked --> Indexes
  Original --> Indexes
  S2 --> U
  Original -->|"standard"| S5
  Masked -->|"privacy_minimised"| S5
  S5 --> V
  S5 --> A
  A --> S6 --> B1
  Original --> B2
  Masked --> B3
  S7 -. "safe operational metadata" .-> Server
  S8 -. "reject secret-bearing bundle" .-> Browser
  Files --> O1
  Original --> O1 --> O2 --> O3 --> O4 --> Files
```

### Data-boundary table

| Data class | Stored where | Sent externally | Browser-visible | Protection |
| --- | --- | --- | --- | --- |
| Authentication/session state | Supabase Auth and secure session cookies | Supabase Auth | Session-dependent UI state | Auth checks, cookie handling, protected-route middleware |
| Original files | Private Supabase `documents` bucket | Not sent as whole files to embedding or answer providers | Owner can access through authenticated flows | Private bucket, owner-prefixed Storage policies, exact paths |
| Original chunks and provenance | Supabase PostgreSQL | Standard mode sends bounded chunk text to Voyage and selected source envelopes to Anthropic | Owner-visible through citations and Source Inspector | RLS, explicit grants, collection/document/user predicates |
| Provider-safe projections | Supabase PostgreSQL beside original chunks | Privacy-minimised mode sends masked text/metadata to Voyage and Anthropic | Masked exports; original evidence remains owner-resolvable | Document-scoped HMAC tokens, separate generated lexical index, payload assertions |
| Embedding vectors | PostgreSQL `vector(1024)` | Voyage returns vectors; query vectors are transient in the request path | Not directly exposed in product UI | Scoped RPCs, RLS ownership boundaries, bounded dimensions |
| Questions and answers | Supabase PostgreSQL chat records | Standard mode may send original question; privacy mode sends transformed question. Anthropic returns generated text. | Owner-visible chat; masked fields drive privacy exports | RLS, mode-aware fields, safe rendering, citation validation |
| Citations and report material | Chat citation JSON and client-generated report structures | Citation repair may resend the same bounded context; masked in privacy mode | Owner-visible source resolution and exports | Resolvable chunk/document IDs, citation validation, bounded repair |
| Rate-limit state | Upstash Redis | Authenticated user UUID as the upload/process rate-limit identifier, plus counter/window metadata | Not shown directly | Sliding windows; no document text or question content intentionally supplied |
| Usage/cost records | Supabase PostgreSQL `ai_usage_events` | Not intentionally sent beyond data platform | Indirectly reflected in blocked/allowed responses | RLS, persistent per-user daily checks |
| Pseudonym key and mappings | Key exists only in the server runtime; no reversible mapping table is stored | Never intentionally sent | Never browser-visible | Server-only secret, HMAC derivation, bundle scanning, safe logs |
| Operational logs | Vercel/runtime logging | Vercel logging boundary | Not product-visible | Safe stage/category metadata; provider bodies, passages, mappings and secrets excluded by design |
| Cleanup evidence | Local ignored reconciliation artifact directory | Supabase inventory reads; deletion only after approval workflow | Not product-visible | Project/bucket pinning, two witnesses, grace period, signed manifest, exact-path validation, batch ceiling |

### Failure-closed behavior

- Unauthenticated protected requests stop before database, file-processing or provider work.
- Missing Production rate-limit or budget backing blocks the guarded operation.
- Missing privacy projections, detected original identifiers in a privacy payload, or unknown pseudonyms reject the provider boundary.
- Incomplete embeddings prevent the document from entering `ready` state.
- Broad or empty retrieval produces a structured refusal without answer generation.
- Invalid citations are repaired only within a bounded path; unresolved validation falls back to insufficient evidence.
- Cleanup refuses wrong project or bucket identity, unsigned or altered manifests, broad paths, missing second witnesses, insufficient age and oversized deletion batches.

These controls reduce risk; they do not establish zero retention, local-only processing, complete identifier detection, regulatory compliance or elimination of every hallucination.
