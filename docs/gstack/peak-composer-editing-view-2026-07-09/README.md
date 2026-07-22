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
- Intelligence lab CSS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.css`
- Intelligence lab state model: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.js`
- Selected Intelligence IA acceptance fixture: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief`
- Intelligence IA lab CSS / state / QA: `intelligence-ia-lab.css`, `intelligence-ia-lab.js`, `intelligence-ia-lab.qa.mjs`
- Related-material surfaces: the sidecar keeps a bounded local relationship preview; its expanded modal is only a reuse marker for the production Vault Search Result Browser and does not copy List / Folder / Graph UI.
- Archived graph/header comparison previews: `preview-intelligence-ia-c-graph-parity.png`, `preview-intelligence-ia-c-session-header.png` (not the current Result Browser source)
- JS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/mock.js`
- Assets: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/assets`
- Related document map: [`2026-07-22-peak-composer-related-document-map.md`](../../superpowers/specs/2026-07-22-peak-composer-related-document-map.md)
- Cross-session Intelligence handoff: [`2026-07-22-peak-composer-intelligence-sidecar-handoff.md`](../../superpowers/plans/2026-07-22-peak-composer-intelligence-sidecar-handoff.md)
- Design spec: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md`
- Intelligence sidecar contract: [`2026-07-15-composer-intelligence-sidecar-ui.md`](../../superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md)
- Production Vault Result Browser extraction plan: [`2026-07-21-vault-result-browser-shared-component.md`](../../superpowers/plans/2026-07-21-vault-result-browser-shared-component.md)
- Copilot + Ambient workbench decision: [`copilot-ambient-consolidation-review-2026-07-17.md`](./copilot-ambient-consolidation-review-2026-07-17.md)
- Block-AI preview screenshots (live mock, 2026-07-11 final): `preview-blockai-capsule.png`, `preview-blockai-combined.png`, `preview-blockai-input-morph.png`, `preview-blockai-inplace-diff.png`, `preview-blockai-rewrite-accepted.png`, `preview-blockai-insert-card.png`, `preview-blockai-formula-menu.png`
- Other preview screenshots (regenerated 2026-07-11 against the current interaction model): `preview-overview.png`, `preview-interaction-insert.png`, `preview-ai-streaming.png`, `preview-ai-diff.png`, `preview-ai-menu.png`, `preview-ai-rollback.png`, `preview-formula.png`, `preview-table.png`, `preview-native.png`, `preview-atlas-links.png`, `preview-atlas-insights.png`, `preview-atlas-mermaid.png`, `preview-atlas-embed.png`, `preview-image-lightgallery.png`, `preview-image.png`, `preview-contextual-ai-actions.png`, `preview-comment-editor.png`, `preview-insert-under-block.png`, `preview-drag-reorder.png`, `preview-native-followup-content.png`

Open `index.html` directly in a browser. No dev server is required.

### Intelligence source-of-truth boundary

- `intelligence-panel.js` and `intelligence.css` are the shared static-mock source of truth for the Intelligence shell. `vault-result-browser.js` owns only the bounded sidecar relationship preview and the expanded-modal reuse contract. There is deliberately no static-mock source of truth for the expanded related-material List / Folder / Graph browser: that surface must be the production Vault Search Result Browser component.
- `index.html` is the integrated Peak Composer owner-review mock. It mounts the shared sidecar and lets `mock.js` project focused-block, run, review and accepted-transaction state into it without replacing the main document body.
- `intelligence-lab.html` is the small-DOM standalone debugging entry. It consumes the same `intelligence-panel.js` and `intelligence.css`; its local CSS/JS only provide the fixture document and host adapter.
- `intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief` is the selected acceptance fixture for hierarchy, states and visual comparison. The other A/B/C routes remain regression references. The fixture is not copied into the hosts and is not a production runtime.

The shared mock has exactly two visible top-level tabs: `Copilot / History`. Ambient remains a distinct inference and ranking runtime, but its user interface is the default Copilot `brief`; it is no longer a third tab. Copilot then moves through the internal `brief / session / review` lifecycle. The full composer appears only in `session`; History owns accepted writes, location, diff and rollback.

