# Peak Composer Editing View Mock

Created: 2026-07-09

This folder contains the static HTML mock for the proposed Peak Composer editing view.

The current direction borrows Feishu Docs' block-level smoothness without copying its collaboration shell. Composer is an Obsidian-native view: Atlas Panel keeps outline/search/gallery/comment navigation, while this mock focuses on the active note canvas, block controls, rich object editing, native file previews, and a focused Intelligence dock.

## Paths

- HTML mock: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/index.html`
- CSS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/mock.css`
- Intelligence sidecar CSS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence.css`
- Intelligence component: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-panel.js`
- Lightweight Intelligence lab: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.html`
- JS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/mock.js`
- Assets: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/assets`
- Design spec: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md`
- Intelligence sidecar contract: [`2026-07-15-composer-intelligence-sidecar-ui.md`](../../superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md)
- Block-AI preview screenshots (live mock, 2026-07-11 final): `preview-blockai-capsule.png`, `preview-blockai-combined.png`, `preview-blockai-input-morph.png`, `preview-blockai-inplace-diff.png`, `preview-blockai-rewrite-accepted.png`, `preview-blockai-insert-card.png`, `preview-blockai-formula-menu.png`
- Other preview screenshots (regenerated 2026-07-11 against the current interaction model): `preview-overview.png`, `preview-interaction-insert.png`, `preview-ai-streaming.png`, `preview-ai-diff.png`, `preview-ai-menu.png`, `preview-ai-rollback.png`, `preview-formula.png`, `preview-table.png`, `preview-native.png`, `preview-atlas-links.png`, `preview-atlas-insights.png`, `preview-atlas-mermaid.png`, `preview-atlas-embed.png`, `preview-image-lightgallery.png`, `preview-image.png`, `preview-contextual-ai-actions.png`, `preview-comment-editor.png`, `preview-insert-under-block.png`, `preview-drag-reorder.png`, `preview-native-followup-content.png`

Open `index.html` directly in a browser. No dev server is required.

For Intelligence-only iteration, open `intelligence-lab.html` instead. It mounts the exact same panel component and behavior against seven representative Markdown blocks, keeping browser snapshots small. `?mode=copilot`, `?mode=ambient`, and `?mode=history` open a specific panel directly. Use the full `index.html` only for the final integration pass; the article itself is not virtualized, so cross-block text selection remains intact.

Design exploration: `ai-menu-variants.html` (+ `preview-ai-menu-variants.png`) compares four shapes for the block AI action menu (命令菜单 / Prompt-first / 极简动作条 / 主次分明); `ai-menu-mock.html` is the isolated iteration rig where the final block-AI interaction was tuned before folding it into the live mock. The older 2026-07-11 “insertion preview card” decision is retained below as history only; the current mock deliberately replaces it with real draft objects in the document flow.

## Real Data Used

- Vault notes from `kb2-learn-prd/B-2-创意和想法管理/C-大类-信息聚合-PKM/`
- Real image attachment copied from `public-image/20250703182542769.png`
- Real Excalidraw file copied from `101-A-产品类别分析.excalidraw.md`
- Real formula examples from PageRank, TextRank, and community-detection notes under `kb2-learn-prd/B-Z-mess/`
- JSON Canvas sample stored as `assets/pkm-composer.canvas`
- Bases sample stored as `assets/pkm-composer.base`

The Excalidraw preview is rendered with `rough.js` from extracted real text nodes, rather than a decorative CSS/SVG placeholder. The JSON Canvas preview is rendered from JSON Canvas-shaped data. The image block uses a real vault image asset and LoveIt-style `lightGallery` / `lg-thumbnail` / `lg-zoom` / `lazysizes` viewer wiring. Formula blocks are rendered with local KaTeX.

## Interaction Model

### Current canonical pass (2026-07-15)

This is the active interaction contract. It supersedes any older paragraph in this README that describes an additive result as a green explanatory card.

