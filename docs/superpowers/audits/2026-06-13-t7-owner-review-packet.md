# T7 Owner Review Packet — Vault Lint Foundation Completion Wave

Date: 2026-06-13  
Status: Accepted by Codex review  
Implementation commits:

- `32fde24b` — `refactor(lint): add VaultLintDetectorContextPort and wire Obsidian/sqlite adapter (T7 part 1)`
- `216dd431` — `refactor(lint): rewrite detectors against VaultLintDetectorContextPort, restore health-score test, add source guards (T7 part 2)`

## Review Entry Points

Read this packet first, then read the changed code in the order below.

Companion files:

- Handoff: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/refactor-ops/t7-vault-lint-foundation-completion-wave-handoff.md`
- Scorecard: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/refactor-ops/architecture-scorecard.md`
- Progress tracker: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/progress.md`

## Short Answer: Was This Too Small?

This was a medium closure wave, not the large wave the owner ultimately wants.

The two implementation commits changed 14 files and about 1.1k lines. That is materially larger than the early T1-T4 micro-slices, but still below the 30-80 file "larger foundation wave" size that the refactor ops policy allows.

The important part is not raw line count. T7 closes the first capability's remaining detector-side boundary:

- `signals/content.ts` no longer reaches `AppContext`.
- `signals/tags.ts` no longer reaches Obsidian metadata directly.
- `signals/structural.ts` no longer reaches `AppContext`, `sqliteStoreManager`, `getSemanticNeighbors`, or `isIndexedNoteNodeType` directly.
- All those reads now go through one fakeable `VaultLintDetectorContextPort`.

So this task is worth accepting, but it should be treated as the end of the Vault Lint foundation sequence. The next implementation package should not be another tiny Vault Lint polish. It should move to a second capability with a larger, coherent closure wave.

## Owner Summary

T7 makes Vault Lint's service-side algorithm much easier to understand:

```text
UI / command
  -> AppContext.getVaultLintRuntime()
  -> runVaultLintManualScan(...)
  -> VaultLintService.runFullScan(...)
  -> detectors read only LintScanContext.detectorContext
  -> app adapter owns Obsidian/sqlite/search-graph side effects
```

Before T7, the detectors looked simple but secretly reached out to the app shell and sqlite layer themselves. After T7, the detector files are closer to pure algorithms: they receive a small context object and ask it for exactly the data they need.

This is the first point where Vault Lint has a reasonably clean backend foundation:

- contract seed exists;
- manual scan goes through `RunEnvelope`;
- UI store is no longer long-running runtime truth;
- service is a plain constructor-injected class;
- runtime binding is app-owned;
- config defaults are governed;
- detector side effects are behind an adapter.

## Code Reading Guide

Read in this order.

### 1. Port shape

File: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/service/lint/ports/VaultLintPorts.ts`

Look for:

- `VaultLintDetectorContextPort`
- `VaultLintDetectorFileRef`
- `VaultLintDetectorTagInfo`
- `VaultLintDetectorGraphNode`
- `VaultLintDetectorSemanticNeighbor`

What to understand:

This is the new boundary. Detectors can ask for markdown files, content, tags, unresolved links, hard orphans, graph nodes, semantic neighbors, and node-type classification. They do not see Obsidian `TFile`, sqlite repos, `AppContext`, or the graph inspector helper.

### 2. App adapter

File: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`

Look for:

- `listMarkdownFiles`
- `readMarkdownFile`
- `getTags`
- `getUnresolvedLinks`
- `getHardOrphans`
- `getNodesByIds`
- `isIndexedNoteNodeType`
- `getSemanticNeighbors`
- `normalizeFrontmatterTags`

What to understand:

This is the only new place that is allowed to know about Obsidian vault APIs, metadata cache, sqlite repos, and graph semantic neighbor lookup for Vault Lint detectors.

### 3. Runtime composition

File: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/app/lint/composeVaultLintRuntime.ts`

Look for:

- `detectorContext: new ObsidianVaultLintDetectorContextAdapter()`

What to understand:

The app layer wires the real adapter once. `VaultLintService` receives it as part of `VaultLintPorts`.

### 4. Service threading

