# T11I Read-only Investigation — Codex Review

## Verdict

批准进入实现，但必须带修正。

Claude 的 read-only investigation 做对了三件事：

- 找到了当前 10 条 `service -> ui` 的真实聚集点。
- 给出了可以达到 `service -> ui <=2` 的 DAG。
- 把实现拆成 required / optional tracks，并明确了 before/after delta。

但默认 A4 方案不能直接批准：不要把 `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts` 整体搬进 `src/core/**` 后继续保留 `AppContext.getInstance()` / Obsidian vault writes。这样会把 UI 依赖问题换成 core -> app / core -> Obsidian side-effect 问题，违背这轮边界治理的目的。

## Approved Tracks

可以执行：

- A1: 抽出 `V2ToolStep` / `V2TimelineItem` / `V2Source` 等中性类型。
- A2: 抽出 `V2Section` / `Round` / `Annotation` / snapshot serialization 等纯类型和纯函数。
- A3: 抽出 `CompletedAnalysisSnapshot` / `UIStepRecord` / `SectionAnalyzeResult` / `getSnapshotSummary` 到非 UI 模块。
- A5: `analysisDocPersistence.ts` 去掉 4 个 `@/ui/*` imports。
- B1/B2: `ReportSessionPort` + app/UI adapter，`ReportOrchestrator` 不再读 `useSearchSessionStore`。
- C1/C2/C3: `ChatRuntimeStatePort` + app adapter，`SystemPromptSlot` / `ConversationService` 不再读 `useChatViewStore`。
- E: `SynthesizeAgent` `Round` import 改成中性类型路径。

Optional D 可以做，但请谨慎命名：如果 `v2ToolDisplay` 只是 quick-search trace/report 语义，放在 `src/service/search/**` 或 `src/service/agents/**` 比放进 generic `core` 更诚实。不要把 UI icon/label 表伪装成 framework-agnostic core abstraction。

## Required Correction To A4

不要执行原计划：

```text
move ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts
  -> src/core/storage/vault/search-docs/aiAnalysisPersistence.ts
while keeping AppContext.getInstance()
```

改成下面两选一，优先 Option 1。

### Option 1 — Preferred: App-owned Vault Writer Port

新增 service-side port type:

```ts
export interface AnalysisDocVaultWriterPort {
  saveAiAnalyzeResultToMarkdown(params: SaveAnalysisResultParams): Promise<{ path: string }>;
  persistAnalysisDocToPath(path: string, content: string): Promise<void>;
}
```

放置建议：

- Port type: `src/service/search/AnalysisDocVaultWriterPort.ts`
- App adapter: `src/app/quick-search/AppAnalysisDocVaultWriterAdapter.ts`
- Pure snapshot/markdown types: `src/core/storage/vault/search-docs/analysisSnapshotTypes.ts`

Implementation constraints:

- `analysisDocPersistence.ts` must receive the writer explicitly, for example through `persistSessionToVault(snapshot, { vaultWriter, ... })`.
- Do not add a new module-level default writer.
- Do not add a new service-side `AppContext.getInstance()` shortcut for vault writing.
- Update the known callers to pass the app-owned writer:
  - `src/app/quick-search/background/AppAnalysisPersistenceAdapter.ts`
  - `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts`
  - `src/ui/view/quick-search/hooks/useSearchSession.ts`
- The adapter may use `AppContext` / `app.vault` / `TFile`; that side effect belongs in app, not core.

### Option 2 — Acceptable Fallback: App Module Helper, No Core Side Effect

If threading the port through all three callers gets unexpectedly large, move the old helper to `src/app/quick-search/analysisDocVaultWriter.ts` instead of `src/core/**`, and make service call it only through a typed port or explicit dependency.

This is less ideal than Option 1, but still better than moving `AppContext` into core.

## Hard Stop Conditions

Stop before commit if any of these happen:

- A4 requires moving `AppContext.getInstance()` into `src/core/**`.
- The port injection ripples into unrelated Chat UI or Quick Search UI redesign.
- `service -> ui` expected after-state is above 2.
- Two or more required tracks must be skipped.
- New module-level mutable defaults are introduced to hide writer/report/chat state.
- The implementation creates a second runtime truth for Quick Search sessions or Chat runtime state.

## Expected After-State

Required:

- `npm run build` passes.
- `npm run audit:boundary` reports `service -> ui <=2`.
- `rg -n "from ['\"]@/ui" src/service` returns zero hits, or only optional-track leftovers explicitly listed.
- `rg -n "useChatViewStore|useSearchSessionStore" src/service` returns zero hits.
- `analysisDocPersistence.ts` has no `@/ui/*` import and receives vault writing through an explicit dependency.

Preferred:

- `service -> ui` drops to 0 if optional D/E also land.
- No new `core -> app` or `core -> Obsidian side-effect` edge is introduced by A4.
- Any UI compatibility shim is explicitly temporary and not imported by service.

## Message To Send Back To Claude

```md
Codex reviewed the T11I read-only investigation. Approved to implement, but A4 must be corrected before coding.

Do not move `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts` into `src/core/**` while keeping `AppContext.getInstance()` / Obsidian vault writes. That would replace service->ui debt with core->app / core->Obsidian side-effect debt.

Implement A4 with an app-owned vault writer port instead:

- Add `AnalysisDocVaultWriterPort` in service/search or an equivalent service-side port module.
- Add an app adapter under `src/app/quick-search/**` that performs the actual AppContext/app.vault/TFile writes.
- Thread the writer explicitly into `persistSessionToVault(snapshot, { vaultWriter, ... })`.
- Update the known callers to pass that writer:
  - `src/app/quick-search/background/AppAnalysisPersistenceAdapter.ts`
  - `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts`
  - `src/ui/view/quick-search/hooks/useSearchSession.ts`
- Do not add a module-level default writer.
- Do not move AppContext-based vault writing into core.

Approved tracks:
- A1, A2, A3, A5
- B1, B2
- C1, C2, C3
- E
- Optional D only if it stays low-risk; prefer a service/search semantic helper over generic core if it contains display labels/icons.

Hard stop before commit if:
- `service -> ui` cannot reach <=2,
- two or more required tracks must be skipped,
- A4 requires core->AppContext,
- the change starts redesigning Chat or Quick Search UI,
- a hidden module-level mutable default is introduced.

Run verification serially:
- npm run build
- npm run test -- test/analysis-doc-persistence-port.test.ts
- npm run test -- test/service-ui-boundary.test.ts
- npm run test -- test/report-session-port.test.ts
- npm run test -- test/chat-runtime-state-port.test.ts
- npm run audit:boundary
- rg checks from the T11I handoff

Implementation note must report the Impact Contract result and explicitly list any remaining service->ui hits.
```