- **One chrome grammar at two levels:** the left edge is only for press-and-hold drag. `在下方插入 / 评论 / AI 建议` live together in a block-tail row. Formula micro-cards reuse the same controls and can be press-dragged inside their formula group, so the parent formula group and each individual formula no longer invent different button counts or top-right shortcuts.
- **AI generates real draft objects, not explanation cards:** additions appear at their real insertion point as a paragraph, heading/list, editable table, rendered KaTeX, or actual generated image. A reusable transaction footer carries generation status and `接受 / 丢弃`; accepted content becomes an ordinary editable block with its own controls.
- **Object transforms are real, vertical review surfaces:** list/checklist reorder, list-to-table, formula split, and table transpose put the original object above and the proposed object below. This keeps wide tables and long formulas readable; accepting replaces the source object in place.
- **Image generation has visible cost and progress:** “生成示意图 / 生成配图” first renders a timed planning/generation state, then reveals the real project-bound bitmap `assets/ai-knowledge-workflow-illustration.png`. The result remains unwritten until accepted and then uses the existing lightGallery viewer.
- **Native objects are inspectable and incrementally editable:** Mermaid, JSON Canvas, and Excalidraw have `预览 / 源码 / 复制源码 / 复制图像` controls. The AI increment path modifies node/edge or element data in small timed steps and re-renders before an explicit accept or restore.
- **The right dock has three explicit modes in one quiet shell:** `Copilot` is a bottom-composer conversation surface with automatic context; `Ambient` shows one Current Work State and one timely primary push while trace and weaker relations stay folded; `History` lists accepted transactions and opens a vertical source diff with locate and rollback. Copilot no longer asks the user to choose current block/section/document before every request.
- **Responsive behavior is a sidecar, never document content:** above `1180px` Intelligence occupies the stable right column; below it the same surface is a fixed right-side drawer with its own close action, bounded height, and off-canvas closed state. It never falls below the Markdown article or expands the page width.
- **History boundary:** the mock demonstrates in-session rollback and a Git-compatible history surface. Production should persist accepted patches in Git when present, or in a vault-local review log when Git is unavailable; the Markdown/native file remains the authoritative content.

The per-type operation contract is maintained separately in [`Composer Block AI Capability Contract`](../../superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md). It distinguishes fixed block tools, evidence-triggered Copilot Review suggestions, and incremental native-object generation.

The mock intentionally removes the old top insert/image/table/native command cluster and the earlier proof-like labels such as "real attachment" or "plain Markdown table." The top strip is only a quiet view/source status area. The useful actions now live where the user works:

### Continuous canvas pass (2026-07-11)

- The entire document paper is now **one editing host**, not a collection of nested `contenteditable` islands. Text can be selected from a title through paragraphs, lists, quotes, callouts, and back again; buttons, object toolbars, inputs, and generated review UI are explicitly non-editable chrome.
- A non-collapsed selection opens a compact floating text toolbar: **评论 / 润色 / 精简 / 扩写 / 问 AI**. It states whether the selection spans several blocks. Cross-block AI is deliberately additive: it creates a reviewable patch at the selection end instead of silently replacing multiple Markdown ranges. A comment is attached with the same multi-block scope.
- Editing a text block marks its local AI hint as refreshing, then re-runs the type-and-signal rule against current rendered text. The original Markdown source shown in Ambient remains untouched until an explicit writeback action.
- Object tools remain local and hover-only. The table toolbar now sits in the gap above the table rather than over its header. Native filenames and source paths are hidden in reading state and are revealed by the focused block's **展开源格式** action.
- Visual noise is reduced: the document is a flatter reading canvas, the type scale is normalized, hover is a subtle left-edge/focus treatment, and the accepted-patch marker moves to Ambient history rather than remaining in the body forever.
- Status badges are no longer absolutely positioned over prose. Claim / Evidence / Decision / issue state lives in a dedicated row at the start of its own block; `AI 建议 · N` has a separate block-tail hover row, with a stable hit target so it can be reached and clicked.
- AI output has a third, object-aware branch in addition to prose rewrite and additive insertion: **Frontmatter** changes values/tags in place with red/green review states; **lists** insert or reorder real bullets in place; **formula cards** render old-versus-new LaTeX and accept into the same formula card. Formula explanation is an arrowed symbol map rather than a dense paragraph; formula extraction from prose renders a candidate KaTeX block.

