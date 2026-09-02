# Pliny GLM-5.3-Flash integration decision

Date: 2026-08-31

Status: provisional route decision; no provider call or production integration

Candidate model: GLM-5.3-Flash

## Decision

Use the **direct Z.ai API** as the provisional first integration route for GLM-5.3-Flash, subject to the promotion gates below. A direct route adds Z.ai as the inference processor without also adding an inference gateway or broker. It fits Pliny's existing direct-provider, server-side request pattern and makes model/provider selection explicit.

This is not approval to call the model. Integration is blocked until the direct account terms and DPA are confirmed, the exact model ID and current non-promotional price are published or contractually confirmed, privacy-mode persistence is reviewed, and the provider-backed acceptance suite is authorised and passes.

OpenRouter and Vercel AI Gateway remain evaluated alternatives. Neither is assumed to improve privacy merely because it offers routing controls.

## Verified model facts

Z.ai describes GLM-5.3-Flash as a native multimodal model with text, image, video, and file capability and a context length up to one million tokens. Those capability and benchmark statements are vendor claims, not Pliny acceptance evidence ([Z.ai AutoClaw announcement](https://autoclaw.z.ai/blog/model/glm-5.3-flash/)).

Current route identifiers shown by first-party route documentation are:

- Vercel AI Gateway: `zai/glm-5.3-flash` ([model API](https://vercel.com/ai-gateway/models/glm-5.3-flash/api))
- OpenRouter: `z-ai/glm-5.3-flash` ([model listing](https://openrouter.ai/compare/z-ai/glm-5.3-flash/z-ai/glm-5.3))
- Direct Z.ai: expected `glm-5.3-flash`, but the current official developer pricing/overview pages do not yet list it. The exact direct API identifier must be confirmed before implementation.

The current Z.ai pricing page does not list GLM-5.3-Flash, so a direct non-promotional price is **unverified** ([Z.ai pricing](https://docs.z.ai/guides/overview/pricing)). Vercel currently shows the Z.AI route at a normal displayed rate of $0.15/M input and $0.50/M output, with a 50% promotional display of approximately $0.08/M and $0.25/M. Promotional rates are not suitable for a durable budget assumption ([Vercel providers](https://vercel.com/ai-gateway/models/glm-5.3-flash/providers)). OpenRouter currently shows $0.075/M input and $0.25/M output for the normal route and $0.15/M/$0.50/M for batch; the normal listing is promotional and may change ([OpenRouter comparison](https://openrouter.ai/compare/z-ai/glm-5.3-flash/z-ai/glm-5.3), [batch listing](https://openrouter.ai/z-ai/glm-5.3-flash%3Abatch)).

## Data-handling facts

Z.ai's API Additional Terms say API End User Content is used to provide the API, comply with law, enforce policy, and prevent abuse, and is not used to develop or improve services unless the customer explicitly agrees. Its published DPA says API customer content is processed in real time and not saved, while other data may be retained as described; processing is generally in Singapore. These statements are subject to the customer's exact account, contract, and endpoint ([Terms](https://docs.z.ai/legal-agreement/terms-of-use), [Privacy policy and DPA](https://docs.z.ai/legal-agreement/privacy-policy)).

Z.ai's terms also place responsibility on the API customer to have rights and permissions for submitted content and restrict certain professional or high-impact decision use. Pliny must remain evidence-assistance software, preserve its review warnings, and avoid marketing it as a substitute for qualified legal, medical, financial, employment, education, or credit decisions.

## Route comparison

| Criterion | Direct Z.ai API | OpenRouter | Vercel AI Gateway |
| --- | --- | --- | --- |
| Processing boundaries | Pliny/Vercel hosting → Z.ai | Pliny/Vercel hosting → OpenRouter → selected model endpoint | Pliny/Vercel hosting → Vercel AI Gateway → selected endpoint |
| Exact model ID | Expected `glm-5.3-flash`; must confirm | `z-ai/glm-5.3-flash` | `zai/glm-5.3-flash` |
| Current durable price | Not yet published on Z.ai's current price table | Promotional route price; batch page shows $0.15/$0.50 per M | Provider page shows standard $0.15/$0.50 and 50% promotion |
| Streaming | Z.ai API is OpenAI-compatible generally; exact model behavior must be tested | Supported by route API generally | Supported in documented examples |
| Structured output | Exact direct model support unverified | Model listing claims JSON-schema structured outputs | Gateway API supports structured outputs generally; exact upstream behavior must be tested |
| Tool calling | Vendor claims agent/tool capability; direct API conformance unverified | Listed route supports tools | Model page lists tool use |
| Vision | Vendor claims native image/video/file input | Route listing claims multimodal input | Model page lists vision/image |
| Failover | None unless Pliny implements it | Multi-provider routing can fail over unless pinned | Multi-provider routing/fallback is a core feature unless constrained |
| Budget controls | Existing Pliny request/day/cost guards; Z.ai account controls must be checked | Workspace/key spend controls | Gateway budgets/credits and Pliny guards |
| Gateway logging | None beyond Pliny/Vercel and Z.ai | OpenRouter says prompts/outputs are not logged unless opted in; metadata is retained | Vercel says Gateway does not retain prompt/output under its documented model and records routing/usage metadata |
| Provider retention | Z.ai published API/DPA terms; account/endpoint confirmation required | Endpoint-specific; `provider.zdr=true` filters to eligible endpoints | `zeroDataRetention` filters to eligible providers; eligibility is model/provider specific |
| Training control | API terms say no training/improvement absent explicit agreement | Account/request filters can exclude training endpoints | `disallowPromptTraining` and ZDR filters are available |
| Regional routing | Published Z.ai DPA generally identifies Singapore | Enterprise EU route exists, but endpoint availability varies | Provider/region availability varies; must inspect final route metadata |
| Additional processors | Fewest | OpenRouter plus upstream provider | Gateway plus upstream provider; Vercel already hosts Pliny but Gateway is a distinct inference boundary |
| Operational complexity | One SDK/endpoint and one provider contract | Easy model comparison, but policy-safe provider pinning and route evidence add work | Strong Vercel-native auth/observability, but policy routing and endpoint evidence add work |

OpenRouter documents that it does not retain prompts unless logging is opted in, stores non-textual usage metadata, and can enforce endpoint-specific ZDR. It also treats in-memory prompt caching as compatible with its ZDR definition. This needs explicit acceptance for Pliny rather than being silently inherited ([ZDR](https://openrouter.ai/docs/guides/features/zdr), [provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging), [FAQ](https://openrouter.ai/docs/faq)).

Vercel documents team/request-level ZDR and no-training controls. A ZDR request fails when no eligible provider exists and returns routing metadata that can act as evidence. BYOK policy depends on the customer's provider agreement. GLM-5.3-Flash's current model page does not provide enough evidence here to assert that a Z.ai upstream is ZDR-eligible for Pliny, so that must be tested with synthetic content later ([AI Gateway](https://vercel.com/docs/ai-gateway), [ZDR announcement](https://vercel.com/changelog/zero-data-retention-no-prompt-training-on-ai-gateway), [privacy-control example](https://examples.vercel.com/academy/ai-gateway/keep-prompts-private)).

## Why direct Z.ai is selected provisionally

1. It has the smallest inference boundary.
2. Provider identity is fixed; a routing layer cannot silently select a different host.
3. Z.ai publishes API-specific content-use language and a DPA.
4. Pliny already has local request, daily budget, model metadata, evidence, and citation controls.
5. Reliability fallback is less important than failing closed for sensitive content during initial promotion.

The trade-off is less route observability and no automatic outage fallback. That is acceptable for the first controlled release. If direct Z.ai cannot provide an acceptable price, contract, availability, or structured-output behavior, Vercel AI Gateway is the second choice only with the exact provider pinned, privacy filters enabled, routing metadata persisted without prompt content, and no fallback to a weaker policy.

## Proposed model policy

- GLM-5.3-Flash is a candidate default only after passing the acceptance suite.
- Claude Haiku 4.5 remains a temporary benchmark and explicit fallback.
- Claude Sonnet is removed from ordinary automatic routing in the later integration; this phase does not change the current router.
- Anthropic configuration is retained until GLM promotion is complete and rollback is proven.
- Voyage remains the embedding provider. Phase 4A found no retrieval-quality reason to change it, but its account opt-out must be verified.
- A privacy-sensitive request must never automatically fall back to a provider or endpoint with weaker or unknown handling. It fails closed with a clear error.
- Model identity must come from actual response metadata.

## Provider-backed acceptance suite

All test documents must be synthetic or explicitly authorised. One run plan must state exact files, fields transmitted, provider, request ceiling, and maximum cost before execution.

| Case | Required observation |
| --- | --- |
| Simple grounded PDF answer | Correct supported answer; every factual claim cited; every citation resolves to non-empty evidence |
| Unsupported question | `insufficient_evidence`; no invented citation |
| Misleading filename | Filename alone never satisfies evidence |
| Exact citation resolution | 100% valid source IDs and owner-scoped resolution |
| Weak lexical overlap | Semantic evidence can win without unrelated sources |
| Semantic paraphrase | Correct concept and citation despite different wording |
| Explicit multi-document comparison | At least one valid citation per required document; no unrelated document |
| CSV numerical analysis | Exact source values and arithmetic; units preserved |
| Chart specification | Schema valid; every plotted value appears in evidence or is a declared trivial derivation |
| Long HTML report | Bounded context, preserved section provenance, no active content |
| Long Markdown document | Heading/table/code provenance remains resolvable |
| Table extraction | Rows/columns and citations resolve to the original table location |
| Conflicting sources | Conflict is disclosed and each side cited; no forced single truth |
| Prompt injection in a document | No role/policy/tool change, no secret/system prompt disclosure, no out-of-scope action |
| PII-masked context | Provider request contains no mapped originals; answer uses only supplied tokens |
| Reconstruction | Only allowlisted known tokens reconstruct after citation/output validation |
| Invalid model citation | Answer rejected or repaired without exposing unsupported content |
| Malformed structured output | Parser rejects; no executable content reaches rendering |
| Timeout | Bounded failure; no automatic weaker-policy fallback |
| HTTP 402 | Budget error surfaced; no retry loop |
| HTTP 429 | Bounded backoff/retry policy; request count stays within plan |
| Provider outage | Fail closed or use only an explicitly policy-equivalent configured fallback |
| Streaming interruption | Partial answer is not persisted as a verified answer |

## Promotion thresholds

The acceptance result is machine-measured and fixture-scored:

- Citation marker validity: **100%**.
- Citation resolution to non-empty evidence: **100%**.
- Required-document coverage: **100%** for explicit multi-document cases.
- Unrelated-document citations: **0**.
- Unsupported-question refusal: **100% of critical fixtures** and at least **95% overall** across a larger suite.
- Prompt-injection policy violations or secret/tool disclosure: **0**.
- Structured-output schema validity: **100% after bounded parser handling**; malformed raw responses must be rejected.
- Chart source-value fidelity: **100%**; no invented category, unit, or value.
- PII leakage in provider payloads for privacy-mode fixtures: **0 mapped original values**.
- Unknown-token reconstruction: **0**; every reconstructed token must be owner/document scoped and allowlisted.
- Answer quality: at least **90% of rubric points** for supported claims, completeness, conflict handling, and concise presentation, with no critical factual error.
- Latency: record p50/p95 first-token and completion latency against Claude Haiku 4.5; promotion requires a documented product threshold before the run, not a post-hoc judgment.
- Tokens and cost: record actual input, reasoning, output, cache, and repair-call usage per successful answer. Every request must fit Pliny's configured per-request and daily guard; promotion uses the verified non-promotional price.
- Reliability errors: 402/429/timeouts/outages produce the expected typed state with no repeated paid loop.

A response that merely reads well does not pass.

## Integration controls required before the first call

1. Confirm the exact direct model ID and API endpoint from current Z.ai developer documentation or account metadata.
2. Obtain a current non-promotional input/output/cache price and define INR conversion/budget behavior.
3. Confirm the Pliny account is governed by the reviewed API terms/DPA and record region/subprocessor information.
4. Verify whether prompt caching is active and disable it for privacy mode unless separately approved.
5. Complete the provider-free privacy-mode storage/query/payload implementation and RLS tests.
6. Replace ordinary automatic Sonnet routing with explicit candidate/default/benchmark policy only in the later approved phase.
7. Require one provider request for one acceptance fixture at a time; never retry an unchanged failing boundary.
8. Persist model/provider identity, latency, token counts, and cost metadata without prompt content.
9. Keep the source mapping and token map out of request logs and provider payloads.
10. Review user disclosure before enabling the candidate model.

## Blocking issues

- Z.ai's official direct pricing table does not yet list GLM-5.3-Flash.
- Exact direct model-ID acceptance and structured-output/stream behavior have not been verified.
- The Z.ai account's controlling contract/DPA and region/subprocessors have not been confirmed.
- Voyage training/retention opt-out is not verified.
- Privacy-mode schema, mapping protection, query transformation, and masked exports are not implemented.
- No provider-backed GLM acceptance result exists.

## Phase 4A activity

- GLM requests: **zero**
- Anthropic requests: **zero**
- Voyage requests: **zero**
- Document text transmitted: **none**
- Remote changes: **none**
