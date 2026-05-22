# Copilot Auto Review — 2026-05-17 ~ 05-18 实施会话日志

> Spec: `docs/superpowers/specs/2026-05-17-copilot-meta-agent-redesign.md`
> Memory: `feedback_auto_build.md`, `project_copilot_meta_agent.md`
> Status: 架构重写完成 + 17 个 UX 迭代 + 持久化 + 速度优化 + agent prompt 守则收紧

## 摘要

一天内把 Copilot Auto Review 从"planner→N 个独立 capability agent loop"完整重写为"单 meta-agent + propose_* 工具 + 多轮 + compact"架构，并完成 8 个 UX 迭代和 1 个持久化系统。

---

## A. 架构重写（Phase 1-4 一次性落地）

### Phase 1 — Propose 工具集 + Collector

**新文件**:
- `src/service/copilot/CopilotOutputCollector.ts` — 中央 proposal 收集器，按 roundIndex 打戳，类型化 propose 数据结构
- `src/service/copilot/CopilotOutputMcpServer.ts` — 6 个 MCP 工具:
  - `propose_insight(title, body, severity, provenance, followUpQuestions)`
  - `propose_change(title, blocks[], provenance)` （每 block 含 heading/before/after/rationale）
  - `propose_source(path, excerpt, relevance, weight)`
  - `attach_chat_followup(question, rationale)`
  - `note_finding(text)` — 回写 tool-result，agent 跨 turn 记忆
  - `submit_review(summary, modeUsed, continue, continueRationale?)`

**改造**:
- `CopilotArtifactAdapter.ts` 新增 `proposalsToArtifacts()`：proposals → typed UI artifacts（loss-less，不再 schema 推断）
- `agent-actions.ts` `buildCopilotAgentStream` 加可选 `collector` 参数（向前兼容旧 capability 路径）

### Phase 2 — Meta-agent + 多轮 + Compact

**新文件**:
- `src/service/copilot/CopilotSignalReport.ts` — 纯规则 pre-flight（J1 决定）：basename, scope, wordCount, links, backlinks, orphan, tags, tasks, recently modified。50ms 内完成，喂入 system prompt 的 SIGNAL REPORT 段
- `src/service/copilot/CopilotMetaAgentStream.ts` — 单轮 meta-agent SDK query。`buildMetaAgentSystemPrompt(mode, signalReport, previousRounds)` 构造 prompt（含 mode-specific 段 + `<previous-rounds>` compact 块）
- `src/service/copilot/CopilotReviewSession.ts` — 多轮编排器 `runCopilotReview(ctx, mode, signal)`：
  - Fast = 单轮；Complete = 多轮 agent 自决
  - 每轮独立 SDK query；轮间 compact（只保留 plan summary + propose_* 产出 + note_findings）
  - `ReviewSessionSnapshot` 状态流出（每个事件触发一次）

### Phase 3 — Trace 折叠

**新文件**:
- `src/service/copilot/CopilotReviewArtifactBuilder.ts` — `buildReviewArtifacts(snapshot)` 把 ReviewSessionSnapshot → CopilotRunArtifacts。trace 按 `propose_*` 作为 group root，前面所有 read/grep/note_finding 收为 children

**改造**:
- `CopilotRunArtifacts.ts::TraceArtifact` 扩展：`roundIndex / groupRoot / groupOf / kind` 新枚举（`plan / finding / propose-insight / propose-change / propose-source / submit-review / round-header` 等）
- `TraceArtifactPanel.tsx` 全重写：分组渲染，运行中 group 默认展开、完成后默认折叠；折叠态显示子计数摘要 ("3 reads · 1 grep · 2 findings")
- 注：按钮元素从 `<button>` 改为 `<div role="button">`，避开 Obsidian 全局 `button` 样式注入的"白底卡片"叠加 bug

### Phase 4 — UI 入口

**改造**:
- `CopilotPickerModal.tsx` 加 Fast / Auto 按钮并列
- `Platform.isMobile` guard 隐藏 Auto Review 入口（L2 决定）
- `CopilotAutoRunModal.tsx` 完整重写消费 ReviewSession

---

## B. UX 迭代（按发现顺序）

### B1. 模型 ID 解析错误 (provider id alias)

**问题**: 选 `claude-4-sonnet` 报"model does not exist"。Profile `kind='anthropic'` 而 catalog provider id 是 `'claude'`，`resolveApiModelId` 找不到 catalog 条目，返回原字符串。

