# 04 · 冗余/重复模块盘点原稿

> 2026-07-27 rg + 源码核实。重要：本稿修正了 capability-matrix 里的两处过重判断（消息渲染、chat 壳）。

## Part A · 已知分叉复核

| 项 | 复核结论 |
|---|---|
| a) 消息渲染 ×4 | **部分证实**：真正的 markdown 渲染只有 MessageViewItem + InsightInlineChat 两处，且都已收敛到 `StreamdownIsolated`；CopilotCommandCenterModal（裸 DOM 计划列表）和 RunReceiptCard（纯文本回执卡）是不同信息模型的展示层，**不算渲染器重复** |
| b) 结果列表 ×2 | **证实**：result-browser（1788 行，6+ 消费方，canonical）vs V2SourcesView（205 行独立实现）。迁移难度中（图部分是 xyflow 不能直接搬） |
| c) 图片 layout ×2 | **证实且是功能 bug**：写入路径 `renderLayoutHtml`（pk-image-layout/data-pk-layout/row-grid-masonry-hero-thumbs，被 imageCoordinator.ts:356,685 实际调用）与读取路径 `parsePeakImageLayout`（peak-image-layout/data-layout/grid-hero-strip-story + 强制 4 figure）永不匹配 → AI 布局块退化 MonoView 纯文本。canonical=peak-（有 UI 消费方+测试）。另 `isLayoutBlockSource`（L227-229）零调用死代码。**难度低，优先修** |
| d) chat 壳 ×2 | **证实但非组件重复**：旧三叶子（合计 108 行薄包装）与 ChatStudioView 渲染同一份组件；重复的是"视图注册+生命周期协调"双套脚手架。canonical=ChatStudioView，难度中（涉及 ViewSwitchConsistentHandler 等引用回归） |
| e) 输入框 ×3 | **证实**：prompt-input 内核（1348 行，2 消费方）vs InsightInlineChat 裸 textarea（~15 行键盘逻辑重复）。其余裸 textarea 均为单行设置字段不算。难度低（提取 useEnterToSend hook 即可，不必上完整 PromptInput） |

## Part B · 深入排查

### 1. LLM 调用底座 ×3 + 手写循环 ×4（最大架构分裂）

| Substrate | 位置 | 规模 | 特征 |
|---|---|---|---|
| **A. AgentLoop（canonical）** | `harness/loop/AgentLoop.ts` | 1001 行 | 完整 harness：tier/budget/TraceBus/权限/subagent/记忆 |
| B. queryStructured | `service-manager.ts:984-1016` | 33 行 | 单轮结构化 JSON |
| C. Claude Agent SDK query() | `sdkAgentPool.ts`（queryWithProfile） | 353 行 | 原生 SDK + MCP 挂载 |

- `ClaudeAgentSDKBridge`（65 行）：Cloud backend 已于 2026-07 退役，`.run()` 永远转发 A——但只覆盖走 Bridge 的调用方。
- **仍在用 C 的**：`ai-graph/GraphAgent.ts`（151 行，自述"Vault Search main route no longer does this"）、`ReportOrchestrator.ts`（677 行，5 处 queryWithProfile 全 maxTurns:1）、`intuition.recon.ts`（281 行，手写 for 循环内调 C）。
- **手写循环靠 B**：`hubCurationRecon.ts`（68 行 for 循环）、`hubMaterializationRecon.ts`（151 行 while draft→critique）。
- copilot planner 循环是假线索：planOnly 单次调用 + executePlan 遍历静态计划，不算。
- 不一致：`VaultSearchAgent.ts:34,268` 直调 runAgentLoop（绕过 RunEnvelope），FollowupChatAgent 经 Bridge（自动获得包装）——难度低可统一。
- 合并 C/B→A：**难度高，暂不动**；hubCuration/hubMaterialization 两个裸循环迁统一 helper：低-中。

### 2. 遥测 ×5 套——职责基本不重叠，不建议合并

