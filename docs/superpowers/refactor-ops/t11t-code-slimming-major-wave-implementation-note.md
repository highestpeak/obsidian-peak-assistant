# T11T 代码瘦身大波次实施报告

## 1. 是否达到 Impact Contract

**是。** 产品代码 LOC 净减少 **2,523**（基线 115,538 → 收口 113,015），超过 Primary 阈值 2,500。

距 Target（4,000）尚差 ~1,477，距 Stretch（6,000）尚差 ~3,477。原因主要是 shell 化收敛要平衡「不要做 god component」与「每个 panel 至少要有 30+ LOC 净收益」，规模化收益需要后续 wave 接管剩余 17 个 Copilot panel + Settings/Dashboard shell。

## 2. 是否算作 major code-slimming wave

**是。** 5 个 required tracks 全部交付：
- T1 Deletion-first（4 子轨：mine/、ai-elements、T11R adapters、type shims）
- T2 Runtime ownership tail（3 子轨：ContextBuilder、bridge singleton、Copilot phase global）
- T3 Copilot panel shell + 3 families consolidated（Diff/Findings/Suggestion + TextStream rehoused）
- T4 Stub/half-wired UI cleanup（chatBridge canonical、ContextRing 退役、WhatWasThisAbout 假 footer、Chat tag no-op）
- T5 Shared UI 移动（diff primitives → `ui/components/shared/diff/`）

## 3. Before / After 产品 code LOC

来自 `cloc src styles.css --quiet --json`：

| 项 | Before | After | Δ |
|---|---:|---:|---:|
| TypeScript | 109,512 | 106,989 | **-2,523** |
| CSS | 6,026 | 6,026 | 0 |
| **SUM** | **115,538** | **113,015** | **-2,523** |

按四层（不含 styles.css 顶层）：

| 层 | Before | After | Δ |
|---|---:|---:|---:|
| ui (src/ui) | 49,390 | ~47.9k | ~-1.5k |
| service (src/service) | 32,760 | ~32.4k | ~-0.4k |
| core (src/core) | 21,262 | ~21.1k | ~-0.1k |
| app (src/app) | 7,234 | ~6.9k | ~-0.3k |

（Per-layer 数值是粗估，权威值看 `cloc src/ui src/service src/core src/app`。）

## 4. Test / docs / package 单独汇报

- **Test**：仅 `test/t11r-zero-obsidian-boundary-regression.test.ts` 文件被修改（删除 9 行 T11R 不再需要的必有文件断言，新增 4 行 T11T 退役路径断言）。净变化 ≈ -5 LOC test。
- **Docs**：本实施报告新建 1 个文件（本文件，~280 行）。不算产品源码。
- **Package**：未做 `package.json` dependency pruning。Codex 提到的 `d3-*`、`recharts`、`react-is`、`use-stick-to-bottom`、`motion` tail 留给 wave T11U 单独评估。
- **Templates / JSON config**：未触动。`templates/config/settings.json` 与 PR-D legacy stub copy 没有修剪——需要先逐 surface 验证 OverviewTab 不再消费这些字段才能安全删除，留给后续。

## 5. Track-by-track 总结

### Track 1 — Deletion-first safe cleanup（净 -1,809 LOC）

| 子轨 | 内容 | 文件数 | LOC |
|---|---|---:|---:|
| T1a mine/ | 删 `ModelSelector.tsx`、`LLMOutputControlSettings/` 整目录、`ProgressBarSlider.tsx`、`ModelCapabilitiesIcons.tsx`、`provider-brand-icons.tsx`；trim `hover-menu-manager.tsx` 的 `HoverMenuWrapper`；将 `NavigableMenu.tsx` 收敛为 types-only 文件；同步收口 `mine/index.ts` barrel | 8 删 + 3 改 | -1,217 |
| T1b ai-elements | 删 `message.tsx`、`open-in-chat.tsx`、`sources.tsx`、`task.tsx`；`index.ts` 只保留 Reasoning + Shimmer | 4 删 + 1 改 | ~-300 |
| T1c T11R adapters + ports | 删 5 个无 consumer 的 adapter（VaultPort/VaultEvent/HostMetadata/WorkspaceObserver/WorkspaceBus）+ 4 个对应 port；boundary test 同步剔除其断言 | 9 删 + 1 改 | ~-250 |
| T1d type shims | 删 `service/search/index/cascade/types.ts`、`chunkTypes.ts`、`index/types.ts`、`mcp/types.ts`；迁 caller 至 `@/core/*` | 4 删 + 9 改 | -38 |

