# October 3 QA repairs — local candidate, not deployed

## Implemented

- Reproduced the deletion failure before editing: an actual pointer click closed the synthetic confirmation and emitted zero DELETE requests. The outside-mousedown row-menu dismissal unmounted its portaled confirmation.
- DocumentsSurface now owns one confirmation outside the conditional desktop/mobile menus. Opening it closes the menu without destroying the dialog. Cancel/Escape restore focus; request failures remain visible; 204 closes and refreshes. Stable fallback focus and selected-details cleanup are retained.
- Desktop document details use a lower layer than the header/account menus. Shared modal overlays/popups are above workspace drawers/details.
- Export transcript remains in the desktop header but moves into the account menu at <=640px. Small-screen mode text can truncate without shrinking the brand/navigation.
- Embedding failures now provide distinct sanitized copy for missing/invalid configuration, credentials, provider credit, rate limiting and temporary failures. Unknown errors direct an administrator to processing logs. No raw provider body, secret or document text is exposed. Runtime providers, dimensions, retrieval/refusal policies and budgets are unchanged.
- Added `test:workspace-browser`: requires a local dev server and externally available Playwright/Chrome. It rejects non-local destinations, uses synthetic fixtures and intercepts API requests. No application dependency added.

## Verification

14 local browser checks passed: rendering; Cancel/Escape and focus; pointer request emission with retained 403 error; keyboard retry/204; ready/processing/failed documents; menus with empty/selected details; 375/390/768px header/overflow/export reachability; mobile card deletion; no page errors. Responses are mocked: this does not establish database deletion or persistence after a real refresh.

Typecheck, lint (0 errors, 2 existing unused-variable warnings), full 26-script deterministic chain, UI review regressions, 36-case provider-free release evaluation, production build and browser privacy-bundle scan passed. The bundle scan used a synthetic credential marker and checked forbidden server identifiers; it is not a comparison against the actual Production key. Build retains an existing malformed generated CSS utility warning; it is not a new repair regression. No hosted acceptance or live provider request occurred (0).

Browser snapshots: `artifacts/codex-repair-20261003/`. These are ignored synthetic local artifacts, not hosted Production evidence.

## Still unresolved: Production embeddings

The read-only Vercel runtime-log query for the failed ingestion window returned `400 ExceedsBillingLimitError`. It yielded no logs. This is a connector/log-query failure, not a provider diagnosis or evidence of an empty log.

No Production environment values, API keys, billing, auth users, database rows, commits, pushes, merges or deployments were changed. Do not call the underlying embedding failure fixed.

## Owner steps

1. Open Vercel project **pliny → Logs**, select **Production**, and filter `/api/process-document`. Look for `chunk embeddings failed; aborting document processing`. Capture only the sanitized `error.name`, `error.status`, `error.code` and timestamp; never copy keys, cookies or authorization headers. The historical run failed around October 2, 08:57 UTC; if history is unavailable, capture a fresh bounded one-file attempt after the candidate is reviewed/deployed. Do not purchase a plan merely to obtain this old query.
2. In **pliny → Settings → Environment Variables**, inspect the **Production** scope. For the intended OpenRouter embeddings route, check `EMBEDDINGS_ENABLED=true`, `EMBEDDINGS_PROVIDER=openrouter`, `EMBEDDING_MODEL=voyageai/voyage-4`, `EMBEDDING_DIMENSIONS=1024`, and that `OPENROUTER_EMBEDDINGS_API_KEY` is populated. This is the app's intended contract, not proof of current provider availability. The answer-generation key is separate. Never paste either key into chat.
3. In the OpenRouter account that owns the embeddings key, check available credit, whether the key is active, its spending limit and its failed-request activity. A provider 401/403 calls for credentials/permissions investigation; 402 for credit/limits; 429 for rate limits; rejected requests or vector-shape errors need model/API contract inspection. Do not rotate keys, change models or disable embeddings without identifying the failure. Environment changes require a new deployment to take effect.
4. Verify both ordinary QA users by signing in separately at `https://pliny.vercel.app/login`. Use the existing Production Supabase project, not the isolated Preview project. If the second identity is invalid, use **Authentication → Users → Add user** to create one confirmed QA identity with a password you save privately, or use the supported administrator password-update method for that existing QA identity. Do not modify auth tables or provide an agent with service-role credentials. Keep public signup disabled if desired; admin provisioning does not require it.
5. Authorize publication of this candidate separately. Do not rerun the whole QA exercise against the unchanged live build expecting these local repairs to exist there.
6. After publication and the provider check, authorize a bounded fresh synthetic smoke: one CSV reaches Ready, one known fact with an entailing citation, one unsupported-question refusal, one confirmed delete and refresh. Stop on repeated failures. Only then resume remaining formats/questions/exports/privacy/cross-user cases within an explicitly approved combined-provider-call/spend allowance.

## QA evidence corrections for the next run

Keep the original ground truth locked. Generate report and coverage totals from one canonical matrix; split twelve questions and four templates into separate rows. Capture sanitized actual interaction/network records and unique screenshots with route, viewport, action and observed state. Include the requested English HTML report and a concise decision summary, not private chain-of-thought. Rebuild the manifest after packaging and verify the ZIP itself. Missing files, pending receipts and unexecuted cases cannot pass. Report actual spend/calls as unknown if not observable; account for internal retries. Shrink the original 104,822-byte scan fixture to fit the authorized 100KB bound or request a small explicit allowance.
