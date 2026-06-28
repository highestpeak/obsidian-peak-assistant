# Architecture Scorecard

This scorecard tracks whether the modernization is making Peak Assistant more elegant, modular, testable, and controllable. It is not a vanity metric. Scores must cite code, tests, old-path deletion, or explicit non-improvement evidence.

The scorecard is intentionally more detailed than a normal progress tracker. The user goal is not only to ship changes, but to understand and control the codebase.

## Scoring Rules

Use 0-100. Avoid false precision; increments of 5 or 10 are usually enough.

Use `N/A` only when the task truly does not touch that concern. Do not use `N/A` to avoid a low score.

Pure diagnostic tasks, such as T0 Boundary Baseline, should score **confidence** and **coverage** separately. They should not inflate implementation dimensions before implementation exists.

## Impact Contract Scoring Gate

For any task described as a major wave, bulk wave, closure wave, deletion wave, or boundary wave, the scorecard must check the handoff's Impact Contract before assigning a high overall score.

High scores require both:

- implementation quality: build/tests/guards pass, no unrelated scope, no new hidden runtime ownership;
- implementation impact: the primary metric target and required tracks materially moved.

If a task is safe but small, record it as **Accepted as minor cleanup**. Do not let a minor cleanup raise the modernization ledger as if it were a major wave.

Examples of material impact:

- `service -> ui` reverse edges drop close to the target;
- `service -> app` leaks or `AppContext.getInstance` leaks drop materially;
- old runtime owners are deleted, not merely wrapped;
- source LOC drops because old paths are truly retired;
- module-level mutable runtime bindings are removed or centralized.

Examples that do **not** prove major-wave impact by themselves:

- `npm run build` passes;
- a few imports move but the main boundary remains;
- a scan was performed but high-impact candidates were skipped;
- a type-only cleanup lands without deleting old runtime ownership;
- docs get longer without making the owner able to read/debug the new path.

## Core Dimensions

These 12 dimensions are the default modernization score.

| Code | Dimension | Weight | Question |
| --- | --- | ---: | --- |
| AC | Architecture clarity | 10 | Can a new engineer trace entry -> runtime -> artifact -> surface? |
| CS | Capability semantics | 6 | Is the product capability named and modeled by user intent, not implementation leftovers? |
| DD | Dependency direction | 8 | Do dependencies point through the intended layers, ports, and adapters? |
| MC | Modularity / cohesion | 8 | Does each module own one coherent responsibility with a low change radius? |
| SI | Side-effect isolation | 8 | Are Obsidian, SQLite, Vault, provider, UI, and command side effects behind explicit boundaries? |
| SR | Single runtime path | 10 | Does the capability have one active business path instead of old and new paths co-owning behavior? |
| SO | State ownership clarity | 8 | Is runtime state truth owned by one place, with UI as projection? |
| OT | Observability / trace | 7 | Can a run be inspected through events, artifacts, logs, traces, or reviewable outputs? |
| TF | Testability / fake-port readiness | 10 | Can the behavior be proven with fake ports, fixtures, contract tests, or golden traces? |
| OD | Old-path deletion | 10 | Was old logic deleted, emptied, or reduced to thin forwarding with evidence? |
| CR | Change radius | 7 | Did this reduce the number of files/concepts a future change must touch? |
| OC | Owner comprehension | 8 | Can the user explain where to read, debug, test, and extend this capability? |

Weights sum to 100.

## Detailed Rubric