- every document block exposes one quiet left-side affordance on hover: the press-and-hold drag handle. Insertion, comments, and contextual AI share one reachable tail row below the selected block; source detail stays in the compact bottom strip;
- **focus is click/edit-based, not hover-based**: hover only reveals local affordances; the Ambient "当前块" and the bottom source strip update when the user clicks a block, edits its content, or uses one of its controls, so panel actions always target the block the user actually interacted with;
- left-side block controls now have a wider invisible hover corridor, so moving from the text block to the control rail does not collapse the toolbar;
- the frontmatter metadata block has no move/remove controls and refuses drag, because frontmatter must stay unique and at the top of the file; insertion remains local while comments and AI remain available through selection, block suggestions, and Ambient;
- left-side controls have a generous leave delay, so they remain reachable while the pointer travels from prose to the rail. The move handle remains press-and-hold drag only; it does not open a movement-command popover. Dragging near the top/bottom of the viewport auto-scrolls the document, and the AI hint pill / object toolbars hide while a drag is active;
- the block-tail `在下方插入` action is the only insert toggle. One click opens an inline insert strip under the current block for paragraph, heading, list, quote, callout, formula, image, table, Base, Canvas, Excalidraw, and one AI draft action; a second click closes it. Choosing a type now creates a real editable draft object with the corresponding Markdown/native embed seed instead of only showing a toast;
- **no floating overlay tray**: hovering a block reveals a compact "AI 建议 · N" pill in the inter-block gap. It is not permanently active and it remains visible long enough to be reached. Clicking it opens an **in-flow block AI menu below the block** that pushes content instead of overlapping it;
- the AI menu is a **capsule that morphs into an input** (final 2026-07-11 design; the old "capsule bar + expandable 推荐 panel" is retired): the resting state is a light white pill — ✦ + text-only action pills (trigger reasons in tooltip) + a quiet "指令" trigger. Clicking 指令 collapses the pills and expands the same pill into a single-line input (placeholder fully visible, a return-icon glyph, Enter runs it) — the big pill radius stays constant across the morph, there is no second dropdown. Blocks that carry a proactive **Copilot long suggestion** upgrade the pill into a combined card: a gradient suggestion row on top with its own "生成" button, and the same capsule/input row underneath labelled 快捷. Short commands stay one-click-light; long instructions get an inline input; proactive suggestions surface only where Copilot has one (`preview-blockai-capsule.png`, `preview-blockai-input-morph.png`, `preview-blockai-combined.png`);
- suggestions are generated from block type plus content signals. Paragraphs do not receive the same rich-generation menu everywhere: a table suggestion appears only when the block contains parallel dimensions or stage/path signals; a formula suggestion only for variables, algorithms, thresholds, or LaTeX/math signals; a visual suggestion only for process, route, graph, Canvas, or Excalidraw signals;
- **inline resources are AI targets too**: hovering an individual `[[vault link]]`, external-link chip, or `[^1]` footnote reference opens a small anchored popover with link-specific actions (修复失效链接 / 同步目标要点 / 转 link card / 抓取摘要 / 跳到脚注定义 / 核对出处…). Choosing one opens the suggestion card scoped to that link, with the link name in the card header;
- **every formula card has its own AI entry**: each math micro card carries an "AI · N" pill and its own per-card AI menu (解释公式 / 拆分公式 / 变量表 + custom instruction), and the resulting card opens inside that formula card;
- **⌘⏎ creates a new block draft anywhere**: pressing Cmd/Ctrl+Enter inside any block opens a draft block right below it. The draft accepts raw Markdown with instant preview (headings, lists, tasks, quotes, callouts, `$$math$$` via KaTeX), quick type buttons that insert the syntax prefix, or a natural-language prompt sent to AI with streaming preview. ⌘⏎ commits, Esc discards; an AI-generated block adds a rollback entry without leaving a permanent body marker. Committed blocks get the same hover controls, badges, and AI suggestions as any other block (`preview-quick-block.png`, `preview-quick-block-ai.png`, `preview-quick-block-committed.png`);
- **Copilot insights are anchored, not a document section**: each insight (claim / evidence / example / action / decision / question) appears as a colored badge on the block it is anchored to. Clicking the badge opens an in-flow insight panel with provenance (run id, anchor, confirmed state), a 复核 insight AI action, confirm toggle, and close. Unconfirmed insights never write back to Markdown; their list navigation belongs to the Atlas panel;
- **every trigger reason cites its evidence**: chips show the matched keyword, e.g. "并列信号：命中“输出”" or "已有判断：命中“真正”", instead of a hardcoded claim, so a wrong suggestion is at least an honest one;
- the block AI hint pill is an **entry point, not an executor**: nothing runs until a chip is clicked or a custom instruction is submitted;
- the result has **two paths by action nature** (final 2026-07-11 design; the old single "candidate + collapsible − / ＋ diff" card is retired):
  - **rewrite** (润色改写 / 改短标题 / 扩写原则 / 改 Callout 类型, and custom instructions on a text block) streams the candidate **in place onto the paragraph itself**, then renders a real **word-level diff on the prose** — deleted words struck red, inserted words highlighted green, right where the text lives (Notion / Google-Docs style, not a line-by-line code diff) — with a `−N +N` change count and an 接受 / 还原 / 重试 review bar. 接受 writes the text and drops the diff marks; 还原 restores the original;
  - **insert** (提出追问 / 转成表格 / 公式解释 / 链接卡 / Copilot 补一段, and anything on an object block) streams into a **green "新增 · 生成到块下方" preview card** below the block, with 接受写入 / 重试 / 丢弃. It never touches the original text, because the output is additive;
  - both are persistent (dismissed only by their own buttons, Esc, or a newer AI task — not by hover) and both stay unwritten until accepted;
