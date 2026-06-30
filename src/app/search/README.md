# Quick Search App Layer Guide

这份文档是给读代码的人看的。`src/app/quick-search` 下面的代码不是搜索算法本身，而是 Quick Search 的 app-layer 接线层：把 UI、后台会话 runtime、Obsidian API、Zustand store、vault 写文件这些真实运行环境连接起来。

如果只看单个文件，这里会显得拆得很碎。先记住一句话：

> `service/search/background` 管后台会话状态机，`app/quick-search` 管真实 App 副作用，`ui/view/quick-search` 管 React 交互。

## 这里解决什么问题

Quick Search 的 AI 分析是流式运行的。用户可能在分析过程中关闭 Quick Search modal，或者从别的地方再打开它。这个目录主要负责让下面这件事可靠发生：

```text
用户开始 AI 分析
  -> 关闭 Quick Search modal
  -> 当前前台 session 被 detach 到后台 runtime
  -> 后续 LLM stream event 继续写入后台 snapshot
  -> plan ready / completed / error 时保存结果并弹 Notice
  -> 用户点击 Notice 或 Active Sessions
  -> 重新打开 modal 并 restore 那个 session
```

也就是说，这里不是在做“怎么搜索”，而是在做“搜索分析跑到一半时，UI 关闭、后台继续、再恢复”的生命周期管理。

## 分层地图

```text
main.ts
  -> composeQuickSearchBackgroundRuntime(app)
     -> QuickSearchBackgroundRuntimeImpl(deps)
        -> foregroundSession port
        -> eventRouter port
        -> targetFactory port
        -> notification port
        -> modalOpener port
        -> persistence port
        -> clock port

React Quick Search UI
  -> useQuickSearchHost()
     -> QuickSearchHost operations
     -> quickSearchRuntime
```

相关目录：

- `src/service/search/background/`
  纯业务层。这里不应该 import `@/app/*`、`@/ui/*` 或 `obsidian`。它只知道 ports 和 runtime 状态机。
- `src/app/quick-search/`
  当前目录。这里允许接触 `AppContext`、Obsidian API、Zustand store、modal、Notice、vault 写入。
- `src/ui/view/quick-search/`
  React UI、hooks、store、components。它通过 `QuickSearchHost` 和 runtime 间接使用 app 能力。

## 为什么拆这么多 class

这组 class 大多是 adapter。它们有些非常薄，比如只是包一层 `Notice` 或 `Date.now()`。这样拆的好处是：

- `QuickSearchBackgroundRuntimeImpl` 可以用 fake ports 做单元测试，不需要真的启动 Obsidian 或 React。
- 后台 runtime 不直接依赖 Zustand store、`AppContext`、`QuickSearchModal`、Obsidian `Notice`。
- 以前的全局 singleton / 随手改 UI 全局变量的行为被收束到一个可控边界。

代价也很明显：

- 文件数量变多。
- 读单个 adapter 时看不出完整业务意义。
- 新人需要先看这份地图，否则会感觉每个文件只做一点点，很难串起来。

所以这里的拆分不是为了“优雅”，而是为了把复杂副作用隔离起来。读代码时不要从最薄的 class 开始钻，先看 runtime 和完整流程。

## 文件职责

### `composeQuickSearchHost.ts`

给 UI 提供 `QuickSearchHost`。UI 不直接拿 Obsidian `app`、`vault`、`workspace`，而是调用这里包装好的 named operations：

- 打开 vault path
- 读取 vault 文件
- 创建各种 agent
- 保存 AI analysis markdown
- 访问 background runtime
- 创建 report orchestrator

可以把它理解成 Quick Search UI 的 app 能力包。

### `AppAnalysisDocVaultWriterAdapter.ts`

真正负责写 Obsidian vault markdown：

- 规范化 folder path
- 清理非法文件名字符
- 确保目标文件夹存在
- 文件重名时加 timestamp
- create 或 overwrite markdown

service 层只看到 `AnalysisDocVaultWriterPort`，不知道 Obsidian vault 的细节。

### `SearchSessionReportAdapter.ts`

把 report orchestrator 接到 Quick Search 的 Zustand session store。报告生成时，plan sections、section 内容、summary streaming 等状态更新都通过这个 adapter 写回 UI store。

### `background/composeQuickSearchBackgroundRuntime.ts`

后台 runtime 的总装入口。它 new 出所有 app-layer adapters，然后传给 `QuickSearchBackgroundRuntimeImpl`。

插件启动时，`main.ts` 会调用这个 compose function，并把 runtime 绑定到 `AppContext` 的 runtime registry。

### `background/AppForegroundSessionAdapter.ts`

连接“前台 React session”和“后台 runtime”。

它负责：

- 判断当前 foreground session 是否值得 detach
- 从 Zustand store 生成 snapshot
- reset foreground store
- restore snapshot 回 foreground store
- 保存和恢复 agent handle / abort controller

