# AI Query Rewrite — 基于行为上下文的复杂 query 生成

**Status:** 调研候选 · 未实施
**Owner:** highestpeak
**Date:** 2026-07-08
**Related:** [搜索工具栏 UI 改造 progress](../../progress.md)

## 一句话

用户在 Vault Search 里点右侧的 **AI** 按钮 → 系统读取用户最近的浏览行为 + 当前 partial query → LLM 生成 3–5 个**结构化候选 query**（含 `folder:` / `tag:` / `ext:` / `after:` / 精确短语等语法）→ 弹窗展示 → 用户选一个 → 自动填入输入框 → 触发搜索。

核心价值：**用户想模糊搜的东西，AI 帮他"翻译"成 vault 语法能命中的精确 query**。

---

## 触发点

### 主要触发

用户手动点搜索框右侧 **AI** 按钮。此按钮当前的样式是紫色胶囊，位于输入框右侧、`Vault Intelligence` 按钮左侧。

### 场景

按需求场景（严格递增复杂度）：

| 场景 | 输入框状态 | AI 该做什么 |
|---|---|---|
| **完全空输入** | `""` | 纯基于行为上下文猜测。给"回到刚才在 D-26 文件夹翻的那几篇 story cards"这类候选。 |
| **模糊 partial** | `"peak assistant"` | 结合 partial 词 + 行为，把它精确化。加 `folder:`、`after:`、`tag:` 等。 |
| **已经很结构化了** | `folder:xxx "yyy"` | AI 提供**变体建议**——比如换个 folder、放宽时间窗、换同义词。 |

一期只做前两种，第三种作为 v2 candidate。

---

## Behavior Context — 收集什么

一切能"猜测用户当前意图"的行为都进入 context。分三层，重的在后：

### 层 1: Static snapshot（无成本）

- 当前 active file 路径
- 最近打开的 3–5 个文件路径
- 最近 5 条搜索历史（vault + AI 分开）
- 当前 modal 里输入框的原始 query（可能是空）
- 当前 result view mode（list / tree / graph）
- 当前是否有 pinned hub

### 层 2: In-session tick tape（modal 本轮生命周期内）

Modal 从打开到点 AI 之间，用户做了什么。以事件流形式记录：

```
[t+0.0s]   modal opened
[t+0.4s]   typed "peak"
[t+1.1s]   typed "peak assist"
[t+1.8s]   typed "peak assistant"
[t+2.5s]   switched to Tree view
[t+3.2s]   expanded folder "kb1-life-notes/D-26年找工作"
[t+4.0s]   hovered file "2-Story Cards-3-Peak Assistant-Search Agent Redesign" for 2.1s
[t+6.5s]   switched cursor to that file (via ↓)
[t+7.9s]   opened inspector (right →) — saw hub "peak assistant"
[t+9.5s]   switched to List
[t+11.0s]  hovered "peakassistant-hubdiscover-具体公式和算法和规则配置" for 3.4s
[t+15.1s]  clicked AI button
```

从这个流里 LLM 可以推断：
- 用户对 **D-26年找工作/Story Cards** 和 **hubdiscover** 这两个方向感兴趣
- 用户尝试了 Tree 和 List 两种视图 → 说明结果太多在扫
- 用户对 hub "peak assistant" 有兴趣 → 可能想聚焦这个 hub 的所有 constituents

### 层 3: Historic patterns（跨 session，可选）

- 过去 7 天内 top-10 高频 query 词
- 过去 7 天点击率最高的 5 个文件
- 高频访问的 folder（top-3）

用来做 grounding baseline —— 帮 LLM 理解"这个用户平常在关心什么"。一期可以不做。

---

## 数据合约 — Context Payload

送给 LLM 的 payload schema：

```jsonc
{
	"currentQuery": "peak assistant",
	"activeFilePath": "kb1-life-notes/D-26年找工作/mess/2-Story Cards-3-Peak Assistant-Search Agent Redesign.md",
	"recentOpenedFiles": [
		"kb1-life-notes/D-26年找工作/mess/2-Story Cards-3-Peak Assistant-Search Agent Redesign.md",
		"kb2-learn-prd/AI-peakAssistant-Chatbot.md"
	],
	"recentQueries": ["hubdiscover", "search redesign", "peak"],
	"currentResultView": "list",
	"pinnedHubName": null,
	"sessionEvents": [
		{ "t": 0.4, "kind": "typed", "value": "peak" },
		{ "t": 1.8, "kind": "typed", "value": "peak assistant" },
		{ "t": 2.5, "kind": "switchedView", "value": "tree" },
		{ "t": 4.0, "kind": "hoveredFile", "path": "…/2-Story Cards…", "durationMs": 2100 },
		{ "t": 11.0, "kind": "hoveredFile", "path": "…/peakassistant-hubdiscover…", "durationMs": 3400 }
	],
	"vaultQuerySyntax": {
		"available": ["folder:PATH", "tag:NAME", "ext:EXT", "-NEGATE", "\"exact phrase\"", "after:YYYY-MM-DD", "before:YYYY-MM-DD"],
		"note": "syntax parsed by src/service/search/query/query-parser.ts"
	}
}
```