- accepting a patch adds an entry to the Ambient "最近 AI 写入" rollback trail, where each entry has a one-click 回滚; reading state does not keep a permanent "AI patch" label on the prose;
- comments are real inline editors. A comment can be typed, saved, and attached to the current block as Copilot context. Like insert and AI surfaces, one click opens it and the next click closes it; hover never closes it;
- checklist text is editable in place separately from the checkbox state;
- formula cards have their own micro block controls, and a micro AI card opens **inside the formula card it explains**, not at the bottom of the whole math section;
- the image block uses LoveIt-style `lightGallery` for fullscreen viewing; crop and AI caption stay Composer edit actions, and **标注 (annotate-on-image) is a separate non-destructive overlay action, no longer routed into the block comment editor**;
- the table block has a **cell selection model**: clicking a cell marks it current; Tab/Enter move between cells; 排序 actually sorts by the current column, 对齐 cycles alignment on the current column, and "- 行" deletes the selected row (falling back to the last row). Format/formula/transpose/CSV remain narrated previews. The toolbar floats above the table without covering the header row;
- Base, Canvas, and Excalidraw blocks each appear as full-width vertical document blocks; their AI buttons (生成周报 / 总结节点 / 提取流程) open suggestion cards under the same label as the button;
- Esc closes the topmost open surface in order: selection toolbar / selection review → link popover → draft block → AI input (collapse back to pills) → AI menu → insert strip → insight panel → comment editor → rewrite-review / insert card → lightGallery;
- Intelligence follows the focused block. Copilot owns conversational edits, Ambient owns inferred work state and related knowledge, and History owns accepted transactions and rollback. On narrow widths the dock remains available as a right-side drawer rather than disappearing.

## Block AI Interaction (2026-07-11 final)

