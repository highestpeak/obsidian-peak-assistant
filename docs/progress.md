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
| U. Chat UI v9 + 智能功能 | Message UI 重构 + 换模型重新输出 + Topic 聚合 + Suggested Follow-ups + Outline 修复 + bug fixes | 完成 |
| W. Copilot 扩展 | 5→15 actions，注册表架构，分组 UI + 上下文推荐，Document/Vault/Writing 三类 | 完成 |
| X. Model Selection 统一 | Provider 卡片简化 + Agent Fast pill + Ollama 动态模型 + baseUrl 修复 | 完成 |
| X2. Provider Settings Polish | Pill 搜索面板 + AddProfileGrid 去重 + 凭证显示修复 + authToken fallback | 完成 |
| X3. Profile authToken 清理 | 删除 authToken 字段 + 统一 apiKey + 迁移 legacy data + OpenRouter baseUrl 修复 | 完成 |
| Y. Token Usage Dashboard | 全站 AI 调用追踪 + SQLite 持久化 + 统计面板（KPI/趋势/分布/明细） | 完成 |
| Z. Mockup Gap 补全 | @菜单面包屑/分组/元数据、/菜单模板分组、工具栏响应式、智能建议、Diff高亮、变量高亮 | 完成 (8 commits) |
| AA. 代码库精简 | 71.2k→66.7k (-4,485行): 死代码删除 + 算法简化 + 架构重构 + 冗余压缩 | 完成 (24 commits) |
| AB. Search Pipeline Upgrade | QueryParser + 5 Retrievers + adaptive RRF + HighlightEngine + stemming + fuzzy + click-through | 完成 (19 tasks, 19 commits) |
| AC. Onboarding Index Config | 4步Onboarding + 三档索引(fast/semantic/full) + Settings面板 + 智能升级提示 | 完成 (7 tasks, 7 commits) |
| AD. P0-P1 批量执行 | authToken 清理 + Plan 模式移除 + Usage Dashboard 恢复 + 动态能力感知 | 完成 (4 commits) |
| AE. Copilot Agent Loop | 4 action (suggest-links/knowledge-gaps/synthesize-topic/add-evidence) 升级为 agent loop + 步骤展示 UI | 完成 (9 commits, 13 files, +832 lines) |
| AF. Inspector Tools Overhaul | Schema 重设计 + find-path 拆分(1→5 文件) + 类型化 params + forceFormat + 描述重写 | 完成 (12 tasks, 12 commits) |
| AG. Report UI Polish | V2InlinePlanReview sticky footer（flex 布局） | 完成 (1 commit) |
| S1. Ambient Push Phase 1 | FTS5 pipeline + 模板解释 + 侧边栏面板 + SQLite 日志 + 状态栏 | 完成 (10 tasks) |
| S1. Ambient Push Phase 2 | 图谱 2-hop 扩展 + shared_tag/graph_neighbor/co_citation/hub_member 信号 + 反馈学习 | 完成 (7 tasks, 7 commits) |
| S1. Ambient Push Phase 3 | Serendipity Engine: CM6 gutter + 偶然发现算法 + LLM 微解释 + 跨会话模式学习 | 完成 (10 tasks, 8 commits) |
| S1. Ambient Push 可见性 | 首次启动自动打开右侧栏 + 布局切换不覆盖 AmbientPush tab | 完成 |
| AH. Provider MCP Phase 1-3 | Model Registry JSON 化 + 自定义 OpenAI 兼容端点 + MCP Client (stdio/SSE) + Settings UI | 完成 (12 tasks, 12 commits) |
| AI. MCP Spike | @modelcontextprotocol/sdk 可行性验证 — GO (所有 transport 可用, +450KB) | 完成 |
| S1. Ambient Push Phase 4 | Morning Briefing: 启动时每日简报弹窗（未解决连接+变化Hub+衰减笔记） | 完成 (7 commits) |
| AJ. Provider MCP Phase 4-5 | Skill System（Registry+Parser+Executor+Picker UI）+ Usage Dashboard 定价同步 | 完成 (7 commits) |
| S2. Vault Lint | Health Check: 5 信号检测器 + VaultXRayView + ScoreRing + 配置模板 | 完成 (7 tasks) |
| S5. PPR Tuning | Co-citation 第 4 层 + query-node seeding + Settings UI + 评估命令 | 完成 (4 tasks) |
| S7. Auto-tag | Schema 修复 + 反馈持久化 + batch 模式 + FolderPicker | 完成 (4 tasks) |
| S3. Cascade Update | hub_constituent 表 + CascadeWorker 补全 + folder_stats + hub_regen stub | 完成 (8 tasks) |
| S4. Structural Hole | Brandes BC + Louvain + Burt constraint + Gap Analysis UI + bridge actions | 完成 (8 tasks) |
| S6. Precompiled Knowledge | HubStalenessDetector + HubRegenService + hub_regen_queue + reranker boost | 完成 (6 tasks) |

## Next

### 0. 已知 Bug — 全部已修复

18 个 P0-P2 bug 全部修复（Phase R/S/AC），包括流式崩溃、auth 错误处理、白屏、幽灵命令等。

### 0.5 UI 调整 — 全部已完成

11 项 UI 调整全部完成，包括 Chat Outline 移除、换模型重输出、Message UI v9、Topic 聚合、Follow-ups 等。

### 1. 真机验证

> 所有测试清单统一维护在 `docs/manual-testing-checklist.md`，此处只记录验证状态。

- [ ] Phase AE (Copilot Agent Loop) — checklist §15
- [ ] Phase W (Copilot 15 actions) — checklist §14
- [ ] Chat 工具基础设施 — checklist (待迁移)
- [ ] 历史回归（Phase S / Provider v2 / AI Analysis / Onboarding）— checklist §1-13

### 2. 竞品差异化功能（核心产品方向）

> 目标定位："Obsidian-native ambient knowledge graph intelligence"
> 三根支柱：Ambient Push + Vault Lint + 级联更新
> 研究来源：`kb2-learn-prd/.../AI-peakAssistant-竞品分析与学术验证.md` + `AI-peakAssistant-差异化定位与护城河分析-2026-04.md`

#### S1. Ambient Push — 写作时主动推送相关内容 + 解释原因 ★★★★★ — Phase 1-4 完成

- Phase 1 (Core Pipeline): FTS5 搜索 + 模板解释 + 侧边栏面板 + SQLite 日志 ✅
- Phase 2 (Graph Intelligence): 2-hop 图谱扩展 + 4 种信号 + 反馈学习 ✅
- Phase 3 (Serendipity Engine): CM6 gutter 提示 + 偶然发现算法 + LLM 微解释 + 模式学习 ✅
- Phase 4 (Morning Briefing): 启动时每日简报（4h+ 间隔触发，3 类推荐） ✅
- 可见性修复: 首次自动打开右侧栏 + 布局切换保留 tab ✅
- Spec: `docs/superpowers/specs/2026-05-01-ambient-push-design.md`
- Plans: `docs/superpowers/plans/2026-05-01-ambient-push-phase1.md`, `2026-05-10-*-phase2/3/4.md`

#### S2. Vault Lint / Health Check — 知识库健康体检 ★★★★★ — 完成

- Phase 1: 5 信号检测器 (S-ORPHAN, S-BROKEN-LINK, C-EMPTY, C-STUB, G-UNTAGGED) + VaultXRayView + ScoreRing ✅
- Spec: `docs/superpowers/specs/2026-05-01-vault-lint-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-vault-lint.md`

