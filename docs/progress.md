# Peak Assistant — Progress Tracker

## Overview

Obsidian AI assistant plugin. 当前目标：**产品完备** — 从 onboarding → 配置 → Chat → Search → Graph 每个环节都能跑通，体验完整。同时推进技术债清理和架构重构。

## Phases

| Phase | Content | Status |
|-------|---------|--------|
| A. 产品断点修复 | 用户旅程中 blocks-usage 的问题 | 完成 (6/6) |
| M. 移动端支持 | iCloud同步 + 去RAG + Claude长上下文 | 完成 (11 commits) |
| B. UX 打磨 | degrades-UX 的问题 + ui-improvements | 完成 (16项) |
| C. 技术债清理 | 死代码/桩代码/注释代码/空文件 | 完成 (9项修复 + 56文件/10800行删除) |
| D. 代码拆分重构 | 大文件拆分 | 完成 (7大文件→23小文件) |
| E. 文档清理 | 归档docs、标记计划、更新过时文档 | 完成 |
| V1 退役 | 删除 V1 search pipeline + step UI | 完成 (-9000行) |
| H. 后台多 Session | 关闭 modal 继续分析 + 多 session 并发 + Active Sessions UI | 完成 (11 commits) |
| F. Provider v2 | 删 Vercel AI SDK → Agent SDK query() | Plan 就绪 (12 tasks, 3 sub-waves) |
| G. Agent Trace | 可观测性 (阻塞于 F) | 未开始 |
| I. Query Pattern Discovery | LLM 驱动查询模式发现 + 上下文建议 | 完成 (12 commits) |
| J. Vault Search Redesign | VS Code 风格 inspector side panel | 完成 (6 commits) |

## Next

- [ ] 真机测试：Query Pattern Discovery 全流程（seed patterns → 建议卡片 → usage count → discovery trigger）
- [ ] 真机测试：Vault Search Redesign 全流程（inspector side panel → 模式切换 → topic 导航 → query-aware 过滤）
- [ ] Provider v2: 启动 Wave 1 Foundation（plan at `docs/superpowers/plans/2026-04-20-provider-system-v2.md`）
- [ ] GitHub triage: 关闭 29 个已完成/重复/过时 issue
- [ ] 考虑替换 playwright+@langchain/community 为 fetch (减 50MB 依赖)

## Log

### 2026-04-20 (Session 2)
- Done: Query Pattern Discovery 全量实现 (Phase I, 12 commits)
  - `query_pattern` SQLite table + QueryPatternRepo (CRUD, incrementUsage, deprecateStale)
  - Zod schemas: MatchConditionSchema, DiscoveredPatternSchema, PatternDiscoveryOutputSchema
  - ContextProvider: 同步收集 15 个 VaultContext 变量（文档基础/内容特征/关系网络/时间历史）
  - PatternMatcher: 8 种条件评估 + 变量填充 + 排序
  - 7 个 seed patterns（deterministic IDs, idempotent insertion）
  - PatternDiscoveryAgent: LLM 分析查询历史 → 发现新模式（singleton guard, fire-and-forget）
  - PatternMergeService: 模板去重 + 30 天自动过期
  - Trigger: plugin load seed + 每 20 次分析触发 discovery
  - AI Analysis landing page 全面改造：SuggestionGrid(2列卡片) + ActiveSessionsList + RecentAnalysisList
  - HoverCard preset switcher → inline mode pills（紫色活跃态）
  - Modal-level footer（键盘提示 + 分析计数）
  - 删除 default-analysis-queries.json + AIAnalysisPreStreamingState idle 状态

- Done: Vault Search Redesign 全量实现 (Phase J, 6 commits)
  - vaultSearchStore: 新增 `help` mode + persistent `inspectorOpen` toggle + 移除 `[[` prefix 模式
  - 模式系统：`?` help prefix → ModeHelpList（5 种模式可导航列表）
  - HoverCard mode switcher → inline mode badge（右侧 pill 显示当前模式）
  - Side-by-side 布局：results panel (flex-1) + 340px inspector side panel（→/← 键切换）
  - InspectorSidePanel: 3 个可折叠 section（Connected/Discovered/AI Graph）
  - ConnectedSection: 合并 outgoing+backlinks, 上下文片段, query-aware 过滤（相关性>0.3 绿色✓, ≤0.3 半透明）
  - DiscoveredSection: SEM(紫) + CO-CITE(蓝) + UNLINKED(琥珀) 三源融合, WHY 标签, 渐进展示
  - AIGraphSection: 历史 AI Graph 查找 + "New window ↗" + "Generate AI Graph" 按钮
  - coCitationService: SQL join 共引分析（HAVING ≥ 2 共引者）
  - unlinkedMentionService: FTS5 标题搜索发现未链接提及
  - SearchResultRow: 紫色相关性分数 badge
  - Topic navigation: 点击 inspector 链接 → 更新选中 + inspector, 保持查询
  - Before-typing: 预选活跃文档, "Recently opened" 标签
  - 清理: 删除 GraphSection.tsx + InspectorPanel.tsx