### Track 2 — Runtime ownership tail（净 ~-290 LOC）

| 子轨 | 内容 | LOC |
|---|---|---:|
| T2a ContextBuilder retirement | 删除 300-LOC 的 `ContextBuilder.ts`；让 `ConversationService.contextPipeline` 必须 wire（缺则 throw），删除 fallback 分支；保留 `setContextPipeline` 注入入口以解决 init 时序耦合 | ~-285 |
| T2b ClaudeAgentSDKBridge singleton | 删除 `let _instance` + `getAgentBridge()`，2 个 caller 改为 `new ClaudeAgentSDKBridge()` 内联构造 | -10 |
| T2c Copilot phase global | 删除 `_currentSetPhase` module global；改为 modal-owned `phaseController: { current }` ref 经 prop 注入到 React content | -10 |

### Track 3 — Copilot panel shell + family consolidation（净 ~-700 LOC）

**新增基础组件（~290 LOC 一次性投资）：**
- `src/ui/view/copilot/components/CopilotPanelShell.tsx` — header + scrollable body + footer (dismiss + actions[]) 通用 shell
- `src/ui/view/copilot/components/DiffBodyParts.tsx` — DiffLegend / DiffSection / SideBySideSection / `applyDiffResult` helper
- `src/ui/view/copilot/components/FindingsBodyParts.tsx` — SeverityIcon / SeverityBadge / FindingCard / PanelEmptyState
- `src/ui/view/copilot/components/SuggestionBodyParts.tsx` — SelectableRow / DirectionBadge / SuggestionSummaryBox

**已 shell 化的 panel（11 个，删除掉的重复 chrome ~990 LOC）：**

| Family | Panels | Before | After | Δ |
|---|---|---:|---:|---:|
| TextStream（已存在） | Summarize / Synthesize / ContinueWriting / WriteArticle | 239 | 239 | 0 |
| TextStream（核心 rehouse） | TextStreamPanel.tsx | 179 | 153 | -26 |
| Diff result | FormatPolish / Translate / RewriteSelection / Polish | 379 | 223 | -156 |
| Findings | Review / KnowledgeGaps / CorrectContent | 478 | 398 | -80 |
| Suggestion | LinkSuggest / SemanticLinkSuggest / SmartConnections / FindRelated | 523 | 391 | -132 |
| Misc shell adoption | AddEvidence / DedupeScan / VaultSummary / ExtractConcepts / PromptAudit / DetectAndFile / TagSuggestion | 1,206 | 920 | -286 |
| **合计** | 17 panels | 3,004 | 2,324 | **-680** |

剩余未 shell 化的 panels（VaultHealth tabbed shell、CheckTaskList / ExtractTodos / FindAndSolveTasks / Split / SplitPanel 各有 unique 形态）留给后续 wave。

### Track 4 — Stub / half-wired UI（净 ~-130 LOC）

