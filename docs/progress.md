# Peak Assistant — Progress Tracker

## Overview

Obsidian AI assistant plugin. 当前目标：**产品完备** — 从 onboarding → 配置 → Chat → Search → Graph 每个环节都能跑通，体验完整。同时推进技术债清理和架构重构。

## Phases

| Phase | Content | Status |
|-------|---------|--------|
| A. 产品断点修复 | 用户旅程中 blocks-usage 的问题 | 完成 (6/6) |
| M. 移动端支持 | iCloud同步 + 去RAG + Claude长上下文 | 完成 (11 commits) |
| B. UX 打磨 | degrades-UX 的问题 + ui-improvements | 完成 (16项) |
| C. 技术债清理 | 死代码/桩代码/注释代码/空文件 | 完成 (9项修复 + 50文件/9000行删除) |
| D. 代码拆分重构 | 大文件拆分 | 完成 (7大文件→23小文件) |
| E. 文档清理 | 归档docs、标记计划、更新过时文档 | 完成 |
| V1 退役 | 删除 V1 search pipeline + step UI | 完成 (-9000行) |
| F. Provider v2 | 删 Vercel AI SDK → Agent SDK query() | 未开始 |
| G. Agent Trace | 可观测性 (阻塞于 F) | 未开始 |

## Next

- [ ] 真机测试：iOS Obsidian 上测试移动端支持
- [ ] Provider v2 设计已批准，待实施
- [ ] 考虑替换 playwright+@langchain/community 为 fetch (减 50MB 依赖)

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

### V1 退役: 死代码删除 ✅ (~9200行, ~50文件)
| 类别 | 删除 |
|------|------|
| V1 phase 文件 (classify/decompose/recon/report 等) | 9 文件 |
| V1 Step UI 组件 (ClassifyStep/ReconStep 等) + 渲染管线 | 18 文件 |
| 死 hooks (useAIAnalysis/aiAnalysisStreamDispatcher) | 3 文件 |
| 死 stores (searchInteractionsStore) | 1 文件 |
| 死 tools (search-web/call-agent-tool/field-update-tool) | 3 文件 |
| 死 schemas (callAgentTool/searchWeb/updateResultOps) | 3 文件 |
| 死组件 (CompletedAIAnalysis/StreamingAnalysis/UsageBadge 等) | 6 文件 |
| 其他 (AgentLoop/type.ts/deprecated_chunking 等) | 7 文件 |
| VaultSearchAgent 简化 | 346行 → 42行 |
| SearchClient 清理 | 删除 aiAnalyze + aiSearchService |
| searchSessionStore/types 清理 | 删除 V1 steps 字段和类型 |
| useV2 feature flag 删除 | V2 Agent SDK 现为唯一路径 |

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
| per-section-report-v2 | 04-13 | SUPERSEDED |
| v2-report-quality-and-ui-fixes | 04-13 | SUPERSEDED |
| context-handoff-v2-ui | 04-12 | SUPERSEDED |

## Log

### 2026-04-18
- Done: AI Graph Agent 全部实现
- Done: 移动端支持全部实现 (Phase M, 11 commits)
- Done: 产品断点修复全部完成 (Phase A, 6/6)
- Done: UX 打磨 16 项完成 (Phase B)
- Done: 技术债清理 9 项 (Phase C)
- Done: 7 个大文件拆分为 23 个聚焦文件 (Phase D)
- Done: 文档清理完成 (Phase E)
- Done: V1 search pipeline 完全退役 — 删除 ~50 文件 / ~9200 行死代码
- Done: VaultSearchAgent 简化为 42 行纯路由器（mobile → MobileAgent, desktop → AgentSDK）
- Done: useV2 feature flag 删除，V2 Agent SDK 为唯一搜索路径
- Next: iOS 真机测试 → Provider v2 → Agent Trace
