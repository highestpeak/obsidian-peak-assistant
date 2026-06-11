# Chat UI retained implementation audit - 2026-06-02

## Scope

本文是 no-code 视觉与信息架构审计。目标不是继续发散新风格，而是判断当前实现相对 retained mock 的效果、偏离原因、以及下一轮应该怎么改。

读者：后续接手 Chat UI 的设计 / 实现 session。

不做什么：

- 不改代码。
- 不重新讨论 retained mock 已锁定的原则。
- 不把问题归因成单个 CSS 小 bug；这次主要看用户体感、信息层级和视觉系统。

设计读取：

> Reading this as: Obsidian-native AI chat workspace for knowledge workers, with a restrained desktop-product language, leaning toward native sidebar + inspector patterns, not marketing UI and not colorful AI-dashboard UI.

## Evidence Used

- User-provided screenshots of the current implementation: home, active chat with Topics panel, active chat with All panel.
- Visual source of truth: `docs/gstack/chat-focused-redesign-2026-05-29/chat-retained-mock.html`, `chat-retained-mock-preview.png`, and retained images under `retained/`.
- Handoff source of truth: `docs/superpowers/handoffs/2026-05-30-worktree-chat-retained.md`.
- Current implementation files inspected: `src/ui/view/chat-view/view-Home.tsx`, `components/ConversationIndex.tsx`, `components/ComposerRetained.tsx`, `components/HeaderRetained.tsx`, `components/messages/MessageViewItemRetained.tsx`, `src/styles/peak-components.css`.
- Progress notes inspected: `docs/progress.md` Chat UI Modernization log.
- External heuristics:
  - NN/g 10 usability heuristics: visibility of system status, recognition over recall, consistency, aesthetic/minimalist design.
  - Apple HIG panels/search/toolbar guidance: inspector-like panels should support the active content and stay less prominent than the main work surface.

## Executive Judgment

当前实现已经比旧 Chat UI 稳很多：三栏结构清楚，header/composer/right index 的基本角色都成立，Obsidian CSS reset 的几个典型污染也已经被处理过。

但现在的效果更像“把 retained mock 的元素清单落进了界面”，还没有完全保住 mock 的视觉重心。主要问题不是某个按钮不美，而是：

1. **右侧 Conversation Index 的存在感过强**，尤其在 home / empty / low-content 状态，像一个永久占位的工具面板，而不是当前聊天内容的 semantic inspector。
2. **信息被列表化、文件化了**。mock 的 Conversation Index 是“主题、产物、消息的语义地图”；当前更像 Obsidian file list + message list，尤其 artifact 从一等对象退化成 28px 中性图标。
3. **紫色 accent 在局部仍然抢戏**。左侧 active conversation、composer focus、index progress bars、chips 同时出现时，页面读感会滑向 generic AI purple，而不是 quiet desktop product。
4. **Home 状态没有 retained 级别的布局锚点**。中心内容过散，右栏空面板占宽，用户第一眼不是“开始一个高质量工作流”，而是“一个空白三栏 shell”。
5. **当前实现对 mock 的一些压缩是合理的，但压缩方向有风险**：为了紧凑，artifact preview、topic visual hierarchy、message timeline cue 被削弱了，导致右栏的信息价值下降。

一句话：**当前是可用的 beta polish，不是最终 retained-level polish。最该改的是 right inspector 的信息架构和 home / empty state，而不是继续往所有地方加更多小控件。**

## What Is Working

### 1. Header direction is correct

Mock 锁定的是 title + open source + refresh。当前 `HeaderRetained.tsx` 已经把动作收在标题旁边，删除危险操作也挪走了。这个方向是对的。

保留：

- 不要把 model selector、mode toggle、delete、search 全塞回 header。
- Header 只承担 orientation 和 source/document action。

### 2. Composer has the right conceptual model

一个 run chip 承担 mode / model / context，比旧版多按钮工具栏清晰。Popover 里分 Mode / Role / Model / Context 也符合 progressive disclosure。

保留：

- 主 composer 不暴露所有高级设置。
- Role 留在 popover 里，不放主 chrome。
- Mic / send / attach 都留底部，别回到多排工具栏。

### 3. Conversation Index 的四 tab IA 是对的

All / Topics / Artifacts / Messages 是 retained mock 的核心价值。它比单纯 outline 更接近 “AI conversation memory map”。

保留：

- Topics 继续作为默认 tab。
- Artifacts 继续是一等 tab。
- Messages 继续作为 timeline / jump surface，而不是普通搜索结果列表。

## Main Gaps

### P0. Home state: right panel should not dominate when it has no content

User screenshot 1 的最大问题是：Conversation Index empty state 在右侧占据了完整工作区宽度，但它没有内容，只显示 “No topics yet”。这让用户的第一屏像一个空工具壳。