### 事件类型枚举

| kind | 何时发出 | payload 字段 |
|---|---|---|
| `typed` | 输入变化 500ms debounce 后 | `value: string` |
| `switchedView` | 切 list/tree/graph | `value: 'list' \| 'tree' \| 'graph'` |
| `switchedDensity` | 切 tree compact/detailed | `value: 'compact' \| 'detailed'` |
| `switchedGraphPreset` | 切 graph preset | `value: GraphPreset` |
| `expandedFolder` | tree 手动展开 folder | `path: string` |
| `collapsedFolder` | tree 手动折叠 folder | `path: string` |
| `hoveredFile` | 鼠标停在 file 行 >800ms | `path: string, durationMs: number` |
| `focusedFile` | 键盘 cursor 停在 file 行 | `path: string` |
| `openedInspector` | 右侧 inspector 打开 | — |
| `pinnedHub` | 图里 Cmd+click hub 锚 | `hubId: string` |
| `openedFile` | 点击 file 或 Enter 打开 | `path: string` |

事件被压缩：连续同 kind 事件保留最后一条（除非 `path` 变），超过 30 条则丢最早的。

---

## LLM Prompt 设计

### System prompt

```
You are a query rewrite assistant embedded in a personal Obsidian vault
search tool. Your job: given the user's browsing behavior + partial query,
produce 3–5 refined structured queries that most likely match what the user
is trying to find right now.

The vault has thousands of markdown notes. The user just abandoned typing
because they aren't finding what they want with a plain-text query.

You have access to the vault's structured query language:
- `folder:PATH`  restrict to files under that folder
- `tag:NAME`     restrict to files tagged #NAME
- `ext:EXT`      restrict to files with extension .EXT
- `-WORD`        negate — exclude files containing WORD
- `"phrase"`     match exact phrase
- `after:YYYY-MM-DD` / `before:YYYY-MM-DD`  date range

Rules:
1. Each rewrite must feel like a distinct hypothesis about what the user
   wants — do NOT emit 3 near-identical queries.
2. Ground each rewrite in observed behavior. Every candidate must reference
   at least one signal: a folder the user browsed, a file they hovered on,
   a recent query, or the active file's folder.
3. Prefer specificity over recall. The user is drowning in noise; give them
   sharp queries.
4. Emit at most 5 candidates. If confidence is low, emit fewer.
5. Return JSON matching the schema in the user message.
```

### User content template

```
=== Behavior Context ===
Current query        : {currentQuery}
Active file          : {activeFilePath}
Result view          : {currentResultView}
Recent queries       : {recentQueries[0..4]}
Recent opened files  : {recentOpenedFiles[0..4]}
Pinned hub           : {pinnedHubName ?? "none"}

=== Session Timeline ===
{formatted sessionEvents, oldest first, capped at 20}

=== Vault syntax reminder ===
{vaultQuerySyntax.available.join(" · ")}

=== Task ===
Produce 3–5 rewritten structured queries as JSON:

{
  "candidates": [
    {
      "title":  "<short human-readable label, 8 words max>",
      "query":  "<the actual query string with structured syntax>",
      "reason": "<one sentence explaining which behavior signal triggered this candidate>"
    }
  ]
}

Return only the JSON, no prose.
```

### 参考示例（放 few-shot 里加分，但不必须）

**Behavior**: 用户输 "peak assistant"，停留在 D-26年找工作/mess/2-Story Cards，切了 tree → list，hover 了 hubdiscover 3.4s。