| Dimension | 0-30 | 40-60 | 70-85 | 90-100 |
| --- | --- | --- | --- | --- |
| Architecture clarity | Flow is implicit, scattered, or only known by reading UI/service internals | Main path can be traced but ownership is mixed | Runtime path and key contracts are clear for one capability | New engineer can trace entry -> run -> artifact -> surface quickly |
| Capability semantics | Capability is named after a UI surface, legacy service, or technical mechanism | Product meaning exists but implementation terms leak into the model | Capability has a clear user intent, inputs, outputs, permissions, and cost boundary | Capability contract is stable enough to guide UI, runtime, tests, and docs |
| Dependency direction | Layers import each other freely; service reaches into UI/app concrete details | Some boundaries exist but are bypassed for convenience | New/changed code follows app -> service -> core/ports -> adapters direction | Boundary is enforced by tests, guards, or import checks |
| Modularity / cohesion | Large services own unrelated responsibilities and direct dependencies | Some modules are split, but responsibility remains mixed | Changed area has focused modules and clear ownership | Small capability slices can evolve independently with predictable impact |
| Side-effect isolation | Business logic directly touches Obsidian app, Notice, modal, SQLite, Vault, provider SDK, or UI store | Side effects are partly wrapped but not consistently fakeable | Side effects are accessed through ports/adapters for the changed area | Side effects are isolated, fakeable, and observable in tests |
| Single runtime path | Old and new implementations both own behavior | Facade exists but old logic remains meaningful | Old path is deleted or thin forwarding for one capability | All migrated entries converge on one runtime path and old ownership is impossible |
| State ownership clarity | UI store / service / DB all act as truth | Truth can be inferred but is not enforced | One state owner exists; UI consumes projections | State lifecycle is explicit, tested, traceable, and documented |
| Observability / trace | Failure requires manual guessing through UI behavior | Some logs or events exist, but they are partial or not linked to artifacts | Run emits inspectable events/artifacts/errors for the changed path | Golden trace or equivalent lets reviewer replay and compare behavior |
| Testability / fake-port readiness | Requires Obsidian/manual testing for basic confidence | Unit tests exist but real boundaries are hard to fake | Fake ports or fixtures prove the changed behavior | Conformance/golden tests cover backend, ports, events, artifacts, and errors |
| Old-path deletion | Nothing deleted; abstractions added on top | Some references removed, old behavior still live | Old path deleted or downgraded to thin forwarding | Deletion gate is enforced by tests, import guards, or explicit failing checks |
| Change radius | Future changes still require touching many unrelated services/stores/screens | Some change surface is lower, but hidden coupling remains | Future changes have a clear start file and limited expected blast radius | Change radius is small, documented, and protected by contracts/tests |
| Owner comprehension | User cannot explain the path without re-reading the whole diff | User can explain the idea but not the debug/test entry points | User can explain entry, state truth, old path, and debug path | User can confidently decide next optimization without agent interpretation |

## Optional Task Dimensions

Use these only when relevant. They do not change the default weighted score unless the Owner Review Packet says so.

| Code | Dimension | Use when |
| --- | --- | --- |
| UX | UI surface stability | UI/view/store behavior changed |
| BC | Backward compatibility / migration safety | Settings, SQLite schema, Vault files, history, or persisted data changed |
| PC | Performance / cost containment | Search, indexing, LLM calls, streaming, or background jobs changed |
| SC | Security / permission boundary | Tools, commands, MCP, secrets, Vault writes, or destructive actions changed |
| DX | Developer experience | Scripts, tests, build, local workflow, or diagnostics changed |
| DOC | Documentation / handoff quality | The task mainly updates docs or creates a handoff/report |

## Overall Elegance Formula

Default weighted formula:

```text
Overall =
  AC * 0.10 +
  CS * 0.06 +
  DD * 0.08 +
  MC * 0.08 +
  SI * 0.08 +
  SR * 0.10 +
  SO * 0.08 +
  OT * 0.07 +
  TF * 0.10 +
  OD * 0.10 +
  CR * 0.07 +
  OC * 0.08
```

For easier reading, also report four grouped indices:

| Group | Dimensions | Meaning |
| --- | --- | --- |
| Control Index | AC, OT, OC | Can the user understand and debug the system? |
| Boundary Index | DD, MC, SI, CR | Are module boundaries and side effects cleaner? |
| Runtime Truth Index | SR, SO, CS | Is the capability modeled and executed through one truthful path? |
| Verification Index | TF, OD | Can the change be proven and old logic removed? |

## Diagnostic Task Mode

For T0 Boundary Baseline and other read-only or mostly diagnostic tasks, do not pretend the architecture improved. Use this instead:

| Dimension | Score |
| --- | ---: |
| Baseline coverage | 0-100 |
| Evidence quality | 0-100 |
| Reproducibility | 0-100 |
| Actionability for next task | 0-100 |
| User comprehension value | 0-100 |

Then record "implementation dimensions: baseline only".

