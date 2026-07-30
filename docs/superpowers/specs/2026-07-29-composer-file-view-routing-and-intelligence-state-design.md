# Composer 文件视图路由与 Intelligence 状态技术设计

> 日期：2026-07-29
> 状态：Accepted for implementation
> 基线：`cc7744eeeff9ebcd0fc578393238b0e185340510`
> 来源分支：`codex/composer-file-view-intelligence`
> 已写回：`codex/peak-modernization-refactor`

## 1. 目标

本次改动把 Composer 从“跟随全局 active file 的功能页”收敛为真正的
Markdown 文件 View，并同时修复手动 AI 动作点击后没有任何可见反馈的问题。

必须同时保持以下语义：

- Composer leaf 明确绑定文件，支持多 tab、restore、rename、delete 和动态标题；
- 默认打开模式与当前 leaf 的 View 类型是两个独立控制；
- 当前 Composer 显示状态只有 `edit / clean`；
- Intelligence、Document Session 和 Run 的 canonical owner 属于 app runtime；
- Run 冻结 origin document/revision/host/work segment/scope，View unmount 不取消 Run；
- AI 动作同步创建 origin-anchor candidate，所有终态可见且可恢复；
- 旧 active-file follower、单 Composer leaf、`work / all / clean` 三态和静默
  `catch {}` 最终删除。

## 2. Stage A 事实与根因

### 2.1 当前 owner map

| 对象 | 当前 owner | 当前生命周期 | 目标 owner | 目标生命周期 |
| --- | --- | --- | --- | --- |
| `DocumentComposerView` | Obsidian leaf | leaf | 不变 | leaf |
| `DocumentComposerController` | View | leaf | 不变，但只绑定显式 file state | leaf |
| `ComposerDocumentSession` | Controller | active file | `DocumentSessionRegistry` | document / plugin |
| `ComposerTransactionHub` | per-compose | active file | `DocumentSessionRegistry` | document / plugin |
| `IntelligenceRuntime` | per-compose | active file / View | workspace runtime 内的 document entry | document / plugin |
| Current Work State / Scope | 未建立 canonical owner | 无 | `ComposerWorkspaceIntelligenceRuntime` | workspace / plugin |
| capability Run | document capability runtime | document runtime | app-owned document entry + workspace Run Registry 投影 | run |
| React selection / scroll / panels | React | mount | 不变 | leaf / React mount |

### 2.2 Active-file follower

当前 `DocumentComposerController.start()`：

1. 订阅 `onActiveFileChange`；
2. 读取 `getActiveFilePath()`；
3. active file 变化时 dispose 当前 editing runtime；
4. 为新 active file 创建 session/runtime。

因此 Composer leaf 没有自己的文件身份。切换任意 Obsidian tab 都可能重绑定 Composer，
多个 Composer tab 也无法表达不同文件。

### 2.3 AI 候选可见性黑洞

production runtime 已经先通过 transaction hub 创建 streaming candidate，再启动 provider。
问题不在“没有创建候选”，而在 UI gating：

- 默认 display state 是 `work`；
- candidate 只有 `displayState === 'all'` 才渲染；
- 只要 candidate 存在，action row 就隐藏；
- 因而默认状态下 candidate 和 action row 同时不可见；
- invoke 的同步异常由空 `catch {}` 吞掉；
- analysis card 对 failed/stale/cancelled 没有完整 body 和 retry。

这解释了“润色、补写、解释流程图等全部像没反应”的共同症状。它是旧 AI 卡样式改动
引入三态显示模型后产生的显示合同回归，不是所有 provider 同时失效。

## 3. Versioned Composer View state

```ts
type ComposerDisplayMode = "edit" | "clean";

interface ComposerViewStateV2 {
  version: 2;
  filePath: string;
  displayMode: ComposerDisplayMode;
  selectedBlockId?: string;
  scrollAnchor?: unknown;
}
```

读取兼容：

- `{ filePath }`、`{ file }` 可迁移为 V2；
- `work`、`all` 都迁移为 `edit`；
- `clean` 保持 `clean`；
- 没有显式文件的 legacy restore 只允许在一次性迁移时采用当时的 active Markdown file；
- 运行中和新写回只产生 V2，绝不再写 `work` 或 `all`。

View 自身负责：

- `getState()` / `setState()`；
- leaf-local `displayMode`、scroll、selection、sidecar local UI；
- `getDisplayText()` 使用绑定文件 basename；
- `getSourceFilePath()` 使用绑定 state，不读取 workspace active file。

Controller 负责：

- `start(filePath)`；
- Vault modify/rename/delete；
- 对 app-owned document entry 的 acquire/release；
- 不再订阅 active leaf 以重绑定文件。

## 4. App-owned navigation/open port

```ts
type DefaultDocumentView = "markdown" | "composer";
type DocumentViewKind = DefaultDocumentView;
type OpenDisposition =
  | "reuse-existing"
  | "replace-current"
  | "new-tab"
  | "split";

interface DocumentOpenRequest {
  filePath: string;
  view?: DocumentViewKind;
  disposition: OpenDisposition;
  reason:
    | "command"
    | "file-atlas"
    | "search"
    | "wikilink"
    | "recent"
    | "view-conversion"
    | "host-file-open";
}
```

