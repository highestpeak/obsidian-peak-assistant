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
| F. Provider v2 | 删 Vercel AI SDK → Agent SDK query() | 完成 (12 files deleted, 7 packages removed, ~3700 lines) |
| G. Agent Trace | 可观测性: TraceSink + fixture vault + MCP server + CLI harness + scenarios | 完成 (15 tasks, 100+ test assertions) |
| K. Chat System Polish | Store 重构 + Input 拆分 + 会话管理 | 完成 (4→2 stores, 453→176 ChatInputArea, #93 delete) |
| I. Query Pattern Discovery | LLM 驱动查询模式发现 + 上下文建议 | 完成 (12 commits) |
| J. Vault Search Redesign | VS Code 风格 inspector side panel | 完成 (6 commits) |
| L. Chat UI Redesign | 消息列表/工具调用/首页/会话列表/输入菜单/大纲 | 完成 (15 tasks, 11 new components) |
| N. FileIcon 统一 | 扩展类型 + 删冗余函数 + 迁移调用点 | 完成 |
| O. Search Polish | #90 open-in-new-tab, #79 query summarization, #76 save graph | 完成 (3 tasks) |
| P. Copilot Doc Intelligence | #42 polish, #33 review, #38 links, #36 split | 完成 (9 tasks, 4 commands, 4 panels, 8 prompts) |
| Q. Onboarding & Native Module | NativeModuleManager + Setup Wizard + SQLite 懒加载 | 完成 |
| R. Streaming 内存修复 | 6 条流式路径 RAF 节流 + O(n²)→O(n) 内存优化 | 完成 (17 files) |
| S. UI 稳定性批量修复 | 15 个 RC 全量修复：错误处理/Chat UI/AI 列表/Copilot/Settings/Profile-Model/Quick Actions | 完成 (7 waves, 9 commits) |
| T. Vercel AI SDK 恢复 | 双轨 dispatch + Chat role + 模型路由修复 + 白闪修复 + typewriter 流式 | 完成 (12 commits) |

## Next

### 0. 已知 Bug

- [x] ~~**P0 稳定性：AI 分析流式传输 renderer 崩溃**~~ — 已修复（Phase R）
- [x] ~~**P0**：`mySessionId is not defined`~~ — 已修复（7389135: `let` 移到 `try` 外）
- [x] ~~**P1**：Onboarding 按钮颜色偏暗~~ — 已修复（`background` 已改为 `var(--background-primary)`）
- [x] ~~**P1**：AI Analysis mode dropdown "Vault Analysis" 图标缺失~~ — 已修复（Brain → Library）
- [x] ~~**P2**：PatternDiscovery 无有效 profile 时仍可能启动~~ — 已修复（`onAnalysisComplete()` 已有 profile 检查）
- [x] ~~**P0**：collectJson 无错误检测 → 401 auth 错误显示为 "Unexpected token 'I'"~~ — 已修复（Phase S Wave A: typed error classes + collectText/Json 加固）
- [x] ~~**P0**：AI Analysis 865 条全量加载 → 白屏崩溃~~ — 已修复（Phase S Wave C: 搜索过滤 + 懒加载 + content-visibility）
- [x] ~~**P1**：VaultSearchAgent max turns → "Oops!" 错误~~ — 已修复（Phase S Wave A: MaxTurnsError graceful degradation）
- [x] ~~**P1**：MessageStyleButtons 是 console.log 占位符~~ — 已修复（Phase S Wave B: 接线到 submitAction）
- [x] ~~**P1**：错误消息显示 Regenerate + Style 按钮~~ — 已修复（Phase S Wave B: isErrorMessage 守卫）
- [x] ~~**P1**：Chat 中 AI Analysis 不渲染 Markdown~~ — 已修复（Phase S Wave B: isMarkdownContent + StreamdownIsolated）
- [x] ~~**P1**：Tag Suggestion 幽灵命令（schema 断线）~~ — 已修固（Phase S Wave D: schema + command + modal route）
- [x] ~~**P1**：Copilot 缺专属入口 Modal~~ — 已修复（Phase S Wave D: CopilotPickerModal）
- [x] ~~**P1**：Model 选择无 Auto 默认~~ — 已修复（Phase S Wave F: auto-select from active profile）
- [x] ~~**P1**：Recent AI Analysis 无搜索过滤~~ — 已修复（Phase S Wave C: typing filters, Enter analyzes）
- [x] ~~**P1**：Quick action 按钮是空占位符~~ — 已修复（Phase S Wave G: 接线到 submitAction）
- [x] ~~**P2**：CodeMirrorInput .select() TypeError~~ — 已修复（Phase S Wave E: forwardRef 类型补全 + ?.）
- [x] ~~**P2**：Profile-Role-Model 绑定过简（toggle-only）~~ — 已修复（Phase S Wave F: RoleConfig + per-role model dropdown）
- [x] ~~**P2**：Local Chromium 功能 0% 但 UI 存在~~ — 已修复（Phase S Wave E: 移除选项）

### 0.5 待修 Bug / UI 调整

- [ ] **Chat Outline**: 去掉消息区域内的 OUTLINE 面板（无用的消息列表），保留侧边栏 Conversation Outline（自动聚合 topic）
- [ ] **换模型重新输出**: 每条 AI 消息可选择不同模型重新生成，新回复出现在下方（非替换）
- [ ] **Settings hover 效果验证**: pktw-root 修复后需验证所有 pk-* 颜色在 Settings 页生效

### 1. 真机验证

- [ ] Phase S 验证：15 个 RC 全量测试（错误处理、Chat UI、AI 列表过滤、Copilot Picker、Profile Model 选择、Quick Actions）
- [ ] Chat 全流程：Onboarding → 配置 Profile → 新建会话 → 发消息 → 收到回复 → 切换模型
- [ ] Provider v2 全流程：Profile CRUD → Set Active → Chat/Search/Agent 全部走 Agent SDK
- [ ] AI Analysis 全流程：查询 → Plan → Report → Graph → 后台 Session → Restore
- [ ] Onboarding Wizard：首次无 profile 自动弹出 → 配置 → 测试连接 → SQLite 初始化

### 2. 竞品差异化功能（核心产品方向）

> 目标定位："Obsidian-native ambient knowledge graph intelligence"
> 三根支柱：Ambient Push + Vault Lint + 级联更新 — 目前 0% 进度
> 研究来源：`kb2-learn-prd/.../AI-peakAssistant-竞品分析与学术验证.md` + `AI-peakAssistant-差异化定位与护城河分析-2026-04.md`

#### S1. Ambient Push — 写作时主动推送相关内容 + 解释原因 ★★★★★

- 优先级：最高（与 Smart Connections 的关键差异点）
- 学术支撑：Koskela 2018 (ACM TiiS) 主动信息检索 + Brain Cache (CHI 2025) 三层认知外骨骼
- 现有基础：vault event listener + maintenance debt 系统（但从不触发主动推送）
- 需要产出：
  - [ ] **Spec**：事件触发模型 + 上下文提取 + 相关内容检索 + 推送 UI + 解释生成
  - [ ] **Plan**：实现任务拆分
  - [ ] **Mockup**：推送面板 / sidebar 设计
  - [ ] **实现**

#### S2. Vault Lint / Health Check — 知识库健康体检 ★★★★★

- 优先级：最高（Karpathy 验证的 Lint 操作，竞品完全空白）
- 设计概念：差异化分析 §9.3 有 "Vault X-Ray" 设计（健康分数、hub 列表、orphan 岛、bridge notes、potential links、community map、decaying notes）
- 现有基础：`find_orphans` 工具 + `HubDiscoverCoverageGap`
- 需要产出：
  - [ ] **Spec**：多信号健康报告模型（断链 + orphans + 低内聚 + stale hubs + 矛盾检测 + topic 盲区）
  - [ ] **Plan**：实现任务拆分
  - [ ] **Mockup**：Health Dashboard UI（参考 §9.3 Vault X-Ray）
  - [ ] **实现**

#### S3. 级联关系更新 — 笔记修改时联动更新知识图谱 ★★★★★

- 优先级：最高（Karpathy Ingest 多页联动，当前只做孤立 re-embed）
- 现有基础：`indexDocument()` 只更新单文档；neighbor 完全不感知变化；hub summary 不失效
- 需要产出：
  - [ ] **Spec**：增量语义边更新 + hub summary 失效/重生成 + neighbor re-scoring + 触发策略（即时 vs 延迟 vs 批量）
  - [ ] **Plan**：实现任务拆分
  - [ ] **实现**

#### S4. Structural Hole / Hub 检测可视化 — InfraNodus 级 gap analysis ★★★★

- 优先级：高（有后端基础，缺 UI）
- 学术支撑：Burt (2004 AJS) "Structural Holes and Good Ideas"
- 现有代码：hub bridge/authority 角色分类 + coverage gap + `find-path.ts` betweenness（但是启发式，非算法）
- 需要产出：
  - [ ] **Spec**：全 vault betweenness centrality + Burt constraint + gap analysis UI
  - [ ] **Plan**
  - [ ] **Mockup**：Gap Analysis 面板设计
  - [ ] **实现**：算法 + UI

#### S5. KG + PPR 搜索 — Personalized PageRank 替代纯向量 ★★★★

- 优先级：高（有后端基础，缺 PPR 核心）
- 学术支撑：HippoRAG (NeurIPS 2024)，比 SOTA RAG 高 20%
- 现有代码：global PageRank + semantic PageRank **已完整实现**（`documentPageRank.ts`），`reranker.ts` 用作静态 boost
- 需要产出：
  - [ ] **Spec**：PPR 算法设计（seed nodes → biased random walk → 加入 reranker 管道）
  - [ ] **Plan**
  - [ ] **实现**：PPR 算法 + reranker 集成

#### S6. 预编译知识层 — Karpathy 式预处理摘要/摘要 ★★★★

- 优先级：高（最成熟的部分，60-70% 基础设施已有）
- 现有代码：Hub Doc pipeline（`hubDocServices.ts` + `hubDiscover.ts`）生成 LLM 摘要存为 vault Markdown
- 缺失：hub docs 不是预嵌入向量；constituent notes 变化时不触发失效/重生成
- 需要产出：
  - [ ] **Spec**：增量触发机制（note change → hub invalidation → 后台重生成）+ 预嵌入策略
  - [ ] **Plan**
  - [ ] **实现**

#### S7. Auto-tag 建议（建议模式，非静默）★★★

- 优先级：中（竞品空白 vs Mem.ai）
- 设计红线：必须是建议模式（Generation Effect），不能静默执行
- 现有基础：`indexDocument` 有 `includeLlmTags`，但只在 manual_full 时触发
- 需要产出：
  - [ ] **Spec**：触发时机 + 用户确认 UI + 批量/单文档模式
  - [ ] **Plan**
  - [ ] **实现**

### 3. 未实现的 Spec/Plan（已有文档但未执行）

| 文档 | 内容 | 规模 | Spec |
|------|------|------|------|
| `provider-mcp-skills-design` | MCP Client（MCPClientManager, stdio/HTTP）+ Skill 系统（markdown 定义 + 在线商店）+ Usage Dashboard + Model Registry 同步 | 大 | `specs/2026-04-10` |
| `search-inspector-tools-overhaul` | 11 个 Inspector 工具重构：消除 MarkdownOnly → `forceFormat`、find-path 拆分策略模式、类型化 `params: any`、bug 修复 | 大 | `specs/2026-04-10` |
| ~~`graph-layout-fix`~~ | ~~5 个图布局修复~~ | ~~中~~ | COMPLETED |
| `v2-persistence-fix` | 5 个 V2 持久化 bug：v2FullyDone 守卫、graph store 错配、restore 数据丢失 | 中 | `plans/2026-04-18` |
| `report-ui-quality` Task 3-4 | 粘性 V2PlanReview footer + 内联 plan 编辑（onUpdate） | 小 | `plans/2026-04-14` |
| `ai-analysis-ux-overhaul` Phase ③ | SynthesizeAgent + 多轮 round 分离 UI | 中 | `plans/2026-04-17` |

### 3. TASKS.md 按阶段待做

#### Phase 4 — Search & Analysis Polish
- [ ] #60 Search UI bugs（含 highlight 回归）
- [ ] #91 Quick Search modes（folder/heading/@context）— 部分
- [ ] #89 Smart connection via graph inspector
- [ ] #67 Recent search 内存缓存 — 部分

#### Phase 5 — Chat 高级功能
- [ ] #73 Conversation modes Level B/C（mode 控制 allowedTools + 独立 agent pipeline）
- [ ] #57 Work focus mode + project templates
- [ ] #14 Message branching（从任意消息点 fork）
- [ ] #83 Per-conversation system prompt / topic — 部分
- [ ] #21 Suggest conversation → project
- [ ] #2 Message lifecycle statuses（queued/cancelled/timeout）— 部分

#### Phase 6 — Infrastructure
- [ ] #58 Expand desktop mock env — 部分
- [ ] #79 Menu popover position 算法 — 部分
- [ ] #55 Docker image for PDF/code interpreter

#### Phase 7 — Copilot 文档智能（剩余）
- [ ] #39 Correct content errors
- [ ] #32 Find files & write article
- [ ] #34 Auto detect text → add to docs

#### Phase 8 — 任务 & 工作流
- [ ] #48 IFTTT workflow agent mode
- [ ] #47 Daily/weekly/monthly summarize — 部分
- [ ] #46 Writing plan for tasks
- [ ] #44 Find vault tasks & solve — 部分
- [ ] #43 Task list check & apply
- [ ] #31 Extract todos from vault — 部分
- [ ] #63 Alfred integration

#### Phase 9 — Quick Capture & Prompt
- [ ] #45 Fast note / inbox
- [ ] #40 User DIY prompts per doc
- [ ] #12 Prompt auto rewrite trigger in chat — 部分
- [ ] #29 Prompt quality audit pass — 部分

#### Phase 10 — Integrations & Advanced
- [ ] #24 Document type loader tests — 部分
- [ ] #13 Test all supported models
- [ ] #53 Sync flomo / Apple Notes / Calendar
- [ ] #23 Sync ChatGPT/Gemini/Claude history
- [ ] #80 Integrate OpenCode
- [ ] 其余：#54, #52, #66, #51, #50, #49, #22, #1

#### Phase 11 — Documentation
- [ ] #88 Graph inspector / AI analysis tutorial
- [ ] #26 Model selection best practice doc

### 4. 基础设施
- [ ] GitHub triage：关闭 22 done + 6 merge + 1 won't-fix = 29 issues
- [ ] 依赖瘦身：替换 playwright + @langchain/community → fetch（-50MB）
- [ ] master 上 73 文件未提交修改需 commit（Settings 重构续 + Chat UI + ConversationType + 搜索 store + Inspector 增强）
- [ ] 清理 11 个 Cursor 遗留 worktree（2025-12，已过时）

### 5. 远期 Backlog（无 spec/plan，仅想法）
- Canvas conversation type（split-pane chat + artifact rendering）
- Template conversation type + marketplace
- AI response cards with UI components
- Message persistence queue（AI 自动存有价值信息到 vault）
- Conversation multi-topic detection + auto-split
- n8n integration / multi-agent parallel mode / agent marketplace
- Graph 高级可视化（nebula background, healing ray, source/sink）
- Real-time LLM context inspector panel
- RAG within single conversation

## Log

### 2026-05-05 (Session 9)
- Done: **Phase T — Vercel AI SDK 恢复 + Chat 修复** (12 commits)
  - Vercel AI SDK 恢复：3 新文件 (provider-factory, vercel-adapter, index) + 恢复 npm deps (ai, @ai-sdk/*)
  - 双轨 dispatch：Anthropic → Agent SDK, 其他 provider → Vercel AI SDK, 无有效 key 时 fallback 到 Agent SDK
  - Chat role：ProfileRegistry 新增 activeChatConfig + StatusBar 第 4 个 selector chip
  - Settings pktw-root 修复：PluginSettingTab 缺少 pktw-root class → 所有 pk-* CSS 变量在 Settings 页不可用
  - CSS 变量 opacity 修复：Tailwind v3 的 `/10` opacity modifier 对 CSS 变量 hex 颜色无效 → 改用预计算 muted 色
  - 模型路由修复：新会话的 selectedModel/initialSelectedModel 断连 → 加 fallback chain (store → chat profile → default)
  - 每条消息独立模型元数据：从当前 UI 选择解析，支持中途换模型
  - 白闪修复：completeStreaming → addMessage 时序间隙 → 新增 commitStreamingMessage 原子操作
  - 内容重复修复：Agent SDK 发 stream_event + assistant 两种消息 → hasPartialMessages:true 跳过 assistant 文本
  - Reasoning 样式：去重 Obsidian button 边框 + 斜体左竖线 + 左对齐
  - ToolCallSummary：pk-* CSS 变量 + context-pipeline 工具名标签
  - Typewriter streaming：chunk 到达后逐字符匀速释放，动态速率（3~remaining/8 chars/frame）
- Plan: `docs/superpowers/plans/2026-05-05-restore-vercel-ai-sdk.md`
- Next: 去掉消息区 OUTLINE 面板 + 换模型重新输出功能 + Settings hover 验证

### 2026-05-03 (Session 8)
- Done: **Phase S — UI 稳定性批量修复** (15 RC, 7 waves, 9 commits)
  - Wave A: typed LLM error classes (AuthenticationError/LLMResponseError/MaxTurnsError) + collectText/Json 加固 + VaultSearchAgent MaxTurns graceful degradation
  - Wave B: isMarkdownContent 字段 + AI Analysis 导入 Markdown 渲染 + MessageStyleButtons 接线到 submitAction + 错误消息 suppress Regenerate/Style + "Open Settings" 链接
  - Wave C: AIAnalysisRepo search/searchCount + RecentAnalysisList 搜索过滤 + content-visibility 虚拟化 + SearchModal 输入过滤历史/Enter 启动分析
  - Wave D: tagSuggestionsSchema + suggest-tags 命令 + CopilotResultModal 三阶段(loading/result/error) + queryTextStream 流式 + Polish 流式渲染 + CopilotPickerModal 统一入口
  - Wave E: tab 背景统一 + provider hover 效果 + CodeMirrorInput select 类型修复 + 移除 Local Chromium + 删除冗余 power-user banner
  - Wave F: RoleConfig 类型 + ProfileRegistry 迁移(向后兼容) + RoleSelector per-role model dropdown + auto-select model from active profile + ProviderIcon avatar
  - Wave G: Quick action 按钮接线 + ConversationOutline stripMarkdown
- Spec: `docs/superpowers/specs/2026-05-03-ui-stability-batch-fix-design.md`
- Plan: `docs/superpowers/plans/2026-05-03-ui-stability-batch-fix.md`
- Next: 真机验证全部 15 个修复

### 2026-05-01 (Session 7)
- Done: Bug 清理 — 确认 4 个已知 bug 已修复，补 1 个图标修复
  - P0 mySessionId ReferenceError: 已在 7389135 修复（`let` 移到 `try` 外）
  - P1 Onboarding 按钮颜色: `background` 已改为 `var(--background-primary)`
  - P1 Vault Analysis icon: Brain → Library（lucide-react）
  - P2 PatternDiscovery: `onAnalysisComplete()` 已有 profile 检查
- Done: **graph-layout-fix plan 完成**
  - Task 1 (dynamic handles): 已在 `useLensLayout.ts:67-82` 实现
  - Task 2 (spacing): topology nodesep 80→100/ranksep 200→220, tree nodesep 120→140/ranksep 180→200, timeline COLUMN_GAP 60→80
  - Task 3 (edge label density): 已实现（dense flag + hover）
  - Task 4 (deterministic d3-force): `Math.random()` → `seededRandom(nodeId)` 哈希函数
  - Task 5 (CJK width): 已在 `estimateNodeWidth` 实现（14px/CJK char）
- Files changed: SearchModal.tsx, topology-layout.ts (multi-lens), tree-layout.ts, timeline-layout.ts, topologyLayout.ts (graph-viz)

### 2026-04-25 (Session 6)
- Done: **P0 Streaming 内存崩溃根治** — 6 条流式路径全部修复，17 个文件
  - 根因：Zustand `set()` 每个 streaming token 调用一次 → O(n²) 数组/字符串复制 + 30+/s React re-render（每次触发 Streamdown markdown 重解析 + Shadow DOM render）
  - 修复：Mutable Buffer + `requestAnimationFrame` 节流（~60fps 上限）
  - Timeline text: `chunks: string[]` → `text: string` + RAF buffer（searchSessionStore）
  - Section report: `streamingChunks: string[]` → `streamingText: string` + per-section RAF buffer（searchSessionStore）
  - Executive summary: `setSummary(accumulated)` per-chunk → RAF throttled（ReportOrchestrator）
  - Chat streaming: `appendStreamingDelta` / `appendReasoningDelta` → RAF buffer（chatDataStore）
  - Legacy summary: `summaryChunks: string[]` → `summaryText: string` + RAF buffer（aiAnalysisStore）
  - Topic analyze: `chunks: string[]` → `text: string` + RAF buffer（aiAnalysisStore）
  - 性能：内存 O(n²)→O(n)，re-render ~30/s→~60fps cap，不再需要 `.join('')`
- Files changed: search-steps.ts, v2SessionTypes.ts, searchSessionStore.ts, sessionSnapshot.ts, aiAnalysisStore.ts, chatDataStore.ts, ReportOrchestrator.ts, BackgroundSessionManager.ts, eventDispatcher.ts, timeline-helpers.tsx, V2ReportView.tsx, tab-AISearch.tsx, followupContextRuntime.ts, useAIAnalysisResult.ts, useSearchSession.ts, useAIAnalysisPostAIInteractions.ts
- Known issues: (1) mySessionId ReferenceError (2) 按钮颜色 (3) mode icon 缺失

### 2026-04-25 (Session 5)
- Done: NativeModuleManager — ABI 检测 → electron prebuilt 下载 → node-gyp 编译 fallback → binary 验证后才写 metadata
- Done: Setup Wizard Modal — 3 步向导，多 Provider 配置 + 平台跳转链接 + 可编辑/删除已有 profile + Set Active
- Done: SQLite 懒加载 — `initSqlite()` 公开方法，失败不阻塞；ChatStore 20 处守卫、AIAnalysisHistoryService 6 处守卫
- Done: 修复 CORS（fetch→requestUrl）、ABI 下载策略（node→electron runtime）、删除 adjacent ABI fallback
- Done: 无 active profile 时跳过 PatternDiscovery + warmupPool（防无效 key 导致子进程崩溃→renderer crash）
- Done: checkAvailable() ensureCompatible 单次执行（nativeModuleChecked 标记）
- Files changed: NativeModuleManager.ts (new), OnboardingModal.tsx (new), main.ts, BetterSqliteStore.ts, SqliteStoreManager.ts, ChatStore.ts, AIAnalysisHistoryService.ts, Register.ts, .gitignore
- Known issues: (1) 流式 reasoning-delta 密集时 renderer 崩溃 (2) mySessionId ReferenceError (3) 按钮颜色 (4) mode icon 缺失

### 2026-04-24 (Session 4)
- Done: Wave 4 Search Polish (3 tasks)
  - #90: open-in-new-tab icon button in VaultSearchResult.tsx (hover-reveal ExternalLink)
  - #79: OpenMenuButton query builder — last 3 messages + 500 char cap (was: all messages, no limit)
  - #76: Save graph to vault — Download button in V2Footer + handleSaveGraph in tab-AISearch.tsx (uses buildAiGraphMarkdown + vault.create)
- Done: Wave 2B FileIcon 统一 (#74)
  - getFileIcon() +excel/word/file 类型, +size 参数
  - pathToFileIconType() +xlsx/xls/docx/doc 映射
  - 删除 getFileIconByName + getFileIconComponent, 迁移 FileChangesList + ProjectOverview
- Done: Wave 5 Copilot Document Intelligence (9 tasks, #42 #33 #38 #36)
  - copilot-schemas.ts: Zod schemas (ReviewResult, LinkSuggestions, SplitPlan)
  - PromptId.ts: +8 entries (4 prompts + 4 system prompts) + PromptVariables
  - TemplateRegistry.ts: +8 template metadata + 8 .hbs prompt files
  - CopilotResultModal.tsx: Modal shell + lazy panel router
  - PolishPanel.tsx: side-by-side diff + Apply (reused by Review Fix flow)
  - ReviewPanel.tsx: severity feedback list + 🔧 Fix → PolishPanel transition
  - LinkSuggestPanel.tsx: checkbox link list + batch insert outgoing links
  - SplitPanel.tsx: preview cards + excerpt + proportional bar + execute split
  - copilot-commands.ts: 4 commands (polish/review/suggest-links/split) + Register.ts wiring
- Stats: 38 tasks, 66 files changed, build green

### 2026-04-22 (Session 3)
- Done: Wave 3A Agent Trace Tasks 6-15 完成 (10 tasks)
  - 22 fixture vault md files (hub/spokes/multilingual/decoys/orphans)
  - fs-vault-reader.ts: listFiles, readFile, grep, readFrontmatter (8 tests)
  - link-resolver.ts: extractWikiLinks, buildLinkIndex, resolveLink, listBacklinks (6 tests)
  - fs-vault-mcp/server.ts: 6 MCP tools wrapping reader + resolver
  - scenario-loader.ts: YAML parse + forbidden-field validation (11 tests)
  - 5 scenario YAML files: hub-discovery, direct-answer, ambiguous-query, multilingual, not-found
  - scripts/run-agent.ts: CLI harness (scenario → MCP → query → TraceSink)
  - scripts/trace-latest.ts: newest trace finder (4 tests)
  - VaultSearchAgentSDK.ts: optional traceSink?.consume(raw) hook
  - run-trace-scenario.ts: Obsidian command (Peak: Run Trace Scenario) + main.ts registration
- Done: Wave 3C Chat UI Redesign 全部 15 tasks 完成
  - T1: ConversationType union + meta field + creation pipeline wiring
  - T2: ThinkingIndicator (gentle-pulse dots) + IME Enter fix (view.composing guard)
  - T3: MessageRoleAvatar (👤/✨) + DateSeparator (Today/Yesterday/date) + message list integration
  - T4: MessageActionsList inline redesign — metadata always visible, actions hover-fade via group-hover
  - T5: MessageStyleButtons (Shorter/More detail/Simpler/More formal) below AI responses
  - T6: ToolCallSummary collapsed chip (replaces ToolCallsDisplay) — active tool animation + expand/collapse
  - T7: ContextMenu.tsx — custom @ menu replacing CodeMirror autocomplete, keyboard nav, click-outside
  - T8: PromptMenu.tsx — custom / menu replacing CodeMirror autocomplete, grouped items
  - T9: Conversation list — two-row layout + type badge + search bar + date grouping (Today/This Week/Older)
  - T10: Home page — time-aware greeting + 2×2 suggestion cards + compact recent lists
  - T11: NewConversationTypePicker — 4-card grid (Chat/Agent/Plan/Canvas) + full creation pipeline
  - T12: Project Overview — inline stats + editable description + tab accent vars + CTA empty state
  - T13: FileChanges — theme-aware colors + NEW badge + group-hover actions
  - T14: ConversationOutline — topic tree right panel + header toggle + store state
  - T15: SuggestionActions + scroll nav color fix (hover:bg-gray-200 → hover:bg-muted)
- Done: Wave 2B FileIcon 统一 (#74)
  - getFileIcon() 扩展: +excel(FileSpreadsheet) +word +file 类型, +size 参数
  - pathToFileIconType() 扩展: xlsx/xls→excel, docx/doc→word
  - 删除 getFileIconByName + getFileIconComponent (冗余)
  - FileChangesList + ProjectOverview 迁移到 <FileIcon>
- Stats: 42 files changed, 11 new UI components, 100+ test assertions, build green

### 2026-04-22 (Session 2)
- Done: Chat System Polish 完成 (Wave 3B, 12 tasks)
  - 4→2 Zustand stores: chatDataStore (entity+message+streaming) + chatViewStore (nav+session+history)
  - 删除 projectStore.ts (107行) + messageStore.ts (190行) + chatSessionStore.ts (289行) = -586行
  - 22 consumer files 迁移到新 store
  - ChatInputArea 453→176行 (提取 useContextSearch + useInputKeyboard + useTokenUsage)
  - Ctrl+Arrow input history navigation (#81)
  - Delete Conversation menu action (#93)
  - ConversationService.streamChat 修复 → Agent SDK queryWithProfile (修复 MultiProviderChatService 删除导致的 chat 断裂)

### 2026-04-22 (Session 1)
- Done: Provider v2 完成 — 删除整个 Vercel AI SDK 栈
  - PromptService: chatWithPrompt/chatWithPromptStream → delegate to AIServiceManager.queryText/queryStream via AppContext
  - AIServiceManager: chatWithPrompt/streamObjectWithPrompt → delegate to queryText/queryStructured + zodToJsonSchema
  - infer-thinking-tree: multiChat.blockChat() → manager.queryText()
  - stream-helper.ts: 640行 → 60行 (only 3 self-contained utilities kept)
  - types.ts: 'ai' re-exports → standalone type definitions
  - 删除 12 文件: adapters, base providers, MultiProviderChatService, model-resolution, tool-executor (~3500行)
  - UI: ModelSelector/MessageActionsList/SearchSettingsTab → modelRegistry (static catalog)
  - 卸载 7 npm packages: ai, @ai-sdk/{anthropic,openai,google,perplexity}, @openrouter/ai-sdk-provider, ollama-ai-provider-v2
  - manifest.json: isDesktopOnly = true
  - Zero `from 'ai'` imports remain in src/ (only comments)
- Done: Working tree 清理 — 3 commits committed (dead code cleanup, features, docs)
  - 39 dead files deleted (-5333 lines)
  - Milestone persistence + graph improvements + search UI polish
  - Execution roadmap + 6 plans + 4 specs + mockups
- Done: All prior work merged to master (131 commits fast-forward)
- Done: ProfileSettingsTab — Profile CRUD UI 替换 ProviderSettings (335 lines)
- Done: UI/Theme CSS Foundation — peak-variables.css + peak-style-settings.css + Tailwind --pk-* tokens + Shadow DOM pass-through
- Started: Chat System Polish (Wave 3B Task 1) — chatDataStore created

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
| ai-analysis-ux-overhaul | 04-17 | PARTIAL (Phase ①② done, Phase ③ SynthesizeAgent 缺失) |
| ai-graph-agent | 04-18 | COMPLETED |
| mobile-support | 04-18 | COMPLETED |
| ui-improvements-all-strategies | 04-18 | COMPLETED |
| background-multi-session | 04-19 | COMPLETED |
| provider-system-v2 | 04-20 | COMPLETED |
| ui-theme-foundation | 04-20 | COMPLETED |
| chat-system-polish | 04-20 | COMPLETED |
| query-pattern-discovery | 04-20 | COMPLETED |
| vault-search-redesign | 04-20 | COMPLETED |
| chat-ui-redesign | 04-22 | COMPLETED |
| copilot-document-intelligence | 04-24 | COMPLETED |
| ai-analysis-landing-redesign | 04-25 | COMPLETED |
| settings-redesign | 04-25 | COMPLETED |
| agent-trace-observability | 04-22 | COMPLETED |
| graph-layout-fix | 05-01 | COMPLETED |
| ui-stability-batch-fix | 05-03 | COMPLETED |
| milestone-based-persistence | 04-20 | MOSTLY DONE (核心函数存在，4 触发点待验证) |
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
