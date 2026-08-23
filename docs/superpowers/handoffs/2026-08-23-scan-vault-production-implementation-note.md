# Scan Vault Production Implementation Note

> Date: 2026-08-23
> Source/build: implemented and verified.
> Real Obsidian interaction: `INTERACTION NOT VERIFIED` because no Obsidian CDP listener was available.

## Outcome

Scan completion is now receipt-driven. Core Search, Embeddings, Summary, AI Tags, four Vault Discovery objectives, two Review Preparation objectives, and Publish each have explicit eligibility and completion boundaries. Missing configuration, provider/model/storage errors, missing receipts, or incomplete controller sessions fail the run; they cannot silently select another route or advance to Publish.

LM Studio uses its configured base URL and exact model through the OpenAI-compatible `/chat/completions` endpoint and the app-owned Node-side transport, bypassing renderer CORS without changing route. Keyless local servers receive only the non-secret `lm-studio-local` compatibility header required by `@ai-sdk/openai`; execution is not redirected to OpenAI. Local checks reached `google/gemma-4-26b-a4b-qat` and returned provider usage receipts; `text-embedding-nomic-embed-text-v1.5` returned a 768-dimensional vector.

## Mock to Production mapping

| Mock subtree | Production subtree | Production truth |
| --- | --- | --- |
| Scan hero/progress | `RunProgress` | run state, weighted progress, actual receipts |
| Five-stage menu | `RunProgress` inspector | real stages and explicit dismiss state |
| Three Index lanes | `BuildIndexParityWorkspace` | eligibility, indexed paths, embedding/LLM receipts |
| Document table | collapsed `pk-vi-build-inspect` | per-path states including `Not supported` |
| Discovery | `VaultDiscoveryParityWorkspace` | Mobius/Louvain/PageRank evidence and four Agent runs |
| Prepare Review | `PrepareReviewRunWorkspace` | review atoms, two Agent runs, validated package |
| Publish/Completed | `PublishRunWorkspace` / `Completed` | frozen package, readback, machine/provider receipts |

The old generic Index and AI render paths were replaced. Prepare Review is an independent stage. Publish no longer infers success from stage order or partial results. Unrendered legacy helpers remain for a later isolated retirement and were not extended.

## Mismatch closure

### STATE_MISMATCH

- AI queued/failed work can no longer render the run as Complete.
- Publish rejects enabled incomplete operations and prior partial stages.
- The duplicate top copy is now `Run finished` plus the real final headline.
- `Follow live` appears only while the run is live.

### DATA_CONTRACT_MISMATCH

- Added per-path Full-text, Embedding, and AI eligibility.
- Added `not-eligible` receipts; unsupported files are never `already-current`.
- Explicit Scan paths execute even without legacy SQLite pending flags.
- Discovery has one frozen evidence packet and receipt per objective.
- `maintenance-synthesis` and `file-proposals` execute and account independently.

### STRUCTURE_MISMATCH

- The stage menu is in the current-stage header, at the right.
- The full document table is collapsed by default and its rows are unmounted while closed.
- Stage selection, outside pointer, and Escape dismiss the menu; Escape restores trigger focus.
- Live elapsed time advances once per second between durable events, and an explicit activity row identifies slow local-model startup or the current document instead of leaving a static `0s` screen.

### HOST_ENVIRONMENT_MISMATCH

- Geometry stays scoped under `.peak-design-root` / `.peak-vault-intelligence-view`.
- Menu visibility no longer relies on Obsidian `:focus-within`, which caused the stuck popup.
- Fixed button sizing keeps the project-required Obsidian reset defense.

### VISUAL_MISMATCH

Mock geometry remains the reference. Only the incorrect menu placement, duplicate copy, unsupported state, and collapsed table behavior changed. Real-host pixel parity is not claimable without a CDP-locked viewport, DPR, theme, zoom, and state.

## Previously false empty-data behavior

- Unsupported `.sh`, `.txt`, and similar files now remain visible as `Not supported` and are excluded from eligible denominators.
- Missing embedding/LLM attempts now fail instead of fabricating `already-current`.
- A provider-required operation cannot complete with zero provider receipts.
- Relationship, semantic, Community, and hub/bridge objectives now execute against freshly recomputed deterministic graph/community evidence and require provider completion events.

## Strict routing

- Role slots resolve only their matching configuration.
- Conversation, Agent, Agent Fast, Copilot, Knowledge Index, Web Search, and Harness tiers do not borrow another role.
- Overrides require an exact `profileId + modelId`; stale bindings throw.
- A complete per-run Scan route is resolved before consulting any global role slot, so an explicitly configured Scan does not require a second hidden Agent/Copilot default.
- Per-document enrichment planning, pricing, Summary, and AI Tags all consume that frozen Scan route; the ETA planner no longer consults the global Agent slot behind the operation runtime.
- Auto routing does not choose the first remaining candidate when a configured tier misses.
- Backend resolution executes only `preferred`.
- Assistant storage/profile errors propagate instead of substituting Default.
- Embedding never borrows the Agent profile.

Intentional Harness escalation is separate from fallback: it may only move between independently owner-configured tiers when its policy explicitly enables escalation. A missing preferred tier still fails at controller construction.

## Verification

- Focused strict-route, LM Studio, Scan domain/runtime, UI parity, assistant, embedding, router, tier, and backend tests passed.
- `npm run build` passed including CSS, production bundle syntax, worker, and simulator boundaries.
- Final full suite: 516 passed / 5 failed. Every task-owned test passed. The five remaining failures pre-exist in unrelated dirty-worktree areas: code-block theme live updates, Composer frontmatter tag chips, generated-output coverage for two unrelated writers, AI Control Center inline-prompt governance, and a planned-requirements text assertion.
- LM Studio advertised both selected local models; direct Gemma and embedding requests succeeded.
- No CDP listener existed. Real clicks, computed geometry, plugin reload, and an end-to-end 509-file Scan remain `INTERACTION NOT VERIFIED`.

## Remaining mismatch

The remaining acceptance gap is real-host interaction and end-to-end execution evidence. Start Obsidian with a loopback CDP listener, verify one small selected Markdown scope, then run the full Vault.
