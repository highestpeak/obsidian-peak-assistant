# Architecture Scorecard

This scorecard tracks whether the modernization is making Peak Assistant more elegant, modular, testable, and controllable. It is not a vanity metric. Scores must cite code, tests, old-path deletion, or explicit non-improvement evidence.

The scorecard is intentionally more detailed than a normal progress tracker. The user goal is not only to ship changes, but to understand and control the codebase.

## Scoring Rules

Use 0-100. Avoid false precision; increments of 5 or 10 are usually enough.

Use `N/A` only when the task truly does not touch that concern. Do not use `N/A` to avoid a low score.

Pure diagnostic tasks, such as T0 Boundary Baseline, should score **confidence** and **coverage** separately. They should not inflate implementation dimensions before implementation exists.

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