This is the record of the multi-round block-AI design discussion and the decisions it settled. It supersedes the earlier "two-stage V3+V2 hybrid" note and the single "candidate + collapsible diff" card. The interaction was tuned in isolation in `ai-menu-mock.html`, then folded into the live mock (`index.html` / `mock.js` / `mock.css`) on 2026-07-11.

**Menu shape — one capsule, morph not stack.** Earlier iterations (crowded chip bar, five-level vertical command menu, capsule-that-opens-a-second-recommendation-panel) were all rejected as cluttered. The final menu is a single light pill: ✦ + short action pills + a "指令" trigger. Clicking 指令 does not open a new surface — the pills collapse and the *same* pill expands into a one-line input. Hard constraints that came out of the reworks: the big pill radius stays constant through the morph (no front/back radius mismatch); the placeholder is fully visible (not clipped); Enter submits so there is no send arrow; the enter affordance is a muted return-icon glyph, not a boxed `<kbd>`.

**On-demand combined suggestion (not always-on).** Most blocks show only the bare capsule. A block that carries a proactive **Copilot long suggestion** upgrades into a combined card — a gradient suggestion row with its own 生成 button on top, the capsule/input row (labelled 快捷) underneath. Rationale: keep reading state clean; a full-sentence proactive suggestion only appears where Copilot actually has one. In the mock, `COPILOT_SUGGESTIONS` (in `mock.js`) drives this — currently `导语段落` (a rewrite suggestion) and `AI 旁路段落` (an insert suggestion), so both result paths are demonstrable from the proactive entry.

**Two result paths, split by action nature — this is the core decision.** Diff only makes sense when you are changing the *same* text; inserting a new paragraph, table, or set of questions is purely additive and looks wrong wrapped in a diff.
- **Rewrite** → stream the candidate **in place onto the paragraph**, then render a **rendered, in-place, word-level diff** (deleted words struck red / inserted words highlighted green, on the prose itself — Notion / Google-Docs style, explicitly not a line-by-line code diff), with a `−N +N` count and 接受 / 还原 / 重试. This directly answers the "diff 看不到效果 — 我要的是渲染后的、原地的、按词的" feedback.
- **Insert** → stream into a green "新增 · 生成到块下方" preview card below the block, with 接受写入 / 重试 / 丢弃; the original text is never touched.

**Where each path fires.** Rewrite requires a rewrite-label (润色改写 / 改短标题 / 扩写原则 / 改 Callout 类型) or a custom instruction, *and* a single editable prose target (paragraph / heading / quote / callout). Text blocks whose prose carries inline math, `[[links]]`, external chips, or footnote refs fall back to insert, so the diff never mangles a rendered span. Formula micro-cards, object blocks, and inline-resource popovers are all insert.

**Streaming everywhere.** Both paths type the candidate out char-by-char with a blinking caret and a busy indicator before settling into their review state, matching the "给 AI 操作生成流式输出" request.

**Open decisions (defaults chosen, easily reversible):**
- *Combined menu = on-demand* (only blocks with a proactive suggestion). To make it always-on, or to attach suggestions to other blocks, edit `COPILOT_SUGGESTIONS`.
- *Diff granularity = char-level* (zero-dependency LCS). Whole-word Chinese diff would need a segmenter (e.g. jieba); the trade-off is that shared characters in compound words can fragment the diff slightly.

**Preview screenshots (from the live mock, 2026-07-11):** `preview-blockai-capsule.png` (bare capsule), `preview-blockai-combined.png` (Copilot combined card), `preview-blockai-input-morph.png` (capsule → input), `preview-blockai-inplace-diff.png` (in-place word diff), `preview-blockai-rewrite-accepted.png` (accepted rewrite), `preview-blockai-insert-card.png` (insertion preview), `preview-blockai-formula-menu.png` (per-formula capsule).

## External UX Notes Applied