### 2026-04-20 (Session 1)
- Done: Execution Roadmap 创建 (`docs/execution-roadmap.md`)
  - 全任务冲突矩阵分析（文件级并行可行性判定）
  - 4 Wave 排期：Wave 0 cleanup → Wave 1 search → Wave 2 provider v2 + theme → Wave 3 trace + chat
  - Milestone Persistence 确认已实现（working tree 中，待 commit）
  - Phase 0 文档清理确认已完成（4 归档 + 3 更新 + 3 标记 + spikeAgentSdk 删除）
- Done: Provider v2 Implementation Plan (`docs/superpowers/plans/2026-04-20-provider-system-v2.md`)
  - 12 tasks, 3 sub-waves (Foundation → Migration → Cleanup)
  - 全量代码锚点：探索了 provider stack、chat system、agent files、settings、build config
  - 精确迁移清单：6 streamText + 2 generateText + 1 generateObject + 2 embedMany + 2 Experimental_Agent + ~16 chatWithPrompt 间接调用
  - 估算 delta: 删 ~3500 行, 加 ~1800 行
- Done: UI/Theme Foundation spec + plan
  - Spec: `docs/superpowers/specs/2026-04-20-ui-theme-foundation-design.md`
  - Plan: `docs/superpowers/plans/2026-04-20-ui-theme-foundation.md` (11 tasks)
  - CSS var bridge (--pk-*) 映射 Obsidian 原生 var，自动适配 Minimal theme 分区配色
  - Style Settings 全面开放：结构色 + 品牌色 + 语义色
  - 559 处内联 hex 分 4 批清理
- Done: Chat System Polish spec + plan
  - Spec: `docs/superpowers/specs/2026-04-20-chat-system-polish-design.md`
  - Plan: `docs/superpowers/plans/2026-04-20-chat-system-polish.md` (12 tasks)
  - 4 store → 2 store 重构 (chatDataStore + chatViewStore)
  - ChatInputArea 453 → ~150 行 (提取 4 hooks/components)
  - #93 delete conversation + #73 mode backend (prompt 分支) + #81 Ctrl+Arrow history
  - 记录：mode Level B/C 升级推迟到 Provider v2 后
- Done: 修复 4 个 AI Search 核心 bug
  - Spinner 空白：Evidence plan 完成后到 plan 出现前无 loading 指示 → 加 `isWaitingForPlan` 第三状态
  - Open in File 按钮不显示：V2Footer 从 `searchSessionStore` 读 `lastSavedPath`，但写入端在 `aiAnalysisRuntimeStore` → 统一读写到同一 store
  - Graph 数据未持久化到 markdown：persist useEffect 缺少 graph 依赖 → 加 `hasGraphData`/`hasGraphAgentData` deps
  - 疯狂刷 IndexService 日志：`ChatFolder/AI-Analysis` 未被排除于 listener indexing → 统一 `shouldSkipListenerIndexing()` 排除 Hub-Summaries + AI-Analysis
- Done: persist useEffect 加 2s debounce，合并快速连续 vault.modify 调用
- Done: Copy 按钮改为 view-aware — 单击复制当前 tab 内容（Process/Report/Graph），hover 弹出菜单选择
- Done: MultiLensGraph 全部中文文案改为英文（tooltip、empty message、loading、按钮）
- Done: Generate Knowledge Graph 按钮样式改为品牌紫色
- Done: Graph 节点支持拖拽（ReactFlow `onNodesChange` + `applyNodeChanges`）
- Done: 自动重叠解消 — post-layout `resolveOverlaps()` pass，基于 `estimateNodeWidth` 检测 AABB 碰撞并推开重叠节点
- Next: 真机测试上述修复 + 后台多 Session 已知限制修复

## Completed Work (2026-04-18)