#### S3. 级联关系更新 — 笔记修改时联动更新知识图谱 ★★★★★ — 完成

- hub_constituent 表 + HubConstituentRepo + CascadeWorker hub_invalidate/folder_stats 补全 + hub_regen stub ✅
- Spec: `docs/superpowers/specs/2026-05-01-cascade-update-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-cascade-update.md`

#### S4. Structural Hole / Hub 检测可视化 — InfraNodus 级 gap analysis ★★★★ — 完成

- Brandes betweenness + Louvain community + Burt constraint + Gap Analysis View + bridge actions ✅
- Spec: `docs/superpowers/specs/2026-05-01-structural-hole-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-structural-hole.md`

#### S5. KG + PPR 搜索 — Personalized PageRank 替代纯向量 ★★★★ — 完成

- PPR 已有完整实现；本轮新增 co-citation 第 4 层 + query-node seeding + Settings UI + 评估命令 ✅
- Spec: `docs/superpowers/specs/2026-05-01-ppr-search-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-ppr-tuning.md`

#### S6. 预编译知识层 — Karpathy 式预处理摘要 ★★★★ — 完成

- HubStalenessDetector + HubRegenService (30s debounce, batch-10, 3x retry) + hub_regen_queue + reranker hub_doc boost ✅
- Spec: `docs/superpowers/specs/2026-05-01-precompiled-knowledge-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-precompiled-knowledge.md`

#### S7. Auto-tag 建议（建议模式，非静默）★★★ — 完成

- Schema 修复 + tag_suggestion 反馈持久化 + Accept High Confidence + batch FolderPicker 模式 ✅
- Spec: `docs/superpowers/specs/2026-05-01-auto-tag-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-auto-tag.md`

### 3. 未实现的 Spec/Plan（已有文档但未执行）

| 文档 | 内容 | 规模 | 状态 |
|------|------|------|------|
| ~~`provider-mcp-skills-design`~~ Phase 1-3 | ~~MCP Client + Model Registry + Custom Endpoints~~ | ~~大~~ | COMPLETED (Session 26) |
| ~~`provider-mcp-skills-design` Phase 4-5~~ | ~~Skill 系统（markdown 定义 + 执行器）+ Usage Dashboard 同步~~ | ~~中~~ | COMPLETED (Session 27) |
| ~~`search-inspector-tools-overhaul`~~ | ~~Inspector 工具重构~~ | ~~大~~ | COMPLETED (Session 26) |
| ~~`graph-layout-fix`~~ | ~~5 个图布局修复~~ | ~~中~~ | COMPLETED |
| ~~`v2-persistence-fix`~~ | ~~5 个 V2 持久化 bug~~ | ~~中~~ | COMPLETED (已在之前 session 修复) |
| ~~`report-ui-quality` Task 3-4~~ | ~~粘性 footer + 内联编辑~~ | ~~小~~ | COMPLETED (Session 26) |
| ~~`ai-analysis-ux-overhaul` Phase ③~~ | ~~SynthesizeAgent + 多轮 round 分离 UI~~ | ~~中~~ | COMPLETED |
| `2026-05-14-copilot-command-center-user-centered-redesign` | Copilot / Command Center intent hub 修正版：点 Copilot / Knowledge Analysis 后自动规划 capability，再用侧边 panel / 弹出 panel / review panel 承载 | 中 | PLANNED (docs/design only, not implemented) |

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

### 2026-05-23 — Codex UX sketches → real picker + report UI（mockup v2 → impl → 整天 debug Obsidian CSS 干扰）

整天分三大块。

**Block 1 · Mockup v2 重做（commit `8fc5784`）**
- Done: 用户提供 7 张 Codex UX 设计稿（picker · vault tab + 6 report tabs）+ 3 张 picker 稿（Document / Vault / Setting）。先逐张视觉 diff 现有 mockup（`2026-05-20-vault-review-mockup.html`），发现结构性差异（不对称 snapshot grid、缺 agent trace right rail、tab 样式 pill vs underline、Sources 3-col 缺等等）
- Done: 归档旧 mockup 到 `_archive/`，新文件 `2026-05-22-vault-review-mockup.html`（4146 行，10 scenes：3 picker + 6 report），按草稿 1:1 重做：Lucide-style SVG symbol library、`--pk-*` token、顶部 scene 切换 navigator
- Done: spec 加 §8.0 "Review Launcher Picker"（picker 4 个问题 + 区域/按钮/差异 3 张表 + 设计边界）

**Block 2 · 真实代码实现（Phase A → D，5 commits）**
- Done: Phase A — 新基础原语：`<Pill>` 8 个 token-aligned variants（success/warning/danger/info/accent/indigo/neutral/outline）+ `<Tabs>` 两个 variant（segment / underline）
- Done: Phase B — `CopilotPickerModal` 重画：3-tab segment header（Document/Vault/Setting）+ search + scope metadata + 新 `<PickerReadinessCard>` 通用 layout（icon + title/desc + signal chips + run-strategy 按钮列）+ 3 个 readiness adapter（document/vault/setting）+ 2-col split + Show all capabilities footer。删除 old `VaultIntentCard`，5-state 逻辑搬到 `vaultReadiness()`
- Done: Phase C — `VaultAutoRunModal` 1220 行 → 1850 行重写，6 个 tab 全按 mockup 重做：shield-check brand、count-badge tab、3×2 snapshot grid、4-chip "What changed"、cluster table+inline expanded card、Bridge score progress、action card with rank+drag+3-stats、Sources 3-col、Trace timeline+step inspector。删 `vault-review.css`（889 行），全 Tailwind 化
- Done: Phase D — placeholder stubs 都在位（bridge score、source signal pills、setting diagnostics 3 个 TODO marker），等真 service ships 再接

**Block 3 · 整天 debug Obsidian CSS 干扰（recurring pitfall 首次系统整理，12+ commits）**

用户反复反馈 "picker 的 row hover 看着比其他高一截 / 整体感觉错乱 / 拥挤"。多轮误诊后定位根因。

- 弯路 1 (`3d79b74`/`a5176e6`/`176a3a7`)：以为是 truncate/line-clamp/spacing 问题，反复调 layout — 无效
- 弯路 2 (`164f73c`)：发现 Tailwind 半步 spacing scale 只到 `3.5`，我用了大量 `4.5/5.5/6.5/9.5` 全是 silently failing — 替换成 `[Npx]` arbitrary 语法。改完仍有"错乱"
- 弯路 3 (`1fa79d3`)：以为白底 card 跟白 modal 融合不可见 → 改成灰底。结果还是错乱
- 弯路 4 (`91a9c4c`/`c57bf56`/`eaa82f9`)：以为是 Obsidian button `:hover` 加了 transform/box-shadow → reset 加 `transform/box-shadow/outline/filter: none !important` + 禁用 `::before/::after` 伪元素。用 Playwright 模拟 Obsidian 极端 hover 干扰验证 reset 真挡住了 — 然而 in-Obsidian 仍错乱
- 弯路 5 (`e352074`)：加 `· v3` 标题 marker 让用户能肉眼判断 CSS 是否真重载
- **真凶 (`7d37916`)**：用户贴 DevTools computed styles dump，**直接看到** Obsidian 的 `.modal button { height: var(--input-height); justify-content: center; }` ——把所有 modal button 高度锁死成 32px，flex 行为崩坏，hover 颜色只填充 32px 中间条。我的 reset 一直没盖 `height`。Fix：reset 加 `height/min-height/max-height: auto !important; justify-content: flex-start`。**一次性彻底解决**
- Done: 沉淀到 `docs/conventions/obsidian-css-defense.md`（新增 "Properties the reset must null" 完整属性清单表 + "Diagnosing a suspected leak" 流程）+ `docs/recurring-pitfalls.md` 新条目 #3（Obsidian global bare-tag rule leaks through scoped reset，含本次实例 + Detection signals + Prevention checklist）