- Notion AI: inline AI can be invoked by highlighting text or using AI blocks; generated edits can be accepted, discarded, or retried, and AI blocks can use page/workspace context.
- Feishu Docs: documents are treated as block-managed content; AI QuickView and AI-backed comments emphasize staying inside the document context instead of moving the user to a separate chat surface.
- Composer adaptation: AI is exposed as contextual block actions, not a permanent page-level toolbar. Ambient remains the persistent context panel, while the most likely actions appear beside the hovered block.

## AI Suggestion Rules

The mock now treats AI chips as contextual suggestions, not a fixed command group.

- Input: block kind, block title, source text, and lightweight content signals.
- Signals: comparison/table structure, visual/process structure, formula/math variables, open questions/risks, and action-item language.
- Output: two or three chips per block, each with a label plus a trigger reason **that cites the matched keyword** (e.g. "并列信号：命中“输出”"). Heading suggestions cite the measured title length instead of a fixed claim.
- Signal priority for paragraphs: table → formula → visual, so a formula-heavy paragraph is not crowded out by the very common 图 character.
- Paragraph default: rewrite plus either a follow-up question or an example. Table, formula, and diagram suggestions appear only when the content signal supports them.
- List default: add missing items, reorder, convert to table only when the list contains parallel fields, or generate follow-up questions.
- Formula default: explain, split derivation, rewrite LaTeX, or make a variable table.
- Image default: caption, regenerate prompt, annotate, or visual polish.
- Table default: summarize, clean headings, generate column, or add formulas.
- Native file default: adapter-aware summary or transformation, with original file format preserved.
- Candidate content: flagship paths (lead paragraph rewrite, list/paragraph → table, the three formula explanations, image caption, table summary, Base/Canvas/Excalidraw actions) use hand-written or genuinely derived candidates (bullet lists are parsed into real pipe tables); long-tail chips fall back to an evidence-referencing template.
- Result routing: an action is a **rewrite** when its label is in the rewrite set (润色改写 / 改短标题 / 扩写原则 / 改 Callout 类型) or is a custom instruction, *and* the block exposes a single editable prose target (paragraph / heading / quote / callout body). Everything else — additive actions, object blocks, and any text block whose prose contains inline math, `[[links]]`, external chips, or footnote refs (to avoid mangling rendered spans) — routes to the **insert** preview card.
- Diff is real, not faked: rewrites run a **char-level LCS word diff** (`tokenize` + `diffTokens` in `mock.js`) between the block's original text and the candidate, rendered in place with `<del>` / `<ins>` and a `−N +N` count. It is genuine diff output, though char-level, so shared characters inside compound words can fragment; upgrading to whole-word granularity would need a Chinese segmenter.
- Chips begin from `data-source` plus rendered block content. Editing a text block triggers a debounced local re-evaluation in the mock; production should make the same boundary explicit and preserve the source-range transaction separately from the suggestion refresh.
- Keyword regexes still over-trigger on this corpus (e.g. 输出 → table signal on a non-comparative paragraph). That is a known limit of keyword matching and the reason reasons must cite evidence; production signals should come from an LLM pre-pass or a structural parser.

## Product Boundary Shown

- Markdown stays the source of truth.
- Composer is a switchable view over the active Obsidian buffer.
- Feishu-style block editing is a reference, but fake collaboration chrome is out.
- Atlas Panel owns outline/search/gallery/comment navigation, so Composer does not duplicate those columns.
- Text formatting stays in Markdown syntax, native shortcuts, and Obsidian behavior.
- Rich object controls are attached to the hovered block/object, with Ambient remembering the last interacted block without leaving a permanent active outline in the document.
- Formulas should render as formulas while preserving original Markdown/LaTeX source.
- Obsidian-native assets appear as first-class vertical blocks: Base, Canvas, Excalidraw, and attachments.
- Native assets stay in their original file formats; Peak only owns the rendering shell, adapter entry points, review controls, and rollback path.
- AI actions are attached to selected blocks and produce reviewable edits.

## Out Of Scope

- No production code touched.
- No Obsidian editor runtime implementation.
- No private all-block document format.
- No mobile interaction pass.
- No complete spreadsheet/database replacement.

## Atlas Filter Coverage