For the selected Intelligence acceptance reference, open `intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief`. The same fixture retains two comparison variants over the same state machine and transaction data:

- `?variant=adaptive&mode=copilot&stage=brief` — A, recommended adaptive Copilot opening on proactive suggestions;
- `?variant=adaptive&stage=session` — a task-named collaboration session with the full Chat Studio-compatible composer;
- `?variant=adaptive&stage=review` — transient multi-change review with previous/next document navigation;
- `?variant=staged&stage=brief` — B, the explicit `建议 / 协作 / 审阅` comparison;
- `?variant=hybrid&stage=brief` — C, retained comparison: A-like quiet content plus a progressive `建议 / 进行中 / 待审` queue only while work exists;
- `?variant=hybrid&stage=brief&fresh=1` — C at rest, where the queue stays hidden until a task begins;
- `?mode=history` — accepted-write ledger and transaction modal.

The A/B/C fixture is intentionally isolated from the integrated mock, but its adaptive route is the acceptance reference the shared component must match. The standalone `intelligence-lab.html` mounts the shared component so sidecar-only debugging and the integrated `index.html` exercise the same runtime and visual source.

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

### Selected Intelligence shell and retained lifecycle exploration (2026-07-21)

The selected static-mock shell is the adaptive route `intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief`. Its top level is `Copilot / History`. Copilot opens on an Ambient-powered proactive brief and moves into `session`, then transient `review`; these are lifecycle states, not permanent tabs. This is the owner-review baseline for `index.html` and `intelligence-lab.html`, not evidence that the Obsidian production runtime is implemented. The staged and hybrid routes remain comparison fixtures only.

2026-07-20 clarification: the earlier `Changes / Insights / Sources / Trace` vocabulary survives only inside one Copilot Run. These are not permanent product tabs. The same Copilot receipt shows the compact summary and key insight, then expands in place into a run artifact browser; accepted writes remain separate History transactions.

| Variant | User-visible structure | Strength | Main risk |
| --- | --- | --- | --- |
| A · Adaptive Copilot (**selected**) | proactive brief → task-named session → transient review; no permanent secondary tabs | feels like one collaborator and minimizes mode tax | back, task naming, and state restoration must stay unambiguous |
| B · Explicit lifecycle | fixed `建议 / 协作 / 审阅` rail; composer only in 协作 | makes lifecycle stages easier to learn | adds navigation weight and can drift back toward a dashboard |
| C · Progressive queues (comparison) | starts like A; when work exists, a light `建议 / 进行中 / 待审` queue appears in one stable location | keeps A's quiet reading state while making B's destinations visible exactly when useful | counts must describe real queues, and the rail must not become an always-on stepper |

Ambient is system initiative and ranking behavior projected into the Copilot brief. It does not create another tab, context store, conversation engine or execution runtime: it reads the same focused-object snapshot used by Copilot and hands selected material/actions into a Copilot session. The A/B/C harness remains useful as a boundary reference and must continue to share the same change/history model.