Recommended change:

- Home / no active conversation 时，右侧 Conversation Index 默认收起或显示极低存在感的 native placeholder。
- 如果必须常驻，placeholder 应该只解释当前状态，不显示完整 search + segmented tabs。
- Home 主区域应该有更明确的 “start work” anchor：继续上次会话、总结最近笔记、研究主题可以保留，但要收进一个窄宽度 launchpad，而不是在大画布上散开。

Why:

- NN/g 的 aesthetic/minimalist heuristic 不是“少元素”，而是不要让无关信息竞争注意力。空 Index 在 home state 就是竞争注意力。
- Apple panel/inspector 模型里，inspector 应该服务当前选择；没有选择时不该像主界面一样重。

### P0. Conversation Index: restore semantic inspector, not just compact list

当前 All tab 截图里，Topics / Artifacts / Messages 都变成同质小卡片。短期很整齐，长期会削弱用户理解：我到底是在看主题地图，还是所有实体的文件列表？

Recommended change:

- All tab 只做摘要，不做完整列表：
  - Topics: top 3 semantic topics with count + one-line reason.
  - Artifacts: top 2-3 most relevant artifacts with visual preview when available.
  - Messages: 2-4 key messages, not all recent messages.
- Topics tab 继续使用 accordion，但 topic title 不要显示 `No topic` 这种实现态 fallback。
- 如果只有一个 fallback topic，把它命名为 `Current thread` / `Unsorted messages`，或者直接隐藏 Topics tab count 的假结构。
- 展开 topic 时，body 的 Key messages 不要再像普通 card stack；更像 timeline snippets，减少嵌套边框。

Why:

- Conversation Index 的产品价值是“把长对话变成结构”，不是“把长对话复制成另一个列表”。
- Recognition over recall 要求信息能被识别，但不是把所有东西都摊出来。需要 summary-first, detail-on-demand。

### P0. Artifacts need to become visual again

Progress log 里记录了 artifact thumb 从 60x44 改到 28x28，并去掉 per-kind 色彩。这个对 All tab 的密度可能合理，但对 Artifacts tab 是反方向。

Current issue:

- 在 screenshot 3 里 artifact 像 file explorer row。它没有 mock 里 “artifact is a first-class product output” 的感受。
- 对 image / diagram / diff / markdown plan 来说，28px 中性 icon 不能帮助用户识别内容。

Recommended change:

- All tab 可用 28px compact icon。
- Artifacts tab 恢复 richer row/card：
  - image / diagram: 56-72px thumbnail or generated preview.
  - code / diff: small monospaced snippet preview.
  - markdown/report: file icon + title + saved/indexed metadata.
- Per-kind color 不要恢复成彩虹，但可以恢复 very subtle semantic tint：diagram/info, image/neutral, diff/warn, markdown/accent-tint。

Why:

- Artifact tab 的存在理由是让用户找到产物，不只是知道“有文件”。
- 当前压缩让 Artifacts tab 与 All tab 的 artifact subsection 太像，tab 差异降低。

### P0. Composer default state should be quieter than focus state

截图 2/3 中 composer 的紫色描边很强，视觉上几乎成为页面主角。若这是 focus state，可以接受；若 idle 也这样，就过重。

Recommended change:

- Idle: neutral border + subtle shadow.
- Focus: accent border + very soft ring.
- Sending/agent running: accent can become active state，但不要一直紫。
- Run chip 与 send button 旁边不要再额外填紫；当前 progress 已经去掉 open-state purple，这是对的。

Why:

- taste-skill 的判断适用：AI purple 不是不能用，但必须是状态色，不是默认装饰色。
- 当前页面已有 left active item、index position bar、model chip、composer border，多点紫会互相抢。

### P1. Home launchpad needs stronger product intent

当前 home 的 “Continue / Summarize / Research” 是好方向，但视觉上太像三张松散 action tile。它没有告诉用户 Peak Assistant 与普通 chatbot 的差异。

Recommended change:

- Home 变成 “work launchpad”，不做 landing hero。
- 上半部：recent active work / last useful artifact / vault readiness 或 quick action。
- Quick actions 用 tighter command rows，不要大卡片散开：
  - Continue last chat
  - Summarize recent notes
  - Research a topic
  - Open full index / Search vault only在有内容时出现
- 如果右栏保留，home 右栏显示 “Recent structure” 而不是 empty Conversation Index。

Why:

- Peak Assistant 的定位不是 ChatGPT clone，而是 Obsidian-native knowledge workspace。Home 应该强调 “我能接上你的 vault/work”，不是只问一句 “What would you like to explore?”。

### P1. Message surface: readable, but identity and utility can be sharper

当前 screenshot 2 的 message body 可读性不错，但页面滚动中没有太多 assistant identity / meta context。mock 的 message head 有 Peak avatar、Agent chip、tools/tokens/time，让用户知道这是一次 agent work，而不只是 markdown。