**修复**: `src/core/providers/model-registry.ts::normalizeProviderId` 加 alias 表 `{ anthropic→claude, gemini→google }`，集中解决（旧 UI 各处的 ad-hoc 映射可冗余保留）。

### B2. Step 瞬间爆出"很多 step"——根因是硬编码 synthetic step

**初版**: 加 180ms 延迟 + CSS 淡入。

**用户反馈**:"这不是 180ms 的问题，是不是没把 agent 流程处理好？"

**真修复**: 删除整套 synthetic step 机制（analyze/run/prepare 三段叙事是 UI 假造的，agent 没有这些事件）。`CopilotAutoRunModal` 改为只渲染 agent 真实事件。保留的"非 agent 事件"都是 planner 真做了的：observed note + selected intent + 结果产物。

### B3. 缺失的 template id `copilot-agent-check-task-list` 等

**修复**: `TemplateRegistry.ts` 补齐 4 个缺失的 copilot-agent playbook：write-article / detect-and-file / check-task-list / prompt-audit（文件在 templates/ 已存在但没注册）。

### B4. Trace tab 隐藏左侧 rail + 工具名展开

**修复**: 
- `CopilotReviewShell::traceRailVisible = showTraceRail && activeTab !== 'trace'`（在 trace tab 时左 rail 隐藏，避免重复）
- `TraceArtifactPanel` 加 `expanded?: boolean` prop；trace tab 模式去掉 `max-w-[160px] truncate`

### B5. vault_read_note 的 maxChars 默认 3000 → agent 自决

**问题**: 所有 Reading 全显示 3000 chars，被硬截。

**修复**: tool description 显式告诉 agent "YOU choose maxChars based on need (1500 scan / 5000 normal / 10000-20000 central)"。默认 5000。Schema 加 `.describe()` 让 Claude 看到引导。

### B6. Trace 太长且无结构 → spec + 实施

详见上述 Phase 3。本节是用户原始 trigger。

### B7. Round budget 概念撤除

**用户**:"为什么一定要有 round？根本没有 round 限制吧应该。"

**修复**: 
- 删 `maxRounds=3`，改 `ABSOLUTE_ROUND_SAFETY_CAP=20`（隐藏的兜底防 infinite loop，从不向用户暴露）
- 删 `budget-exhausted` 状态、"Round budget exhausted"红框、Budget reminder trace、70% 预算 `<system-note>` 注入
- Round header 不再写 "of N"

### B8. Tab 切换抖动

**问题**: `CopilotReviewShell` 有个 effect 每次 `changes.length > 0` 都强制 `setActiveTab('changes')`，snapshot 频繁更新导致点别的 tab 立即被弹回。

**修复**: 用 `userPickedTab` flag 区分用户主动选择 vs 自动选择；只在当前 tab disabled 时才回落。

### B9. Changes 面板完整重做

**用户**:"这不是我规划的样式啊"（贴了一张目标设计稿）。

**迭代**:
- 初版：行号 + 红绿背景 + 每 block 第一行 capability chip + checkbox accept/reject
- 用户:"这checkbox不知道是接受还是拒绝"
- 二版：每 block header 上明确的 Accept(CheckCircle)/Reject(XCircle) 双按钮组；选中态填充色
- 用户:"不能看整个文档" + "应该有开源 diff 组件"
- 三版（最终）:
  - 新 `src/ui/component/diff/lineDiff.ts` — LCS 行级 diff（自己写的工业级版本；评估过 jsdiff/react-diff-viewer-continued 但渲染需求太特殊，库没有 hunk + capability chip + accept/reject 的 hook，沿用自研）
  - `WholeDocChangesView` — 全文档连续 diff：把每 block.before 在 ctx.content 中匹配定位（first non-overlapping），按位置排序，未匹配的 block 在末尾。unchanged 段 + block 段交错，行号连续，block 头上的 capability chip + 双按钮明确
  - 顶栏切换 "Whole document" / "Blocks only"
  - block 被 reject 时 whole-doc 视图把该段还原成原文（不显示 diff）
  - reject 状态写回 `block.selected=false`，`Apply selected` 自动跳过

### B10. Insights 全宽 + Markdown + 可选中

