# Pliny.AI Phase 3 Export & Report Test Script

Use this script after Phase 1 and Phase 2 retrieval/citation checks pass. The goal is to confirm that cited answers can become professional work product without losing source support.

## Test Setup

- Start the local app.
- Sign in with a disposable or test account.
- Open a workspace with processed cited documents.
- Recommended documents:
  - `policy.md`
  - a PDF or DOCX with page/section evidence
  - the Phase 2 spreadsheet fixture data
- Keep the Source Inspector available for citation checks.

## Test 1 - Cited Answer Report

Ask a direct factual question that is answered by uploaded documents.

Pass:

- The answer includes valid citation pills.
- Click Reports -> Cited answer report.
- The downloaded Markdown includes workspace name, timestamp, question, answer, sources, source excerpts, and verification note.
- Click Copy report Markdown and confirm the copied Markdown includes sources, excerpts, and verification note.
- Source excerpts are non-empty.

Fail:

- Report omits sources.
- Report removes verification note.
- Report includes hidden prompts, API keys, or retrieval internals.

## Test 2 - Print View

Use the same cited answer.

Pass:

- Click Open print report.
- A clean white print view opens.
- It includes Pliny.AI, workspace, generated timestamp, question, answer/report content, source excerpts, and verification note.
- It does not show the workspace sidebar, document panel, composer, account menu, or debug metadata.
- Browser print preview / Save as PDF is available through the print button or browser menu.

Fail:

- Popup cannot open.
- Sources are empty for a cited answer.
- Interactive workspace UI appears in the print view.

## Test 3 - Transcript Export

Ask at least two questions in one workspace:

1. One cited factual question.
2. One unsupported question, such as `What is the CEO's birthday?`

Then click Export transcript in the workspace header.

Pass:

- The Markdown transcript includes multiple Q/A pairs.
- Cited answers include source lists and excerpts.
- Refusal/no-evidence answers say no cited sources were used.
- Workspace name and export timestamp are present.

Fail:

- Transcript omits questions.
- Transcript omits cited source excerpts for cited answers.
- Transcript includes hidden prompts or debug internals.

## Test 4 - Due Diligence Summary

Ask a multi-source review question, such as:

```txt
What are the main vendor review requirements?
```

Pass:

- The normal answer is cited.
- Reports -> Due diligence summary is enabled.
- The downloaded Markdown includes executive summary, key findings, source evidence, open questions/evidence gaps, and verification note.
- Every source excerpt is non-empty.

Fail:

- Due diligence summary is available for an uncited weak/no-evidence answer.
- Summary makes unsupported claims.

## Test 5 - Risk Report

Ask a risk-focused question, such as:

```txt
What vendor renewal risks are visible in these documents?
```

Pass:

- The normal answer is cited.
- Reports -> Risk report is enabled.
- The risk report includes risk summary, identified risks/issues, missing evidence/caveats, sources, and human-review verification note.
- Risk statements are grounded in answer/citation payloads, not invented.

Fail:

- Risk report is confident without citations.
- Risk report omits caveats and verification note.

## Test 6 - Table Summary

Upload or use spreadsheet data with:

Sheet: Renewals

| Account | ARR | Renewal Date | Status | Notes |
|---|---:|---|---|---|
| Acme Corp | 120000 | 2026-04-12 | At risk | Pricing increase requested |
| Novus Energy | 84000 | 2026-05-03 | Renewing | Legal approved |
| Atlas Legal | 45000 | 2026-06-18 | Unsure | Waiting on procurement |

Sheet: Expenses

| Department | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---:|---:|---:|---:|---|
| Sales | 12000 | 15000 | 16000 | 17000 | Travel increased |
| Cloud | 30000 | 34000 | 38000 | 42000 | Usage growth |
| Marketing | 9000 | 11000 | 12500 | 13000 | Campaign spend |

Ask:

```txt
Show a chart of Q4 expense by department.
```

Pass:

- Chart answer includes Sales 17000, Cloud 42000, Marketing 13000.
- Reports -> Table summary includes chart/table values if structured chart data was present.
- Source rows cite the Expenses sheet/rows.

Fail:

- Chart values are wrong.
- Table summary invents values absent from the answer/chart payload.
- Sheet/row source context is missing.

## Test 7 - Weak / No-Evidence Export Guard

Ask:

```txt
What is the CEO's birthday?
```

Pass:

- Pliny.AI refuses or qualifies based on lack of evidence.
- Due diligence, risk, and table summary actions are disabled or produce an insufficient-evidence report.
- No confident professional report is generated.
- Export Markdown / print view, if used, clearly records insufficient evidence.

Fail:

- Any professional report confidently answers without document support.

## Test 8 - Source Excerpt Integrity

For every report created above:

Pass:

- Every cited source has a non-empty excerpt.
- Filename and location/page/sheet/row context are visible where available.
- Clicking original citation pills in the answer still opens Source Inspector.

Fail:

- Empty source excerpts appear.
- Source Inspector breaks after report actions.

## No-Go Rules

Do not demo Phase 3 if:

- A factual report has no valid sources.
- Weak/no-evidence answers generate confident due diligence, risk, or table reports.
- Print view exposes the workspace shell or hidden internals.
- Spreadsheet reports contain wrong numbers.
- Native PDF/DOCX support is implied.