- **One chrome grammar at two levels:** the left edge is only for press-and-hold drag. `在下方插入 / 评论 / AI 建议` live together in a block-tail row. Formula micro-cards reuse the same controls and can be press-dragged inside their formula group, so the parent formula group and each individual formula no longer invent different button counts or top-right shortcuts.
- **AI generates real draft objects, not explanation cards:** additions appear at their real insertion point as a paragraph, heading/list, editable table, rendered KaTeX, or actual generated image. A reusable transaction footer carries generation status and `接受 / 丢弃`; accepted content becomes an ordinary editable block with its own controls.
- **Object transforms are real, vertical review surfaces:** list/checklist reorder, list-to-table, formula split, and table transpose put the original object above and the proposed object below. This keeps wide tables and long formulas readable; accepting replaces the source object in place.
- **Image generation has visible cost and progress:** “生成示意图 / 生成配图” first renders a timed planning/generation state, then reveals the real project-bound bitmap `assets/ai-knowledge-workflow-illustration.png`. The result remains unwritten until accepted and then uses the existing lightGallery viewer.
- **Native objects are inspectable and incrementally editable:** Mermaid, JSON Canvas, and Excalidraw have `预览 / 源码 / 复制源码 / 复制图像` controls. The AI increment path modifies node/edge or element data in small timed steps and re-renders before an explicit accept or restore.
- **The right dock has two top-level surfaces:** `Copilot` opens on the Ambient-powered brief and owns conversation, capability execution, run receipts and transient Review; `History` keeps a scannable accepted-transaction timeline and opens detail in a modal. Ambient inference and Copilot execution still have separate runtime ownership even though they share one Copilot-facing surface.
- **Copilot separates live context from run context:** one system event in the conversation follows the active object, selection, nearby content and Ambient relations. Sending freezes that state into an immutable run snapshot; later editor focus changes affect only the next run and never rewrite the context of an in-flight or accepted transaction.
- **Copilot messages have distinct jobs without becoming a card wall:** the thread demonstrates user instructions, AI replies, automatic recommendations, tool/context feedback, processing state and accepted-write receipts as flat timeline events. A user instruction carries an immutable inline quote of the selected text or target block, including its title and excerpt; clicking it locates the referenced document position. A new clue promoted into the active session is an ordinary recommendation message with a direct preview, inline expansion, ignore and `带入下一轮`; bringing it in only updates action/context chips and never auto-runs. The same clues must not reappear in a separate `session-clues` list or external detail panel.
- **Every run leaves one expandable receipt, not four permanent result tabs:** the receipt updates in place with run status, target, duration and change / insight / source counts, plus at most one key insight in the Q&A flow. Expanding that same message reveals a run-local artifact browser where `Changes / Insights / Sources / Trace` switch in place and their entries are immediately visible. Long text expands inline; ordinary entries do not open a modal. Trace defaults folded and contains only verifiable actions, artifacts, validation and errors—never chain-of-thought. `Fast Lookup` remains runtime metadata rather than user-facing navigation. A wide explorer is reserved for relationship graphs and similarly spatial artifacts that cannot be understood in the narrow thread.
- **Voice creates a draft, never a surprise run:** the microphone control lives in the bottom composer, shows requesting/listening/transcribing/error states, and inserts the transcript at the current draft position without auto-running a capability. The fixture proves the interaction only; production must choose an Obsidian/Electron transcription adapter and permission policy.
- **The input shell follows one project-wide contract:** the lab maps its action/context chips and document run semantics onto the Chat Studio composer grammar—one focus-owning shell, shared `--pk-*` tokens, 14px editor inset, soft footer divider and common control states—without inheriting Chat-specific stores or submit runtime. See [`Prompt Input Consistency`](../../conventions/prompt-input-consistency.md).
- **Capabilities stay next to the task-session composer:** quick actions, `全部能力`, voice and the input shell are absent from brief and review. `全部能力` stays at the recommendation row's right edge and opens a searchable picker. Choosing a capability creates an action chip; text, link, link-graph and concurrent-note commands create context chips. Running produces a `ProposedChangeSet` instead of result cards in the thread.
- **Copilot brief projects Ambient sensing as one proactive work surface:** `接下来可能要做 / 相关材料 / 还没安放的想法` render as vertically stacked, long-list sections in one scroll. Preview and refresh stay in brief; `讨论 / 问 Copilot / 带入协作` enters a task session without auto-running. A run with pending patches enters Review, where `改动 N / Total` and previous/next synchronize with editor-local previews. Ambient refresh updates the brief snapshot in place and never appends chat messages.
- **Live generation and review stay on the document:** as a run streams, rewrite candidates, insertions, transforms and native patches render at their real anchors. Once a candidate is reviewable, `上一处 / 下一处 / 接受 / 拒绝` operate on those anchored previews; an incomplete streaming candidate cannot be accepted. The sidecar carries status, navigation and explanation rather than a duplicate result card.
- **The document is the primary review surface:** every change anchor has a stable clickable number pin in source order. `current` shows only the active in-place diff, `all` shows every candidate at its real anchor, and `original` shows committed source while retaining light locator pins. Pin, right-side pending queue and bottom previous/next all select the same active change; the queue and navigator are helpers, never a second review truth. Accept/reject affects only the active change in every mode. Pins are keyboard-operable, and narrow-screen locate closes the drawer back to the document while preserving a compact bottom navigator and all review state.
- **Related materials use progressive disclosure:** the sidecar keeps a small read-only graph of the current object and its strongest materials, with in-place selection detail and `查看来源 / 带入协作`. `打开完整视图` then mounts the production Vault Search Result Browser in related-material mode. Its List / Folder / Graph, toolbar, layouts, keyboard behavior and inspector grammar are not redrawn in Composer HTML/CSS/JS. The static modal is only a reuse slot / contract marker; it does not prove or simulate the expanded component internals.
- **The sidecar header is centered chrome, not a badge card:** `Intelligence / 正在跟随正文` is geometrically centered in the panel; the spark is an unboxed 18px mark and the close action remains edge-aligned. Session/review leading icons keep their hit area without a permanent square border, and task title/action tops share one alignment axis.
- **History is a dated authorship-aware ledger:** rows are grouped by day and distinguish `你直接编辑`, `AI 辅助 · 你已接受`, `AI 后调整`, and `系统回滚`. Selecting a row opens a transaction modal. Its default view marks additions and deletions in place in one source-ordered context; `Before / After` shows the complete snapshots. Unsafe old rollback is withheld when later edits make direct inversion destructive.
- **Run records and History link without collapsing into one store:** every accepted change creates its own addressable transaction, even when several transactions are visually grouped by one run/change set. The run record behind the message browser keeps `acceptedTransactionIds`; History keeps the originating run/change IDs, so navigation works in both directions and returns to the originating receipt. Rejected candidates, Sources, Insights and Trace never enter History.
- **Sensing is separate from execution:** `off / smart / continuous` only controls proactive snapshot refresh. Auto-run is an independent, default-off policy; even when enabled it may only produce read-only analysis or pending candidates. No sensing or auto-run mode may auto-accept or write Markdown/native source.
- **Responsive behavior is a sidecar, never document content:** above `1180px` Intelligence occupies the stable right column; below it the same surface is a fixed right-side drawer with its own close action, bounded height, and off-canvas closed state. It never falls below the Markdown article or expands the page width.
- **History boundary:** the mock demonstrates in-session rollback and a Git-compatible history surface. Production should persist accepted patches in Git when present, or in a vault-local review log when Git is unavailable; the Markdown/native file remains the authoritative content.