File Atlas (v3 mock) filters on a fixed kind registry. Every filterable kind now exists in this Composer mock as hoverable content with its own AI suggestion set (hint pill → AI menu → suggestion card):

| Atlas filter group | Kind | Composer block | AI suggestions |
| --- | --- | --- | --- |
| Structure | paragraph / list / task / callout / quote | 正文段落、markdown-list、checklist、callout、引用块 | 润色 / 追问 / 转表格等信号驱动集 |
| Rich blocks | table | PKM pipeline 表格 | 总结表格 / 补一列 / 检查口径 |
| Rich blocks | code | Base query source（YAML） | 解释源格式 / 检查语法 / 生成预览 |
| Rich blocks | math | 图算法公式组 + 行内公式 | 解释 / 拆分 / 变量表（micro 卡级） |
| Rich blocks | mermaid | PKM 流程 flowchart（本地 mermaid 渲染） | 解释流程图 / 补缺失分支 / 转 Canvas |
| Media & embeds | image | 路线图真实附件 | 图注 / 标注 / 重写 prompt |
| Media & embeds | excalidraw / canvas | RoughJS / JSON Canvas 预览块 | 提取流程 / 总结节点 等 adapter 集 |
| Media & embeds | embed | `![[信息管理#^pkm-cache]]` 嵌入片段 | 展开要点 / 修复锚点 / 改为链接 |
| Media & embeds | attachment | PKM-工具对比调研-2023.pdf 附件壳 | 提取要点 / 生成引用 / 拆章节笔记 |
| References | property / tag | Frontmatter metadata 块（tags 行） | 规范属性 / 补标签 |
| References | vault link | 相关笔记双链段（含失效链） | 补双链 / 检查断链 / 生成 MOC 行 |
| References | external link | 外部参考链接段（含裸 URL） | 转 link card / 抓取摘要 / 核对来源 |
| References | footnote | `[^1]` 脚注块 | 核对出处 / 转尾注段 / 升为正文 |
| Copilot insights | claim / evidence / example / action / decision / question | Insight cluster：6 张带 provenance 的 micro 卡 | 复核 insight（micro 级）+ 复核全部 / 转正文 / 清理未确认（块级） |
| Issues | issue | 4 个 issue pill：metadata warning（frontmatter）、stale link（双链段）、unresolved anchor（embed）、missing source（Claim 卡） | 点击 pill 直接打开修复建议卡 |

Issue pills are persistent state markers (not hover-only) because warnings must stay visible; clicking one opens the corresponding fix suggestion card with candidate + diff.

## Spec Surfaces Intentionally Not Mocked

Called out so a reviewer does not mistake absence for a decision:

- keyboard slash menu (spec "Slash Insert") — only the block-tail insert strip is mocked;
- link card block (spec Phase 3) — external links are present with a 转 link card AI action, but the card block itself is not rendered;
- image resize drag handle (spec Phase 0 spike deliverable);
- callout visual toolbar for type/title/color/collapse — the mock only offers AI chips on callouts;
- audio/video attachment previews — only the PDF attachment shell is mocked, and the PDF is a placeholder file name, not a real vault asset;
- real diff computation for rewrites is **now implemented** (char-level LCS word diff, in place) — but it is still char-level, and additive results use a streamed preview card rather than a diff; whole-word Chinese segmentation is the remaining upgrade.

## Verification

Checked on 2026-07-15 for the rebuilt Intelligence sidecar:

- Playwright Chromium at `1500x1040`, `962x998`, and `390x844`; Copilot, Ambient, and History all render and switch with zero console errors.
- At `962x998` and `390x844`, the open panel is `position: fixed` on the right; closing moves its full bounding box beyond the viewport and reopening restores it without page-width overflow.
- Copilot contextual starter -> populated prompt -> generated transaction summary was exercised at `390x844`; the bottom composer remains reachable and the result scrolls inside the panel.
- Ambient renders one primary push plus folded relations/trace; History renders a vertical timeline and vertical before/after Markdown diff.