**修复**: 
- `InsightsArtifactPanel` 强制 `max-w-4xl mx-auto w-full` 单列
- body 用 `StreamdownIsolated` 渲染 markdown
- 所有容器加 `style={{ userSelect: 'text' }}` 绕过 Obsidian 默认禁选

### B11. Chat tab 删除（送不出去的"Send"按钮）

**问题**: Chat tab 是占位 UI，"Send" 按钮 `disabled`。

**修复**: 
- `CopilotReviewModel` 的 `visibleTabs` 去掉 chat
- agent 通过 `attach_chat_followup` 产的问题在 Insights tab 底部以独立"Suggested follow-ups"卡片展示

### B12. Loop 结束后隐藏 Agent trace 左 rail

**修复**: `CopilotAutoRunModal` 把 `showTraceRail={isRunning}` 传给 shell。跑完 → 左 rail 消失，trace 仍可从顶部 tab 切回。

### B13. Insights 卡片底部按钮 "Ask follow-up" / "Create proposal" 点不动

**初版**: 直接删了。

**用户**:"不要删除，我们得实现最好。"

**讨论方案 A/B/C**:
- A. 内嵌 modal 内的 chat（用户首选）
- B. 跳到 Assistant 视图（"navigate away 不好看到这个界面"，否决）
- C. 启动独立 sub-agent loop（太重）

**最终实现 A**:
- 新文件 `src/ui/view/copilot/review/InsightInlineChat.tsx`
  - 两种模式（`follow-up` / `draft-proposal`），同组件复用
  - `follow-up` mode system prompt：研究助手，禁止它产改动，专注解释
  - `draft-proposal` mode system prompt：要求输出 1-3 条可复制的具体编辑（rationale + 代码块）
  - 多轮历史 local state，每次发送把历史拼进 user prompt
  - 用 `manager.queryTextStream(userPrompt, undefined, { systemPrompt, signal, usageFeature: 'copilot', usageAction: 'insight-<mode>' })` 流式
  - 流中可 Cancel；用 `StreamdownIsolated` 渲染响应；Enter 发 / Shift+Enter 换行 / Esc 关闭
  - `draft-proposal` 默认预填 "Draft 2-3 concrete edits I could apply."，回车直接触发
- `InsightsArtifactPanel` 状态 `openChats: Map<insightId, mode>`，每张 insight 卡片独立打开，再点同按钮 = 关闭
- 同一 insight 切换模式走 `key={insight.id-mode}` 强制重建（清历史）
- 通过 shell 透传 `subjectPath` + `subjectBasename` 进入 chat 的 system prompt

---

## C. 持久化系统

### C1. 服务层 + 存储