这就是关闭 modal 后还能继续分析、恢复后还能继续 HITL feedback 的关键桥。

### `background/AppEventRouterAdapter.ts`

控制 `useEventRouter.ts` 里的 `eventTargetRedirect`。

正常情况下，LLM stream event 会写入当前 React/Zustand store。session detach 到后台后，这个 adapter 打开 redirect，让后续 event 写入后台 session snapshot。

这个文件应该是唯一写 `eventTargetRedirect.active/target/summaryBuffer/uiStepRef` 的地方。

### `background/AppBackgroundTargetFactory.ts`

这个文件最重要，也最容易看晕。它创建一个 `EventDispatchTarget`，看起来像 UI store，但实际写的是后台 snapshot。

比如 stream event 调用：

- `pushV2Step`
- `pushV2TimelineText`
- `setPlanSections`
- `setV2Sources`
- `markCompleted`
- `recordError`

前台时这些方法写 Zustand store；后台时这些方法写 `session.snapshot`。

session 级别的变化，比如 title、plan ready、completed、error，会通过 runtime hooks 回到 `QuickSearchBackgroundRuntimeImpl`，因为保存文件、发通知、推进队列这些副作用应该由 runtime 统一处理。

### `background/AppNotificationAdapter.ts`

包装 Obsidian `Notice`。

plan ready、complete、error 时弹一个可点击通知。点击通知时不要直接 open modal，而是调用 runtime 给的 `onRestore()`，这样 runtime 会先写入 pending restore id，再打开 modal。否则新 modal mount 以后不知道要恢复哪个 session。

### `background/AppModalOpenerAdapter.ts`

只负责打开 Quick Search modal：

```text
new QuickSearchModal(AppContext.getInstance()).open()
```

它不决定恢复哪个 session。恢复意图由 runtime 的 `pendingRestoreId` 管。

### `background/AppAnalysisPersistenceAdapter.ts`

后台 session 自动保存时走这里。它把 runtime 的 snapshot 交给 `persistSessionToVault`，并从 `AppContext` 注入真实运行依赖：

- search settings
- devtools flag
- AI analysis history service
- event bus
- vault writer

### `background/DefaultClock.ts`

生产环境 clock，返回 `Date.now()`。测试里会注入 fake clock，让 session id 和 timestamp 可预测。

## 推荐阅读顺序

1. `src/service/search/background/QuickSearchBackgroundRuntime.ts`
   先看 runtime 对外提供什么能力。
2. `src/service/search/background/QuickSearchBackgroundRuntimeImpl.ts`
   再看后台 session 状态机：detach、restore、cancel、notify、queue。
3. `src/service/search/background/ports/QuickSearchBackgroundPorts.ts`
   理解 runtime 依赖哪些 ports。
4. `src/app/quick-search/background/composeQuickSearchBackgroundRuntime.ts`
   看 app-layer 如何把真实 adapter 装进去。
5. `src/app/quick-search/background/AppForegroundSessionAdapter.ts`
   看前台 Zustand session 怎么被 snapshot / restore。
6. `src/app/quick-search/background/AppBackgroundTargetFactory.ts`
   看后台 snapshot 如何接收 stream event。
7. `src/app/quick-search/background/AppEventRouterAdapter.ts`
   看 event redirect 如何切到后台。
8. `src/app/modals/QuickSearchModal.tsx`
   看 modal close 时如何 detach。
9. `src/ui/view/quick-search/SearchModal.tsx`
   看 modal mount 时如何 consume pending restore。
10. `src/ui/view/quick-search/hooks/useSearchSession.ts`
    看 restoreFromBackground 如何把 session 写回前台。

如果只是想知道大意，可以先跳过 `DefaultClock`、`AppModalOpenerAdapter`、`AppNotificationAdapter`。它们是很薄的边界 adapter。

## 改这里时的注意点

- 不要让 `src/service/search/background/` 直接 import `AppContext`、`@/ui/*`、`@/app/*` 或 `obsidian`。
- 不要在 adapter 外面直接写 `eventTargetRedirect.*`。
- 通知点击 restore 时，要走 runtime 提供的 `onRestore()` 或 `openAndRestore(sessionId)`，不要只打开 modal。
- restore 已经挂在当前 modal 里的 session 时，应该直接调用 `restoreFromBackground(sessionId)`，不要只写 pending restore id。
- 后台 session 的 snapshot 可以被 `AppBackgroundTargetFactory` mutate，但 session 状态变化要通过 hooks 回 runtime。
- 如果修改 detach / restore / queue / notification 行为，优先跑下面两个测试：

```bash
npm run test -- test/quick-search-background-runtime-ports.test.ts
npm run test -- test/quick-search-background-source-guard.test.ts
```