The per-type operation contract is maintained separately in [`Composer Block AI Capability Contract`](../../superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md). It distinguishes fixed block tools, evidence-triggered Copilot Review suggestions, and incremental native-object generation.

### Vault Search related-material explorer reuse boundary

The static mock does not implement or visually clone the expanded Vault Search browser. It retains the Composer-specific compact relationship preview, then marks the modal integration slot and host contract. Production reuse is complete only when that modal mounts the same controlled React Result Browser used by Vault Search.

| Layer | Current status | Boundary |
| --- | --- | --- |
| `src/service/search/graph/resultSubgraph.ts` | implemented and tested | structural Vault graph data contract |
| `VaultSearchResult.tsx` / `ResultTreeView.tsx` | implemented, but bound to Vault Search result state and actions | extract controlled List/Tree projections over supplied results |
| `ResultGraphView.tsx` | implemented, but bound to Vault Search store/context | extract its controlled canvas/layout core; do not import the search host into Composer |
| Static Composer mock | compact sidecar preview + expanded-modal reuse marker | preview may show a capped local relation graph; modal must not implement toolbar, result rows, folder tree, full graph layouts or inspector |
| Composer material adapter + shared controlled browser | production target, not implemented | one app-owned immutable snapshot feeds the complete List/Folder set and capped Graph projections |

Production reuse means the same controlled List, Tree and Graph renderers over host-supplied results—not a lookalike mock and not sharing `vaultSearchStore`. Vault Search keeps query lifecycle, global cursor, density preference and hub navigation; Composer keeps its immutable brief snapshot, source inspection, context-chip assembly and task-session actions. `MultiLensGraph` is a different AI-analysis graph domain and is not the source contract for this surface.

The mock intentionally removes the old top insert/image/table/native command cluster and the earlier proof-like labels such as "real attachment" or "plain Markdown table." The top strip is only a quiet view/source status area. The useful actions now live where the user works:

### Continuous canvas pass (2026-07-11)

- The entire document paper is now **one editing host**, not a collection of nested `contenteditable` islands. Text can be selected from a title through paragraphs, lists, quotes, callouts, and back again; buttons, object toolbars, inputs, and generated review UI are explicitly non-editable chrome.
- A non-collapsed selection opens a compact floating text toolbar: **评论 / 润色 / 精简 / 扩写 / 问 AI**. It states whether the selection spans several blocks. Cross-block AI is deliberately additive: it creates a reviewable patch at the selection end instead of silently replacing multiple Markdown ranges. A comment is attached with the same multi-block scope.
- Editing a text block marks its local AI hint as refreshing, then re-runs the type-and-signal rule against current rendered text. Markdown shown in a source preview or Copilot projection remains untouched until an explicit writeback action.
- Object tools remain local and hover-only. The table toolbar now sits in the gap above the table rather than over its header. Native filenames and source paths are hidden in reading state and are revealed by the focused block's **展开源格式** action.
- Visual noise is reduced: the document is a flatter reading canvas, the type scale is normalized, hover is a subtle left-edge/focus treatment, and accepted patches move to History rather than leaving permanent body markers.
- Status badges are no longer absolutely positioned over prose. Claim / Evidence / Decision / issue state lives in a dedicated row at the start of its own block; `AI 建议 · N` has a separate block-tail hover row, with a stable hit target so it can be reached and clicked.
- AI output has a third, object-aware branch in addition to prose rewrite and additive insertion: **Frontmatter** changes values/tags in place with red/green review states; **lists** insert or reorder real bullets in place; **formula cards** render old-versus-new LaTeX and accept into the same formula card. Formula explanation is an arrowed symbol map rather than a dense paragraph; formula extraction from prose renders a candidate KaTeX block.

- every document block exposes one quiet left-side affordance on hover: the press-and-hold drag handle. Insertion, comments, and contextual AI share one reachable tail row below the selected block; source detail stays in the compact bottom strip;
- **focus is click/edit-based, not hover-based**: hover only reveals local affordances; the Copilot workbench scope and the bottom source strip update when the user clicks a block, edits its content, or uses one of its controls, so panel actions always target the block the user actually interacted with;
- left-side block controls now have a wider invisible hover corridor, so moving from the text block to the control rail does not collapse the toolbar;
- the frontmatter metadata block has no move/remove controls and refuses drag, because frontmatter must stay unique and at the top of the file; insertion remains local while comments and AI remain available through selection, block suggestions, and the Copilot workbench;
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
- accepting a patch adds an entry to the History transaction ledger, where each entry can be located, reviewed and rolled back; reading state does not keep a permanent "AI patch" label on the prose;
- comments are real inline editors. A comment can be typed, saved, and attached to the current block as Copilot context. Like insert and AI surfaces, one click opens it and the next click closes it; hover never closes it;
- checklist text is editable in place separately from the checkbox state;
- formula cards have their own micro block controls, and a micro AI card opens **inside the formula card it explains**, not at the bottom of the whole math section;
- the image block uses LoveIt-style `lightGallery` for fullscreen viewing; crop and AI caption stay Composer edit actions, and **标注 (annotate-on-image) is a separate non-destructive overlay action, no longer routed into the block comment editor**;
- the table block has a **cell selection model**: clicking a cell marks it current; Tab/Enter move between cells; 排序 actually sorts by the current column, 对齐 cycles alignment on the current column, and "- 行" deletes the selected row (falling back to the last row). Format/formula/transpose/CSV remain narrated previews. The toolbar floats above the table without covering the header row;
- Base, Canvas, and Excalidraw blocks each appear as full-width vertical document blocks; their AI buttons (生成周报 / 总结节点 / 提取流程) open suggestion cards under the same label as the button;
- Esc closes the topmost open surface in order: selection toolbar / selection review → link popover → draft block → AI input (collapse back to pills) → AI menu → insert strip → insight panel → comment editor → rewrite-review / insert card → lightGallery;
- Intelligence follows the focused block. Copilot owns the user-visible workbench, conversation and execution; Ambient runtime supplies inferred work state, related knowledge and ranking behind that workbench; History owns accepted transactions and rollback. On narrow widths the dock remains available as a right-side drawer rather than disappearing.

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
- Composer adaptation: AI is exposed as contextual block actions, not a permanent page-level toolbar. Copilot keeps a full editing workbench as its default body, while the most likely actions also appear beside the focused block and, after entering conversation, in the quick-capability row above the composer.

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
- Rich object controls are attached to the hovered block/object, with the Intelligence focus projection remembering the last interacted block without leaving a permanent active outline in the document.
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