### Phase M: 移动端支持 ✅
- Platform gate + 动态导入守卫
- VaultContentProvider + main.ts 启动守卫（跳过 SQLite）
- MobileSearchService（路径/标签/内容三层搜索）
- MobileVaultSearchAgent（搜索→读文件→Claude 1M 长上下文）
- 直觉地图导出为 vault JSON 文件（iCloud 同步）
- 隐藏桌面专属命令和 UI

### Phase A: 产品断点修复 ✅ (6/6)
- A1: 友好错误信息引导到 Settings → Model Config
- A2: 默认模型统一为 openai/gpt-4o-mini（不再依赖 OpenRouter）
- A3: Vault 未索引时显示引导文案
- A4: 侧栏对话右键菜单增加 Delete
- A5: deleteProject 全栈实现（Repo → Store → Service → Manager → UI）
- A6: Provider 启用无 key 时显示警告

### Phase B: UX 打磨 ✅ (16项)
- B1: AI Analysis 空白页 P0 → 显示 loading 替代 null
- B2: "0 days ago" → 日历日差 + "yesterday"
- B3: 搜索结果路径截断为最后2段 + hover 全路径
- B4: Chat tool call 默认折叠
- B5: Chat placeholder 简化为单行
- B6: Suggestion tags 首条消息前隐藏
- B7: EmptyState 统一组件
- B8: Hops segmented control（品牌紫色选中态）
- B9: Quick Actions 紧凑化 + 品牌紫色左边框
- B10: 报告表格 CSS fallback 样式
- B17: 删除无操作的 "Full analysis view" 按钮
- B18: graphSummary 从 aiGraphStore 接线
- B20: 弹窗标题 "Create" → "Rename"
- B21: Settings provider 默认选中第一个已启用
- B22: Graph 空结果显示 "No connections" 反馈
- Vault search 空状态改进 + 索引引导文案

### Phase C: 技术债清理 ✅
- 删除 DocumentCache.ts 空文件
- 清理 aiSearchService deprecated 方法
- 修复 TableDocumentLoader XLSX stub
- FlashRank reranker 改为 throw 明确错误
- 清理 searchPrompts stub
- 清理 find-orphans TODO + MobiusEdgeRepo 空方法
- 恢复 ModelConfigTab 3个模型选择器
- 合并 date-utils 到 core/utils（6处导入更新）

### Phase D: 代码拆分 ✅
| 文件 | 原大小 | 主文件新大小 | 提取文件数 |
|------|--------|-------------|-----------|
| useSearchSession.ts | 1193 | 342 | 3 |
| searchSessionStore.ts | 922 | 797 | 1 |
| MessageViewItem.tsx | 838 | 280 | 3 |
| tab-AISearch.tsx | 947 | 370 | 4 |
| search-agent-schemas.ts | 1407 | 1346 | 1 |
| service-manager.ts | 972 | 809 | 2 |
| AiSearchAnalysisDoc.ts | 1154 | 202 | 2 |

### Phase E: 文档清理 ✅
- 标记 11 个已完成计划 + 3 个被取代计划
- 更新 DEVTOOLS_GUIDE、quick-search-ui-design、AI_ANALYSIS_ARCHITECTURE 文档

### V1 退役 + 死代码全面清理 ✅ (~10,800行, ~56文件)
| 类别 | 删除 |
|------|------|
| V1 phase 文件 (classify/decompose/recon/report 等) | 9 文件 |
| V1 Step UI 组件 (ClassifyStep/ReconStep 等) + 渲染管线 | 18 文件 |
| 死 hooks (useAIAnalysis/aiAnalysisStreamDispatcher/useOpenInChat) | 3 文件 |
| 死 stores (searchInteractionsStore) | 1 文件 |
| 死 tools (search-web/call-agent-tool/field-update-tool) | 3 文件 |
| 死 schemas (callAgentTool/searchWeb/updateResultOps) | 3 文件 |
| 死组件 (CompletedAIAnalysis/StreamingAnalysis/UsageBadge/V2SectionNav) | 7 文件 |
| 死 agent 基础设施 (AgentLoop/type.ts) | 2 文件 |
| 遗留服务 (DailyStatsiticsService/LogMetricRegister/ActivityService/ScriptLoader/HtmlView) | 5 文件 |
| 死 CSS (streamdown-backup.css) + 死 chunk (deprecated_chunking.ts) | 2 文件 |
| VaultSearchAgent 简化 | 346行 → 42行 |
| SearchClient 清理 | 删除 aiAnalyze + aiSearchService |
| searchSessionStore/types 清理 | 删除 V1 steps 字段/类型/getAllSections/getAllSources |
| useV2 feature flag 删除 | V2 Agent SDK 现为唯一路径 |
| 死设置字段清理 | scriptFolder/htmlViewConfigFile/statisticsDataStoreFolder 从类型+UI+loader 移除 |
| 依赖清理 | simple-git 从 package.json 移除 |
| core/types.ts 瘦身 | 删除 AgentLoop 专用类型，仅保留 UserFeedback/HitlPausePoint |