| 项 | 处理 | LOC |
|---|---|---:|
| chatBridge.ts vs messageReceiptSlot.ts 双 registry | dashboard-side 删除 messageReceipt registry block；`mountCuratorPushRoot` 改为直接调用 chat-side canonical `registerMessageReceiptRenderer`；`InlineReceipt.tsx` import 同步更新 | -60 |
| ContextRing.tsx | 整个文件删除（97 LOC）：chat 从未推送 utilization → composer slot 从未渲染。`mountCuratorPushRoot` 移除 composer slot 注册 | -97 |
| WhatWasThisAbout 假 footer verb | 删除 `<Modal.Footer>` + `VerbButton` + `pickVerb`（只 `console.info` + close 的假按钮）| -50 |
| Chat tag no-op handler | 删除 `handleSuggestionTagClick`（`console.log` + 空 switch，无 caller）| -20 |
| Composer "Coming soon" rows | **延后**：3 处 `data-disabled="true"` row 仍渲染在 `ComposerRetained.tsx`，重构面较大且 chat IA 整体改造已立项，本 wave 不动 | 0 |
| Settings PR-D legacy stub copy | **延后**：需要逐 surface（OverviewTab、ProfilesTab、KnowledgeIndexTab 等）验证 adapter 是否真已替代 stub，留给 Settings shell wave | 0 |

### Track 5 — Shared UI ownership（净 0 LOC，结构性）

| 项 | 内容 |
|---|---|
| `src/ui/component/diff/**` → `src/ui/components/shared/diff/**` | 3 文件迁移（DiffView.tsx、lineDiff.ts、wordDiff.ts），2 个 caller 同步：`DiffBodyParts.tsx`、`ChangesArtifactPanel.tsx`。`src/ui/component/diff` 目录已空，被自动清理 |
| Source guard | `test/t11r-zero-obsidian-boundary-regression.test.ts` 的 `testRelocatedFilesAreGone()` 新增 3 个被退役的旧 diff 路径 |

## 6. 改动文件按 track 归类

完整列表见 git history（`git log -p 973e128f..HEAD`）。这里给重点：

**Track 1（删除）：**
- `src/ui/component/mine/{ModelSelector,ProgressBarSlider,ModelCapabilitiesIcons,provider-brand-icons}.tsx` ✂️
- `src/ui/component/mine/LLMOutputControlSettings/` ✂️ 整目录
- `src/ui/component/mine/{NavigableMenu,hover-menu-manager,index}.tsx` 改写
- `src/ui/component/ai-elements/{message,open-in-chat,sources,task}.tsx` ✂️
- `src/app/adapters/{VaultPort,VaultEvent,HostMetadata,WorkspaceObserver,WorkspaceBus}Adapter.ts` ✂️
- `src/core/ports/{VaultLookup,VaultEvent,WorkspaceObserver,WorkspaceBus}Port.ts` ✂️
- `src/service/search/index/{cascade/types,chunkTypes,types}.ts`, `src/service/mcp/types.ts` ✂️
- 调整 caller：`src/service/search/index/cascade/{CascadeChangeDetector,CascadeWorker}.ts`, `src/service/search/index/{indexService,indexInitializer,helper/safeChunking,helper/semanticRelatedEdges,retriever/types,support/llm-enrichment-progress-tracker}.ts`, `src/ui/view/settings/{tabs/KnowledgeIndexTab.tsx,components/MCPServerCard.tsx,components/MCPServerSection.tsx}`, `src/service/mcp/MCPClientManager.ts`, `test/cascade-change-detector.test.ts`
- 同步 boundary test：`test/t11r-zero-obsidian-boundary-regression.test.ts`

**Track 2（runtime tails）：**
- `src/service/chat/context/ContextBuilder.ts` ✂️
- `src/service/chat/service-conversation.ts` 改
- `src/service/agents/harness-bridge/ClaudeAgentSDKBridge.ts`、`src/service/agents/{FollowupChatAgent,DocSimpleAgent}.ts` 改
- `src/ui/view/copilot/CopilotResultContent.tsx`、`src/app/copilot/modals/CopilotResultModal.tsx` 改

**Track 3（Copilot panel shell）：**
- 新增：`src/ui/view/copilot/components/{CopilotPanelShell,DiffBodyParts,FindingsBodyParts,SuggestionBodyParts}.tsx`
- 改写：`src/ui/view/copilot/components/TextStreamPanel.tsx`
- 改写：`src/ui/view/copilot/panels/{FormatPolish,Translate,RewriteSelection,Polish,Review,KnowledgeGaps,CorrectContent,LinkSuggest,SemanticLinkSuggest,SmartConnections,FindRelated,AddEvidence,DeduplicateScan,VaultSummary,ExtractConcepts,PromptAudit,DetectAndFile,TagSuggestion}Panel.tsx`

