# Pliny.AI Manual QA Checklist

Use this checklist to test Pliny.AI end to end with a real authenticated account before adding more backend features.

## 1. Test Prerequisites

- Local dev server is running with `npm run dev`.
- Supabase environment variables are configured locally.
- Anthropic API key is configured locally.
- Embeddings environment variables are configured if semantic retrieval is being tested.
- A test user account exists, or signup is available.
- The tester is logged in.
- At least one workspace exists, or the tester can create one from the dashboard.
- Browser console is visible during testing.
- Test build/commit is recorded in the known issues log below.

Do not write real secrets into this document or test files.

## 2. Test Files To Create

Create small files locally for upload testing. Keep them synthetic and safe to share.

### PDF

Create a short PDF with 2-3 paragraphs and clear facts, for example:

```text
Pliny.AI QA Memo

The renewal review meeting is scheduled for April 12, 2026. The team must confirm pricing changes before the meeting.

The vendor agreement requires written notice at least 30 days before non-renewal. The finance owner is Deepak.

The Q2 review packet lists cloud infrastructure and sales travel as the largest operating expense drivers.
```

### DOCX

Create a short contract-like DOCX with:

- Renewal date: April 12, 2026
- Payment terms: Net 30
- Termination notice period: 30 days before renewal
- Governing section labels such as "Renewal", "Payment", and "Termination"

### CSV

Create `renewals.csv`:

```csv
Account,ARR,Renewal Date,Status,Notes
Acme Corp,120000,2026-04-12,At risk,Pricing increase requested
Novus Energy,84000,2026-05-03,Renewing,Legal approved
Atlas Legal,45000,2026-06-18,Unsure,Waiting on procurement
```

### XLSX

Create `pliny-qa-spreadsheet.xlsx` with two sheets.

Sheet: `Renewals`

| Account | ARR | Renewal Date | Status | Notes |
|---|---:|---|---|---|
| Acme Corp | 120000 | 2026-04-12 | At risk | Pricing increase requested |
| Novus Energy | 84000 | 2026-05-03 | Renewing | Legal approved |
| Atlas Legal | 45000 | 2026-06-18 | Unsure | Waiting on procurement |

Sheet: `Expenses`

| Department | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---:|---:|---:|---:|---|
| Sales | 12000 | 15000 | 16000 | 17000 | Travel increased |
| Cloud | 30000 | 34000 | 38000 | 42000 | Usage growth |
| Marketing | 9000 | 11000 | 12500 | 13000 | Campaign spend |

### TXT / Markdown

Create a simple policy memo with numbered rules:

```markdown
# Vendor Review Policy

1. Renewal risk must be reviewed 45 days before the renewal date.
2. Legal must approve material contract changes.
3. Finance must review ARR changes greater than 10 percent.
4. Procurement must approve new vendors before signature.
```

## 3. Core Smoke Test

- Create an account or log in.
- Create a workspace.
- Confirm the dashboard shows only real workspaces.
- Open the workspace.
- Upload one supported file.
- Confirm the file appears in the Documents panel.
- Confirm processing starts automatically or a small Process action appears.
- Confirm the document becomes ready.
- Ask a simple question that the document can answer.
- Confirm the assistant answer appears.
- Confirm at least one citation pill appears.
- Click the citation pill.
- Confirm the Source Inspector opens.
- Confirm the Source Inspector shows the expected source text.
- Close the Source Inspector.
- Confirm the Documents panel returns.

## 4. File-Type Tests

Run the following for each supported type:

- PDF
- DOCX
- XLSX
- CSV
- MD
- TXT

Checklist for each file:

- Upload is accepted.
- Processing completes.
- Document row shows the correct file type indicator.
- Ask a file-specific question.
- Answer cites the correct source.
- Source Inspector shows useful location context.
- No raw stack traces or private text appear in errors.

Suggested file-specific questions:

- PDF: "What is the renewal review meeting date?"
- DOCX: "What are the payment terms and termination notice period?"
- XLSX: "Which renewals are at risk or unsure?"
- CSV: "Which account has the largest ARR?"
- MD/TXT: "What are the vendor review rules?"

## 5. XLSX / Chart Tests

Use the XLSX test file.

### Test 1

Question:

```text
Summarize this spreadsheet.
```

Expected:

- Source-backed answer.
- Mentions the available renewal and expense data.
- No unnecessary chart unless it genuinely helps.
- No invented rows, departments, accounts, dates, or amounts.

### Test 2

Question:

```text
Which renewals are at risk or unsure?
```

Expected:

- Mentions Acme Corp and Atlas Legal.
- Cites the Renewals sheet rows.
- Does not mention Novus Energy as at risk.
- No fabricated accounts.

### Test 3

Question:

```text
Which department has the largest Q4 expense?
```

Expected:

- Answer: Cloud.
- Cites the Expenses sheet rows.
- No chart required unless the model decides it helps.
- No fabricated departments.

### Test 4

Question:

```text
Show a chart of Q4 expense by department.
```

Expected:

- Inline chart appears.
- Chart values are:
  - Sales: 17000
  - Cloud: 42000
  - Marketing: 13000