## Progress Ledger

Use the ledger for checkpoints. Detailed per-dimension scores belong in the Owner Review Packet.

| Date | Task | Commit | Control | Boundary | Runtime truth | Verification | Overall | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-06-12 | Pre-refactor checkpoint | `4fa5bd2` | baseline | baseline | baseline | baseline | baseline | Tagged as `pre-large-refactor-2026-06-11`. No score yet; scoring starts with T0. |
| 2026-06-12 | Refactor ops playbook | `1e4d952` | N/A | N/A | N/A | N/A | N/A | Operating docs only. Scorecard applies to implementation tasks starting at T0. |
| 2026-06-12 | T0 Boundary Baseline | `9850eef` | 85 diagnostic | 85 diagnostic | baseline only | 90 diagnostic | 85 diagnostic | Diagnostic quality score, not code elegance improvement. Current code elegance baseline is about 32/100 in the Owner Review Packet. |
| 2026-06-12 | T1 Vault Lint Contract Seed | `3626c48` | 58 | 31 | 33 | 21 | 36 | Accepted. Small clarity gain; no runtime rewrite, no ports, no deletion. |
| 2026-06-12 | T2A ProgressReporterPort first slice | `f9cf49f` | 51 | 46 | 42 | 44 | 46 | Accepted. One service-side Obsidian `Notice` path moved behind a fakeable port; narrow slice, no RunEnvelope yet. |
| 2026-06-12 | T2B IndexInitializer ProgressReporterPort follow-up | `fbf8a56` + `79478b0` | 58 | 55 | 45 | 55 | 54 | Accepted. Same port reused by second search indexing adopter; `IndexInitializer` direct `Notice` path and private helper removed. |
| 2026-06-12 | T2C AnalysisDocPersistence Notice cleanup | `2e97eac` | 60 | 58 | 46 | 60 | 56 | Accepted. Same port reused by third search adopter; `analysisDocPersistence` direct `Notice` path removed, no new mutable default introduced. |
| 2026-06-13 | T3A RunEnvelope Core | `3626e29` + `bf42673` | 66 | 60 | 54 | 68 | 61 | Accepted. Dependency-light `RunSession` / `RunEvent` / `ArtifactRef` foundation with deterministic recorder and snapshot guards; no real capability uses it yet. |
| 2026-06-13 | T4 Vault Lint RunEnvelope Vertical Slice | `4d68724` | 70 | 60 | 60 | 72 | 64 | Accepted with caveat. First real capability now emits RunEnvelope trace, but `VaultLintService -> useVaultLintStore` remains and boundary audit stays at 420. T5 must be a larger closure wave. |
| 2026-06-13 | T5 Vault Lint Runtime Closure Wave | `eb45195` | 76 | 63 | 72 | 78 | 71 | Accepted. Deleted `vaultLintStore`, moved Vault X-Ray runtime truth to RunEnvelope projection, and reduced service->ui by 1. Remaining blocker is service-locator dependencies inside `VaultLintService`. |
| 2026-06-13 | T6 Vault Lint Ports + Plain Service | `89e0406` | 82 | 68 | 78 | 82 | 77 | Accepted. `VaultLintService` is now constructor-injected with ports, `SignalRegistry` is deleted, and service->app drops by 1. Remaining blocker is detector-level AppContext/sqlite access in `signals/*`. |
| 2026-06-13 | T6R Runtime Ownership + Config Defaults | `abb968d9` | 80 | 73 | 83 | 84 | 79 | Accepted. `currentRuntime` moved from service-layer module state to app-owned `AppRuntimeRegistry`; `DEFAULT_VAULT_LINT_CONFIG` moved to `VaultLintDefaults.ts` with template drift guards. Boundary audit stays flat at 418; detector AppContext access remains for the next closure wave. |
| 2026-06-13 | T7 Vault Lint Foundation Completion Wave | `32fde24b` + `216dd431` | 84 | 79 | 85 | 89 | 84 | Accepted. Detector-side Obsidian/sqlite/search-graph reads moved behind `VaultLintDetectorContextPort`; `signals/*` now run with fake context tests and source guards. Boundary audit drops 418 -> 415. This should close Vault Lint foundation work and move the next wave to a second capability. |
| 2026-06-13 | T8 Ambient Foundation Runtime Boundary Wave | `a1789056` + `e20bbce7` + `85f20917` | 84 | 86 | 87 | 91 | 87 | Accepted. Ambient is now the second capability on the modernization pattern: retired `AmbientPushService` / `MorningBriefingService` singletons, added app-owned `AmbientRuntime`, moved Obsidian/sqlite/UI/LLM dependencies into `src/app/ambient/*` adapters, and added fake-port/source-guard tests. Boundary audit drops 415 -> 404. Observability remains capped because Ambient does not yet emit RunEnvelope/artifact traces. |
| 2026-06-13 | T9 Copilot Vault Review Runtime Boundary Wave | `d606005b` + `bbbdb95d` + `9f53d970` | 87 | 88 | 89 | 93 | 88 | Accepted. Vault Auto Review now runs through app-owned `VaultReviewRuntime`; report singleton, service-side sqlite digest/fingerprint paths, and service-side report persistence were retired. Codex verified after-state boundary audit at 404 findings; Claude reported T9 true delta 415 -> 404. Residual debt: `VaultMetaAgentStream` still owns some Agent SDK/ProfileRegistry setup. |
| 2026-06-14 | T10 Quick Search Background Session Runtime Boundary Wave | `5a21111b` + `c2c153cb` + `2daa8b3f` + `20bbd79f` | 89 | 91 | 90 | 94 | 90 | Accepted after T10R. `BackgroundSessionManager` was deleted; Quick Search background sessions now run through app-owned `QuickSearchBackgroundRuntime` with service ports and app adapters. T10R fixed Notice-click and ActiveSessionsList restore entrypoints. Boundary audit drops 404 -> 396. Residual debt: `eventTargetRedirect`, `sessionRefs`, and `persistSessionToVault` remain controlled old-path internals. |
| 2026-06-14 | T11 Copilot Action Registry Boundary Wave | `c1d02ae4` + `cbd14a68` + `0037b074` | 90 | 94 | 90 | 95 | 91 | Accepted. `CopilotAction` no longer carries `LucideIcon` or `ResultPanel`; `actions/index.ts` no longer imports 29 UI panels or `lucide-react`; UI binding now lives in `copilot-action-surfaces.tsx`. Boundary audit drops 396 -> 367 and service->ui drops 45 -> 16. Residual debt: Copilot action execution still uses `AppContext.getInstance`, `SqliteStoreManager.getInstance`, and service-side registry singletons. |
| 2026-06-15 | T11B Copilot Execution Ports / Registry Ownership Wave | `661a3dc1` + `13a425c9` + `7dd3f6d9` + `68a2c176` + `04d8c2c1` | 91 | 95 | 93 | 96 | 92 | Accepted after T11B-R. Copilot manual actions now run through app-owned `CopilotActionRuntime` + explicit ports; `CopilotActionRegistry.getInstance`, `CustomPromptRegistry.getInstance`, and `registerAllCopilotActions` are retired. T11B-R moved runtime binding before `initSqlite()` so the catalog remains available on mobile / SQLite-deferred boot. Boundary audit drops 367 -> 366; service AppContext count drops 86 -> 62. Caveat: T11B series net-adds code, so the next recommended task is a Code Volume Audit / Deletion Map. |
| 2026-06-25 | T11D Code Volume Deletion Wave 1 | `da6ef34b` | 92 | 95 | 93 | 97 | 93 | Accepted. First real post-boundary deletion wave: 20 source files removed, `src` net -1780 lines by commit numstat, debug command retired, and no new runtime path introduced. Boundary audit is 363. T11C/T11D docs were corrected to protect live `core/po/graph.po.ts`; next step is a Product Decision Packet before Wave 2 deletion. |
| 2026-06-25 | T11E Big Deletion + Curator Push Runtime Move | `b19d98dc` | 94 | 96 | 95 | 95 | 95 | Accepted with required follow-up. Deleted Prompt Templates legacy modal, AmbientContract source inventory, stale chat-view hook, and old vault-sdk sdkProfile path; moved Curator Push from service singleton to app-owned runtime + ports. Boundary audit drops 363 -> 358 and service->ui drops 16 -> 14. Caveat: `test/profile-registry.test.ts` still has 2 stale model-name failures; T11E-R handoff is ready. |
| 2026-06-25 | T11E-R ProfileRegistry Review Fix | `dd6750b0` | 94 | 96 | 95 | 97 | 95 | Accepted. Test-only stale assertion fix; `profile-registry` is 30/30, build passes, old sdkProfile path remains gone, and boundary audit stays 358. No deletion gain from this commit; next task should be T11F Code Retirement Wave. |
| 2026-06-26 | T11F Code Retirement Wave | `79947556` | 96 | 97 | 96 | 97 | 96 | Accepted. Deletion-first wave removed 15 files; commit-level `src` delta is `+5/-1948`, net `-1943`; boundary audit drops 358 -> 352. Old Workflow, old OnboardingModal, and confirmed orphan files are gone with no protected runtime touched. Caveat: `OnboardingModal` remains as one comment-only breadcrumb in `main.ts`; optional cleanup if we want source guards fully silent. |
| 2026-06-26 | T11G Single-Prompt Product Surface Retirement | `06d9442a` | 97 | 97 | 97 | 98 | 97 | Accepted. First single-prompt mega wave: retired GraphFullscreen popout view, standalone Gap Analysis view, and standalone Batch Tag modal in one DAG-guided task. Deleted 9 source files and `src` net -1201 LOC; boundary audit drops 352 -> 349. Protected StructuralAnalysisRepo/runStructuralAnalysis, Knowledge Intuition, Quick Search core, Chat, Ambient, and Command Gateway remain intact. |
| 2026-06-26 | T11H Scan-First Cleanup Wave | `6d4131d7` | 86 | 84 | 82 | 88 | 84 | Accepted as minor cleanup, not counted as a major wave. It moved neutral lens graph types out of UI and removed `MultiLensGraph.onExpand`, but commit size was only 8 files `+95/-83`; boundary audit moved 349 -> 344 and `service -> ui` 14 -> 10. Useful cleanup, but too small for the user's requested bulk modernization pace. T11I must use an Impact Contract and target the remaining `service -> ui` cluster directly. |
| 2026-06-26 | T11I Hard Service-to-UI Boundary Wave | `b1c2fd0f` | 94 | 96 | 93 | 98 | 94 | Accepted as major wave with caveat. Impact Contract met: `service -> ui` 10 -> 0 and `core -> ui` 4 -> 0. A4 followed Codex correction via app-owned `AnalysisDocVaultWriterPort` / `AppAnalysisDocVaultWriterAdapter`, with no module-level default writer. Caveat: moved "neutral" core/search and search-doc types still import `@/service/**`, so `core -> upstream` is 79; T11J should address core/service ownership or the next `service -> app` cluster. |
| 2026-06-26 | T11J Combined A+B Mega Wave | `a14c4135` | 96 | 97 | 94 | 98 | 96 | Accepted as major wave with caveats. Impact Contract mostly met: `total flagged` 338 -> 236, `core -> upstream` 79 -> 11, `service -> app` 56 -> 15, and `service -> ui` / `core -> ui` remain 0. Caveats: implementation note overclaimed `src/core` app imports as zero; current audit still has 5 core -> app edges and `service/core -> Obsidian types` is 81, making T11K's baseline. |
| 2026-06-26 | T11K Obsidian File-Handle Boundary Cut | `8ad1f78c` | 97 | 98 | 94 | 98 | 96 | Accepted as major wave with caveats. Impact Contract met: `total flagged` 236 -> 199, `service/core -> Obsidian types` 81 -> 48, `core -> upstream` 11 -> 6, and `service -> app` holds at 15. The document loader/resource cluster now depends on narrow read-only vault ports and `AppVaultReaderAdapter` owns raw `TFile/TFolder`. Caveats: `vault-utils` / `obsidian-utils` remain Obsidian-backed core infrastructure, and `embedClient` uses a narrow module-level telemetry reporter sink. |
| 2026-06-26 | T11L Remaining Boundary Wave | `86839550` | 96 | 98 | 94 | 98 | 96 | Accepted as major wave with caveats. Impact Contract met: `total flagged` 199 -> 163, `core -> upstream` 6 -> 2, `service -> app` 15 -> 8, `service/core -> Obsidian side-effect` 16 -> 5, and `service/core -> Obsidian types` 48 -> 34. Caveats: `AppHandle = Record<string, any>` is temporary containment rather than final decoupling; several floors have thin margins; the commit subject says `236->163` although the true T11L baseline was 199. |
| 2026-06-26 | T11M UI to App Boundary Wave | `62a39991` | 97 | 98 | 94 | 98 | 96 | Accepted as major wave with caveats. Impact Contract met: `total flagged` 163 -> 95, `UI -> app` 114 -> 46, direct UI `AppContext` import files 87 -> 33, and `UI -> @/app/settings/types` 15 -> 0. Copilot result panels now go through `CopilotPanelVaultPort` / app adapters and have 0 raw panel vault/editor ops. Caveats: `ServiceContext.app` remains a raw escape hatch, `useQuickSearchHost()` is containment rather than final ports, `TemplateManager.setInstance()` is a compatibility singleton, and 25 raw UI vault/editor operations remain outside the Copilot panel target. |
| 2026-06-27 | T11N UI Vault/Editor Port Wave | `860eb305` | 96 | 97 | 94 | 98 | 95 | Accepted as targeted raw-UI-IO port wave, with contract caveat. It hit the meaningful raw-op target: raw UI vault/editor matches about 20 -> 7 and `core -> upstream` 2 -> 0, while preserving `service -> ui` / `core -> ui` at 0 and `service -> app` at 7. But it missed the original total-flagged and UI-app hard floors: `total flagged` 95 -> 92, not <=83; `UI -> app` 46 -> 45, not <=42. Caveat: T11N's new guard locks `totalFlagged` at the landed value 92, which is a regression floor, not proof that the original hard floor was met. |
| 2026-06-27 | T11O App-Shell Relocation Wave | `5686ac97`..`73fce758` | 98 | 99 | 95 | 97 | 97 | Accepted as major wave. Obsidian `ItemView` / `Modal` shells moved from `src/ui/**` to `src/app/**`; `ReactElementFactory` moved to app composition and `ServiceContext` no longer imports `AppContext`. Impact Contract met: `total flagged` 92 -> 56, `UI -> app` 45 -> 9, direct UI `AppContext` import files 31 -> 6, with `service -> app` held at 7 and `service -> ui` / `core -> ui` / `core -> upstream` held at 0. Caveats: `useServiceContext().app` still has 25 consumers; stretch `UI -> app <=8` missed by one edge; full `npm run test` did not complete in Codex's run, but build + affected guards passed. |