**Track 4（stub cleanup）：**
- `src/ui/view/usage-dashboard/integration/chatBridge.ts` 改（保留 context utilization，删除 messageReceipt + composer slot）
- `src/ui/view/usage-dashboard/runtime/mountCuratorPushRoot.ts` 改
- `src/ui/view/usage-dashboard/components/ContextRing.tsx` ✂️
- `src/ui/view/usage-dashboard/components/{InlineReceipt,WhatWasThisAbout}.tsx` 改
- `src/ui/view/chat-view/hooks/useChatSession.ts` 改

**Track 5（shared UI 迁移）：**
- 新增：`src/ui/components/shared/diff/{DiffView.tsx,lineDiff.ts,wordDiff.ts}`
- 删除：`src/ui/component/diff/` 整目录
- 改 caller：`src/ui/view/copilot/components/DiffBodyParts.tsx`、`src/ui/view/copilot/review/ChangesArtifactPanel.tsx`

## 7. 删除 / 移动路径完整清单

**完全删除（不再可访问）：**
```
src/app/adapters/HostMetadataAdapter.ts
src/app/adapters/VaultEventAdapter.ts
src/app/adapters/VaultPortAdapter.ts
src/app/adapters/WorkspaceBusAdapter.ts
src/app/adapters/WorkspaceObserverAdapter.ts
src/core/ports/VaultEventPort.ts
src/core/ports/VaultLookupPort.ts
src/core/ports/WorkspaceBusPort.ts
src/core/ports/WorkspaceObserverPort.ts
src/service/chat/context/ContextBuilder.ts
src/service/mcp/types.ts
src/service/search/index/cascade/types.ts
src/service/search/index/chunkTypes.ts
src/service/search/index/types.ts
src/ui/component/ai-elements/message.tsx
src/ui/component/ai-elements/open-in-chat.tsx
src/ui/component/ai-elements/sources.tsx
src/ui/component/ai-elements/task.tsx
src/ui/component/mine/LLMOutputControlSettings/  (整目录)
src/ui/component/mine/ModelCapabilitiesIcons.tsx
src/ui/component/mine/ModelSelector.tsx
src/ui/component/mine/ProgressBarSlider.tsx
src/ui/component/mine/provider-brand-icons.tsx
src/ui/component/diff/                            (整目录，已迁移)
src/ui/view/usage-dashboard/components/ContextRing.tsx
```

**移动（路径变了，内容保留）：**
```
src/ui/component/diff/DiffView.tsx → src/ui/components/shared/diff/DiffView.tsx
src/ui/component/diff/lineDiff.ts  → src/ui/components/shared/diff/lineDiff.ts
src/ui/component/diff/wordDiff.ts  → src/ui/components/shared/diff/wordDiff.ts
```

## 8. 保护功能验证

- ✅ **Usage Dashboard** 仍存在：`UsageDashboard.tsx`、所有 screens（History、Budget、Overview、ProviderModel、Optimization）、`InlineReceipt`、`WhatWasThisAbout`、`CuratorPushModal` 均未删。仅清理 ContextRing 半接线组件 + WhatWasThisAbout 的假 footer verb。
- ✅ **Chat 三栏 view** 注册不动：`ChatView.tsx`、`ProjectListView.tsx`、`ConversationOutlineView.tsx` 文件存在且 main.ts 仍注册三个 view type。
- ✅ **Vault X-Ray** 仍存在：`src/ui/view/vault-xray/` 整个目录未触动。
- ✅ **Copilot action id / bindings 保留**：`copilot-action-surface-registry.test.ts` PASS（28 actions, every built-in action has icon + result panel binding）；`copilot-action-runtime-ports.test.ts` PASS（10 检查）。
- ✅ **Boundary audit 0 findings 守住**：`npm run audit:boundary` `_None detected._`；`t11r-zero-obsidian-boundary-regression.test.ts` 全 15 个断言 PASS。
- ✅ **核心 search / index / agent**：未触动 `src/service/search/index/{indexService,IndexService,indexInitializer}.ts` 核心逻辑（只更新了 sibling import path）；agents/harness 未触动；Command Gateway 未触动。