**Block 4 · 后续 UX 调整（多 commit）**
- Done: `redesign(history-modal)` `4138095` — `CopilotReviewHistoryModal` 去 5 层 border，加 `peak-design-root`（同 CSS 干扰治了），trash 改成 hover-only ghost，去掉底部 Close 按钮（modal 已有 ×）
- Done: `ae9bcf5` — 顶部 tab 恢复 hover/active 反馈（之前误删的）+ history modal 加 Back 按钮
- Done: `d0c4224` — active tab 加 `bg-pk-accent-tint`（用户嫌 underline 不够明显）+ Run strategy primary 按钮从 shadcn 蓝色（`--pk-info`）改成品牌紫
- Done: `80becaf` — history modal 加 scope prop：Vault tab "All reviews" 直接接 `VaultReviewReportService`；Document tab 加 "This note / All notes" segmented toggle；统一 NormalizedRecord 类型让两种数据共用 row 渲染
- Done: `fe2b16c` — Setting tab 假数据洁净化：去掉 "All diagnostics" 误导 link、`SettingDiagnosticsList` 两个假行换成 "No diagnostics yet" 空状态、section title 加 `[preview]` pill

**Total: ~24 commits**。10-scene picker + 6-tab report UI 全部 live，1 个 recurring pitfall 正式建档，CSS defense convention 全面扩张。

### 2026-05-22 — Vault Auto Review 全量交付 + 设计系统暴雷 + 整改 spec

整天工作量超大，分四大块。

**Block 1 · Copilot doc-scope Auto Review 收尾**（剩余 H 列表 + 多轮 UX 迭代）
- Done: H#2/#3A/#4/#5 完成（debounce 立即写、Fast=Haiku auto override、Cancel 状态徽章、peak-system folder onboarding Notice）
- Done: G1-G3 自我检查 prompt 强化、capability chip 删除、Changes view toggle 移到 tab 行 sticky
- Done: I1-I2 卡片样式柔化、footer 合并 Apply 双按钮为单 Apply N changes 仅 Changes tab 显示、删 Close 按钮
- Done: H1 文档语言检测注入 + 用户偏好（profile markdown）系统 prompt 注入；H2 sources 改 div role=button + getLeaf('tab') 新 tab 打开
- Done: J1/J2 review headline frontmatter 持久化（first insight / first change title）+ 行 border 删干净
- Done: M1 Changes view toggle 移到顶层 tab bar 右侧、默认 Blocks only
- Done: N1/O1 Vault tab 用 listAll 全库 review、Setting tab 隐藏 history + Auto 按钮、show all 默认展开
- Done: K1 Sources 卡片 button → div role=button 修复 Obsidian button 全局样式注入导致的 flex 错乱（recurring pitfall #1 首次遇到）
- Done: L1 Insights tab hover popover TOC 加 Suggested follow-ups 入口
- Done: Q1 Trace 顶部 elapsed time summary
- Done: R1 Sources 新 tab 打开 + 头部解释卡；S1 Insights bg `bg-muted/30` 加 shadow，info severity 终于看着像卡片
- Done: P1/P2 行 hover bg 加深 + 完整 stat 标签；`originScope` 字段持久化到 frontmatter + 按 scope 过滤列表

**Block 2 · Vault Auto Review 从零交付**（8 任务 T1-T8 + 4 修复 + 全量重写）
- Done: 综合分析报告（北极星 / 竞品 / 学界 / 现有能力盘点 / 5 条差异化机会）
- Done: 综合设计文档 `docs/superpowers/specs/2026-05-20-vault-auto-review-design.md`（18 节，被 Codex 改过加 5 tab modal 结构 + Sources tab）
- Done: Mock HTML `docs/superpowers/mockups/2026-05-20-vault-review-mockup.html` 还原 Codex 7 张设计稿（picker + 6 tabs）
- Done: T1 VaultFingerprintService（sha1 over sorted path:contentHash + 30s 缓存 + 五状态映射 A-E）
- Done: T2 VaultDigestService（counts/clusters/holes/hubs/orphans/lint/activity 一次性聚合 + formatVaultDigestForPrompt）
- Done: T3 三个新 propose tool（`propose_cluster_observation` / `propose_gap` / `propose_action`）+ collector 新类型 + VaultMetaAgentStream system prompt
- Done: T4 runVaultReview session 多轮编排（无 ctx.file，独立轮数 SAFETY_CAP=12）
- Done: T5 VaultReviewReportService 落盘 `peak-system/vault-reviews/{ISO-date}-{hash}.md` + frontmatter 完整 schema
- Done: T6 Picker Vault tab UI（VaultContextLine / VaultIntentCard 5 状态 / VaultReviewHistoryList）
- Done: T7 VaultAutoRunModal + 6 tabs（Overview / Clusters / Gaps / Actions / Sources / Trace）
- Done: T8 picker onAuto 分流到 VaultAutoRunModal、history 还原走 openVaultReviewHistoryRecord
- Bug: U1 `translateSdkMessage` 第二参数 opts 对象未传，agent 流首条消息就崩 "B.split is not a function" — 修
- Bug: W1 cluster topNodes 实际是 `{path,label,betweenness}` 对象数组不是 string[]，点 cluster 行白屏 — 修

**Block 3 · UI 视觉还原 4 轮迭代 + Tailwind 翻译终局放弃**
- Iteration 1: V1-V6 修小问题（隐藏运行结束后的 trace rail / 删 Recent activity / cluster 行可选 + 异步 fetch members / Actions 空 chip 过滤 / TOC hover popover / prompt 强化 coverage targets）
- Iteration 2: 用户多次截图指出视觉跟 mock 差距大，**承认 Tailwind 翻译每属性 5% 损耗 × 10 属性 = 肉眼可见差异**
- Decision: 放弃 Tailwind 翻译路径，转 Mock CSS verbatim 复制方案
- Done: 新 `src/styles/vault-review.css`（730 行，scope 在 `.peak-vault-auto-run-modal`），mock `<style>` 块 1:1 复制
- Done: VaultAutoRunModal 完整重写，全部 className 改用 `vr-*` 命名（Tailwind 全清），inline SVG 替代 lucide
- Done: fallback 链补全：cluster label / dominantTopics / status / prevRecord 反查
- Iteration 3: 用户报"边框很多 / X 按钮不一致" → 定位到 Obsidian `<button>` 全局样式注入（recurring pitfall，跟之前 trace panel 同根因）

**Block 4 · Convention 体系建立 + 设计系统暴雷**
- Done: `docs/conventions/README.md` 索引 + 加新规则的格式约定
- Done: `docs/conventions/obsidian-css-defense.md` 详细规则（TL;DR / 原理 / Do / Don't / Checklist）
- Done: `src/styles/obsidian-reset.css`（`.peak-design-root` 类触发的 bare-tag 中和 reset）
- Done: `CLAUDE.md` 加 Project Rules section 一行指针
- Done: VaultAutoRunModal modal root 加 `peak-design-root` class
- Audit: 用户要求审所有 mock 文件 → 发现 12 个 mock 共 **5 套并行 token 系统**：
  - 真源 `peak-variables.css` 用 `#7c3aed`
  - 旧 chat redesign mock 用 `--accent` `--bg` 无前缀但值对
  - ai-analysis mock 用 `--pk-*` 完全对齐
  - dark variants 4 个 mock 各自一套
  - **我的 vault-review 用 `#7B5CFF` ❌ 偏离**
  - prompt-template-modal 用 Obsidian native dark
  - Streamdown shadow DOM 是第 6 套独立 shadcn HSL 系统