usage_log 族（成本记账）/ mobius_operation（单一 ai_analysis 类型，被 SessionContextService 读取喂 working-theme，非死代码）/ DebugTraceRecorder（内存 span 树）/ TraceBus（harness 步骤事件）/ composer intelligence JSONL（产品评估维度）。
TraceBus→DebugTrace 有官方桥（`debugTraceAdapter.ts` 225 行）——正确组合。**但 ReportOrchestrator 因走 substrate C 被迫手写第二份平行 adapter（`report/debugTraceAdapter.ts` 142 行）——根因在 B-1 的分裂，不在遥测本身**。

### 3. Markdown 渲染——已收敛，两处注意

- `StreamdownIsolated` 是唯一富渲染器（13 处消费，shiki/mermaid 单次加载）。
- **例外**：`MermaidBlockView.tsx:87` 直接 `import('mermaid')` 裸包，与 @streamdown/mermaid 是两条初始化/主题/安全配置线（node_modules 已去重无体积翻倍，但维护面两份）。难度低。

### 4. 图组件——双栈并行但分工清楚，不建议合并

cytoscape 栈（AtlasGraphCanvasImpl 524 行 canonical + 3 个薄封装消费方）vs xyflow 栈（MultiLensGraph 240 行，唯一消费方 V2SourcesView，timeline/swimlane 场景）。合并成本远超收益；建议文档明确"两栈分工"防选错。

### 5. Modal 宿主——基类存在但 7 个 Modal 未用

`ReactModalHost`（75 行）只有 5 个 Modal 采用；**7 个 Modal（VaultAutoRun/CopilotAutoRun/FileAtlas/CopilotReviewHistory/CopilotPicker/QuickSearch/CopilotResult，合计 721 行）手写逐字相同的 onOpen/onClose 样板**（~50 行 ×7）。ItemView 侧的 ReactItemViewHost 7/7 全采用（干净）。裸 DOM 的 6 个 Modal 不建议改。**难度低，纯样板删除**。

### 6. 配置加载——底层统一但 18 处骨架复制

TemplateManager.loadJson + ConfigTemplateId 是唯一 I/O 入口（好）；但 12 个 loadXConfig + 6+ 个 strings loader 逐字复制 try/catch/fallback 骨架（~150 行）。可抽 `defineConfigLoader<T>(templateId, defaults, merge)` 工厂（merge 语义各异需保留参数）。**难度低**。

### 7. 工具函数散落

- **truncate ×11 处**私有实现（core/utils 无导出版本）——难度低收益小，P3。
- **日期格式化**：canonical `core/utils/date-utils.ts`（8 导出）+ 5 处旁路（DateSeparator/SearchModal:584/Optimization:294/RecommendationBlock:139/slots/types.ts:56）。
- **slugify ×3 且行为分叉**：`insightSections.ts:29`（Unicode，60）、**`ChatDocName.ts:61`（ASCII-only——纯中文标题剥空 → 兜底 'untitled'，中文 vault 潜在用户可见 bug）**、`artifactProducers.ts:450`（Unicode，40）。需先验证线上是否已有 untitled 堆积。
- cn 唯一定义 97 处引用（健康）；debounce 是模式级重复非函数复制（可提 useDebouncedCallback，非紧急）。
- Zustand 18 个 store：唯一重叠对 aiGraphStore/graphAgentStore 是两个图 agent 的故意并存，先合 agent 才能合 store。

## 优先级汇总

| 级 | 项 | 难度 |
|---|---|---|
| P0 | 图片 layout 双格式 bug | 低 |
| P1 | 7 Modal 迁 ReactModalHost；18 处 config loader 工厂化 | 低 |
| P2 | slugify 统一（先验证中文 untitled）；V2SourcesView 迁 result-browser | 中 |
| P3 | InsightInlineChat useEnterToSend；truncate/date 收敛 | 低 |
| P4 观察 | 三套 LLM substrate；双图栈 | 高，暂不动 |
| 不动 | 5 套遥测；chat 旧壳（迁移期共存） | — |
