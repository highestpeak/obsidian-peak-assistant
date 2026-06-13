# Peak Assistant Refactor Ops

Last updated: 2026-06-13

This folder is the operating layer for the large architecture modernization. It does not replace the architecture reports. It turns them into a repeatable loop where Codex produces understanding, review packets, diagrams, scorecards, and Claude Code handoffs, while Claude Code only performs implementation work.

## Source Of Truth

Final architecture docs:

1. [`2026-06-01-peak-system-architecture-modernization-handbook.html`](../specs/2026-06-01-peak-system-architecture-modernization-handbook.html)
   - Main system understanding handbook and modernization action map.
   - Defines the architecture spine: `Capability Contract -> RunEnvelope -> Ports -> ToolDef -> Skill Compiler -> Artifact/Trace`.
   - Defines the task DAG from T0 to T12.
   - Contains the hard rule: no dual system / no dual business implementation.

2. [`2026-06-02-ambient-push-current-work-state-product-technical-review.html`](../specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html)
   - Ambient Push final spec.
   - Ambient is post-foundation and must not be implemented inside the old Ambient pipeline as a parallel target architecture.

3. [`2026-06-03-obsidian-plugin-command-gateway-capstone-review.html`](../specs/2026-06-03-obsidian-plugin-command-gateway-capstone-review.html)
   - Command Gateway final spec.
   - Command Gateway is T12 capstone, not an early implementation task.

Historical exploration docs are reference only. They should not override the final three docs.

## Operating Decision

This project should not be run as autonomous vibe coding.

The operating model is:

| Role | Owns | Does not own |
| --- | --- | --- |
| User | Authorization, direction, deciding whether the architecture is understandable and controllable | Reading every diff line alone |
| Codex | Architecture reports, diagrams, task design, handoff prompts, diff audit, owner review packets, scorekeeping | Large implementation edits in `src/` during the modernization loop |
| Claude Code | Code implementation from a bounded handoff, local tests, implementation notes, small commits | Redefining architecture, skipping task order, writing final architecture source of truth |

## Loop

```mermaid
flowchart TD
  A["Codex reads source-of-truth docs"] --> B["Codex writes handoff prompt"]
  B --> C["User manually reviews and sends to Claude Code"]
  C --> D["Claude Code implements one bounded task package"]
  D --> E["Claude Code runs verification and commits"]
  E --> F["Codex audits diff and writes Owner Review Packet"]
  F --> G["User reads diagrams, scorecard, teach-back questions"]
  G --> H{"User understands and approves?"}
  H -- yes --> I["Codex prepares next handoff"]
  H -- no --> J["Codex explains code path / revises packet"]
  J --> G
```

Manual handoff is intentional. It is the owner authorization point.

## Task Size Policy

T0-T4 used small slices to establish evidence, contracts, ports, and the first `RunEnvelope` adopter. From T5 onward, default tasks should be closure waves, not adapter-only micro-slices.

A normal closure wave may touch:

- 10-25 related production files;
- 5-15 related tests/docs files;
- one capability or one tightly bounded runtime surface;
- both new-path wiring and old-path deletion in the same task.

A larger foundation closure wave may touch roughly 30-80 total files when all of these are true:

- the work stays inside one capability;
- the sub-tasks share the same runtime path;
- splitting the work would force the owner to shuttle multiple tiny deltas back and forth;
- the handoff still has one code reading guide and one acceptance story.
- the handoff can be implemented as multiple small commits inside one Claude session if that improves reviewability.

Do not merge extra tasks into an implementation that is already in flight. If Claude Code is already executing a handoff, finish that handoff first, review it, then decide the next larger package.

A task is too small if it only:

- adds a wrapper, hook, adapter, or type;
- leaves the old runtime truth owning behavior;
- reports no old-path deletion;
- produces no boundary, state ownership, or change-radius improvement;
- forces the user to paste many tiny deltas back and forth without giving a coherent code-reading unit.

A task is too large if it:

- crosses into unrelated capabilities;
- touches Chat, Ambient, Command Gateway, and Vault Lint in the same implementation package;
- changes persisted data or UI redesign scope without an explicit handoff;
- cannot be reviewed with a single code reading guide.

From T5 onward, each implementation handoff must name the old path that will be deleted, emptied, or retired. If there is no old-path closure target, Codex should either merge it into a larger package or explain why the task must remain diagnostic.

## Review Access Rule

Any document that requires user review must be easy to open from the Codex conversation where it is mentioned.

Codex must do both:

1. In the final chat response, list review artifacts with clickable absolute file links.
2. In the document itself, include clear review entry points near the top when the document depends on companion reports, handoffs, source-of-truth docs, or next-step docs.