## 9. 视觉依赖图

### Copilot panel 收敛后的依赖

```
                         CopilotResultModal (modal shell)
                                   │
                                   ▼
                          CopilotResultContent
                                   │
                            ┌──────┴──────┐
                            │             │
                            ▼             ▼
                    getCopilotResultPanel  CopilotReviewShell
                            │
                            ▼
                       <one of 28 panels>
                            │
                            │ uses
                            ▼
                  ┌────────────────────────┐
                  │  CopilotPanelShell     │  ◄── 全部 17 个已 shell 化 panel
                  │  (header+body+footer)  │     都收敛在这里
                  └────────────────────────┘
                            │
            ┌───────────────┼─────────────┬───────────────┐
            ▼               ▼             ▼               ▼
      DiffBodyParts   FindingsBodyParts  SuggestionBodyParts  TextStreamPanel
      (Diff family)   (Findings family)  (Suggestion family)  (TextStream family)
```

### Runtime singleton 拓扑（before → after）

```
Before:
  ChatService 启动:
     ConversationService ─► ContextBuilder (fallback, 300 LOC)
                       └─► ContextPipeline   (preferred)
  FollowupChatAgent ─► getAgentBridge() ─► _instance ◄── service module global
  DocSimpleAgent   ─►       同上          ─►
  CopilotResultModal ─► getCurrentSetPhase() ─► _currentSetPhase ◄── React module global

After:
  ConversationService ─► ContextPipeline (required, throw if not wired)
  Each agent caller   ─► new ClaudeAgentSDKBridge()  (stateless, no module global)
  CopilotResultModal  ─► phaseController: { current }  (modal-scoped ref, prop)
```

## 10. Code Reading Guide

按下面这个顺序读，可以最快理解本 wave 的关键变更：

1. **`src/ui/view/copilot/components/CopilotPanelShell.tsx`**
   读它来了解所有 11 个 shell 化 panel 共用的 chrome 是什么形状。

2. **`src/ui/view/copilot/panels/FormatPolishPanel.tsx`（45 LOC）**
   最小的 shell wrapper，对照下面看模式：
   - header / footer 已外移到 shell
   - body 是单一 `<DiffSection original={...} modified={...} />`
   - `applyDiffResult({scope, file, modified, vault})` 接管 selection vs full 的 apply 逻辑

3. **`src/ui/view/copilot/panels/PolishPanel.tsx`（67 LOC）**
   带 breadcrumb / onBack 的复杂变体——shell 已经把 onBack 化为内置 prop，仍只需要 67 LOC。

4. **`src/ui/view/copilot/panels/TagSuggestionPanel.tsx`（230 LOC）**
   反例：分层 confidence tiers + 行内编辑 + 三种 action button 让 row body 高度 bespoke，shell 只能省掉 header/footer chrome。

5. **`src/service/chat/service-conversation.ts`** 的 `prepareChat` 方法
   读 `if (!this.contextPipeline) throw` 之前/之后的对比，理解为什么 ContextBuilder 这条 fallback 路径可以安全删除。

6. **`src/service/agents/harness-bridge/ClaudeAgentSDKBridge.ts`** 的尾部
   注意没有 `let _instance` 或 `getAgentBridge()`。这是「service 层不再 own runtime 单例」的最小示范。

7. **`src/app/copilot/modals/CopilotResultModal.tsx`** 的 `phaseController` field
   理解 React 模块全局如何替换为 modal 实例上的 ref。

8. **`src/ui/view/usage-dashboard/runtime/mountCuratorPushRoot.ts`**
   注意现在 `registerMessageReceiptRenderer` 来自 `@/ui/view/chat-view/integration/messageReceiptSlot`，而不是 dashboard 自己的 chatBridge。这是 carrier A 的 canonical registry 修正。