Checked on 2026-07-14 (current consolidation pass; the earlier 2026-07-11 browser run covered the block-AI result model):

- `node --check mock.js`
- required Intelligence/source-strip DOM IDs are unique and present; CSS brace balance is zero
- the stale four-tab sidebar API is absent; the active API is `Copilot / Ambient + History`
- insert-menu choices create real editable draft blocks; formula micro-blocks participate in pointer drag reorder
- Playwright Chromium at `1500x1040`, no `pageerror` / console errors during the scripted interaction run
- real image asset loads; vendored `lightGallery`, `lg-thumbnail`, `lg-zoom`, and `lazysizes` load from `file://`
- KaTeX formula blocks render; JSON Canvas preview renders from data; Excalidraw preview renders through `rough.js`
- contextual AI quick actions are generated for all 39 document blocks (32 original + 7 Atlas-coverage additions); hovering shows only the "AI 建议 · N" pill in the inter-block gap (no overlay covers neighboring content), and every chip shows an evidence-citing trigger reason in the AI menu and card (`preview-contextual-ai-actions.png`)
- every Atlas-filterable kind is present and AI-hoverable: vault/external link paragraphs, footnote, embed, PDF attachment, mermaid (rendered by local `mermaid.min.js`), 6 insight micro cards with provenance, and 4 clickable issue pills (`preview-atlas-links.png`, `preview-atlas-insights.png`, `preview-atlas-mermaid.png`, `preview-atlas-embed.png`)
- issue pills open fix suggestion cards: stale link → 修复失效链接（改链候选）、unresolved anchor → 重定位锚点、missing source → 补来源、metadata warning → 规范属性
- rewrite chips stream in place then render a word-level diff (red del / green ins) with a `−N +N` count and 接受 / 还原 / 重试; 接受 writes the text and records an Ambient rollback entry without leaving a permanent body pill (`preview-blockai-inplace-diff.png`, `preview-blockai-rewrite-accepted.png`)
- additive chips (and Copilot 生成) stream into a green "新增 · 生成到块下方" preview card with 接受写入 / 重试 / 丢弃, leaving the original text untouched (`preview-blockai-insert-card.png`)
- both result surfaces survive hovering other blocks; each closes only via its own buttons, Esc, or replacement by a new AI task
- the inter-block `AI 建议 · N` pill opens the capsule menu; the pills collapse into a one-line input when 指令 is clicked, and blocks with a Copilot suggestion show the combined card (`preview-blockai-capsule.png`, `preview-blockai-input-morph.png`, `preview-blockai-combined.png`)
- Intelligence 当前块 follows click/edit focus, not hover; Copilot and Ambient actions act on the focused block
- every formula micro-card has its own capsule menu, and its insert card opens inside the formula card it explains (`preview-formula.png`, `preview-blockai-formula-menu.png`)
- table cell click sets the current cell; Tab/Enter move between cells; sort/align/row-delete act on the current column/row (`preview-table.png`)
- image 标注 toggles a non-destructive overlay pin and no longer opens the block comment editor
- frontmatter block has no move/remove controls and rejects drag
- press-and-hold block drag reorders in the article DOM, auto-scrolls near viewport edges, and hides the AI hint pill and object toolbars while dragging
- toast feedback moved to the bottom-right corner so it no longer covers the reading column
- inline insert strip appears under the selected block, now with explicit Base/Canvas/Excalidraw entries
- comment input can be typed, saved to the block, and persists across hover
- continuous-canvas pass: one root editing host, a five-action cross-block selection toolbar, explicit non-editable UI chrome, on-demand source detail, and a narrow-screen Ambient drawer. This pass was statically checked with `node --check`, a single-host assertion, and CSS brace validation; refresh the already-open mock to exercise the browser-level selection path.
- Esc closes AI menu → insert strip → comment editor → suggestion card → lightGallery in that order
- table hover toolbar does not cover the table header
- all preview screenshots regenerated from the current build (the previous 07-09 set showed the removed permanent AI strips)