**新文件**: `src/service/copilot/CopilotReviewHistoryService.ts`
- 存储路径：`<vault>/.peak/auto-review/<sanitized-basename>-<isoTimestamp>.md`
- 格式：YAML frontmatter（id, subjectPath, mode, counts, timestamps）+ 人类可读 markdown 摘要 + 一段 ` ```json peak-copilot-review-data ` 代码块包装完整 ReviewSessionSnapshot
- API：`save / listAll / listForSubject / load / delete`
- `save()` 支持 `existingRecord?: {id, storagePath}` 参数 → 同 session 内 upsert 同一文件（不是每次新文件）

### C2. 渐进式 Checkpoint

**改造 `CopilotAutoRunModal`**:
- `persistedRecordRef` ref 持有当前会话 record（id + storagePath）
- snapshot 变更 → 计算内容签名（status + rounds.length + 各 collector counts）
- 签名变化时排队保存：
  - 终态（completed / cancelled / error）→ 立即 flush
  - `awaiting-next-round` → 立即 flush（轮间 checkpoint）
  - 其他 → 1.5s 防抖
- 空内容（没有任何 propose）+ 未终态 → 不写盘
- Unmount 时清理 timer

### C3. 历史展示

**改造 `CopilotPickerModal`**:
- 新 `DocumentReviewHistory` 组件：当前文档的过去 N 条 review 列表
- 点开 → `getCopilotReviewHistoryService().load(record)` → `new CopilotAutoRunModal({initialSnapshot})` 以 read-only 模式打开
- "All reviews" 按钮 → 打开全局 history modal

**新文件 `CopilotReviewHistoryModal.tsx`**:
- 全局 review 列表，按 subjectPath 分组
- 支持 query 过滤、refresh、单条 trash 删除
- 点单条 → 还原 snapshot 到 CopilotAutoRunModal（subject 文件被删时用 stub ctx 兜底）

**Read-only 模式（CopilotAutoRunModal）**:
- `initialSnapshot?: ReviewSessionSnapshot` prop
- 跳过 agent loop / 跳过 auto-save / 禁用 Apply / 隐藏 Cancel run / 标题加 "· History" / footer "Historical snapshot..."

**注册命令**: `peak-copilot-review-history` → Cmd+P 搜 "Open Auto Review History"。

---

## D. 速度优化（保留版本）

### 最终保留（基于真实机制，非拍数字）

1. **预加载 subject 文档到 user prompt** — `buildMetaAgentUserPrompt` 把 ctx.content 包成 `<subject-note path="...">...</subject-note>` 直接给 agent，省 1-2 个起步 read turn。≤12000 字符全文给，超出截断并提示。System prompt 加 "THE SUBJECT NOTE IS ALREADY IN YOUR USER PROMPT — do NOT re-read it"。
2. **显式要求并行 tool_use** — system prompt + `vault_read_note` tool description 双重提醒："when you need multiple files, request them in a SINGLE turn (the SDK supports parallel tool_use blocks)"。这是基于真实 SDK 能力，Claude 见到这句话才会主动并行；不说它默认串行。

### 移除（事后承认是拍脑袋）

- ❌ "≤ 8 vault tool calls per round"
- ❌ "submit with 2-4 quality artifacts"  
- ❌ "note_finding ≤ 2 per round"
- ❌ Fast mode maxTurns = 12（回到 999）
- ❌ Complete mode round cap（trust agent，仅留 `ABSOLUTE_ROUND_SAFETY_CAP=20` 防 infinite loop）
- ❌ `vault_read_note` 默认 maxChars 2500（还原 5000；"小读多读"未必快过"大读少读"，没数据支撑）

### 保留的软指导（反模式提醒，非硬数字）

- ✅ "NEVER re-read a path you have already read"
- ✅ "Externalise findings via the tools instead of holding them in chain-of-thought"
- ✅ "You decide when the review is done"

---

## E. 文件清单

### 新文件

```
src/service/copilot/
  CopilotOutputCollector.ts         — Phase 1: proposal 收集器
  CopilotOutputMcpServer.ts         — Phase 1: 6 个 MCP 工具
  CopilotSignalReport.ts            — Phase 2a: pre-flight signal
  CopilotMetaAgentStream.ts         — Phase 2b: 单轮 meta-agent
  CopilotReviewSession.ts           — Phase 2b: 多轮编排
  CopilotReviewArtifactBuilder.ts   — Phase 2c+3: snapshot → artifacts
  CopilotReviewHistoryService.ts    — C: 持久化

src/ui/component/diff/
  lineDiff.ts                       — B9: LCS 行级 diff

src/ui/view/copilot/
  CopilotReviewHistoryModal.tsx     — C3: 全局历史模态
  review/InsightInlineChat.tsx      — B13: 内嵌 chat

docs/superpowers/
  specs/2026-05-17-copilot-meta-agent-redesign.md  — 设计 spec
  sessions/2026-05-17-copilot-auto-review-impl.md  — 本文件
```

### 改造文件

```
src/service/copilot/CopilotArtifactAdapter.ts        — proposalsToArtifacts
src/service/copilot/CopilotRunArtifacts.ts           — TraceArtifact 扩展
src/service/copilot/actions/agent-actions.ts         — collector 接入
src/service/copilot/CopilotAutoPlanner.ts            — 保留但 Auto 不再用
src/service/agents/vault-sdk/vaultMcpServer.ts       — maxChars 描述 + 并行提醒
src/core/providers/model-registry.ts                 — provider id alias
src/core/template/TemplateRegistry.ts                — 4 个 copilot-agent 模板补齐

src/ui/view/copilot/CopilotAutoRunModal.tsx          — 完整重写 + checkpoint
src/ui/view/copilot/CopilotPickerModal.tsx          — Fast/Auto 按钮 + history list + mobile guard
src/ui/view/copilot/review/CopilotReviewShell.tsx    — tab 切换修复 + rail 控制 + trace 全宽过渡
src/ui/view/copilot/review/CopilotReviewModel.ts     — visibleTabs 不含 chat
src/ui/view/copilot/review/TraceArtifactPanel.tsx    — group 折叠 UI + 工具名展开
src/ui/view/copilot/review/ChangesArtifactPanel.tsx  — 全文档 diff + Accept/Reject
src/ui/view/copilot/review/InsightsArtifactPanel.tsx — 全宽 + markdown + 内嵌 chat 触发
src/styles/tailwind.css                              — `.pktw-trace-enter` keyframe