Acceptance baseline and entrypoint QA (2026-07-21):

- `intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief` remains the selected sidecar visual/state acceptance route. Related materials retain the bounded inline preview; the expanded modal is represented by a Result Browser reuse slot / contract marker and does not validate duplicated List / Folder / Graph internals.
- Brief has no full composer. Session preserves the project PromptInput contract: the textarea has no inner border/outline, the shell owns the focus ring, and horizontal input padding is `14px`.
- `全部能力` opens the searchable capability registry; a selection becomes an action chip and does not auto-run. Voice writes only an editable draft.
- Review starts at `改动 2 / 8`; previous/next changes the editor anchor, the highlight follows the target block rather than the whole paper, and accepting a change creates a History transaction.
- Static entrypoint QA should assert that the bounded preview renders and changes its selected source in place, then that its reuse slot opens/closes, preserves drawer/modal bounds and restores focus. The Composer modal must not contain copied Vault Search toolbar, List, Folder or expanded Graph implementations; projection parity, graph layouts and export belong to production Result Browser component tests.
- Header geometry is asserted: title group center delta is `0px`, the spark has transparent background and `0px` border, and session title/back/action top deltas are `0px`.
- At narrow width, Intelligence remains a fixed right-side drawer. It never drops below or widens the document.
- `intelligence-entrypoints.qa.mjs` validates that `index.html` and `intelligence-lab.html` mount the same shared version, expose only `Copilot / History`, default to the Copilot brief, show the composer only in session, and close/reopen as a fixed right drawer without horizontal overflow. It does not emit screenshots by default.
- Not yet verified: a production Composer result adapter, shared controlled React List/Tree/Graph surfaces, or real Quick Search/Composer use of the same component. The static marker is not component-reuse evidence.

### Archived v7 fixed-rail verification

The following record describes the pre-shared version of `intelligence-lab.html`. It is retained only as historical interaction evidence and does not describe the current standalone lab:

- `node --check intelligence-lab.js`; HTML IDs are unique, exactly two `[data-mode]` tabs exist, the v6 shelf state/events are absent, CSS braces balance, and `git diff --check` is clean for the lab/docs files.
- Playwright Chromium at `900x998` and `390x844` completed with zero console errors and no horizontal page overflow.
- Copilot opens in `workbench`: all three sections are present in one body scroll, with `38 / 37 / 19` initial totals and `2 / 3 / 1` visible summary rows. Quick capabilities, picker and composer are absent from the visible workbench.
- `工作台 / 对话` stays at the same `419×39px` rail position across both bodies. Pointer and ArrowLeft/ArrowRight switching update selection and URL; conversation alone reveals quick capabilities and composer.
- A workbench refresh kept the body in workbench, changed the queue from `94` to `98`, left the hidden conversation at four thread events, and reported `+7 新线索 · 3 条已归档` instead of creating a chat message.
- Choosing `Base 使用判断.md` switched to conversation, added the `补上依据` action chip, a concrete `相关材料 · Base 使用判断` context chip and editable draft, while keeping the thread at four events and not starting a run.
- History hides all Copilot mounts and renders nine transactions across five date groups. Its modal diff/rollback fixture remains unchanged from the verified v5 transaction model.
- At `390x844`, Intelligence remains a `fixed` full-width right drawer. Workbench uses the full body without an input dock; conversation pins the composer to the viewport bottom.
- `output/playwright/intelligence-v7-copilot-workbench.png` predates the fixed secondary rail and is archived interaction evidence, not the current visual baseline. This correction was verified through DOM geometry and interaction state without producing another screenshot.

## Intelligence Integration Boundary