**Ideal output**:
```json
{
  "candidates": [
    {
      "title": "Peak Assistant redesign story cards",
      "query": "\"peak assistant\" folder:D-26年找工作 tag:redesign",
      "reason": "You lingered on the Story Cards folder and hovered the search-redesign card — narrowing to that job-hunt folder with a tag filter."
    },
    {
      "title": "Hub-discover algorithm details",
      "query": "hubdiscover \"具体公式\" folder:B-Z-mess",
      "reason": "3.4s hover on `peakassistant-hubdiscover-具体公式和算法和规则配置` — likely you want the algorithmic details."
    },
    {
      "title": "Recent peak-assistant dev logs",
      "query": "\"peak assistant\" folder:E-日记 after:2026-05-01",
      "reason": "You've opened dev-log style files in E-日记 recently; this pulls the last two months of development notes."
    }
  ]
}
```

---

## UI — Modal 结构（详见 `index.html` 里 mockup）

### 弹窗形态

- 位置：在原 Search Modal 上方半覆盖（覆盖 ~60% 高度），不完全遮挡
- 宽度：520px（跟随 Search modal 宽度收敛，居中）
- 圆角：10px，紫色 accent border
- 背后 Search modal 灰化到 40% 但不禁用（用户仍能 hover 底下的结果）

### 结构

```
┌─────────────────────────────────────────┐
│ ✦ AI query rewrite            ✕         │  ← title bar
├─────────────────────────────────────────┤
│ Based on your recent browsing…          │  ← subtitle
├─────────────────────────────────────────┤
│                                         │
│ ┌─ Candidate 1 ────────────────── 1 ─┐  │  ← 3-5 张卡片
│ │ Peak Assistant redesign story...   │  │
│ │ "peak assistant" folder:D-26...    │  │  ← code font, accent purple
│ │ You lingered on the Story Cards... │  │  ← reason, muted
│ └────────────────────────────────────┘  │
│                                         │
│ ┌─ Candidate 2 ────────────────── 2 ─┐  │
│ │ …                                  │  │
│ └────────────────────────────────────┘  │
│                                         │
├─────────────────────────────────────────┤
│ Show context ⌄     ⟲ Try again    Esc   │  ← footer
└─────────────────────────────────────────┘
```

### 交互

| 动作 | 效果 |
|---|---|
| 点候选卡片 | 关弹窗 · query 填入输入框 · 触发搜索 |
| `1`–`5` 数字键 | 选对应索引的候选 |
| `↑`/`↓` | cursor 在候选间移动 |
| `Enter` | 选中当前 cursor 候选 |
| `Esc` | 关弹窗（不填入任何东西） |
| 点 `⟲ Try again` | 重新收集 context 重新调 LLM |
| 点 `Show context ⌄` | 展开查看送给 AI 的 context payload（debug 用） |

### 状态

1. **Loading**：转圈 + "Reading your browsing..." · 蓝色 shimmer 骨架
2. **Success**：3–5 张候选卡片
3. **Low confidence**：只有 1–2 张，附一句 "Try browsing a bit more, then try again"
4. **Error**：红色小 icon + "AI is unavailable — try Vault Intelligence instead" + 关闭按钮

---

## Integration Points（未实施 · 实施 spec 需要）

### 需要新增

- `src/service/search/rewrite/BehaviorContextRecorder.ts` — 侧车服务，订阅 sharedStore + vaultSearchStore 变化并把事件推到内部 ring buffer；modal 关时清空
- `src/service/search/rewrite/AIQueryRewriteService.ts` — 组装 payload、调 LLM、parse response、暴露 `generateCandidates(): Promise<RewriteCandidate[]>` 方法
- `src/ui/view/quick-search/modals/AIQueryRewriteModal.tsx` — 弹窗
- `src/core/schemas/queryRewrite.ts` — Zod schema for LLM output
- `src/core/prompts/PromptId.ts` 加 `QUERY_REWRITE` 常量 + `templates/config/prompts/query-rewrite.md`

### 需要修改

- `SearchModal.tsx` — AI 按钮 `onClick` 从 `setActiveTab('ai')` 改成打开 `AIQueryRewriteModal`
- `vaultSearchStore.ts` — 加 event log 相关 state（或者 store 保持不变，事件全在 recorder 里）
- 事件源需要打点：`ViewModeToggle` / `TreeDensityToggle` / `ResultTreeView`（hover / cursor / expand / collapse）/ `ResultGraphView`（pin hub / preset switch）/ `CodeMirrorInput`（typed with debounce）

### 复用现有

- LLM 调用走 `AIServiceManager` + `MultiProviderChatService`（跟 AI Analysis / Vault Intelligence 一致）
- Prompt 管理走 `PromptService` / `TemplateManager`
- 结构化输出走 `streamObject` + Zod schema