File: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/service/lint/VaultLintService.ts`

Look for:

- `detectorContext: this.ports.detectorContext`

What to understand:

The service does not call the adapter methods itself. It threads the port into `LintScanContext`, and detectors consume it.

### 5. Detector rewrites

Files:

- `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/service/lint/signals/content.ts`
- `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/service/lint/signals/tags.ts`
- `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/src/service/lint/signals/structural.ts`

Look for:

- `const dc = context.detectorContext`
- no `AppContext`
- no `sqliteStoreManager`
- no direct `getSemanticNeighbors` import

What to understand:

These files now read like algorithm files. That is the architectural win.

### 6. Tests and guards

Files:

- `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/test/vault-lint-detectors.test.ts`
- `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/test/vault-lint-source-guard.test.ts`
- `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/test/lint-health-score.test.ts`

Look for:

- `makeFakeContext`
- `noAppOrUiOrSqliteImportsAnywhere`
- `noServiceLocatorUsageInLiveCode`
- health-score tests against the current `computeHealthScore` API

What to understand:

`vault-lint-detectors.test.ts` proves the detectors can run with a fake port. `vault-lint-source-guard.test.ts` proves future edits cannot silently reintroduce direct app/sqlite dependencies under `src/service/lint`.

## Boundary Evidence

Codex reran the boundary scanner:

```text
node scripts/audit/boundary-baseline.mjs --out /tmp/t7-codex-boundary-baseline.md
```

Result:

```text
Files scanned: 837 under src/
Total flagged cross-layer / side-effect edges: 415
service -> app shell: 70
service -> ui: 55
core -> upstream: 78
service/core -> Obsidian side-effect surface: 20
service AppContext.getInstance references: 87
```

Delta from T6R owner review:

```text
Total flagged edges: 418 -> 415 (-3)
service -> app shell: 73 -> 70 (-3)
service AppContext.getInstance references: 90 -> 87 (-3)
service -> ui: 55 -> 55 (unchanged)
service/core -> Obsidian side-effect surface: 20 -> 20 (unchanged)
```

Note: Claude's implementation note reported `Files scanned: 841`; Codex's local rerun reports `837`. The main architectural counts match the expected result: total flagged edges are 415, and Vault Lint's detector-side service-to-app leaks are gone. Treat the file-count difference as scan-context noise, not as acceptance evidence.

## Source Search Evidence

Codex reran these checks:

```text
rg -n "from ['\"]@/app/|from ['\"]@/ui/" src/service/lint
```

Result: no matches.

```text
rg -n "search-graph-inspector|from ['\"]obsidian|from ['\"]@/core/storage" src/service/lint/signals
```

Result: no matches.

```text
rg -n "AppContext\s*\.\s*getInstance\s*\(|sqliteStoreManager\s*\." src/service/lint --glob '*.ts'
```

Result: only comments and `VaultLintContract.ts` inventory strings. No live detector/service runtime calls.

## Verification

Codex reran:

```text
npm run build
```

Passed. Tailwind printed the existing browserslist warning only.

Codex reran these tests sequentially:

```text
npm run test -- test/vault-lint-detectors.test.ts
npm run test -- test/vault-lint-source-guard.test.ts
npm run test -- test/lint-health-score.test.ts
npm run test -- test/vault-lint-service-ports.test.ts
npm run test -- test/vault-lint-runner.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/vault-lint-structural.test.ts
npm run test -- test/vault-lint-repo.test.ts
npm run test -- test/vault-lint-defaults.test.ts
npm run test -- test/app-runtime-registry.test.ts
npm run test -- test/run-envelope-core.test.ts
```

All passed.

Codex also ran:

```text
npx tsc --noEmit 2>&1 | rg -n "src/(service/lint|app/lint)" || true
```

Result: no `src/service/lint` or `src/app/lint` TypeScript errors.

## What Changed

Accepted changes:

- Added `VaultLintDetectorContextPort` and narrow detector-side data shapes.
- Added `ObsidianVaultLintDetectorContextAdapter` in the app layer.
- Wired the adapter through `composeVaultLintRuntime`.
- Added `detectorContext` to `LintScanContext`.
- Rewrote content, tags, and structural detectors to consume `context.detectorContext`.
- Restored health-score tests against the current free-function API.
- Added fake-port detector tests.
- Added source-scan boundary guards for `src/service/lint`.
- Updated the Vault Lint dependency inventory to describe the post-T7 reality.

## What Did Not Change

Intentionally unchanged:

- No UI redesign.
- No SQLite schema migration.
- No new Ambient Push work.
- No Command Gateway work.
- No Chat runtime work.
- No changes to the underlying `getSemanticNeighbors` algorithm.
- No new RunEnvelope persistence/subscription layer.
- No attempt to rename "Vault Lint" in code.

## Architecture Score

T7 raises Vault Lint from an almost-clean runtime to a cleaner foundation slice.

| Group | T6R | T7 | Why |
| --- | ---: | ---: | --- |
| Control | 80 | 84 | Reading path is clearer: runtime -> service -> detector context -> app adapter. |
| Boundary | 73 | 79 | Detector-side app/sqlite/tool imports were removed; source guards now enforce the boundary. |
| Runtime truth | 83 | 85 | Single Vault Lint runtime path remains; detector side effects no longer bypass the runtime ports. |
| Verification | 84 | 89 | Fake detector context tests and source-scan guards materially improve proof. |
| Overall | 79 | 84 | Accepted as the Vault Lint foundation completion point. |

Confidence: high. Backed by code inspection, build, focused tests, source searches, and boundary scan.

## Remaining Old Architecture

Vault Lint is no longer the right place for more micro-polish unless a bug appears.

Remaining old architecture is mostly outside Vault Lint:

- `service -> ui` remains 55 flagged edges, especially Quick Search, Ambient, Copilot, and chat stores.
- `service -> app shell` remains 70 flagged edges outside this capability.
- `core -> service/app/ui` remains 78 flagged edges.
- Several major capabilities still do not run through the new contract/RunEnvelope/ports pattern.

## Next Recommendation

Stop expanding Vault Lint for now.

Next implementation should be a larger second-capability closure wave. Recommended target:

```text
T8 Ambient Push Foundation Readiness / Runtime Boundary Wave
```

Why Ambient:

- It is one of the product's three core pillars.
- It still has visible `service -> ui` store coupling in the boundary report.
- It has final architecture/product docs already.
- It is easier to reason about than Chat and less broad than Quick Search.

But the handoff must be bigger than earlier micro-slices:

- target roughly 25-60 total files if the investigation confirms a coherent closure package;
- include contract/inventory, runtime ownership, store truth audit, first ports/adapters, and old-path closure in one Claude session;
- allow multiple small commits inside the one session;
- include a code reading guide and Chinese implementation note.

Do not start Command Gateway. Do not start Chat. Do not add new Ambient features. The next goal is foundation cleanup, not product expansion.

## Owner Teach-Back

The owner should be able to say:

1. Vault Lint detectors no longer directly access Obsidian or sqlite.
2. The app adapter is the only new file that owns detector-side Obsidian/sqlite/search-graph reads.
3. Tests can run the detectors with a fake `VaultLintDetectorContextPort`.
4. Source guards prevent future service/lint code from importing app/ui/sqlite directly.
5. This closes Vault Lint's foundation phase; the next big value is moving the same discipline to a second capability.