The selected shell is now shared by the large mock and the lightweight lab. `intelligence-panel.js` / `intelligence.css` own the component; `index.html` and `intelligence-lab.html` are hosts. The adaptive IA route is the acceptance fixture rather than the merge/runtime source; its other routes remain regression comparisons. This completes the **static mock integration only**. Production still needs app-owned focused context, sensing, run, `ProposedChangeSet` and transaction adapters rather than fixture timers, fixed counts or in-memory state. Preserve these boundaries during production implementation:

- keep all 17 capability IDs distinct and keep the picker next to the bottom composer;
- separate the live-context projection from the immutable run snapshot, and bind accepted History transactions to that snapshot;
- preserve the event-kind model instead of flattening context, user prompts, AI replies, recommendations, and action receipts into one generic chat bubble;
- project an automatically discovered clue for the active session as one stable recommendation message item with inline preview/expand, ignore and `带入下一轮`; update that item in place as evidence changes, and never build a parallel session-clues list, shelf or external detail panel;
- implement microphone capture behind a production adapter with explicit permission, cancellation, transcript review, and draft-only semantics; do not make Web Speech or the lab timer the source of truth;
- keep `全部能力` fixed at the recommendation row's right edge;
- keep results and progress in the document; the sidecar carries intent, context, status, and receipts;
- keep Ambient inference separate from Copilot execution and accepted History while projecting its proactive work into the Copilot brief rather than a third top-level tab;
- keep `Changes / Insights / Sources / Trace` scoped to one stable run ID; make the same receipt expand into an in-message artifact browser with category switching, visible rows and inline long-content disclosure. Ordinary artifacts never open a modal; only relationship graphs and similarly spatial content may use an explicit wide view. Trace stays redacted to verifiable actions/artifacts, and `Fast Lookup` remains runtime metadata;
- preserve brief snapshot, session draft/chips/thread, Review active change, and each stage's scroll position independently; background refresh never leaves brief/session/review or forces a run stage change;
- render `接下来可能要做 / 相关材料 / 还没安放的想法` in one brief scroll, with stable IDs and long-list windowing rather than category tabs or nested scrollers;
- build one app-owned Composer material snapshot containing the complete ranked items plus `ResultSubgraphOutput`; use it for the bounded Composer preview and pass the same frozen snapshot to the shared production Result Browser, without creating a parallel expanded browser in Composer code;
- extract the neutral controlled Result Browser from the store-bound Vault Search host once; Composer must import that production component package and must not maintain parallel List, Tree, Graph, toolbar, layout or inspector renderers;
- keep Vault Search query/store/global cursor/hub navigation in its host and Composer `查看来源 / 带入协作` in the Composer host; preserve selected source across projections and resolve the current `hub_constituent` render/isolation discrepancy before locking shared acceptance tests;
- implement one source-ordered `ProposedChangeSet` navigator synchronized with editor-local review surfaces, with stale-target checks and batch-aware History grouping;
- stream every candidate at its real document anchor and make previous/next/accept/reject operate on those anchored previews; do not render a duplicate sidecar result list;
- make the document own `current / all / original` review projections and stable numbered change pins; converge pin, pending queue and bottom previous/next on one `activeChangeId`, keep accept/reject active-only, and preserve mode/focus/scroll through keyboard and narrow drawer locate/reopen flows;
- keep Run records and History as separate stores with bidirectional run/change/transaction links; every accepted change remains an independently locatable and rollbackable transaction, while rejected and non-writing run artifacts stay out of History. Returning from History must focus and expand the originating receipt, not open a generic Run detail modal;
- implement sensing `off / smart / continuous` independently from auto-run and enforce a runtime guard that no mode can auto-accept or write;
- do not port the obsolete fixed `工作台 / 对话` rail or a separate Ambient tab; the composer exists only in Copilot session, while brief selections become action/context chips without starting a second conversation runtime;
- port the date-grouped, origin-aware transaction timeline and modal whose default is source-ordered in-place changes and whose alternate view is `Before / After`;
- make rollback append-only, source-range aware, and guarded by a current-content conflict check, with Markdown/native files remaining authoritative;
- capture direct editor transactions as first-class History entries instead of inferring every accepted write came from AI;
- retain a stable right column above `1180px` and a closable fixed right drawer below it.