- Numbers: 200+ `pk-*` Tailwind class 引用、71 文件 hardcoded hex、25 文件直接引用 Obsidian theme var
- Done: 完整 spec `docs/superpowers/specs/2026-05-22-design-system-migration.md`（17 风险 / 6 phase 5-8 天 / 7 个待评审决策）

**关键沉淀（永久价值）**
- `docs/conventions/` 文件夹模式（rule 拆分而非堆 CLAUDE.md）
- `peak-design-root` 防 Obsidian 注入的可复用 class
- Obsidian CSS defense 规则文档
- 全局 design system 现状清单 + 暴雷分析（17 风险）
- 颜色不一致根因：`#7B5CFF` vs `#7c3aed` 早已埋下

**Known limitations / Next**
- Design system 迁移 spec 等用户评审 §3 风险 + §7 决策（紫色定哪个？Obsidian 主题继承否？Dark mode 时机？旧 mock 处置？）
- Vault Auto Review 视觉部分还有几处细节需要在确认设计系统统一方案后再修
- agent 产出量仍偏少（Fast 1-2 cluster / Complete 5 cluster），V6 prompt 改了但实际 vault 跑一次的覆盖未到 mock 期望水位
- Cluster member fetcher 依赖 `mobius_node.community_id` 字段，新 vault 没跑过 community detection 时为空（需引导跑一次 index）

### 2026-05-10 (Session 28) — S2-S7 全量并行执行（6 竞品差异化功能）

- Done: **Pre-wave — 6 个 Plan 并行编写**
  - `vault-lint.md` (7 tasks), `cascade-update.md` (8 tasks), `structural-hole.md` (8 tasks), `ppr-tuning.md` (4 tasks), `precompiled-knowledge.md` (6 tasks), `auto-tag.md` (4 tasks)
- Done: **Wave 1（3 线并行，零文件冲突）**
  - **S2 Vault Lint** (7 tasks): 5 信号检测器 + VaultLintService + VaultXRayView + ScoreRing/DimensionBars/PriorityActions
  - **S5 PPR Tuning** (4 tasks): co-citation 第 4 层 + query-node seeding + Settings enablePPR toggle + 评估命令
  - **S7 Auto-tag** (4 tasks): Schema 修复 + tag_suggestion 反馈持久化 + Accept High Confidence + batch FolderPicker
- Done: **Wave 2（2 线并行，协调 ddl.ts）**
  - **S3 Cascade Update** (8 tasks): hub_constituent 表 + HubConstituentRepo + CascadeWorker hub_invalidate/folder_stats 补全 + hub_regen stub
  - **S4 Structural Hole** (8 tasks): Brandes betweenness + Louvain community + Burt constraint + StructuralAnalysisRepo + Gap Analysis View + bridge actions + MCP tools
- Done: **Wave 3（S3 依赖已落地）**
  - **S6 Precompiled Knowledge** (6 tasks): HubStalenessDetector + HubRegenService (30s debounce, batch-10, 3x retry) + hub_regen_queue + reranker hub_doc boost