Do not make the user hunt through git status, file trees, relative paths, or prior chat messages to find what needs review.

For every review cycle, the user-facing closeout should include:

- primary artifact to review;
- companion evidence or previous packet, if relevant;
- next handoff or next draft, if relevant;
- whether the document is final, draft, or waiting for user approval.

## Owner-Facing Language Rule

Owner-facing refactor artifacts must optimize for user understanding, not English practice.

Use Chinese first for:

- Owner Review Packets;
- scorecard explanations and progress summaries;
- "why this task", "what changed", "what remains old", and "what to do next";
- chat closeouts that ask the user to review, approve, or send a handoff.

Keep English for code-facing names and precision:

- commit messages;
- file names, symbols, interface names, test names, and command names;
- architecture terms that appear directly in code, such as `Capability Contract`, `RunEnvelope`, `ProgressReporterPort`, `ToolDef`, `Port`, `Adapter`, and `Inventory`.

When Claude Code returns an implementation note, Codex must translate and normalize it into a Chinese owner-facing summary before asking the user to decide. English technical detail may remain below the Chinese summary, but the user should be able to understand the task status without reading a long English report.

## Code Reading Guide Rule

Every code-changing task must include a code reading guide for the owner.

Claude Code implementation notes must include:

- changed code files grouped by purpose;
- a recommended reading order;
- the key symbols/functions/classes to inspect in each file;
- what changed in each file, in plain Chinese;
- what did not change and should not be reviewed for this task;
- tests or source-scan guards that prove the change.

Codex Owner Review Packets must include:

- clickable file links in the chat closeout for the main changed code files;
- visual dependency maps near the top: runtime ownership, main sequence, state ownership, old-path deletion / guards;
- small readable Mermaid diagrams rather than one giant all-in-one graph; ASCII arrow diagrams may supplement but should not replace rendered diagrams;
- a "read in this order" section near the top of the packet;
- short guidance for each file: "look for this function / boundary / deleted old path";
- the first debug file to open if the behavior breaks later.

Do not accept a code-changing task if the owner cannot answer: "which code files changed, why, and in what order should I read them?"

## Mutable Global State Rule

New mutable globals must not be scattered across random service, core, or port files.

Avoid patterns like:

```ts
let defaultSomething: Something | null = null;
export function setDefaultSomething(...) { ... }
export function getDefaultSomething() { ... }
```

These are hidden service locators. They make the runtime harder to understand because dependencies are no longer visible from a constructor, capability contract, run envelope, or app composition point.

Preferred order for new work:

1. Pass dependencies explicitly through a constructor, capability runtime, or `RunEnvelope` once that exists.
2. Put long-lived app-owned adapters in one app composition location, such as `main.ts` or a future app-level runtime registry.
3. Use `AppContext` only as a transitional centralization point when the alternative would scatter multiple module-level globals. Do not expand service-side `AppContext.getInstance()` usage as the default solution.
4. If a module-level mutable default is unavoidable for a narrow T2 slice, it must be:
   - explicitly named as temporary in comments and the Owner Review Packet;
   - fail-loud when missing;
   - cleared on plugin unload if it captures app/runtime objects;
   - covered by tests or source-scan guards;
   - listed as a retirement target for T3/T4.

`ProgressReporterPort`'s `defaultReporter` is accepted only as a T2 transitional compromise. Do not copy this pattern into new ports. T3/T4 should replace it with an explicit runtime/composition mechanism.

## Runtime Ownership Rule

Capability runtimes must be owned by app-level composition, not by per-capability service-layer module singletons.

Do not create this pattern in service files:

```ts
let currentRuntime: SomeRuntime | null = null;
export function setSomeRuntime(runtime: SomeRuntime) { ... }
export function getSomeRuntime(): SomeRuntime { ... }
```

This is still a hidden service locator. It is better than scattering direct `AppContext` / sqlite / registry calls, but it should not become the new house style.

Preferred ownership:

1. Compose runtime in `src/app/**` after infrastructure is ready.
2. Store long-lived runtime in `AppContext` or a single app-owned runtime registry.
3. Pass runtime explicitly into service/runner functions from app or UI context.
4. Keep service-layer runtime files type-only or dependency-only; they should not own mutable process state.

T6's `VaultLintRuntime.currentRuntime` was accepted only as a reviewable transitional binding. T6R must move it to app-level ownership before T7 continues.

## Config Defaults Rule

Domain/product configuration defaults must be discoverable and documented.

Do not bury large config tables inside service engine files. Use:

- `templates/config/*.json` for editable runtime configuration;
- one domain-specific compiled fallback file when code needs defaults without template loading;
- `src/core/constant.ts` only for small cross-cutting constants that are not product-tunable tables.

See [`config-defaults-governance.md`](./config-defaults-governance.md).

## Non-Negotiable Gates

Every implementation task must answer these before it is considered accepted:

1. Which capability or boundary did this task clarify?
2. What is the single runtime path after the change?
3. What is the state source of truth after the change?
4. Which old path was deleted, emptied, or reduced to thin forwarding?
5. Which fake port, fixture, or contract test proves the boundary?
6. What remains intentionally old, and why?
7. What should the user read to debug this later?
8. Which changed code files should the user read, in what order, and what should they look for?
9. Did this introduce or preserve mutable global state? If yes, where is it centralized, why is it temporary, and what retires it?
10. Who owns long-lived runtime composition: app-level composition or a hidden service-layer singleton?
11. Where do product/domain config defaults live: editable template, documented fallback, or incorrectly inside engine logic?

If the answer is "new and old implementations both continue to own behavior", the task is not accepted.

## Verification Caveat

`run-test.js` writes a fixed `temp-test.js` file. Do not run multiple `npm run test -- <file>` commands in parallel, because parallel test processes can overwrite each other's compiled output and produce misleading pass logs.

Correct patterns:

- `npm run test -- test/a.test.ts test/b.test.ts` so the runner executes files sequentially inside one process;
- or run one `npm run test -- <file>` command at a time.

## Task Order

Start here:

```text
T0 Boundary Baseline
-> T1 Contract Seeds
-> T2 Port Sketches
-> T3 RunEnvelope Core
-> T4 Capability Replacement
-> T5/T6 First Capability Runtime Closure
-> T7 First Capability Foundation Completion
-> T8 Second Capability Runtime Boundary Wave
-> T9 Third Capability Boundary Wave
-> T10 Conformance + Golden Trace
-> T11 Expand to next capability
-> T12 Command Gateway Capstone
```

T5 and T6 can proceed when T2/T4 establish enough tool boundary evidence, but they should not be used to bypass T0-T3.

Ambient starts only after the foundation is in place. Command Gateway starts only after T10.

## Current Implementation Status

Completed and accepted:

- T0 Boundary Baseline: [`t0-boundary-baseline-handoff.md`](./t0-boundary-baseline-handoff.md) + [`2026-06-12-t0-owner-review-packet.md`](../audits/2026-06-12-t0-owner-review-packet.md)
- T1 Vault Lint Contract Seed: [`t1-vault-lint-contract-seed-handoff.md`](./t1-vault-lint-contract-seed-handoff.md) + [`2026-06-12-t1-owner-review-packet.md`](../audits/2026-06-12-t1-owner-review-packet.md)
- T2A ProgressReporterPort first slice: [`t2-first-port-sketches-draft.md`](./t2-first-port-sketches-draft.md) + [`2026-06-12-t2a-owner-review-packet.md`](../audits/2026-06-12-t2a-owner-review-packet.md)
- T2B IndexInitializer ProgressReporterPort follow-up: [`t2b-index-initializer-progress-reporter-handoff.md`](./t2b-index-initializer-progress-reporter-handoff.md) + [`2026-06-12-t2b-owner-review-packet.md`](../audits/2026-06-12-t2b-owner-review-packet.md)
- T2C AnalysisDocPersistence Notice cleanup: [`t2c-analysis-doc-persistence-notice-cleanup-handoff.md`](./t2c-analysis-doc-persistence-notice-cleanup-handoff.md) + [`2026-06-12-t2c-owner-review-packet.md`](../audits/2026-06-12-t2c-owner-review-packet.md)
- T3A RunEnvelope Core: [`t3-run-envelope-core-handoff.md`](./t3-run-envelope-core-handoff.md) + [`2026-06-13-t3a-owner-review-packet.md`](../audits/2026-06-13-t3a-owner-review-packet.md)
- T4 Vault Lint RunEnvelope Vertical Slice: [`t4-vault-lint-run-envelope-vertical-slice-handoff.md`](./t4-vault-lint-run-envelope-vertical-slice-handoff.md) + [`2026-06-13-t4-owner-review-packet.md`](../audits/2026-06-13-t4-owner-review-packet.md)
- T5 Vault Lint Runtime Closure Wave: [`t5-vault-lint-runtime-closure-wave-handoff.md`](./t5-vault-lint-runtime-closure-wave-handoff.md) + [`2026-06-13-t5-owner-review-packet.md`](../audits/2026-06-13-t5-owner-review-packet.md)
- T6 Vault Lint Ports Extraction + Service-as-Plain-Class: [`t6-vault-lint-ports-service-plain-class-handoff.md`](./t6-vault-lint-ports-service-plain-class-handoff.md) + [`2026-06-13-t6-owner-review-packet.md`](../audits/2026-06-13-t6-owner-review-packet.md)
- T6R Runtime Ownership + Config Defaults Governance: [`t6-review-fix-runtime-ownership-config-defaults-handoff.md`](./t6-review-fix-runtime-ownership-config-defaults-handoff.md) + [`2026-06-13-t6r-owner-review-packet.md`](../audits/2026-06-13-t6r-owner-review-packet.md)
- T7 Vault Lint Foundation Completion Wave: [`t7-vault-lint-foundation-completion-wave-handoff.md`](./t7-vault-lint-foundation-completion-wave-handoff.md) + [`2026-06-13-t7-owner-review-packet.md`](../audits/2026-06-13-t7-owner-review-packet.md)
- T8 Ambient Foundation Runtime Boundary Wave: [`t8-ambient-foundation-runtime-boundary-wave-handoff.md`](./t8-ambient-foundation-runtime-boundary-wave-handoff.md) + [`2026-06-13-t8-owner-review-packet.md`](../audits/2026-06-13-t8-owner-review-packet.md)