Checked on 2026-07-14 (current consolidation pass; the earlier 2026-07-11 browser run covered the block-AI result model):

- `node --check mock.js`
- required Intelligence/source-strip DOM IDs are unique and present; CSS brace balance is zero
- the integrated `index.html` and standalone `intelligence-lab.html` consume the same adaptive two-tab (`Copilot / History`) shared sidecar rather than maintaining separate panel markup
- insert-menu choices create real editable draft blocks; formula micro-blocks participate in pointer drag reorder
- Playwright Chromium at `1500x1040`, no `pageerror` / console errors during the scripted interaction run
- real image asset loads; vendored `lightGallery`, `lg-thumbnail`, `lg-zoom`, and `lazysizes` load from `file://`
- KaTeX formula blocks render; JSON Canvas preview renders from data; Excalidraw preview renders through `rough.js`
- contextual AI quick actions are generated for all 39 document blocks (32 original + 7 Atlas-coverage additions); hovering shows only the "AI 建议 · N" pill in the inter-block gap (no overlay covers neighboring content), and every chip shows an evidence-citing trigger reason in the AI menu and card (`preview-contextual-ai-actions.png`)
- every Atlas-filterable kind is present and AI-hoverable: vault/external link paragraphs, footnote, embed, PDF attachment, mermaid (rendered by local `mermaid.min.js`), 6 insight micro cards with provenance, and 4 clickable issue pills (`preview-atlas-links.png`, `preview-atlas-insights.png`, `preview-atlas-mermaid.png`, `preview-atlas-embed.png`)
- issue pills open fix suggestion cards: stale link → 修复失效链接（改链候选）、unresolved anchor → 重定位锚点、missing source → 补来源、metadata warning → 规范属性
- rewrite chips stream in place then render a word-level diff (red del / green ins) with a `−N +N` count and 接受 / 还原 / 重试; 接受 writes the text and creates a History transaction without leaving a permanent body pill (`preview-blockai-inplace-diff.png`, `preview-blockai-rewrite-accepted.png`)
- additive chips (and Copilot 生成) stream into a green "新增 · 生成到块下方" preview card with 接受写入 / 重试 / 丢弃, leaving the original text untouched (`preview-blockai-insert-card.png`)
- both result surfaces survive hovering other blocks; each closes only via its own buttons, Esc, or replacement by a new AI task
- the inter-block `AI 建议 · N` pill opens the capsule menu; the pills collapse into a one-line input when 指令 is clicked, and blocks with a Copilot suggestion show the combined card (`preview-blockai-capsule.png`, `preview-blockai-input-morph.png`, `preview-blockai-combined.png`)
- Intelligence 当前块 follows click/edit focus, not hover; Copilot actions and projection suggestions act on the focused block
- every formula micro-card has its own capsule menu, and its insert card opens inside the formula card it explains (`preview-formula.png`, `preview-blockai-formula-menu.png`)
- table cell click sets the current cell; Tab/Enter move between cells; sort/align/row-delete act on the current column/row (`preview-table.png`)
- image 标注 toggles a non-destructive overlay pin and no longer opens the block comment editor
- frontmatter block has no move/remove controls and rejects drag
- press-and-hold block drag reorders in the article DOM, auto-scrolls near viewport edges, and hides the AI hint pill and object toolbars while dragging
- toast feedback moved to the bottom-right corner so it no longer covers the reading column
- inline insert strip appears under the selected block, now with explicit Base/Canvas/Excalidraw entries
- comment input can be typed, saved to the block, and persists across hover
- continuous-canvas pass: one root editing host, a five-action cross-block selection toolbar, explicit non-editable UI chrome, on-demand source detail, and a narrow-screen Intelligence drawer. This pass was statically checked with `node --check`, a single-host assertion, and CSS brace validation; refresh the already-open mock to exercise the browser-level selection path.
- Esc closes AI menu → insert strip → comment editor → suggestion card → lightGallery in that order
- table hover toolbar does not cover the table header
- all preview screenshots regenerated from the current build (the previous 07-09 set showed the removed permanent AI strips)
