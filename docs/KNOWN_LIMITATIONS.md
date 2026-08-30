# Pliny AI Known Limitations

This document keeps Pliny AI honest. It should be reviewed before demos, pilot proposals, and deployment copy.

## Product Status

- Pliny AI is a working MVP/prototype for private document intelligence.
- It is suitable for controlled demos with demo-safe data.
- It may be suitable for limited paid pilots only after environment, RLS, retrieval, processing, and manual QA checks pass.
- It is not a replacement for professional legal, financial, audit, medical, or compliance judgment.

## Compliance And Security Limits

- Pliny AI is not currently certified for SOC 2.
- Pliny AI is not currently certified for HIPAA.
- Pliny AI does not currently provide a formal enterprise compliance program.
- Team roles, admin controls, audit logs, and SSO/SAML are not implemented yet.
- Security posture depends on correct Supabase RLS, Storage, environment, and deployment configuration.
- Logs and monitoring should be reviewed before handling sensitive pilot data.

## AI And Citation Limits

- AI can make mistakes.
- Citations reduce risk but do not eliminate it.
- A cited passage may still be incomplete, indirect, or too broad.
- Pliny AI does not currently perform quote-level citation confidence scoring.
- Pliny AI does not currently guarantee that every relevant document was retrieved.
- Weak-evidence refusal is implemented, but retrieval and citation behavior still require manual QA.

## Retrieval Limits

- Keyword retrieval is available.
- Semantic retrieval is optional and depends on `EMBEDDINGS_ENABLED=true` plus a valid Voyage API key.
- Hybrid retrieval exists when embeddings are enabled.
- There is no learned reranker yet.
- There is no formal query rewriting yet.
- Retrieval scores are not currently exposed in the UI.
- Very broad questions may need narrower phrasing.

## File Format Limits

Currently supported formats:

- PDF
- DOCX
- XLSX/XLS
- CSV
- Markdown/MD
- TXT

Not currently supported:

- PPTX
- Code repositories as structured code intelligence
- IPYNB notebooks
- Email inbox ingestion
- Google Drive import
- Arbitrary binary or media files

## OCR Limits

- OCR fallback can help with scanned PDFs.
- OCR can be slower and less accurate than text-based PDFs.
- OCR page limits may apply.
- Poor scans, handwriting, rotated pages, and low contrast can reduce accuracy.

## Spreadsheet Limits

- Sheet names, headers, and row ranges are preserved for XLS/XLSX/CSV.
- Formulas are generally flattened to displayed or raw values.
- Exact cell-level citation is limited.
- Merged cells and complex financial-model structures are not fully modeled.
- Spreadsheet charts are generated only when retrieved data contains comparable numeric values.
- Large or complex workbooks need additional QA.

## Processing Limits

- Processing is currently API-route based, not a full background queue.
- Very large files may hit parser, runtime, or provider limits.
- Duplicate upload detection is not implemented.
- Document versioning is not implemented.
- Processing failure details are user-safe, but detailed processing logs are not exposed in the UI.

## Export Limits

- Copy answer with citations is available.
- Markdown answer export is available.
- Full visible chat transcript export is available as Markdown.
- HTML print view is available for selected answer reports.
- Browser print-to-PDF is available through the print view.
- Native PDF export is not implemented yet.
- Native DOCX export is not implemented yet.
- Downloadable report packages are not implemented yet.
- Report templates are generated from current answer and citation payloads. They require human review and should not be treated as legal, financial, audit, medical, or compliance advice.

## Collaboration And Billing Limits

- Team workspaces are not implemented yet.
- Role-based permissions are not implemented yet.
- Billing is not implemented yet.
- Workspace audit logs are not implemented yet.
- Admin reporting is not implemented yet.

## Integration Limits

- Webhook export is not implemented yet.
- n8n bridge is not implemented yet.
- Slack, Teams, Telegram, or email alerts are not implemented yet.
- Google Drive import is not implemented yet.

## Recommended Safe Demo Framing

Good:

- "Pliny AI helps you ask questions of uploaded documents and inspect cited source passages."
- "The product is designed around source verification."
- "This is a controlled MVP demo with known limitations."

Avoid:

- Claims of formal compliance certification.
- Claims that answers are always correct.
- Claims that every document type is supported.
- Claims that citations eliminate all review risk.