Recommended change:

- 保持 document-style body。
- 在 long answer 中，assistant head/meta 应该 sticky? 不一定。但至少 message start should be visibly structured when at top.
- Suggested next row 应该在内容结束处更像 continuation controls，而不是低存在感 footer links。
- 若 user 当前停在长消息中部，右栏 current viewport marker 应该更明显地同步，让“我在第几段”可见。

Why:

- 这类产品的信任来自 “AI 做了什么、花了多少、产生了什么”。meta 不是装饰，是 system status。

### P1. Left sidebar should become calmer and more Obsidian-native

当前左侧 active conversation 的紫色填充偏厚，和右侧 index / composer accent 同时出现时会增加紫色噪声。

Recommended change:

- Active state 改成 subtle tint + left accent bar，或更接近 Obsidian selected row。
- Project / conversation section spacing 可以更像 native file explorer：标题更轻，行高固定，hover 清楚。
- Toolbar icons 可以保留，但需要 consistent hitbox and tooltip; no extra text.

Why:

- 左栏是导航，不是 primary CTA。它越安静，中间内容越能成为主角。

### P1. Replace internal fallback language

需要避免用户看到系统未分类或内部度量词。

Recommended changes:

- `No topic` -> `Current thread`, `Unsorted messages`, or generated topic title.
- `0 ctx` -> 如果表示 selected context count，用 `No context` / `0 sources`；如果表示 token/context utilization，则用 `0% context` 或 `Empty context`。先把 open question 定义清楚。
- Footer `Topics are derived from message structure.` 可改为更任务向：`Click any entry to jump in chat.` 推导机制不必常驻解释。

Why:

- 用户不关心分类器没抓到 topic，也不该被迫理解 ctx。
- NN/g 的 match with real world heuristic 也支持这个方向：用用户概念，不用内部概念。

## Priority Plan

### Pass 1 - Fix information hierarchy

1. Home state: collapse / soften empty right index.
2. Rename fallback topic and adjust empty / one-topic behavior.
3. Make All tab summary-first instead of full mixed list.
4. Separate compact artifact representation in All from rich artifact representation in Artifacts.

### Pass 2 - Visual quieting

1. Composer idle state neutral; accent only focus/sending.
2. Left active row less purple.
3. Topic open state keep neutral, but remove heavy dashed accent border if it reads as noisy.
4. Reduce nested border stacks inside expanded topic cards.

### Pass 3 - Artifact and message value

1. Restore thumbnails / previews in Artifacts tab.
2. Add timeline/current viewport cue in Messages tab if not already visible in production.
3. Keep assistant meta durable and readable.
4. Make suggested next row more explicitly actionable without turning it into a toolbar.

## Do Not Do

- Do not add more header buttons to solve discoverability.
- Do not make right panel visually richer by adding more purple.
- Do not turn every section into bordered cards; rows and whitespace are enough for dense desktop product UI.
- Do not create a new visual system for chat. Use `--pk-*`, `pk-*` primitives, and the existing Obsidian reset defenses.
- Do not implement artifact previews only as generic icons; that removes the reason Artifacts is a first-class tab.
- Do not keep `No topic` as a user-facing happy path label.

## Suggested Next Artifact

Before code, make **4 focused HTML mock screens**, not one giant screenshot:

1. Home with right index collapsed / quiet.
2. Topics tab with one generated topic, one fallback topic, one artifact-bearing topic.
3. Artifacts tab with image / diagram / markdown / diff previews.
4. Composer idle vs focus vs sending states.

Each mock should be element-focused and stored under `docs/gstack/`, following the existing mock-first workflow.

## Quick Score

| Dimension | Current | Target | Notes |
|---|---:|---:|---|
| Overall retained fidelity | 7 | 9 | Structure landed; visual semantics still diluted. |
| Home state | 5 | 8 | Too much empty shell; right panel dominates without content. |
| Conversation Index IA | 7 | 9 | Correct tabs; All/artifact/topic density needs rebalancing. |
| Artifact value | 4 | 9 | Current compact icon treatment contradicts first-class artifact goal. |
| Composer | 7 | 9 | Concept right; purple/focus/default state needs calmer separation. |
| Sidebar | 6 | 8 | Functional, but active state and density still feel loud. |
| Obsidian-native feel | 7 | 9 | Good shell; right panel should behave more like inspector. |

## Bottom Line

The current implementation is close enough to justify a polish pass, not a redesign reset. Keep the retained architecture. The biggest unlock is to treat the right side as a semantic inspector with progressive disclosure, and to let artifacts be visually recognizable outputs again. After that, quiet the accent system so Peak feels like a serious Obsidian-native workspace rather than a purple AI dashboard.
