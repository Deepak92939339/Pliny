# Current limitations

Pliny is a production-deployed portfolio system with deliberately narrow guarantees. These limits are part of the product description, not footnotes to it.

## Privacy and provider boundaries

- Deterministic identifier detection can miss names, organisations, addresses and sensitive values outside its supported patterns.
- Standard processing sends bounded original document text and questions to configured external processors.
- Privacy-minimised processing sends masked content, not no content. A detector miss can therefore cross the external-processing boundary.
- Voyage account-level zero-retention and training opt-out status remain unverified for this deployment.
- Privacy-minimised processing is not local-only processing and is not a compliance certification.

## Extraction and retrieval

- Poor scans can exceed the bounded OCR page limit or produce inaccurate recovered text.
- Complex DOCX layout, comments and tracked changes may not be represented completely.
- Large or unusually structured spreadsheets can exceed sheet, row, column or cell limits.
- Hybrid retrieval can miss relevant evidence; broad fallback is intentionally insufficient for answer generation.
- The deterministic acronym/title equivalence layer is deliberately small. It currently covers proven concepts rather than attempting open-ended synonym rewriting.
- Citations prove which retrieved passage supported an answer; they do not prove the passage itself is complete or correct.

## Product scope

- GLM is planned but not integrated. Anthropic is the current answer-generation provider and Voyage is the current embedding provider.
- Team roles, shared workspaces, enterprise SSO and billing are not implemented.
- Presentations, legacy `.xls`, macro-enabled spreadsheets, notebooks and arbitrary code files are not supported.
- Provider-backed answer-quality evaluation remains limited compared with the deterministic suite.
- Storage reconciliation is an operator-run guarded workflow, not automatic background deletion.

## Dependency posture

The current Production dependency audit reports one moderate transitive `@xmldom/xmldom` advisory (`GHSA-6gmq-8vp8-gcm6`). It remains open pending separately scoped dependency remediation.

See [Security & Privacy](./security-and-privacy.md) for implemented controls and [Evaluation](./evaluation.md) for the evidence behind current claims.
