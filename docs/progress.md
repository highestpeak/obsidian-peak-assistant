# Peak Assistant — Progress Tracker

## Overview

Obsidian AI assistant plugin. 当前目标：**产品完备** — 从 onboarding → 配置 → Chat → Search → Graph 每个环节都能跑通，体验完整。同时推进技术债清理和架构重构。

## Phases

| Phase | Content | Status |
|-------|---------|--------|
| A. 产品断点修复 | 用户旅程中 blocks-usage 的问题 | 完成 |
| M. 移动端支持 | iCloud同步 + 去RAG + Claude长上下文 | 完成 (11 commits) |
| B. UX 打磨 | degrades-UX 的问题 + ui-improvements 计划 | 完成 (16项) |
| C. 技术债清理 | 死代码/桩代码/注释代码/空文件 | 完成 (9项) |
| D. 代码拆分重构 | 大文件拆分 (>600行的20+文件) | 进行中 (useSearchSession已拆) |
| E. Phase 0 清理 | 归档docs、标记已完成计划、更新过时文档 | 完成 |
| F. Provider v2 | 删 Vercel AI SDK → Agent SDK query() | 未开始 |
| G. Agent Trace | 可观测性 (阻塞于 F) | 未开始 |

## Next

- [ ] A1: Onboarding — 首次使用无 API key 时 Chat/Search 显示友好引导，而非抛错
- [ ] A2: 默认模型不依赖 OpenRouter — AI Analysis 默认模型改为用户已配置的 provider
- [ ] A3: Vault 未索引时搜索显示"需要先索引"提示，而非空结果
- [ ] A4: 侧栏 conversation 右键菜单加 delete 按钮 (#93)
- [ ] A5: 实现 deleteProject 服务方法和 UI
- [ ] B1-B10: ui-improvements-all-strategies 10个任务（含 P0 AI Analysis blank page）

## Backlog

### A. 产品断点 (Blocks-Usage)

| ID | 问题 | 位置 | 说明 |
|----|------|------|------|
| A1 | 无 API key 无引导 | 全局 | 没有 onboarding flow，Chat 报错是 JS Error 不是友好 UI |
| A2 | 默认模型指向 OpenRouter | `core/providers/types.ts:395` | 新用户只配了 OpenAI 时 AI Analysis 全部失败 |
| A3 | Vault 未索引无提示 | `tab-VaultSearch.tsx` | autoIndex=false，搜索空结果只说"没有最近文件" |
| A4 | 侧栏无法删除对话 | `ConversationsSection.tsx:184` | 菜单只有 Edit/Open，缺 Delete |
| A5 | 无法删除 Project | 全局 | 整个代码库没有 deleteProject 方法 |
| A6 | Provider 启用但无 key 不报错 | `ProviderSettings.tsx` | 可以 Enable 一个无 key 的 provider，调用时才报错 |

### B. UX 打磨 (Degrades-UX)

来源: ui-improvements-all-strategies + ai-analysis-ux-overhaul + report-ui-quality + 审计发现

| ID | 问题 | 来源 |
|----|------|------|
| B1 | AI Analysis blank page (P0) | ui-improvements Task 3 |
| B2 | humanReadableTime "0 days ago" | ui-improvements Task 1 |
| B3 | 搜索结果路径截断 | ui-improvements Task 2 |
| B4 | Chat tool call 默认折叠 | ui-improvements Task 4 |
| B5 | Chat input placeholder 简化 | ui-improvements Task 5 |
| B6 | 首条消息前隐藏 suggestion tags | ui-improvements Task 6 |
| B7 | EmptyState 统一组件 | ui-improvements Task 7-8 |
| B8 | Hops 选择器 → segmented control | ui-improvements Task 9 |
| B9 | Quick Actions 紧凑化 + brand color | ui-improvements Task 10 |
| B10 | ai-analysis-ux-overhaul Phase ① CSS 修复 | ai-analysis-ux-overhaul |
| B11 | ai-analysis-ux-overhaul Phase ② V2 持久化 | ai-analysis-ux-overhaul |
| B12 | ai-analysis-ux-overhaul Phase ⑥ Quick action chips | ai-analysis-ux-overhaul |
| B13 | report-ui-quality: Sources 同步 | report-ui-quality |
| B14 | report-ui-quality: 去内联引用 | report-ui-quality |
| B15 | report-ui-quality: sticky footer | report-ui-quality |
| B16 | report-ui-quality: 内联编辑 | report-ui-quality |
| B17 | "Full analysis view" 按钮无操作 | `tab-AISearch.tsx:888` |
| B18 | graphSummary 未接线 | `useSearchSession.ts:922` |
| B19 | Suggestion tag actions 全是空壳 | `useChatSession.ts:151` |
| B20 | 对话编辑弹窗标题写成"Create" | `ProjectsSection.tsx:122` |
| B21 | Settings 默认选 openai 不跟随已启用 | `ProviderSettings.tsx:442` |
| B22 | Graph 空结果无反馈 | `GraphSection.tsx` |

### C. 技术债清理

| ID | 问题 | 位置 | 严重度 |
|----|------|------|--------|
| C1 | DocumentCache.ts 空文件 | `core/document/DocumentCache.ts` | must-fix |
| C2 | aiSearchService 两个方法返回 'deprecated' | `service/search/aiSearch/aiSearchService.ts:59,123` | must-fix |
| C3 | TableDocumentLoader XLSX 解析注释掉 | `core/document/loader/TableDocumentLoader.ts:136` | should-fix |
| C4 | FlashRank reranker 是空壳 | `core/providers/rerank/flashrank.ts` | should-fix |
| C5 | searchPrompts 返回空数组 | `service/chat/service-manager.ts:766` | should-fix |
| C6 | VaultSearchAgent 缺 fast path | `service/agents/VaultSearchAgent.ts:90` | should-fix |
| C7 | find-orphans 软孤儿未实现 | `service/tools/search-graph-inspector/find-orphans.ts:28` | should-fix |
| C8 | MobiusEdgeRepo 方法体缺失 | `core/storage/sqlite/repositories/MobiusEdgeRepo.ts:693` | should-fix |
| C9 | ImageDocumentLoader hash/base64 禁用 | `core/document/loader/ImageDocumentLoader.ts:149` | should-fix |
| C10 | context window overflow 未检查 | `service/chat/service-conversation.ts:260` | should-fix |
| C11 | ModelConfigTab 3个模型选择器注释掉 | `ui/view/settings/ModelConfigTab.tsx:272` | should-fix |
| C12 | 多个 getSummary() 空壳 | MarkdownDocumentLoader, FolderResourceLoader, TagResourceLoader | nice-to-have |
| C13 | date-utils 位置错误 | `ui/view/shared/date-utils.ts` → 应在 `core/utils/` | nice-to-have |

### D. 大文件拆分 (>600行, 优先级排序)

**Service 层 (最大):**
- `hubDiscover.ts` (3294行), `indexService.ts` (2255行), `find-path.ts` (2031行)
- `service-manager.ts` (972行), `explore-folder.ts` (843行)

**UI 层:**
- `useSearchSession.ts` (1193行), `tab-AISearch.tsx` (947行)
- `searchSessionStore.ts` (922行), `MessageViewItem.tsx` (838行)

**Core 层:**
- `MobiusNodeRepo.ts` (2046行), `search-agent-schemas.ts` (1407行)
- `AiSearchAnalysisDoc.ts` (1154行), `MobiusEdgeRepo.ts` (1141行)

### E. Phase 0 清理

参见 TASKS.md § Phase 0:
- 关闭 22 个已完成 issue + 6 个合并 + 1 个 won't-fix
- 归档 4 个过时 docs → `docs/archive/`
- 更新 3 个过时 docs
- 标记 8 个已完成计划 + 2 个被取代计划

### F-G. 架构重构

- F: Provider v2 — 设计已批准 (`specs/2026-04-11-provider-system-v2-design.md`)，约 -5000/+1500 行
- G: Agent Trace Observability — 阻塞于 F

## 已完成计划

| 计划 | 日期 | 状态 |
|------|------|------|
| ai-search-ui-step-based-refactor | 04-08 | COMPLETED |
| vault-search-agent-sdk-migration | 04-12 | COMPLETED (15/16) |
| v2-search-ui | 04-12 | COMPLETED |
| per-section-report-generation | 04-13 | COMPLETED |
| mission-roles-plan-review | 04-14 | COMPLETED |
| playbook-dimension-framework | 04-14 | COMPLETED |
| report-generation-reliability | 04-14 | COMPLETED |
| report-quality-overhaul | 04-15 | COMPLETED |
| ai-graph-multi-lens | 04-15 | COMPLETED |
| continue-analysis-process-view | 04-17 | COMPLETED |
| ai-graph-agent | 04-18 | COMPLETED |
| per-section-report-v2 | 04-13 | SUPERSEDED by report-quality-overhaul |
| v2-report-quality-and-ui-fixes | 04-13 | SUPERSEDED by report-quality-overhaul |
| context-handoff-v2-ui | 04-12 | SUPERSEDED |

## Log

### 2026-04-18
- Done: AI Graph Agent 全部实现（GraphAgent + MCP tools + bridge/timeline layouts + React Flow 集成）
- Done: 创建 ui-improvements-all-strategies 计划（10个任务，4个策略方向）
- Done: 全面用户旅程审计 + 技术债盘点 → 建立统一 progress.md
- Done: 移动端可行性调研（native module盘点、启动流程分析、搜索链路分析）
- Done: 移动端设计文档 (`specs/2026-04-18-mobile-support-design.md`)
- Done: 移动端实施计划 (`plans/2026-04-18-mobile-support.md`) — 10个任务，~500行新代码
- Done: **移动端支持全部实现** — 11 commits, 4 new files, 8 modified files
  - Platform gate (`src/core/platform.ts`)
  - Dynamic imports for playwright/simple-git
  - VaultContentProvider (模板加载 vault API fallback)
  - main.ts 启动守卫 (跳过 SQLite)
  - MobileSearchService (路径/标签/内容三层搜索)
  - 直觉地图导出为 vault 文件 (iCloud 同步)
  - MobileVaultSearchAgent (搜索→读文件→Claude 长上下文)
  - 移动端 agent 路由
  - 隐藏桌面专属命令和 UI
- Next: Phase A 产品断点修复 → Phase B UX 打磨 → 真机测试移动端