Next owner decision:

- choose the T9 target;
- recommended medium wave: Copilot Vault Digest / Review runtime boundary cleanup;
- recommended large wave: Quick Search foundation boundary cleanup;
- do not start Current Work State, Chat, or Command Gateway yet;
- keep T9 as one coherent capability package with multiple small commits inside one Claude session if needed.

## Supporting Files

- [`claude-code-handoff-template.md`](./claude-code-handoff-template.md): reusable Claude Code prompt shape.
- [`owner-review-packet-template.md`](./owner-review-packet-template.md): Codex review packet shape after Claude Code commits.
- [`architecture-scorecard.md`](./architecture-scorecard.md): scoring rubric and progress ledger.
- [`t1-vault-lint-contract-seed-handoff.md`](./t1-vault-lint-contract-seed-handoff.md): T1 implementation handoff.
- [`t2-first-port-sketches-draft.md`](./t2-first-port-sketches-draft.md): T2A port extraction handoff source.
- [`t2b-index-initializer-progress-reporter-handoff.md`](./t2b-index-initializer-progress-reporter-handoff.md): T2B implementation handoff.
- [`t2c-analysis-doc-persistence-notice-cleanup-handoff.md`](./t2c-analysis-doc-persistence-notice-cleanup-handoff.md): T2C implementation handoff.
- [`t3-run-envelope-core-handoff.md`](./t3-run-envelope-core-handoff.md): T3A implementation handoff.
- [`t4-vault-lint-run-envelope-vertical-slice-handoff.md`](./t4-vault-lint-run-envelope-vertical-slice-handoff.md): T4 implementation handoff.
- [`t5-vault-lint-runtime-closure-wave-handoff.md`](./t5-vault-lint-runtime-closure-wave-handoff.md): T5 larger closure-wave handoff.
- [`t6-vault-lint-ports-service-plain-class-handoff.md`](./t6-vault-lint-ports-service-plain-class-handoff.md): T6 backend closure-wave handoff.
- [`t6-review-fix-runtime-ownership-config-defaults-handoff.md`](./t6-review-fix-runtime-ownership-config-defaults-handoff.md): T6 owner-review fix handoff.
- [`t6r-t7-vault-lint-foundation-closure-handoff.md`](./t6r-t7-vault-lint-foundation-closure-handoff.md): paused future scale draft, not the current handoff.
- [`config-defaults-governance.md`](./config-defaults-governance.md): configuration defaults governance.
- [`t7-vault-lint-detector-context-closure-handoff.md`](./t7-vault-lint-detector-context-closure-handoff.md): superseded small T7 detector handoff.
- [`t7-vault-lint-foundation-completion-wave-handoff.md`](./t7-vault-lint-foundation-completion-wave-handoff.md): accepted T7 Vault Lint completion handoff.
- [`t8-ambient-foundation-runtime-boundary-wave-handoff.md`](./t8-ambient-foundation-runtime-boundary-wave-handoff.md): accepted larger second-capability handoff for Ambient foundation cleanup.

## Do Not Do

- Do not ask Claude Code to "modernize the architecture" broadly.
- Do not let Claude Code implement Ambient in the old `AmbientPushService` path.
- Do not let Command Gateway appear before T10 as a standalone agent runtime.
- Do not accept a task that adds abstractions without deletion, tests, or lower change radius.
- Do not merge a task if the user cannot explain the new entry point, state truth, and debug path.