- No invented departments.
- Citations around the chart still work.
- Source Inspector shows `Sheet: Expenses - Rows ...` or equivalent sheet/row context.

### Test 5

Ask this on a chartless PDF, DOCX, TXT, or MD file:

```text
Show me a chart from this document.
```

Expected:

- No fabricated chart.
- Response explains that chartable comparable numeric data is needed.
- No fake values.

## 6. Citation / Source Inspector Tests

- Citation pills open the correct source.
- Invalid citations do not appear as clickable pills.
- Spreadsheet sources show sheet/row labels, not `Page 1`, when sheet/row metadata is available.
- PDF sources show page labels when available.
- DOCX/MD/TXT/CSV sources show section, paragraph, line, or row labels when available.
- Source text is readable.
- Previous/Next source controls work when multiple sources are available.
- Closing the Source Inspector restores the Documents panel.
- Chart answer citations still open the Source Inspector.
- Chart JSON never appears as normal answer text.

## 7. Retry / Failure Tests

- Retry a failed document if one exists.
- Confirm the Retry button disables while the request is in flight.
- Confirm the old visible error clears or becomes calm during retry.
- Confirm the document ends as either ready or failed.
- Confirm the document does not remain stuck in processing.
- Click Process/Retry twice quickly.
- Expected: no duplicate processing, no duplicate chunks, and no runtime error.
- Upload an unsupported file type, such as `.pptx` or `.zip`.
- Expected: upload is rejected safely with a clear message.

Optional failure setup:

- Upload a deliberately invalid renamed file, such as a `.txt` file renamed to `.pdf`.
- Upload a binary file with a supported extension.
- Temporarily disable an API key in a local test environment only, then retry processing or asking a question.

## 8. Low-Evidence / Grounding Tests

Ask questions that should not be answerable from the uploaded files:

```text
What is the CEO's birthday?
```

```text
What is the company's 2030 revenue forecast?
```

```text
What acquisition did this company announce yesterday?
```

Expected:

- Answer refuses or qualifies if the evidence is not in the sources.
- No unsupported facts.
- No fake citations.
- Response says relevant evidence was not found when appropriate.
- If closest evidence is mentioned, it is clearly framed as incomplete or indirect.

Optional:

```text
Summarize the document in Spanish.
```

Expected:

- If translation/summarization is supported by the retrieved content, the answer should still cite source-backed claims.
- It should not add facts outside the documents.

## 9. UI Sanity Checks

- Landing page looks polished.
- Dashboard has no fake workspaces.
- Workspace composer is visible.
- Documents panel does not overflow.
- Source Inspector replaces the Documents panel cleanly.
- Chart does not break the answer layout.
- Light and dark mode are acceptable.
- No raw markdown markers such as `**bold**` appear in assistant answers.
- No old working-name copy is visible.
- Upload copy lists supported formats accurately.
- Document processing failures look calm, not catastrophic.
- Browser console has no runtime errors during core flows.

## 10. Known Issues Log

Use this section for manual findings.

| Date | Build/Commit | Issue | Steps To Reproduce | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

Severity guide:

- Critical: blocks signup/login, upload, processing, asking, or source inspection.
- High: incorrect answer, fabricated source, duplicate processing, or stuck document.
- Medium: broken layout, misleading status, recoverable API failure.
- Low: copy, spacing, or cosmetic issue.

## 11. Pass / Fail Table

| Area | Test | Expected | Result | Notes |
|---|---|---|---|---|
| Auth | Signup works | User can create an account and reach dashboard |  |  |
| Auth | Login works | User can sign in and reach dashboard |  |  |
| Dashboard | Create workspace | Workspace appears in real workspace list |  |  |
| Workspace | Open workspace | Workspace shell loads without console errors |  |  |
| Upload | Upload PDF | PDF appears in Documents panel |  |  |
| Upload | Upload DOCX | DOCX appears in Documents panel |  |  |
| Upload | Upload XLSX | XLSX appears in Documents panel |  |  |
| Upload | Upload CSV | CSV appears in Documents panel |  |  |
| Upload | Upload MD | MD appears in Documents panel |  |  |
| Upload | Upload TXT | TXT appears in Documents panel |  |  |
| Processing | Ready state | Uploaded file becomes ready or shows retryable failure |  |  |
| Processing | Retry failed document | Retry ends in ready or failed, not stuck processing |  |  |
| Processing | Double-click retry | No duplicate processing or duplicate chunks |  |  |
| Chat | Ask simple document question | Answer appears and cites source |  |  |
| Citations | Open citation | Source Inspector opens correct passage |  |  |
| Citations | Spreadsheet source | XLSX source shows sheet/row context |  |  |
| Charts | Ask Q4 chart question | Inline chart shows Sales 17000, Cloud 42000, Marketing 13000 |  |  |
| Charts | Chartless document | No fabricated chart appears |  |  |
| Grounding | Ask unsupported fact | Answer refuses or qualifies without fake citation |  |  |
| UI | Light/dark mode | Main surfaces remain readable and calm |  |  |
| UI | No legacy copy | No visible old working-name copy remains |  |  |