`ComposerDocumentRouter` 位于 app layer，由 `DocumentComposerRuntime` 持有：

- 普通打开先按 file identity 查找 Markdown/Composer leaf 并 reveal；
- 未打开时按 Vault setting `defaultDocumentView` 选择目标 View；
- `new-tab` / `split` 明确允许 duplicate；
- 只路由 `.md`，其他文件继续走 Obsidian 原生行为；
- loop guard 标识 router 自己发起的 `setViewState/openFile`；
- 插件自有入口逐步迁移到此 port；
- 对宿主 `file-open` 只使用稳定 workspace event 做安全的默认 View 转换，不做 DOM patch。

默认打开模式保存在 plugin settings：

```ts
interface ComposerSettings {
  defaultDocumentView: "markdown" | "composer";
}
```

默认值是 `markdown`。Composer 主工具栏的控制只写此 setting，不转换当前 leaf。

## 5. 同 leaf View conversion transaction

### Markdown -> Composer

1. 读取当前 leaf 与 `MarkdownView.file`；
2. `await TextFileView.save()` flush 未保存 buffer；
3. 保存原 `ViewState`；
4. 在同 leaf `setViewState({ type: composer, state: V2 })`；
5. 验证 leaf 类型和 `getSourceFilePath()`；
6. 失败时恢复原 `ViewState`。

### Composer -> Markdown

1. 读取 Composer 绑定文件；
2. 保存原 `ViewState`；
3. 在同 leaf 设置 Markdown state `{ file: filePath, mode: "source" }`；
4. 验证 `MarkdownView.file.path`；
5. 失败时恢复 Composer state。

两侧发现入口：

- Composer `onPaneMenu`：`切换到原生 Markdown`；
- workspace `file-menu` 在 Markdown tab/header source 中：`切换到 Composer`；
- 不增加新的 production Command Palette 命令。

## 6. App-owned document/session registry

`DocumentSessionRegistry` 由 `DocumentComposerRuntime` 独占：

```ts
interface DocumentSessionEntry {
  documentId: string;
  filePath: string;
  session: ComposerDocumentSession;
  editing: ComposerEditingRuntime;
  refs: number;
  lastAccessedAt: number;
}
```

行为：

- 首个 leaf acquire 时读取并 compose；
- 同文件多个 leaf 共享 source/session/hub/candidates/history/intelligence；
- selection、scroll、active block 和 sidecar 展示仍保存在各 leaf React host，不共享；
- leaf close 只 release subscription/ref，不 dispose still-running 或待 review entry；
- plugin runtime dispose 才统一 cancel/dispose；
- rename 对 registry re-key，并让 session rebind 新 path，同时保持稳定 document identity；
- delete 保留 review/history entry，但 controller 投影为 missing，禁止写回；
- 外部 modify 先 stale，用户 revalidate 后由 shared hub 迁移 candidate anchor。

为控制内存，entry 在无 refs、无 active run、无 pending review 时可 LRU 释放；本次实现至少保证
plugin 生命周期内的 run/review 不被 View unmount 销毁。

## 7. Workspace Intelligence owner

`ComposerWorkspaceIntelligenceRuntime` 由 `DocumentComposerRuntime` 持有并提供：

- Current Work Segment；
- workspace Scope selection；
- Frozen Run Registry；
- document registry projection；
- JSONL machine event persistence port。

### 7.1 Work Segment

```ts
interface ComposerWorkSegment {
  segmentId: string;
  startedAt: number;
  endedAt?: number;
  documentIds: string[];
}
```

- 第一次 Composer/Intelligence task 自动建立；
- open/switch/close/idle 不自动结束；
- 显式 `startNewSegment()` / `endCurrentSegment()`；
- acquire 的 document 被记录到当前 segment。

### 7.2 Scope

```ts
type ComposerIntelligenceScope =
  | { kind: "document"; documentId: string }
  | { kind: "work-segment"; segmentId: string }
  | { kind: "pinned"; pinId: string; documentIds: string[] };
```

workspace 保存当前 scope selection；每个 leaf 只保存自己的 sidecar tab、scroll 和 selection。
切 Scope 只影响后续 projection/new run。

### 7.3 Frozen Run

```ts
interface FrozenComposerRunEnvelope {
  runId: string;
  candidateId: string;
  originDocumentId: string;
  originPathAtStart: string;
  originRevision: string;
  originHost: "composer" | "markdown";
  originLeafId?: string;
  workSegmentId: string;
  scopeSnapshot: ComposerIntelligenceScope;
  capabilityId: string;
  target: ComposerTarget;
  startedAt: number;
  status:
    | "starting"
    | "streaming"
    | "ready"
    | "failed"
    | "cancelled"
    | "stale"
    | "interrupted";
  error?: string;
}
```

capability runtime 的 typed events 投影到此 registry。所有事件按 `runId` 更新原 record；
active file、Scope、View 切换不参与结果定位。accept 仍由 document hub 的 revision guard
fail closed。

## 8. Persistence boundary

沿用已接受的 machine-record 规则：