src/app/commands/PeakCommandActions.ts               — openCopilotReviewHistory
src/app/commands/Register.ts                         — peak-copilot-review-history
```

---

## F. 后续追加迭代（2026-05-17 晚 ~ 2026-05-18）

### F1. Insights tab 悬浮 TOC

- 新文件 `src/ui/view/copilot/review/insightSections.ts`：把每条 insight 的 markdown body 按 H1/H2/H3 切 sections（避开 fenced code block），生成稳定 slug
- `InsightsArtifactPanel`：每个 section 包 `<div id="peak-insight-{id}-section-{slug}" class="pktw-scroll-mt-4">` 单独渲染（anchor 在主 DOM，Streamdown 内部在 shadow 不受影响）
- `CopilotReviewShell`：Insights tab 用 `<TabButton>` 包裹（hover 进入展示 popover，160ms 缓冲关闭），popover 用 `<InsightsTocPopover>`：列出每条 insight + 缩进的 sections（H1/H2/H3 按级缩进）
- 点击条目：先切到 Insights tab → `requestAnimationFrame` 后 `document.getElementById(anchor).scrollIntoView({behavior: 'smooth'})`
- 第一版 popover 行项过多边框（又是 Obsidian 全局 `<button>` 注入），换成 `<div role="button">` + 紫色 hover 高亮 + 仅留一层外框 + section 左侧细缩进线

### F2. Round budget 真正撤除（用户：限制轮数没必要）

- `FAST_MAX_TURNS_PER_ROUND=12` 撤回，Fast 也走 `UNCAPPED_MAX_TURNS=999`
- system prompt 删掉 "≤ 8 reads / 2-4 artifacts / ≤ 2 findings" 拍脑袋数字
- 软指导留 3 条：never re-read / externalise findings via tools / you decide when done
- `vault_read_note` 默认 maxChars 还原 5000（之前 2500 不一定净加速，没数据支撑）
- 保留确定有效的两条：**预加载 subject 文档到 user prompt**（省 1-2 turn）、**显式要求并行 tool_use**（Claude 见到这句才并行）

### F3. 渐进式 Checkpoint

- `CopilotReviewHistoryService.save()` 支持 `existingRecord?: {id, storagePath}` → 同会话内 upsert 同一文件
- `CopilotAutoRunModal` 用 ref 持有 `persistedRecordRef`，按 snapshot 内容签名去重，**轮间 + 终态立即 flush**、**进行中 1.5s 防抖**
- 第一个 propose 出现就触发首次保存；用户中途关 modal 也已落盘到上一个 checkpoint

### F4. 防 agent 把文件夹当 wikilink 目标

- system prompt QUALITY 段加："Wikilinks MUST target a real note (.md file), NEVER a folder." + 解释 `vault_list_folders` 给的是 folder
- `vault_list_folders` tool description 加："paths returned here are FOLDERS, not notes — they are NOT valid wikilink targets"
- `propose_change` 工具描述加："Any [[wikilinks]] in `after` MUST target real .md notes"
- `propose_source` 工具描述加："PATH MUST be a real .md note file, NEVER a folder"
- 三处冗余覆盖：system prompt 立规矩 + tool description 在调用前再提醒

### F5. `.peak` dotfolder 写盘失败

- 根因：`.peak` 是 dotfolder，Obsidian 的 `vault.getAbstractFileByPath` 不索引 dotfile/dotfolder → `vault.createFolder('.peak')` 报已存在 → `ensureFolderRecursive` 死循环
- 修复：存储路径 `.peak/auto-review` → **`peak-system/auto-review`**（非 dotfolder），所有 vault API 正常工作。代价：可见文件夹，但用户可在 Obsidian 设置 → Files & Links 加 excluded
- 撤掉了试探性的 `ensureHiddenFolder`（用 adapter 绕开索引），改用现有 `ensureFolder`

### F6. Insights inline chat 持久化（用户：变成折叠的 sub-card）

- `InsightInlineChat` 加 `initialHistory` / `onHistoryChange` / `readOnly`：每次发送/收到回复都通过 `onHistoryChange` 把完整 turns 上抛；`readOnly=true` 时禁用输入框，显示 "Historical conversation — read-only"
- `InsightsArtifactPanel` 透传 `chatHistories: Record<key, turns>`；`makeChatKey(insightId, mode)` 作为 key（`${insightId}::follow-up` / `${insightId}::draft-proposal`）
- "Ask follow-up" / "Draft proposal" 按钮上加 exchange count badge（紫色小数字）——已有历史的按钮一眼可见
- 关闭 chat（点 X）只折叠不丢历史；再点按钮重开延续上次对话
- `CopilotReviewHistoryService`:
  - 新类型 `InsightChatHistories = Record<string, ChatTurn[]>`
  - `save()` 加第四参 `chats?`；markdown 体内加第二个 JSON fence `peak-copilot-review-chats`
  - 新方法 `loadWithChats(record)` 返回 `{ snapshot, chats }`
- `CopilotAutoRunModal` 把 `insightChats` 也纳入 checkpoint 签名 → chat 改了也触发 1.5s 防抖 save
- `CopilotPickerModal` 和 `CopilotReviewHistoryModal` 还原走 `loadWithChats`，chats 透传到 modal `initialInsightChats`

### F7. Changes 数量过少（用户：大文档只产 2 个 change）

- Complete mode prompt 加规模指引：
  > "Scale output to document size and issues found: a substantial note with many problems should yield many propose_change calls — do NOT cap yourself at 2-3 changes when you can see 8 places that need improvement. One propose_change per concrete issue."
- 没加硬数字，只是明确告诉 agent 不要克制

---

## G. 文件总览（包含 F1-F7 追加）

### 新增（继 E 之后）

```
src/ui/view/copilot/review/
  insightSections.ts                — F1: markdown section parser