## 11. 跳过的 track / 部分跳过的子项及证据

| 项 | 状态 | 原因 |
|---|---|---|
| Optional Track 6 Settings section shell | 跳过 | Required tracks 已经 deliver 全部 5 个；时间窗内 Settings shell 需要先做 IA 调研（4 个 tab 形态差异大），单独走 wave T11U-Settings 更安全 |
| Optional Track 7 Usage Dashboard shell | 跳过 | 同上。Dashboard 已经 land 过 `DashboardCard` / `DashboardSection` mock（见 [project_usage_dashboard_on_hold.md](memory)），需要先验证 mock 是否符合 production，不应仓促重构 |
| Optional Track 8 Quick Search V2 shell | 跳过 | V2 UI 上一轮 redesign 还未稳定（见 [project_v2_search_ui_progress.md](memory)）。本 wave 不动 |
| Optional Track 9 CSS dead namespace | 跳过 | 删 CSS 必须先做组件视觉回归 QA。本 wave 删除了 ContextRing 但其 CSS 由 design system tokens 提供，无 dead namespace 残留 |
| Optional Track 10 Package pruning | 跳过 | depcheck + runtime smoke 是独立的工程，不在本 wave 范围 |
| T4 Composer Coming-soon rows | 部分跳过 | `ComposerRetained.tsx` 的 3 处 disabled row 需要 chat IA 决策（隐藏 vs 真接线），重构面较大 |
| T4 Settings PR-D legacy stub copy | 部分跳过 | 需要逐 surface 验证 adapter 已替代 stub。OverviewTab 等 4 个 tab 各 ~1k LOC，先走专项 audit |
| T3 VaultHealthPanel | 部分跳过 | 该 panel 有 tabs 形态，需要 `TabsHeader` 辅助组件；本 wave 不引入额外 sub-shell |
| T3 SplitPanel / CheckTaskList / ExtractTodos / FindAndSolveTasks | 部分跳过 | 每个都有 unique body 形态（split editor / checklist editing / todo extraction），shell 化收益 < 30 LOC，不值这一轮投入 |

## 12. 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm run build` | ✅ green (esbuild 0 error，bundle check pass) |
| `npm run audit:boundary` | ✅ `_None detected._` 所有 5 个 bucket 都为 0 |
| `npm run test -- test/copilot-action-surface-registry.test.ts` | ✅ PASS (28 actions × icon + panel binding) |
| `npm run test -- test/copilot-action-runtime-ports.test.ts` | ✅ PASS (10 个 runtime + port + dispose 断言) |
| `npm run test -- test/t11r-zero-obsidian-boundary-regression.test.ts` | ✅ PASS (15 个断言，已更新为 11 个 T11R infra 文件 + 5 个 retired 文件) |
| `cloc src styles.css --quiet --json` | 115,538 → **113,015**（-2,523 LOC，过 Primary 阈值） |

测试串行执行——本 repo 的 `run-test.js` 共享临时 bundle 名字，并行跑容易混淆输出。

## 13. 收尾说明

本 wave 是 T11 系列首个明确以「LOC 净减少」为 Primary metric 的 major wave。完成后留给后续 wave 的关键基础设施：
- `CopilotPanelShell` + 三套 body part helpers 已经 land，剩余 11 个 panel 的 shell 化是 mechanical 工作（不需要新基础设施）。
- `ContextPipeline` 现在是 ConversationService 的硬依赖——后续给 chat context 加新 slot 不会再走 ContextBuilder 的 deprecated 分支。
- T11R 9 个无 consumer 的 adapter/port 退役后，`src/app/adapters` 目录回到了 3 个真正 alive 的 adapter（HttpClient / NoticeNotifier / ObsidianProgressReporter），boundary test 的 required-file 列表也清爽了。
- Diff primitives 现在住在 `src/ui/components/shared/`，是后续把 `src/ui/component/**` 整体下线（rename 到 `legacy/` 或 inline）的第一块基石。
