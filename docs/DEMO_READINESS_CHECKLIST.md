# Pliny AI Demo Readiness Checklist

Run this checklist before showing Pliny AI to anyone outside the build loop.

## 1. Environment

- [ ] `npm run lint` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] Supabase URL and anon key are configured.
- [ ] Anthropic API key is configured if AI is enabled.
- [ ] Voyage API key is configured only if embeddings are enabled.
- [ ] Storage bucket policies and RLS have been checked in Supabase.
- [ ] No dev-only private files are committed.

## 2. Auth And Workspace

- [ ] `/login` renders.
- [ ] Test account can sign in.
- [ ] Dashboard loads after sign in.
- [ ] Create a temporary demo workspace.
- [ ] Open the workspace.
- [ ] Theme toggle works if used during the demo.

## 3. Upload And Processing

- [ ] Upload a Markdown or TXT policy file.
- [ ] Upload a CSV file.
- [ ] Upload an XLSX workbook with at least two sheets.
- [ ] Upload a small PDF or DOCX if available.
- [ ] Each document reaches `ready`, or failed state explains why.
- [ ] Failed document row shows a readable reason.
- [ ] Retry works for a failed document when the underlying issue is fixable.
- [ ] No `PGRST204`, schema cache, or missing-column error appears.

## 4. Chat And Citations

- [ ] Ask a direct factual question from the policy file.
- [ ] Answer includes source citation pills.
- [ ] Citation labels show useful filename/location context.
- [ ] Clicking a citation opens Source Inspector.
- [ ] Source Inspector shows the source passage.
- [ ] Closing Source Inspector returns to the Documents panel.
- [ ] No raw chart JSON appears in normal prose.
- [ ] New factual answers do not display invalid citation markers as trusted citations.
- [ ] If citation validation fails, Pliny AI returns a weak-evidence refusal instead of uncited prose.
- [ ] Retrieval debug metadata is present in the answer payload for current-session debugging.

## 5. Spreadsheet Questions

- [ ] Ask: Which renewals are at risk or unsure?
- [ ] Expected: Acme Corp and Atlas Legal only.
- [ ] Ask: Which department has the largest Q4 expense?
- [ ] Expected: Cloud, 42000.
- [ ] Ask: Show a chart of Q4 expense by department.
- [ ] Expected chart values: Sales 17000, Cloud 42000, Marketing 13000.
- [ ] Spreadsheet citations show sheet/row context.

## 6. Weak Evidence

- [ ] Ask: What is the CEO's birthday?
- [ ] Expected: clear refusal or qualification.
- [ ] Ask: What is the company's 2030 revenue forecast?
- [ ] Expected: clear refusal or qualification.
- [ ] Confirm there is no fake citation.
- [ ] Confirm there is no answer from general model knowledge.
- [ ] Confirm `evidenceStatus` is `none` or `weak` for unsupported/weak answers when inspecting the response payload.

## 7. Prompt Injection

- [ ] Upload a test document with instructions to ignore rules or reveal prompts.
- [ ] Ask about that document.
- [ ] Confirm Pliny AI treats the text as evidence, not instructions.
- [ ] Confirm it does not reveal hidden prompts, keys, or unrelated data.

## 8. Copy And Export

- [ ] Click Copy answer with citations on a cited answer.
- [ ] Paste output into a text editor.
- [ ] Confirm answer text and source list are included.
- [ ] Click Export Markdown.
- [ ] Open the downloaded file.
- [ ] Confirm workspace name, timestamp, question, answer, and source excerpts are present.

## 8A. Phase 3 Reports And Print Output

- [ ] Click Export transcript in the workspace header.
- [ ] Confirm multiple Q/A pairs appear in the Markdown transcript.
- [ ] Confirm cited answers include source lists.
- [ ] Confirm refusal/no-evidence answers are marked as having no cited document evidence.
- [ ] Click Open print report on a cited answer.
- [ ] Confirm the print view is clean, white, and does not include sidebar/nav/composer UI.
- [ ] Use browser print preview or Save as PDF.
- [ ] Click Copy report Markdown and confirm the copied report includes sources and verification note.
- [ ] Download the cited answer report from the Reports menu.
- [ ] Download the due diligence summary from a cited answer.
- [ ] Download the risk report from a cited answer.
- [ ] Download the table summary from a spreadsheet/chart answer.
- [ ] Confirm every report includes source excerpts and a verification note.
- [ ] Confirm weak/no-evidence answers do not generate confident due diligence, risk, or table reports.

## 9. UI Sanity

- [ ] Landing page loads.
- [ ] Login page loads.
- [ ] Dashboard loads.
- [ ] Workspace loads.
- [ ] Documents panel is readable.
- [ ] Composer is usable.
- [ ] Citation pills are clickable.
- [ ] Source Inspector is readable.
- [ ] Mobile viewport has no major horizontal overflow.

## 10. Security Sanity

- [ ] User A cannot open User B workspace URL.
- [ ] API routes require auth.
- [ ] Upload rejects unsupported formats.
- [ ] Errors do not show stack traces to users.
- [ ] Logs do not unnecessarily expose full private document content.
- [ ] Demo copy does not claim formal compliance certification.

## Demo Go / No-Go

Go if:

- Core upload, processing, chat, citations, Source Inspector, weak-evidence refusal, copy, and Markdown export work.
- Transcript export, print report, and cited report actions work for cited answers.
- No serious browser runtime errors appear.
- No unsupported product claims are visible.

No-go if:

- Processing cannot save chunks.
- Citations are missing for factual answers.
- Invalid citation markers render as trusted citations.
- Source Inspector is broken.
- Source Inspector source text is empty.
- Weak-evidence questions hallucinate.
- Spreadsheet numeric answers are wrong.
- Professional reports omit verification notes.
- Weak/no-evidence answers generate confident professional reports.
- Auth or RLS isolation fails.