## Evidence Rules

Every score update must include at least one of:

- File path and function/type/contract changed.
- Test file, fixture, fake port, or golden trace added.
- `rg` evidence that an old path reference was removed.
- Import graph / dependency scan evidence.
- Build/test command output.
- Screenshot or UI verification when a surface changed.
- Explicit reason that a score did not improve.

## Score Confidence

Each score should include confidence:

| Confidence | Meaning |
| --- | --- |
| High | Backed by tests, scan evidence, and code inspection |
| Medium | Backed by code inspection and partial verification |
| Low | Plausible but not yet verified |

Low-confidence high scores are not acceptable. A score of 85 with low confidence should be treated as "needs verification", not as progress.

## Common Score Smells

- Score improves because new abstractions were added, but no old path was removed.
- Modularity score improves while imports still cross the same boundary.
- State ownership score improves while UI store still owns long-running task truth.
- Testability score improves without fake ports, fixtures, or contract tests.
- Observability score improves because logs were added, but no artifact/trace is reviewable.
- Owner comprehension score improves because docs got longer, but the debug path is still unclear.
- Overall score improves despite a larger blast radius and no deletion.
- Boundary score improves while new module-level mutable defaults or hidden service locators are scattered across service/core/port files.

## Owner Control Questions

Before accepting a higher score, the user should be able to answer:

1. Where do I start reading this capability?
2. What owns runtime state?
3. Which side effects are behind ports or adapters?
4. What file or port would I fake in tests?
5. What old path no longer matters?
6. What changed radius got smaller?
7. How would I inspect a failed run?
8. What should not be touched in the next task?