## 已完成计划

| 计划 | 日期 | 状态 |
|------|------|------|
| ai-search-ui-step-based-refactor | 04-08 | COMPLETED |
| vault-search-agent-sdk-migration | 04-12 | COMPLETED |
| v2-search-ui | 04-12 | COMPLETED |
| per-section-report-generation | 04-13 | COMPLETED |
| mission-roles-plan-review | 04-14 | COMPLETED |
| playbook-dimension-framework | 04-14 | COMPLETED |
| report-generation-reliability | 04-14 | COMPLETED |
| report-quality-overhaul | 04-15 | COMPLETED |
| ai-graph-multi-lens | 04-15 | COMPLETED |
| continue-analysis-process-view | 04-17 | COMPLETED |
| ai-graph-agent | 04-18 | COMPLETED |
| mobile-support | 04-18 | COMPLETED |
| ui-improvements-all-strategies | 04-18 | COMPLETED |
| background-multi-session | 04-19 | COMPLETED |
| query-pattern-discovery | 04-20 | COMPLETED |
| vault-search-redesign | 04-20 | COMPLETED |
| per-section-report-v2 | 04-13 | SUPERSEDED |
| v2-report-quality-and-ui-fixes | 04-13 | SUPERSEDED |
| context-handoff-v2-ui | 04-12 | SUPERSEDED |

## Log

### 2026-04-19
- Done: Report tab 无内容时展示 Plan（替代占位文字），用户可直接在 Report tab 审阅+批准 plan
- Done: Plan 出现即持久化 — v2PlanSections 出现时立即触发 auto-save，Open in File 在 plan 阶段即可用
- Done: 后台多 Session 系统 (Phase H, 11 commits)
  - 提取 eventDispatcher 纯函数 + streamConsumer 独立函数（脱离 React 依赖）
  - BackgroundSessionManager 单例：detach/restore/cancel/queue 全生命周期
  - 事件重定向机制：前台闭包继续跑，事件自动写入后台 snapshot
  - Modal 关闭 → 活跃 session 自动 detach 到后台
  - Modal 打开 → 从 Notice 或 Active Sessions 恢复后台 session 到前台
  - Active Sessions UI：Recent Analysis 顶部展示进行中/plan-ready/排队中的后台 session
  - 并发控制：最多 3 个 streaming，超过排队；plan-ready 不占并发位
  - Notice 通知：plan ready / completed 可点击恢复，error 通知
  - Plugin unload 清理所有后台 session
- Known limitations: 多 session 事件重定向单例（同时>1 streaming 只有最后一个接收事件）、后台无增量持久化、restore flicker
- Next: 真机测试 + 已知限制修复

### 2026-04-18
- Done: AI Graph Agent 全部实现
- Done: 移动端支持全部实现 (Phase M, 11 commits)
- Done: 产品断点修复全部完成 (Phase A, 6/6)
- Done: UX 打磨 16 项完成 (Phase B)
- Done: 技术债清理 9 项 (Phase C)
- Done: 7 个大文件拆分为 23 个聚焦文件 (Phase D)
- Done: 文档清理完成 (Phase E)
- Done: V1 search pipeline 完全退役 + 全面死代码清理 — 删除 56 文件 / ~10,800 行
- Done: VaultSearchAgent 简化为 42 行纯路由器（mobile → MobileAgent, desktop → AgentSDK）
- Done: 删除遗留服务集群（DailyStatsiticsService/LogMetricRegister/ActivityService/ScriptLoader/HtmlView）
- Done: 清理死设置字段（scriptFolder/htmlViewConfigFile/statisticsDataStoreFolder）+ UI
- Done: 移除 simple-git 依赖
- Done: useV2 feature flag 删除，V2 Agent SDK 为唯一搜索路径
- Done: 5 轮死代码审计全部清零，代码库无残留死代码
- Next: iOS 真机测试 → Provider v2 → Agent Trace