- workspace segment/scope/run transition 追加到知识库 DataStore 下的 Composer JSONL stream；
- SQLite 不是本次新增 canonical store；
- Markdown 只保存用户文档；
- plugin settings 保存轻量默认 View 和 scope pointer；
- restore 时 replay JSONL 恢复 segment/scope/terminal review；
- 无法恢复 provider 计算的 in-flight run 变成 `interrupted`，不得重复执行。

本次不得写入或覆盖现有 `telemetry/composer-intelligence.jsonl`；使用独立
`composer-workspace-state.jsonl`。

## 9. Display state 与多候选 review

顶层只保留：

- `edit`：正文可编辑，findings 和候选在 origin anchor 可见；
- `clean`：正文只读，暂时隐藏 findings/candidates/chrome，不删除状态。

`审阅全部改动 · N` 是 edit 内的上下文动作，不是第三个 state：

- `N >= 2` 才出现；
- 默认自动展开最新 streaming/starting candidate；
- 其他 candidate 可折叠；
- 点击 review-all 临时展开全部；
- 退出只改变 local expansion set，display state 仍是 `edit`。

不变量：

```text
edit && candidateExists
  => candidateCardVisible || actionRowWithVisibleError
```

## 10. AI candidate lifecycle

```text
ActionAvailable
  -> Starting (同步创建 candidate + run record)
  -> Streaming
  -> Ready | Failed | Cancelled
  -> Stale (origin revision drift)
  -> Accepted | Discarded
```

数据模型变化：

- `CandidateVariantStatus` 增加 `cancelled`；
- active variant 保存 `error?: string`；
- candidate status 增加 `cancelled`；
- abort 先标 cancelled，再发 `run-cancelled`，不得先标 failed；
- runtime/provider/prompt 同步和异步异常写入 candidate，不只写 event。

UI：

- starting/首 token 前显示 shimmer/caret、状态文案、取消；
- streaming body 稳定更新；
- failed 显示真实或安全错误、重试、关闭；
- cancelled 显示已取消、重试、关闭；
- stale 显示来源已变化、重新运行、关闭；
- analysis 卡永远没有接受，但具有关闭、重试、取消和 stale 重跑；
- reduced-motion 下停用持续位移动画，状态仍由文本和 `aria-live` 表达。

同步 invoke 异常不再 `catch {}`：

- 如果 runtime 能创建 failed candidate，则投影到 origin anchor；
- 无法创建 candidate 的 wiring error 显示在该 block action row 的 local error status；
- action row 不能同时被不存在的卡片隐藏。

## 11. Rename / delete / reload

- rename：registry re-key、session path rebind、所有 leaf state 更新、动态标题刷新；
- delete：leaf 保留，显示 missing 状态和 origin path；review/history 只读保留；
- reload：V2 state 恢复相同 filePath/displayMode；JSONL replay 恢复 segment/scope/run；
- 同名文件：tab title 用 basename，pane menu/tooltip/aria 保留完整 path；
- legacy 无 file state：只做一次 active Markdown migration，之后立即写 V2。

## 12. 旧路径删除清单

- `ComposerFileEventsPort.getActiveFilePath`；
- `ComposerFileEventsPort.onActiveFileChange`；
- controller 的 `onActiveFileChange` 主文档绑定；
- ViewManager “找到第一个 Composer leaf 就 reveal”；
- per-view dispose `IntelligenceRuntime`；
- `ComposerDisplayState = work | all | clean`；
- `displayState === 'all'` candidate gate；
- invoke 空 `catch {}`；
- cancelled -> failed 的兼容行为；
- 相关旧 contract tests 和 CSS selectors。

## 13. Obsidian API spike 证据与风险

官方 typings 已确认：

- `View.getState/setState` 和 `ViewStateResult.history`；
- `View.onPaneMenu(menu, source)`；
- `View.navigation`；
- `WorkspaceLeaf.getViewState/setViewState/openFile`；
- `TextFileView.save()` / `requestSave()`；
- `Workspace.file-open`、`file-menu`、`revealLeaf`。

本次预检时未发现运行中的 Obsidian CDP listener，因此以下仍需在 build 后真实验收：

- restore 调用时序；
- rename 后 header refresh；
- 同 leaf conversion 的 host history；
- native file tree/wikilink 默认路由；
- 未保存 CodeMirror buffer；
- pane menu/header action 可发现性。

实现只使用公开 View/Workspace API，不使用 DOM monkey patch。若真实 Obsidian 证明某项行为
不成立，按 transaction rollback 保留原 View，并把该项标为 `INTERACTION NOT VERIFIED`
或 `PARTIAL`，不伪报完成。

## 14. 实现顺序

1. core contracts 与 characterization tests；
2. V2 View state、Controller file binding、document registry；
3. app-owned router、settings 和 same-leaf conversion；
4. workspace Intelligence/Work Segment/Scope/Frozen Run/JSONL；
5. `edit/clean` UI 与 review-all；
6. candidate cancelled/error/analysis feedback；
7. plugin-owned callers 迁移与旧路径删除；
8. focused/full tests、build、真实 Obsidian QA 和 implementation note。