- Done: **TASKS Batch 1 (3 线并行)** — Phase 0 cleanup + 7 issues (#90 #81 #79 #76 #42 #38 #83)
- Done: **TASKS Batch 2 (3 线并行)** — #73 #57 #17 #14 #39 #47 #45 #31 #46 #12
- Done: **TASKS Batch 3 (3 线并行)** — #92 #77 #74 #93 #72 #2 #21 #60 #67 #91 #48
- Done: **TASKS Batch 4 (2 线并行)** — #32 #34 #40 #43 #29 #20 #44 #89 #58
- 总计本 session: 37 S-feature tasks + 35 TASKS.md issues = **72 tasks/issues**
- Build 通过，tests 通过
- **竞品差异化 S1-S7 全部完成 + TASKS Phase 3-9 大部分完成**
- Next: Phase 10 integrations, Phase 11 docs, 依赖瘦身, 真机验证

### 2026-05-10 (Session 27) — Wave 3 并行执行（Ambient Push Phase 4 + Provider MCP Phase 4-5）

- Done: **Ambient Push Phase 4 — Morning Briefing** (7 commits, 12 files, +1660 lines)
  - `BriefingItem` 类型 + `enableMorningBriefing` 设置
  - 3 类 SQLite 查询：未解决连接（incoming >= 2, outgoing < incoming*0.5）、变化的 Hub、衰减笔记（14 天未打开 + 高 PageRank）
  - `MorningBriefingService`：4h 间隔检查 + 并行数据收集
  - Zustand store + Obsidian Modal + React panel（三分组卡片 + hover Open/Dismiss）
  - `main.ts` 3s 延迟触发，cleanup on unload
  - 修复 Phase 2 缺失的信号检测导出函数
- Done: **Provider MCP Phase 4-5 — Skill System + Usage Dashboard** (7 commits, 13 files, +2099 lines)
  - Phase 4: `SkillDefinition` 类型 + YAML frontmatter markdown 解析器
  - `SkillRegistry` 单例：vault `_skills/` 目录扫描 + Obsidian vault 事件热加载
  - 3 个内置 skill：weekly-report、literature-review、vault-health-check
  - `SkillExecutor`：simple（单阶段）+ pipeline（多阶段）模式，复用 `queryWithProfile()` + AgentTool
  - Skill Picker Modal（搜索 + tag 过滤 + 动态输入表单）+ `peak-run-skill` 命令
  - Phase 5: `ModelRegistry.syncFromServer()` 服务端定价同步（Bearer auth, 10s timeout, 非破坏性合并）
- Plans written: `2026-05-10-ambient-push-phase4.md`, `2026-05-10-provider-mcp-phase4-5.md`
- Build 通过，ambient-push tests 全部通过（30 tests）
- Ambient Push S1 全 4 Phase 完成；Provider MCP 全 5 Phase 完成
- Next: S2 Vault Lint/Health Check spec + S3 级联关系更新 spec

### 2026-05-10 (Session 26) — Wave 1+2 并行执行（Ambient Push + Inspector + MCP + Report UI）

- Done: **并行执行框架** — `docs/parallel-execution-plan.md`，4 wave 编排，worktree 隔离
- Done: **Wave 1（5 条线并行）**
  - **Line A — Inspector Tools Overhaul** (12 tasks, 12 commits)
    - Schema 重设计：`BaseLimit.limit` 语义统一、`findPathInputSchema` strategy enum、`SemanticFilter.topK` max 30
    - `find-path.ts` 2032 行拆为 5 文件（scorer/reliable/fast-track/brainstorm/index），删除 temporal 策略
    - `makeTool` 工厂 + `forceFormat` 选项，消除 3 个 MarkdownOnly 变体
    - 11 个工具描述重写（When to use / Avoid when 格式）
    - 7 个实现文件从 `params: any` → Zod 推断类型
    - Recon system prompt 加工具选择指南
    - `search_by_dimensions` 结构化诊断输出、`find_orphans` 双重过滤 bug 修复
  - **Line B — V2 Persistence Bug Fix**: 5 个 bug 全部已在之前 session 修复
  - **Line C — Report UI**: V2InlinePlanReview sticky footer（flex 布局），Task 4 inline edit 已实现
  - **Line D — Ambient Push Phase 2** (7 tasks, 7 commits)
    - 图谱 2-hop 扩展 via `GraphRepo.getRelatedFilePaths()`
    - 4 种新信号：shared_tag、graph_neighbor、co_citation、hub_member
    - 反馈学习：opened/linked +0.1(cap +0.3)、ignored -0.05(cap -0.15)、dismissed 抑制 7 天
    - `getPositivePairs()`/`getIgnoredPenalties()` 聚合查询
  - **Line E — MCP Spike**: **GO** — `@modelcontextprotocol/sdk` 全 transport 可用，+450KB bundle
- Done: **Ambient Push 可见性修复**
  - `main.ts` onLayoutReady 首次自动打开右侧栏
  - `ViewSwitchConsistentHandler` Chat/Doc 布局切换不覆盖 AmbientPush tab
- Done: **Wave 2（3 条线并行）**
  - **Line F — AI UX Phase 3**: 17/17 tasks 全部已实现，`progress.md` 更新标记 COMPLETED
  - **Line D — Ambient Push Phase 3** (10 tasks, 8 commits)
    - `SerendipitySearcher`: 2-hop 邻居 + 最大 embedding 距离算法
    - `SerendipityGutterPlugin`: CM6 ViewPlugin，光标行 `?` 图标 + hover tooltip + click 打开
    - `RelevanceExplainer`: LLM Tier 2 微解释（fire-and-forget，rate-limited 2min）
    - `PatternLearner`: 跨会话 recurring pairs 缓存（10min 刷新，0-0.4 boost）
    - `PushCard` LLM 标记（Sparkles icon）
  - **Line E — Provider MCP Phase 1-3** (12 tasks, 12 commits)
    - Phase 1: 4 个 provider JSON + TemplateManager 运行时加载 + `ModelRegistry.loadFromTemplateManager()`
    - Phase 2: `OpenAICompatibleEndpoint` + 模型自动发现 + preset（LM Studio/LiteLLM/vLLM）+ Settings UI
    - Phase 3: `MCPClientManager`（stdio + SSE）+ `MCPToolAdapter`（JSON Schema→Zod）+ MCP Settings tab + 3 agent 集成
- Plans written: `inspector-tools-overhaul`, `ambient-push-phase2/3`, `provider-mcp-phase1-3`, `parallel-execution-plan`
- Spike report: `docs/superpowers/specs/2026-05-10-mcp-spike-report.md`
- Build 通过，ambient-push tests 通过
- Next: Wave 3 已完成（Session 27）

### 2026-05-10 (Session 25) — OpenRouter Stall Timeout + UI 小修
- Done: **OpenRouter PROCESSING 卡住修复**
  - 根因：OpenRouter 排队时发送 `: OPENROUTER PROCESSING` SSE 心跳，`eventsource-parser` 静默消费不产生 data event，`for-await` 无限挂起
  - `vercel-adapter.ts`：stall timeout（30s 无 chunk → abort）+ total timeout（5min → abort），接入已有但未使用的 `timeoutStepMs`/`timeoutTotalMs` 设置
  - `provider-factory.ts`：OpenRouter 加 `HTTP-Referer` + `X-Title` headers 提高路由优先级
  - `CopilotResultModal.tsx`：LOADING_STEPS 精简（移除 60s 无效提示，25s 提示 provider 排队），Back 按钮 `<button>` → `<Button>`
  - 用户取消时静默结束 generator（不再 yield error）
- Done: **UI 小修**
  - `MessageViewItem.tsx`：Style chips 最后一条消息始终可见，其余 hover 显示
  - `PromptItem.tsx`：所有 item 统一 hover 背景，非成对 item 加 cursor-pointer
- Build 通过
- Next: 真机验证 stall timeout 效果

### 2026-05-09 (Session 24) — Copilot Token 显示 + 请求取消
- Done: **Token Usage Display**
  - `ActionUsage` 接口 + `usage?` 字段加到 `ActionResult` 三种变体
  - `queryTextStream` 的 `done` 事件携带 `usage`；`queryStructured` 加 `usageCallback` opts
  - `toActionUsage()` 转换 helper，10 个 LLM action 全部捕获并返回 usage
  - `UsageFooter` 组件：result 阶段底部 "X in + Y out tokens"
- Done: **Request Cancellation**
  - `CopilotAction.execute` 签名加 `signal?: AbortSignal`，15 个 action 全部透传
  - `CopilotResultModal.onOpen()` 创建 `AbortController`
  - Loading 阶段 Cancel 按钮（X 图标），点击 abort + 显示 `CancelledView`
  - `CancelledView`：Ban 图标 + "Cancelled" + "Back to Copilot" 按钮
  - Back 按钮 / modal close 同步 abort
  - catch 中判断 `signal.aborted` → 显示 cancelled 而非 error
- Files: CopilotActionRegistry.ts, service-manager.ts, actions/index.ts, CopilotResultModal.tsx
- Build + tests 通过
- Next: 15 个 action smoke test + Suggest Links 本地化（可选）

### 2026-05-09 (Session 23) — Bug 修复 + 清理
- Done: **移除独立 Copilot 命令**
  - 删除 `copilot-commands.ts`，移除 `Register.ts` 中 `buildCopilotCommands()` 调用
  - 命令面板只保留 "Open Copilot Panel"（Picker Modal），不再注册 15 个独立 action 命令
- Done: **OpenRouter 404 修复** — `baseUrl` 缺少 `/v1` 后缀
  - 根因：`presets.ts` / `materialize.ts` / `sdkProfile.ts` 硬编码 `https://openrouter.ai/api`，覆盖了 `@openrouter/ai-sdk-provider` 库的正确默认值 `https://openrouter.ai/api/v1`
  - 修复 3 个源文件 + `provider-factory.ts` 加运行时兼容（已保存的旧 profile URL 以 `/api` 结尾自动补 `/v1`）
  - 测试文件同步更新，全部通过
- Done: **SuggestedFollowups 级联 LLM 调用修复**
  - 根因：`SuggestedFollowups` 在所有 assistant 消息上渲染（CSS 隐藏 ≠ 不执行 useEffect），切换对话时 N 个 assistant 消息 = N 个并发 LLM 请求
  - 修复：`MessageViewItem.tsx` 加 `isLastMessage` 条件，只在最后一条消息渲染 `SuggestedFollowups`
- Build + tests 通过
- Next: 重载插件验证 OpenRouter 连接 + chat 无级联报错

### 2026-05-09 (Session 22) — Profile authToken 清理
- Done: **Phase X3 — Profile authToken 清理**
  - **根因调查**：PatternDiscovery 启动 401 错误 → Agent config 指向 "Migrated OpenRouter" profile（baseUrl 空 → OpenRouter token 发到 Anthropic API）；Copilot TagSuggestion 报 "OpenRouter API key missing" → Copilot config 指向无 key 的空 OpenRouter profile
  - **数据清理**：合并两个 OpenRouter profile（Migrated authToken → OpenRouter apiKey），删除 Migrated OpenRouter，重新绑定 4 个 slot
  - **authToken 字段删除**：Profile 接口移除 `authToken`，所有 provider 统一用 `apiKey`
  - **代码清理**（10 个文件）：
    - `types.ts` 移除字段、`presets.ts` 8 个工厂方法清理
    - `materialize.ts` 简化：Anthropic → `ANTHROPIC_API_KEY`，OpenRouter → `apiKey` 映射到 `ANTHROPIC_AUTH_TOKEN`（CLI 要求 Bearer）
    - `provider-factory.ts` / `testProviderConnection.ts` 直接用 `apiKey`
    - `ProfileCard.tsx` 移除 "auth token set" 显示
    - `sdkProfile.ts` 移除 `authToken` + 统一 OpenRouter fallback 用 `apiKey`
    - `PluginSettingsLoader.ts` 加 legacy 迁移：旧 `authToken` → `apiKey`
  - **OpenRouter baseUrl 修复**：空 baseUrl fallback 到 `https://openrouter.ai/api/v1`（`materialize.ts` + `provider-factory.ts`）
  - **测试更新**：3 个测试文件同步更新（profile-registry、sdk-profile、embed-client），全部通过
  - Build 通过
- Next: 重载插件验证无启动错误

### 2026-05-09 (Session 21) — Search Pipeline Upgrade + Onboarding Index Config
- Done: **Phase AC — Onboarding Index Configuration** (7 tasks, 7 commits on `feat/onboarding-index-config`, merged to master)
  - **Onboarding 4步流程**：Welcome → Provider → **Index Config** → System Check+Indexing
  - **三档索引选择**：Quick Index (FTS only, ~30s) / +Semantic Search (+embedding, ~5min) / +Smart Enrichment (+LLM, ~30min)
  - **Smart Provider Defaults**：OpenAI→自动选semantic+预填embedding、Ollama→fast+hint、Anthropic→fast+警告(无embedding API)
  - **Inline Embedding Config**：endpoint/model/apiKey 直接在 onboarding 里配置 + Test Connection
  - **IndexProgressDisplay**：进度条 + 步骤标签 + 文件计数
  - **IndexErrorDialog**：embedding/LLM 失败时 Continue/Retry/Cancel 三选一
  - **IndexInitializer 升级**：`performStagedFullIndexing(level)` 按档位跳过 embedding/LLM 步骤 + error callback
  - **Settings SearchIndexSection**：索引级别下拉 + 文件统计 + Rebuild Index 按钮
  - **SearchUpgradePrompt**：搜索 ≥10 次且无 semantic search 时，结果底部淡色提示 → Settings（7天冷却）
  - **Settings 迁移**：已有 embedding 配置的老用户自动升级为 `semantic`
- Spec: `docs/superpowers/specs/2026-05-09-onboarding-index-config-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-onboarding-index-config.md`

### 2026-05-09 (Session 21) — Search Pipeline Upgrade
- Done: **Phase AB — Vault Search Pipeline Upgrade** (19 tasks, 19 commits on `feat/search-pipeline-upgrade`, merged to master)
  - **架构重构**：硬编码三路搜索 → 可组合 Query Pipeline（QueryParser → 5 Retrievers → adaptive RRF Merger → Ranker → HighlightEngine）
  - **关键 Bug 修复**：BM25 分数被 `Math.max(0, negative)` 清零 → batch 归一化恢复 TF-IDF 信号
  - **QueryParser**：`"短语"` 精确匹配、`-排除` 否定搜索、`tag:` / `ext:` 过滤、auto prefix 匹配
  - **5 路 Retriever 注册表**：FTS (BM25 fix + chunk decay)、FTS-Stem (Porter Stemmer 词干匹配)、Vector (KNN)、Meta (title/path/tags)、Fuzzy (Levenshtein ≤2 错字修正)
  - **自适应 RRF 融合**：query-dependent 权重（短语→压低语义、长查询→拉高语义、CJK→跳过 stem）
  - **Per-document Chunk Decay**：指数衰减（decay=0.5），防长文档碾压短文档
  - **Click-through 学习**：search_click 表记录用户点击，stemmed query key 泛化，+0.15 ranking boost
  - **HighlightEngine 统一**：原始文本 snippet（非 FTS 归一化文本）、exact/stem/fuzzy 三色高亮、双因子窗口选择（diversity×2 + density）
  - **Ranker 微调**：recency 衰减 30d→40d、frequency 0.15→0.10、新增 exclude post-filter
  - **Debounce 优化**：vault 500ms→200ms、in-file 300ms→150ms、go-to-line 500ms→100ms
  - **UI**：统一 `renderHighlightSpans` 渲染器、fuzzy correction banner、`?` 帮助增加查询语法文档
  - **Cleanup**：删除 `highlight-builder.ts`、删除 6 个过时 RRF/scoring 常量、queryService.ts -517 行
- Spec: `docs/superpowers/specs/2026-05-09-vault-search-pipeline-upgrade-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-vault-search-pipeline-upgrade.md`
- Next: 真机验证搜索效果 + Onboarding 流程验证 + Phase W Copilot smoke test

### 2026-05-08~09 (Session 17+20) — Codebase Deep Refactor
- Done: **100,002 → 71,582 code lines (-28,420 = -28.4%)**, 40 commits on `refactor/codebase-50k-target`
- Hub 系统完整删除 (-6,750), D3 graph-viz → ReactFlow (-6,373), Wave 0 dead code (-5,448)
- Wave 2 store migration (-630), 结构分析管线删除 (-920), 遥测系统删除 (-1,009)
- Service 简化 (-2,800), Loader 基类提取 (-911), Feature 删除 (-2,600)
- 死 UI 组件 (-830), console strip (-234), dead exports/files/stubs (-315)
- Next: UI 组件精简, MobiusNodeRepo 瘦身, service/chat 合并 (target 50k)

### 2026-05-09 (Session 21) — Codebase Deep Refactor Phase 2
- Done: **71,227 → 66,742 code lines (-4,485 = -6.3%)**, 25 commits on `refactor/codebase-50k-target`
- 死代码删除 (-800): hub SQL/NativeModule tryCompile/BetterSqlite require.cache/dead files/dead props/PromptId/MobiusEdgeRepo 9 methods
- 算法简化 (-1,200): find-path.ts A*→min-heap+BFS合并(1514→986), buildBackboneMap tag-ranking折叠+DFS合并(1519→1208)
- 架构重构 (-1,000): 14 copilot actions→factory(787→377), service-manager 18 wrappers→getter, IndexService 3 classes→1
- 冗余压缩 (-750): tools 8文件简化(-710), search infra 去重(indexInitializer/semanticEdges/SqliteStoreManager/highlight-builder/progress-tracker, -1099)
- 注释/类型精简 (-700): document/types.ts(325→109), settings/types.ts(468→242), analysis-markdown parser+builder
- V1退役: SectionExtraChatModal(-450), V1 topic/interaction stores, followupContextRuntime V1 paths
- 代码量评估: 66.7k 对功能体量(Chat+RAG搜索+Agent工具链+向量索引+Graph分析+多Provider+Copilot)合理，各模块量级均衡
- 可继续方向: quick-search store/hooks层(偏复杂), sqlite repo层(偏冗余), 但不急

### 2026-05-09 (Session 19) — Provider Settings Polish
- Done: **Phase X2 — Provider Settings Polish** (7 commits)
  - **Pill 搜索面板**：`RoleModelPicker` 组件，Command Palette 风格浮动面板，实时搜索 + 键盘导航 + CapTags（reason/vision/search/上下文窗口）+ 按 profile 分组
  - **共享 utils 提取**：`model-display-utils.tsx` 提取 `CapTags`/`highlightMatch`/`formatCtx`，`ModelCombobox` 和 `RoleModelPicker` 共用
  - **StatusBar 重写**：`RoleSelectorChip` 从平铺下拉改为 `RoleModelPicker` 弹出面板，删除冗余的 `PROVIDER_CATALOG`/`getModelsForProfile`
  - **AddProfileGrid 去重**：已配置的 provider 默认隐藏，底部 "Add another instance of existing provider" 链接可展示全部
  - **凭证状态修复**：`ProfileCard` subtitle 区分显示 — Ollama "no key needed"、有 authToken "auth token set"、有 apiKey "API key set"
  - **连接测试修复**：`testProviderConnection.ts` Bearer token 优先使用 `authToken`，修复 OpenRouter 认证
- Spec: `docs/superpowers/specs/2026-05-09-provider-settings-polish-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-provider-settings-polish.md`
- Next: 真机验证 pill 搜索 + AddProfileGrid 去重效果

### 2026-05-09 (Session 18) — Settings UI Redesign
- Done: **Settings General & Search Tab UI Redesign**
  - **设计决策**：现代卡片式 + General 不分组 + Search 轻量 section header + pill chips
  - **新建 3 个共享组件**：`SettingCard`（统一卡片）、`SectionHeader`（轻量标题）、`DocTypePills`（flex-wrap 药丸标签替代 4 列 grid）
  - **GeneralTab 重写**：去掉 3 个 CollapsibleSettingsSection，4 项设置平铺为卡片，DevTools 加 "Developer" badge，删除 Graph Visualization Tuning（5 个死滑块）
  - **SearchTab 重写**：统一卡片样式，SectionHeading→SectionHeader（11px uppercase + icon），DocTypeGrid→DocTypePills
  - **清理**：types.ts 删除 5 个死 graphViz 设置项（clusterForceStrength/nodeBaseRadiusPhysical/nodeBaseRadiusSemantic/nodeDegreeBoost/skeletonMinBranchNodes），删除 DocTypeGrid.tsx + CollapsibleSettingsSection.tsx
  - Build 通过
- Spec: `docs/superpowers/specs/2026-05-09-settings-general-search-ui-redesign.md`
- Plan: `docs/superpowers/plans/2026-05-09-settings-general-search-ui-redesign.md`
- Mockups: `.superpowers/brainstorm/21332-1778293900/content/`
- Next: 真机验证两个 tab 的视觉效果 + 功能回归

### 2026-05-08~09 (Session 17) — Codebase Deep Refactor
- Done: **100,002 → 81,632 code lines (cloc TypeScript, -18,370 = -18.4%)**, 21 commits on `refactor/codebase-50k-target`
- Wave 0 (dead code purge, -5,448): tmp_code_ref_for_cursor, src/desktop, index-debug-tools, dead hooks/utils/exports, 44 dead repo methods, dead templates
- Wave 1 (D3→ReactFlow, -6,373): Delete entire graph-viz/ (46 files, 6,456 lines) + shim + preset, replace with 100-line ReactFlow SearchGraph
- Wave 3 (hub/backbone consolidation): Inline 4 hub helpers into hubDiscover.ts, merge backbone 15→4 files
- Wave 4 partial: merge duplicate agent SDK files, simplify find-path.ts/explore-folder.ts/inspectorService.ts, delete 5 dead inspector functions
- Wave 5.3: Extract BaseDocumentLoader, simplify 10 loaders (-911 lines)
- Feature deletions: usage-dashboard (init never called), vault-xray (isolated), 7 dead files
- Cleanup: strip 234 console.log/debug, delete dead exports from constant/markdown-utils/PromptId/types
- Plan: `docs/superpowers/plans/2026-05-08-codebase-deep-refactor.md`
- Next: Wave 2 store migration (-5k), Wave 4/5/6 service+core+UI simplification (target 50k)

### 2026-05-08 (Session 16)
- Done: **Phase Z — Mockup Gap 补全** (8 commits)
  - **审计**：对比 7 个 HTML mockup 与实际代码，识别出 9 个未实现设计项
  - **NavigableMenuItem 类型扩展**：新增 `group` + `meta` 可选字段
  - **@ 菜单改进**：文件夹面包屑导航（ChevronLeft + Backspace 快捷键）、"Recent" 分组标签、文件元数据 badge（PDF/DOCX/word count）
  - **/ 菜单模板分组**：`item.group` 动态分组（替代硬编码 Quick Actions）、"Template" 紫色 badge、CopilotActionRegistry 15 个 action 自动接线到 / 菜单
  - **输入工具栏响应式**：ResizeObserver 监测宽度，<400px 隐藏 TokenUsage + 截断模型名，<300px 隐藏 ModeSelector
  - **智能建议 actions**：LLM 生成上下文感知建议（chat-suggest-actions prompt），失败时 fallback 到默认建议（Summarize/Search vault/Explain further）
  - **Diff 高亮**：wordDiff.ts LCS 算法 + DiffView 组件（红色删除线/绿色高亮），PolishPanel 集成
  - **变量高亮**：SuggestionGrid 卡片中引号包裹的动态变量黄色高亮（warning-muted CSS var）
- Next: 真机验证各 mockup 功能视觉效果

### 2026-05-08 (Session 15)
- Done: **Bug fix — Auto 模型选择不感知 chatMode**
  - 根因：`chatMode`（Chat/Agent/Plan）从未参与模型选择逻辑，三处硬编码 `getActiveAgentConfig()`
  - `ProfileRegistry.ts` 新增 `getConfigForMode(mode)` — agent/plan → Agent config，其余 → Chat config
  - `ChatInputArea.tsx` Auto 占位符改用 `getConfigForMode(store.chatMode)`
  - `useChatSession.ts` 已有对话 fallback 改用 `getConfigForMode(conversationType.kind)`
  - `useChatSubmit.ts` 新对话 fallback 改用 `getConfigForMode(chatMode)`
- Done: **Feature — Quote to input（右键引用选中文字到输入框）**
  - `chatViewStore.ts` 新增 `insertToInput` 回调 + `setInsertToInput` action
  - `ChatInputArea.tsx` 新增 `InsertToInputHandler` 组件（PromptInput 内注册追加文本+聚焦回调）
  - `MessageViewItem.tsx` 右键菜单新增 "Quote to input"，选中文字按行加 `> ` 前缀插入输入框
- Next: 真机验证 Auto 模型切换 + Quote to input 功能

### 2026-05-08 (Session 14)
- Done: **Phase Y — Token Usage Dashboard** (11 commits)
  - **数据层**：`usage_log` + `usage_daily` 表 schema（DDL），`UsageLogRepo` 12 个聚合查询方法，`UsageTrackingService` 事件订阅 + 压缩 + 查询 API
  - **事件总线**：`USAGE_RECORDED` 事件类型 + `UsageRecordedViewEvent`，pub-sub 架构
  - **自动追踪（6 个拦截点）**：
    - `AIServiceManager` 4 个 query 方法（queryText/queryTextStream/queryStream/queryStructured）自动 emit
    - `sdkAgentPool.queryWithProfile` 拦截 result 消息 emit
    - `embedClient.embedTexts` 解析 API response 中 `usage.prompt_tokens` emit
  - **数据修复**：`vercelGenerateText` 返回 usage（原来丢弃）、`sdkMessageAdapter` 映射 `cachedInputTokens`
  - **Dashboard View**：独立 ItemView（`peak-usage-dashboard`），recharts 图表库
    - KPI 卡片 4 个（总 token / 费用 / 调用数 / 延迟）+ 环比变化
    - Token 趋势折线图 + Cost 趋势折线图（按 provider 分色）
    - 3 个饼图（By Feature / By Provider & Model / Cost Breakdown）
    - Daily Breakdown 堆叠柱状图（按功能分色）
    - Recent Calls 明细表（feature 筛选 + 彩色 badge）
  - **保留策略**：可配置 `usageDetailRetentionDays`（默认 30 天），过期明细自动按天压缩到 `usage_daily`
  - **设置**：`usageTrackingEnabled` + `usageDetailRetentionDays`，main.ts 生命周期集成
  - **命令**：`Open Usage Dashboard` 命令注册
- Spec: `docs/superpowers/specs/2026-05-08-token-usage-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-05-08-token-usage-dashboard.md`
- Mockup: `.superpowers/brainstorm/85527-1778205143/content/panel-mockup-v4.html`
- Next: 真机验证 Dashboard 面板渲染 + 数据流

### 2026-05-08 (Session 13)
- Done: **Settings Test 按钮接线**
  - 根因：`ProfileCard.tsx:handleTest` 是空壳（`// TODO: wire to real connectivity test`），只假装 1.5s testing 无实际 API 调用
  - 提取 `src/core/providers/testProviderConnection.ts` 共享函数（从 `OnboardingModal.tsx` 去重），支持 `Profile` 对象和 `(kind, apiKey)` 两种调用方式
  - 分 provider 测试：Anthropic → POST messages (max_tokens:1)，Ollama → GET /api/tags，其他 → GET /v1/models
  - ProfileCard 按钮显示真实结果：Connected(绿✓) / Failed(红✗) + 动画
  - OnboardingModal 改为导入共享函数，删除本地重复实现
- Next: 真机验证 Test 按钮 + Phase W smoke test

### 2026-05-08 (Session 12)
- Done: **Phase X — Model Selection 统一** (10 commits)
  - **Provider 卡片简化**：删除 Primary/Fast Model 选择器 + "Use as Agent/Embedding/Web Search" 角色切换按钮 + RoleBadge，Provider 卡片只保留 Connection + Embedding 配置
  - **Agent Fast pill**：新增第 5 个 StatusBar pill，对应 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 环境变量（Agent SDK 轻量任务模型）
  - **`toAgentSdkEnv` 重构**：从读 `profile.primaryModel/fastModel` 改为接受显式 `agentModelId + agentFastModelId`，由 `ProfileRegistry` RoleConfig 解析
  - **Agent/Agent Fast pill 模型过滤**：只展示 `anthropic` 和 `openrouter`（`anthropic/` 前缀）的 profile 和模型，因 Agent SDK 只支持 Claude
  - **Ollama 动态模型获取**：`fetchOllamaModels(baseUrl)` 调用 `GET /api/tags`，3s 超时，silent fail；`ModelRegistry.mergeRuntimeModels()` 合并到 catalog；Settings 页加载时自动触发
  - **Ollama 自由输入**：ModelCombobox 对 Ollama profile 允许输入任意模型名（如 `nomic-embed-text`）
  - **Ollama baseUrl 修复**：`provider-factory.ts` 的 `ollama()` 调用传入 `profile.baseUrl`
  - **清理**：ProfileCard props 精简（删 6 个 prop）、ProfilesTab handlers 精简（删 3 个 handler）、131 行代码删除
- Spec: `docs/superpowers/specs/2026-05-08-model-selection-unification-design.md`
- Plan: `docs/superpowers/plans/2026-05-08-model-selection-unification.md`
- Next: 真机验证 Settings 页模型选择 + Ollama 动态模型获取

### 2026-05-07 (Session 11)
- Done: **Phase W — Copilot Panel Expansion** (20 tasks, 4 commits)
  - **架构重构**：CopilotActionRegistry 注册表模式替代硬编码 action 数组
  - **DocumentContextBuilder**：从活跃文件 + metadataCache 构建 DocumentContext（wordCount/tags/links/backlinks/headingCount/isOrphan）
  - **CopilotPickerModal 重写**：按 Document(蓝)/Vault(紫)/Writing(绿) 三组展示，高相关性 action 显示 ★ 推荐标记
  - **CopilotResultModal 重写**：通用 `action.ResultPanel` 渲染，消除 switch/case
  - **copilot-commands.ts 精简**：从 165 行 5 个独立命令 → 55 行注册表 dispatcher
  - **TagSuggestionEngine 接入**：suggest-tags 现在使用多信号融合（LLM + 图邻居 + 文件夹历史）
  - **10 个新功能**：
    - Document: Summarize (流式), Extract Concepts (结构化), Translate (流式+自动语言检测)
    - Vault: Find Related (纯向量搜索无 LLM), Knowledge Gaps (结构化), Synthesize Topic (搜索+流式), Vault Health (元数据扫描+结构化)
    - Writing: Continue Writing (流式), Rewrite Selection (流式), Add Evidence (搜索+结构化)
  - **18 个 prompt 模板** + **4 个 Zod schema** + 语言配置
  - Build passes，待真机验证
- Spec: `docs/superpowers/specs/2026-05-07-copilot-expansion-design.md`
- Plan: `docs/superpowers/plans/2026-05-07-copilot-expansion.md`
- Next: 真机 smoke test（见下方清单）

### 2026-05-05 ~ 2026-05-07 (Session 10)
- Done: **Phase U — Chat UI v9 + 智能功能**
  - Message UI v9 重构：去掉 PEAK/You 标签 + 用户头像，provider icon 与内容同行
  - 非最后消息 footer(metadata+actions+followups+styles) 隐藏、hover 显示；最后消息始终展示
  - Reasoning 默认折叠（saved messages defaultOpen=false），展开文字更浅（xs + opacity-60）
  - 换模型重新输出：split button (regenerate + model picker popover)，任意 AI 消息可用
  - Suggested Follow-ups：LLM 生成后续问题建议，所有 AI 消息可见
  - Topic 自动聚合：TopicAggregationService + SQLite topic 列 + prompt 模板，6条未分组消息触发
  - 删除内联 OUTLINE 面板，保留侧边栏 Conversation Outline + padding/overflow 修复
  - Bug fixes：Home Recent Conv 空白（缺 notifySelectionChange）、Model picker 裁切（fixed 定位）、最后消息 action 按钮隐藏
- Next: 真机验证全流程

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
| ai-analysis-ux-overhaul | 04-17 | COMPLETED (all 6 phases, Phase ⑥ superseded by PatternDiscovery) |
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
| copilot-expansion | 05-07 | IN PROGRESS (code done, needs smoke test) |
| model-selection-unification | 05-08 | COMPLETED |
| token-usage-dashboard | 05-08 | COMPLETED |
| ai-analysis-landing-redesign | 04-25 | COMPLETED |
| settings-redesign | 04-25 | COMPLETED |
| agent-trace-observability | 04-22 | COMPLETED |
| graph-layout-fix | 05-01 | COMPLETED |
| ui-stability-batch-fix | 05-03 | COMPLETED |
| provider-settings-polish | 05-09 | COMPLETED |
| ambient-push-phase1 | 05-01 | COMPLETED |
| ambient-push-phase2 | 05-10 | COMPLETED |
| ambient-push-phase3 | 05-10 | COMPLETED |
| inspector-tools-overhaul | 05-10 | COMPLETED |
| v2-persistence-fix | 04-18 | COMPLETED (verified already done) |
| report-ui-quality | 05-10 | COMPLETED (Task 3 done, Task 4 already done) |
| ai-analysis-ux-overhaul | 04-17 | COMPLETED (all 17 tasks verified) |
| provider-mcp-phase1-3 | 05-10 | COMPLETED |
| mcp-spike | 05-10 | COMPLETED (GO) |
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
