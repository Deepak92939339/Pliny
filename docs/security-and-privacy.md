# Security and privacy

Pliny is designed for private, owner-scoped document work with explicit external-processing boundaries. It is not a local-only system and it does not claim zero retention, complete identifier detection or regulatory compliance.

## Tenant and access boundaries

- Supabase Auth gates dashboard, workspace and API access.
- Collections and documents carry an owner ID; document chunks and chat messages are authorized through their owning collection/document relationships.
- PostgreSQL row-level security is enabled on exposed application tables. Owner policies use `auth.uid()` predicates, and update policies retain both `USING` and `WITH CHECK` conditions where updates are supported.
- Anonymous `SELECT`, `INSERT`, `UPDATE` and `DELETE` privileges are explicitly revoked from the private collections, documents, document chunks and chat tables.
- Retrieval functions are `SECURITY INVOKER`, use constrained search paths, accept explicit collection/document/user scope, and are not executable by anonymous callers.

Application ownership checks are defense in depth; RLS and database grants remain the data boundary.

## File storage

Original uploads live in a private Supabase Storage bucket. Object paths begin with the authenticated owner ID and collection ID, and Storage policies restrict authenticated access to the owner prefix. Upload validation occurs before an object is accepted; if the subsequent document-row insert fails, the exact uploaded object is removed as compensation.

Application-row deletion and orphaned-object cleanup are separate concerns. The maintenance tooling inventories database rows and Storage objects, requires two consistent orphan observations separated by a grace period, signs candidate manifests, validates exact paths and enforces a hard batch ceiling before deletion.

## Processing modes

Each workspace supplies a default for new documents. The selected mode and privacy policy version are captured on document creation and protected by a database immutability trigger.

| Mode | Embedding boundary | Answer boundary | Stored retrieval material |
| --- | --- | --- | --- |
| Standard | Voyage receives bounded original chunk text and the original/expanded query | Anthropic receives the original question plus bounded retrieved source envelopes, filenames and locations | Original chunks, provenance, lexical material and vectors |
| Privacy-minimised | Voyage receives provider-safe masked chunks and a transformed query | Anthropic receives a masked question, masked source text, document aliases and generic locations | Original owner-visible chunks plus separate provider-safe content, metadata, lexical material and vectors |

Privacy-minimised processing detects a bounded set of deterministic patterns and replaces matches with document-scoped HMAC-derived pseudonyms. The raw key remains server-only and reversible token mappings are not persisted. Repeated identifiers within the same document scope remain linkable without exposing the detected original to the provider payload.

Detection can miss names, organisations, addresses and other sensitive values that do not match a supported deterministic pattern. Masked content is still transmitted content.

## Provider payload and prompt controls

- Provider inputs are bounded by query length, source count, per-source character limits, embedding batch size and document chunk ceilings.
- Privacy payload builders scan for detected original identifiers before Voyage or Anthropic calls and reject unsafe payloads.
- Retrieved document text is encoded as untrusted evidence. It cannot redefine system rules, choose tools or authorize disclosure.
- When evidence is insufficient, Pliny returns a structured refusal without calling the answer provider.
- Citation repair, when eligible, receives only the same bounded context and a draft answer. Privacy-minimised repair reuses masked context.
- Provider request bodies and provider response bodies are not intentionally logged.

Voyage account-level zero-retention or training opt-out has not been independently verified for this deployment. No zero-retention claim is made. Anthropic and Voyage remain external processors under their account and contractual terms.

## Output and provenance controls

- Generated source markers are parsed and checked against the supplied source set.
- Multi-document requests require qualifying evidence and citations from every explicitly required document.
- Unsafe chart references or missing citations cause rejection, bounded repair or refusal.
- Safe Markdown is rendered through controlled React nodes rather than raw model HTML.
- The Source Inspector resolves a citation to the owner-visible original filename, location and excerpt.
- Privacy-minimised default exports use the masked question, answer, filename aliases, locations and excerpts.

These mechanisms improve reviewability but do not guarantee that every answer is correct or that every relevant passage was retrieved.

## Operational controls

- Upstash Redis sliding-window limits protect upload and processing routes. Production fails closed if the configured backing service is unavailable.
- Answer requests use persistent per-user daily request and estimated-cost checks stored in Supabase, plus minute and prompt-size limits.
- Safe logging records stages, normalized error categories and bounded identifiers rather than document text, prompt bodies, pseudonym mappings or secrets.
- Production browser assets and local Production bundles are scanned for server-only privacy/provider secret indicators.
- Storage reconciliation reports are sanitized and local artifacts are excluded from version control.

## Verified controls

- 59/59 privacy/database pgTAP assertions passed on each of two clean database rebuilds.
- Anonymous table access fails at the ACL layer with SQLSTATE `42501`; owner flows succeed and non-owner rows remain isolated.
- Production protected APIs return unauthenticated errors before processing, uploading or provider work.
- Deterministic tests cover provider-safe ingestion, query transformation, generation, citation repair, masked export and missing-projection refusal.
- Production browser-bundle scans found no pseudonym key name or provider secret indicators.

See [Architecture](./architecture.md), [Evaluation](./evaluation.md) and [Limitations](./limitations.md) for the wider evidence and boundaries.