```

### 改造（继 E 之后）

```
src/service/copilot/CopilotMetaAgentStream.ts         — F2: 删硬数字 / F4: 文件夹防护 / F7: 规模指引
src/service/copilot/CopilotReviewSession.ts           — F2: 统一 UNCAPPED_MAX_TURNS
src/service/copilot/CopilotReviewHistoryService.ts    — F3: upsert / F5: 路径改 peak-system / F6: 持久化 chats
src/service/copilot/CopilotOutputMcpServer.ts         — F4: source/change 工具描述加 .md 约束
src/service/agents/vault-sdk/vaultMcpServer.ts        — F4: list_folders 描述强调"非链接目标" / maxChars 还原 5000

src/ui/view/copilot/CopilotAutoRunModal.tsx           — F3: persistedRecordRef + 签名 + debounce / F6: insightChats state + 传递
src/ui/view/copilot/CopilotPickerModal.tsx            — F6: loadWithChats + initialInsightChats
src/ui/view/copilot/CopilotReviewHistoryModal.tsx     — F6: 同上
src/ui/view/copilot/review/CopilotReviewShell.tsx     — F1: TabButton + InsightsTocPopover / F6: insightChat 透传
src/ui/view/copilot/review/InsightsArtifactPanel.tsx  — F1: section anchor / F6: chat 持久化 + badge
src/ui/view/copilot/review/InsightInlineChat.tsx      — F6: initialHistory / onHistoryChange / readOnly
```

---

## H. 真正剩下的遗留

1. **9 个旧 copilot-agent playbook**（K3）—— meta-agent 用的是 inline system prompt。等 meta-agent 稳定后再统一切换 CopilotPickerModal 走 meta-agent。
2. **1.5s debounce 窗口的 checkpoint 丢失** —— 用户在 round 内 propose 完到下一轮开始之间关 modal 可能丢；可考虑改成"每次 propose 立即同步 write"。当前优先级低。
3. **Provider Haiku 加速** —— 第二档速度跳跃需要让 Auto Review 强制走 Haiku 或加 model 选择 UI。
4. **取消（Cancel）路径的 checkpoint UX** —— 用户点 Cancel 时会写 "cancelled" 状态，UI 显示中断会话；可以更显眼地标识"被取消的会话"。
5. **`peak-system/` 文件夹在用户 vault 文件树里可见** —— 让用户在 Obsidian Files & Links 设置里 excluded，或者将来用 `.peak/` + 全部走 adapter（更复杂但更整洁）。