### 模型绑定 — 复用 Fast Lookup tier · 不 hardcode 具体模型

Query Suggest 语义上就是**单 pass 短任务 · 分类/短生成 · 延迟 &lt; 2s · payload 小 · 用户高频触发**，跟现有 AI behavior 里 **Fast Lookup** 一档（`HarnessSettings.localFastConfig` / Curator 的 `quick` capability）完全同类，直接复用。

**不新增 role 的理由**：
- Fast Lookup 定位就是"轻推理短任务"——Copilot 里 fast tier meta-agent 已经用它，Query Suggest 加入不违和
- 加新 role 会让 AI behavior 从 5 行涨到 6 行，新用户 onboarding 时问"Suggest 跟 Fast Lookup 有啥区别"，是无谓的 UX 债
- Recommended setup 4 个 preset (Balanced / Lowest cost / Research quality / Local-private) 已经自动覆盖 Fast Lookup 绑定 → Suggest 免费继承

**代码约定**：
- `AIQueryRewriteService` 通过 `ProfileRegistry` / `HarnessSettings.localFastConfig` 拿到当前 quick tier 的 `{ profileId, modelId }`
- 不允许在 `AIQueryRewriteService.ts` / prompt / templates 里写死 provider 或 model 名 (`claude-haiku-*` / `gpt-4o-mini` 都不行)
- Onboarding 时的 Curator wizard 走 `quick` tier 就够 — 用户完全不需要知道"Suggest 用什么模型"

**Usage dashboard 分类**：
- Token 消耗独立打点 `usageCategory: 'query-rewrite'`，方便用户在 dashboard 看到 Suggest 花了多少
- 但底层模型跟 Fast Lookup 共享（因为绑定就是一个），dashboard 里可以显示"query-rewrite 用的是 &lt;当前 Fast Lookup binding&gt;"

---

## Open Questions

1. **AI 按钮语义冲突**：现在点 AI button 是跳到 AI Analysis tab（那是完全不同的功能——AI 语义搜索 + 分析总结）。改成 rewrite 后需要给 AI Analysis 换一个入口。方案：
   - a) 保留 AI Analysis 作为独立 tab，AI 按钮只做 rewrite
   - b) AI 按钮变成小菜单："Rewrite query · Switch to AI Analysis"
   - c) 两个按钮：`✦ AI` (rewrite) + `⚡ Analyze` (jump to AI tab)

   倾向 (a) — Query rewrite 是"当前搜索的加速器"，跟 AI Analysis 的"另一种搜索方式"是不同层次。

2. **候选缓存**：同一 context 重复点 AI 是否命中缓存？倾向"是"——3 秒内的重复点击返回同一批候选（省 tokens），超过 3 秒或用户 typed 新词后重算。

3. **成本控制**：每个用户 session 里 AI rewrite 触发上限？建议无硬上限但显示 usage token 消耗（在 usage dashboard 里独立列 category `query-rewrite`）。

4. **Fallback**：LLM 超时或返回 malformed JSON 时展示什么？倾向"1 个规则模板候选 + 提示"——比如把 partial query 直接加 `folder:{activeFileFolder}` 作为 baseline fallback。

5. **反馈闭环**：用户选了某个候选 → 有没有点击结果 → 是否满意？可以埋点写回 `SearchClickRepo` 或独立 `QueryRewriteFeedbackRepo`，long-term 用来调 prompt。

---

## 反面清单（不做什么）

- ❌ **实时自动 rewrite**：用户每输一个字都调 LLM——延迟、成本、幽灵感都很差。必须手动触发。
- ❌ **多轮对话**：不是聊天，用户不追问、不澄清。一次点击一次生成。
- ❌ **自然语言解释性回答**：如果用户想问"我上周关于 X 的想法在哪"，那是 AI Analysis 的场景，不在这里。
- ❌ **改写用户已选中的 query**：如果用户已经选了一个候选并触发了搜索，不允许 AI 静默再改写。用户是 pilot。

---

## Milestones（假设未来实施）

- **M1**: BehaviorContextRecorder + 事件源打点 · 用 console.log dump payload 手工验证 quality
- **M2**: AIQueryRewriteService + prompt · 用固定 mock context 跑通 LLM → JSON 结构
- **M3**: 弹窗 UI + AI 按钮改为触发弹窗（AI Analysis 换入口方案定）
- **M4**: 反馈闭环（选/不选 + click-through）打点

不写工时。
