# Peak Composer Editing View Design

**Status:** design proposal + static UI mock
**Date:** 2026-07-09
**Owner surface:** dedicated Peak Composer View, Document Copilot, attachment/table/callout editing
**Related research:** `docs/research/2026-07-09-obsidian-editor-view-ui-plugins/report.md`
**Editor tooling research:** `docs/research/2026-07-09-open-source-editor-ui-tools/report.md`
**UI mock:** `docs/gstack/peak-composer-editing-view-2026-07-09/index.html`
**Native asset references:** Obsidian Bases help, Obsidian JSON Canvas announcement/spec, Obsidian Excalidraw plugin docs.

## Summary

Peak Composer is a one-stop editing view for Obsidian notes. It keeps Markdown and Obsidian-native files as the source of truth, but gives the user a calmer document-editing layer for the places where Obsidian still feels too code-like: images, tables, callouts, link cards, native embeds, slash insertion, and AI-assisted block actions.

The design mock must be validated with real vault content and data-shaped native assets, not decorative placeholders. Image blocks should load real attachments. Canvas blocks should render JSON Canvas-shaped data. Excalidraw blocks should render from real Excalidraw content or an adapter output, not a hand-drawn static illustration that only resembles a drawing.

At the same time, the UI should not constantly label itself as "real data" or expose file names as decorative badges. Real data is a validation requirement, not a visible product feature. Source details belong in the bottom source strip, Intelligence context, hover affordances, or documentation.

The core product statement:

> Peak Composer is a clean editing layer over Markdown and native Obsidian assets. It makes rich document blocks feel editable without turning the vault into a private rich-text format.

**Owner decision locked on 2026-07-22:** the production host is a dedicated Peak Composer View. It opens the same Markdown/native files through its own app-owned view and source adapter; it does not install decorations, widgets, state, or interaction behavior into Obsidian's existing Markdown CodeMirror editor. Users can leave Composer and open the same source in the standard editor without migration or format conversion.

**Component consistency design added for owner review on 2026-07-22:** Composer uses role-based component families, not one radius everywhere and not a separate visual grammar for AI actions. Peer controls in one toolbar share geometry and states; Block action capsules, compact selection/object tools, structural rail controls, review actions, status chips and panel shells remain intentionally distinct. The normative review matrix is [`2026-07-22-peak-composer-component-consistency.md`](./2026-07-22-peak-composer-component-consistency.md).

This should not be positioned as a full Notion clone, a Feishu clone, or a replacement for Obsidian's workspace. The useful lesson from **Feishu Docs** is not the collaboration chrome; it is the smooth block-level editing: current-block handles, in-place rich object controls, and AI suggestions that appear beside the content being edited.

Composer should also share the existing Peak / Atlas side-panel system. It should not duplicate outline, search, gallery, or comment navigation inside this view.

## Reader And Purpose

This document is for the product owner, designer, and implementation agent deciding what Peak Assistant should build after the Obsidian editor UI research.

After reading, the reader should be able to:

- explain what Peak Composer owns;
- review the proposed UI layout;
- understand the source-of-truth contract;
- split the feature into implementation phases;
- decide which parts are MVP and which parts should wait.

## Product Judgment

The opportunity is not another theme, typography toolbar, or full contenteditable editor. The research points to a narrower but stronger shape:

- tables are the strongest pain point;
- image insertion and resizing are the next strongest visual pain;
- callouts and link previews need better edit-time presentation;
- users still value plain Markdown and Obsidian compatibility;
- Chinese community adoption is often theme-driven, but the unmet product value is editing comfort, not another skin.
- Obsidian has more than Markdown notes: Bases, Canvas, Excalidraw drawings, PDFs, media, and plugin-owned files need to appear as first-class document elements without being converted into Peak-private storage.
- Peak already has Atlas navigation and Intelligence context surfaces; Composer should reuse those product boundaries instead of rebuilding outline, search, gallery, or comment columns inside the editor view.
- A credible mock must show a long, mixed real document. Short marketing-copy examples are not enough to evaluate writing density, Markdown syntax coverage, block controls, source trust, or native asset previews.

External AI editor references applied in this iteration:

- Notion AI supports inline improvement from selected text, `/AI` blocks, AI-generated summaries/action items/custom content, and an accept/discard/try-again review loop. Composer should borrow that local review loop, but keep Markdown diff as the gate.
- Feishu Docs emphasizes document blocks, AI QuickView, and AI-assisted comment answers inside the document context. Composer should borrow the block-local feel and contextual comments, but avoid Feishu collaboration chrome because Obsidian/Atlas already owns the surrounding workspace.
- The adaptation for Peak is therefore: type-aware and content-signal-aware hover AI actions near the current block, local anchored review, and an Intelligence sidecar whose Copilot Brief quietly projects proactive sensing.

Peak Composer should therefore start as a document block editing view. The first version should make existing Markdown blocks easier to see, insert, modify, and hand off to AI.

The interaction direction should borrow from Feishu's block editing, but stay native to Obsidian:

- the document stays visually central;
- the top of the view is a quiet status strip, not a permanent insert/image/table/native command cluster;
- Markdown-native text formatting stays in shortcuts, Markdown syntax, and Obsidian behavior instead of a large font/size/mark toolbar;
- each paragraph/table/image/callout/native embed has a lightweight left-side block affordance;
- standard Markdown should be modeled at real block-node granularity: document title, heading, paragraph, list, checklist, quote, callout, code, math, table, and embed are distinct Composer blocks with distinct source ranges and AI defaults, not one oversized visual section;
- block affordances and object controls should stay hidden in the default reading state and appear on hover, keyboard invocation, or a short action feedback state;
- Composer should not keep one document block visibly active by default; the app-owned focused-context projection may remember the last interacted block without drawing a permanent outline in the canvas;
- inserting content uses `+` / slash entry near the cursor, not a heavy always-open block palette;
- AI should behave like a block-local editing partner, not only a right-panel chat. Hovering a block may reveal a compact AI quick-action tray near that block; opening a suggestion should render a local streaming card with accept, retry, and close controls before any Markdown write;
- AI quick actions should be generated from block type plus content signals, not from a fixed universal menu. Paragraphs may get rewrite, question, or example suggestions by default; table conversion appears only when the text contains parallel dimensions, stages, paths, or comparison structure; image/diagram generation appears only when the text contains process, route, graph, attachment, Canvas, or Excalidraw signals; formula extraction appears only for variables, algorithms, thresholds, or LaTeX/math signals. Formula blocks can offer explain, split, rewrite LaTeX, and generate example; image blocks can offer caption, regenerate, annotate, and polish; table blocks can offer summary, column generation, formula, and data cleanup; native Base/Canvas/Excalidraw blocks can offer adapter-aware summaries and transformations;
- the right panel is an Intelligence sidecar with `Copilot / History`; its Copilot Brief follows the current block without becoming a generic inspector;
- outline, search, gallery, and comment navigation remain in Atlas Panel.

## Product Boundary

Peak Composer owns:

- an alternate editor view for the active file;
- visual block rendering for standard Markdown structures;
- visual shells for Obsidian-native asset embeds such as Bases, Canvas, Excalidraw, PDF, audio, video, and other vault attachments;
- block selection, movement, insertion, and property editing;
- image/table/callout/link-card editing affordances;
- source sync status and a safe open/switch path to Obsidian's standard Markdown editor or source mode;
- AI actions that operate on selected blocks.

Peak Composer does not own:

- replacing Obsidian's workspace or file explorer;
- duplicating Atlas Panel's outline, search, gallery, or comment navigation;
- fake collaboration chrome such as avatars, share buttons, or document title bars that do not exist in the plugin product model;
- building a Notion-style database system;
- forcing every note into a private block schema;
- converting `.base`, `.canvas`, Excalidraw, or other plugin-native files into Peak-owned data;
- global theme restyling for the whole vault;
- owning a second vault-wide linting, indexing, metadata-statistics, or knowledge-graph runtime. Composer may consume app-owned projections from those capabilities;
- destructive rewrites without a visible source diff or rollback.

## Experience Model

Peak Composer has four visible layers.

### 1. Document Canvas

The center of the view looks like an Obsidian note rendered as a document, not a code buffer and not a separate collaboration product. Text remains close to Obsidian Live Preview, but visual blocks become stable interactive objects. This is the Feishu-like part of the design: the page itself carries the work, while chrome stays quiet until the user selects or hovers a block.

The canvas should support:

- editable title and body text;
- current-block context for Intelligence without permanent visible selection;
- a disclosure triangle and drag handle near the left edge of every active block;
- one-line collapse for individual blocks and section collapse from a heading to the next same-or-higher heading;
- stable image/table/callout/link card chrome;
- vertical native asset blocks for Base, Canvas, Excalidraw, and attachments;
- source sync feedback at the bottom.

### 2. Minimal View Strip

The top of Composer should be mostly invisible. It can show the current view state, source safety, and a concise status label, but it should not compete with the document.

The strip may include:

- Composer/source status;
- active file/source safety state;
- small fallback path to Source or Live when the host Obsidian chrome does not already provide it.

It should not include font family, font size, bold, italic, underline, alignment, fake collaboration controls, share buttons, or document title chrome.

It should also avoid always-visible Insert, Image, Table, Native file, and Intelligence buttons. Those actions belong near the current block, selected object, slash menu, or Copilot session.

### 3. Block Tools

The user should not hunt through settings or command palette for common document actions. Tools appear near the selected object.

Tool surfaces:

- block `+` menu near the current line;
- left-side block handle for move, insert, remove, comment, and Intelligence actions;
- no always-visible AI generation strip below every section; AI generation should be invoked from the current block's `+`, slash menu, content-aware hover quick actions, or Copilot action so the document stays readable;
- a hover-only block AI tray may show two or three precomputed or on-demand suggestions. Each suggestion should expose a short trigger reason so the user understands why it appeared. The tray should disappear when the user is actively writing a comment or moving a block, so the local task remains visually clean;
- local AI suggestion cards should show a lightweight streaming state, then a reviewable candidate with accept/retry/close. Accepting a suggestion represents a draft Markdown transaction, not an immediate destructive rewrite;
- comment should be an actual inline editor tied to the block source range, so comments can become Copilot context rather than only visual markers;
- movement should be demonstrable in the mock: pressing and holding the block grip should reorder blocks directly while preserving the source-range contract. A click on the grip can teach the drag affordance, but should not open a discrete movement-command menu;
- object overlay for image blocks, shown on hover;
- cell and table overlay for tables, shown on hover;
- formula micro-controls for individual formula cards, not only the parent formula section;
- callout toolbar for type, title, color, and collapse;
- slash insert menu for keyboard-first insertion;
- inline AI suggestion chips or slide-out suggestions attached to the current block.

### 4. Intelligence Sidecar And Source Sync

The right side of the Composer view is an Intelligence sidecar with two top-level surfaces: `Copilot / History`. Copilot opens on a brief projected from the Ambient sensing runtime, then enters a task session and transient Review only when the user chooses work. History contains accepted transactions.

It is not a generic inspector and does not expose Ambient as a third tab. Contextual source actions may appear in the brief or session, while broad outline/search/gallery/comment navigation remains in Atlas Panel. AI candidate changes return to the real document anchor for Review rather than becoming a duplicate sidecar result list.

The user must always know whether the rich surface is still writing clean Markdown.

Source sync should show:

- whether the selected block is standard Markdown;
- what syntax will be written;
- whether an advanced block requires a fenced format;
- a one-click path to the standard Markdown editor/source mode;
- a small rollback trail for AI edits.

## One-Stop Workflow

### Entry

The user opens a note and switches between `Source`, `Live`, and `Composer`. The Composer mode should be available from:

- Obsidian / Peak view switch command;
- command palette command;
- right-click note command;
- Document Copilot action after generating formatted content.

### Write

Plain writing should feel quiet. The Composer view should not over-toolbar every paragraph. Text formatting can stay in Markdown syntax and native shortcuts; Composer's visible tools should focus on object editing and AI assistance.

### Insert

The user can insert blocks from:

- current-line `+` menu;
- slash menu;
- paste/drop behavior;
- AI action output.

Common insert types:

- image;
- table;
- callout;
- link card;
- Base embed;
- Canvas embed;
- Excalidraw drawing;
- PDF / media attachment;
- code block;
- math block;
- embedded note;
- AI draft block.

### Refine

Block editing happens in place. The Intelligence sidecar can show context, source inspection, task state and review navigation, but common operations should stay near the block.

Examples:

- use the current block's `+` menu or Copilot session to insert a paragraph, table, image, formula, native embed, or AI draft, then preview the generated patch before any source write;
- resize image by dragging the handle;
- open an image fullscreen through a mature viewer such as LoveIt's `lightGallery` stack, while crop, annotate, replace, and AI caption remain Composer edit actions;
- ask AI to generate a new image or suggest a better image prompt for the current image block;
- add a caption under the image;
- paste CSV into a table;
- add or remove table rows;
- auto-format Markdown table pipes and spacing;
- move rows or columns;
- set column alignment;
- sort by the current column;
- evaluate or preview table formulas;
- transpose rows and columns;
- export CSV;
- change callout type without touching syntax;
- convert a pasted URL into a card;
- ask AI to turn a paragraph into a comparison table only when the selected text already contains comparable dimensions, stages, or alternatives.

### Check Source

The bottom source strip confirms that the note is still safe Markdown. The Intelligence sidecar can also show the source for the selected block without forcing the user to leave Composer.

### Return

The user can leave Composer at any time. The file remains readable in normal Obsidian, and uninstalling Peak Assistant should not make the note unusable.

## Screen Inventory

| Screen / surface | Primary job | Reads | Writes | Key actions |
| --- | --- | --- | --- | --- |
| Composer canvas | Edit the current note as a document | dedicated-view source snapshot, block parse tree | explicit Markdown/native-file transactions | select block, edit text, drag block, insert block |
| Minimal view strip | Keep source safety visible without adding product chrome | Composer view state, source revision/sync state | Composer-local view state only | open standard editor, source preview, Composer status |
| Current-line `+` menu | Insert a content block at the cursor | current cursor line | block insertion request | image, table, callout, link card, AI draft |
| Left block handle | Fold or move one block/section without opening a panel | selected block metadata and heading boundary | Composer-local collapse state or block movement | collapse/expand, move |
| Selection toolbar | Combine deterministic rich-text operations with comment, Easy Copy and AI actions | one selected range or explicit cross-block ranges | Markdown/HTML-enhanced formatting transaction, scoped copy payload, comment or AI candidate | bold, italic, underline, strikethrough, paste URL/add link, text/Highlightr color, copy as text/Markdown/HTML/image, comment, polish, shorten, expand, ask AI |
| Object toolbar | Fast rich-block actions | selected image/table/native block metadata | block transaction, attachment transaction, copy payload or adapter action | image convert/rename/copy, zoom, row/column edit, open original, summarize |
| Inline AI suggestion | Review one proposed edit at the point of need | selected block text and AI patch candidate | accept/reject/diff request | apply patch, preview diff, ignore |
| Intelligence sidecar | Project proactive findings, task sessions and accepted history beside the document | focused context, findings, run state, source preview, transaction history | task/session actions and explicit review commands | discuss, inspect source, run capability, locate change, rollback transaction |
| Source sync strip | Preserve trust in Markdown | pending transactions, block grammar | view switch or rollback | open source, compare, rollback |
| Native asset block | Render and operate on Obsidian-native files inside the document | vault file link, target file metadata, adapter preview | original target file only through its adapter | open original, preview, summarize, comment, refresh |

## UI Layout

The static mock uses this layout:

```text
minimal source/status strip
document canvas with block gutter | Intelligence sidecar
bottom source sync strip
```

The screen should feel like a focused Obsidian editor view, not a marketing page and not a fake team document product. It should stay dense enough for real writing, but with enough visual affordance that images, tables, and native asset embeds no longer feel like raw Markdown.

Feishu-style constraints for the mock and implementation:

- borrow block interaction quality, not collaboration product chrome;
- no internal outline/search/gallery/comment column because Atlas Panel owns those surfaces;
- no permanent heavy left tool palette in the default writing state;
- no oversized generic right inspector as the primary interaction path;
- no typography toolbar for font family, font size, or marks that Markdown already handles;
- top chrome should stay minimal because insert, object, native file, and Intelligence actions are more useful at the block/object level;
- block actions live at the block's left edge or directly above the selected rich block;
- Intelligence sidecar carries proactive context, task execution status, source inspection, and History;
- source preview is trust infrastructure, not the visual center.

The default desktop target is a normal Obsidian editor pane. Mobile should be designed separately because hover toolbars need tap or bottom-sheet behavior.

## Block Specifications

### Block Insert And AI Draft

MVP behavior:

- each block exposes insert through the left-side `+` handle and keyboard slash menu;
- the insert menu contains concrete block types such as paragraph, heading, list, quote, callout, formula, image, table, Base, Canvas, Excalidraw, and AI draft;
- AI draft is a single contextual action, not four permanent AI buttons in the reading flow;
- generation progress appears in the Copilot session while the candidate streams at its real document anchor; generated output remains a preview until accepted into the Markdown source or native asset adapter.

Source contract:

- paragraph and formula outputs write standard Markdown / LaTeX where possible;
- table outputs default to plain Markdown tables;
- image outputs initially create an image prompt or attachment proposal, not a hidden binary write;
- native file outputs must route through the target adapter and show source impact before write.

### Image Block

MVP behavior:

- paste, drop, or slash insert creates a visible image draft at the current Composer anchor;
- direct clipboard paste is captured from the document caret, not from an existing image toolbar. It creates a new image Block at that exact position; when the caret is inside a paragraph, the paragraph becomes `before -> image Block -> continuation` without losing the surrounding text;
- direct clipboard paste reads the bitmap, derives an editable semantic filename, previews the target attachment path, and waits for confirmation before writing the Vault file and Markdown embed;
- automatic naming combines deterministic filename cleanup, collision suffixing and user naming rules with an optional AI candidate based on the current heading and image content. Program output and AI output remain visibly distinct;
- caption is editable under the image;
- width can be changed by drag handle or object toolbar;
- fullscreen viewing uses a LoveIt-style `lightGallery` integration with thumbnail and zoom plugins;
- the hover object toolbar exposes `全屏 / 编辑图片 / 重命名 / Easy Copy / AI 图注 / AI 改图`;
- Image Converter owns deterministic crop, rotate, flip, resize, WebP/PNG/JPEG conversion, compression quality and metadata stripping. Every operation renders against a preview copy;
- Easy Copy orders outputs as `plain text -> image -> Markdown -> HTML`. Selecting one is the final action: copy immediately, replace that tile with a transient check-mark success state, then close the menu. Image output passes the original visible HTMLElement and its click-time bounding box to a DOM-to-image adapter and copies the generated canvas/PNG directly; it must not open a second preview or confirmation surface. Browser internals may clone/serialize the element to rasterize it, but the internal clone must be locked to the captured source box, hidden from UI and filtered only for edit controls, comments, findings and review chrome. The output preserves list structure, table cells and line breaks, KaTeX output, images, typography, spacing, borders, colors and inline styles; it must not rebuild a branded/share-card layout or flatten content to prose;
- the whole display-formula group and every individual display-formula micro-block independently expose Easy Copy; choosing one micro-block captures only that rendered formula card;
- AI can suggest a better image prompt, generate an alternate image, or generate a caption;
- alignment supports left, center, right, full width;
- replace/open/copy/delete are available on hover;
- source preview shows the exact Markdown link.

Source contract:

- default to standard Markdown image or Obsidian wikilink image;
- preserve existing `alt` text and wikilink size syntax;
- avoid hidden metadata unless needed for advanced layout;
- original attachments are immutable by default. Converter or AI acceptance creates a new attachment and atomically swaps the controlled Markdown reference; undo restores the prior reference;
- rename updates the Vault file plus every reference included in the reviewed transaction. Collision handling appends a deterministic suffix instead of overwriting another asset;
- clipboard file writes follow the Vault attachment-folder policy. Object URLs and browser blobs are preview-only and never become persisted source.
- viewer markup may wrap the image in a `.lightgallery` anchor for runtime behavior, but the persisted source remains a normal Markdown image or Obsidian wikilink image.

Advanced later:

- OCR-assisted filename candidates and alt text;
- background removal, object erase and generative fill through an AI image adapter;
- two/four image grid;
- lightweight gallery;
- attachment compression pipeline.

### Table Block

MVP behavior:

- normal Markdown tables render as a cell grid;
- Tab and Enter move between cells;
- row/column insert and delete are available;
- CSV paste is supported;
- header row can be toggled;
- auto-formatting keeps Markdown pipes readable;
- row and column movement is available;
- column alignment can be changed visually;
- sorting can use the current column;
- formula preview can be shown before write;
- transpose is available for wide comparison tables;
- a rectangular selection can merge cells horizontally, vertically, or both;
- `图表` creates a separate candidate Chart Block rather than replacing the source table; bar, line and pie modes share one visible data/source contract and require explicit acceptance;
- toolbar overlays must not cover the header row or active cell content;
- source preview exposes whether the current block uses pipe Markdown or raw HTML table syntax.

Source contract:

- ordinary tables stay ordinary Markdown;
- the first `rowspan` or `colspan` explicitly upgrades only that block to a semantic raw HTML `<table>` stored inside the Markdown file; this is standard Markdown-compatible HTML, not a Peak-private table grammar;
- the upgrade is reversible through the same transaction/undo path and must explain why pipe tables cannot preserve merged cells;
- a Chart Block stores a fenced `chart` code block containing chart type, metric, labels and values. Composer renders the chart, while other editors retain an inspectable source block;
- typed columns, formulas, and rich styling require their own explicit upgrades and must not be smuggled into a plain table.

Advanced later:

- spreadsheet-like formulas that cannot round-trip to plain Markdown;
- typed columns;
- sortable rows;
- column width persistence;
- import/export to CSV.

### Code Block

MVP behavior:

- a fenced Code Block remains a source/display object with syntax highlighting and code-specific actions;
- selecting code must not open the rich-text selection toolbar;
- bold, italic, underline, strikethrough, text color and Highlightr are unavailable because they would mutate or corrupt executable/source text;
- copy source, explain, lint/check syntax and object-level AI review remain available.

Source contract:

- preserve the original fence, language identifier, whitespace and code payload;
- AI changes remain source patches reviewed inside the Code Block; no HTML-enhanced rich-text wrappers may be inserted into the fence.

### Callout Block

MVP behavior:

- Obsidian callout chrome stays visible while editing inner content;
- type, title, collapse state, and color can be changed visually;
- body supports normal Markdown editing;
- nested lists and links remain editable.

Source contract:

- write standard Obsidian callout syntax;
- do not create a private callout grammar for normal callouts.

### Link Card

MVP behavior:

- pasted URL can remain plain or convert to a card;
- card shows title, domain, short description, and optional thumbnail;
- user can switch between compact and wide card layouts;
- fallback always keeps the raw URL visible in source.

Source contract:

- first version can use a fenced metadata block only after explicit conversion;
- metadata cache should be optional and recoverable;
- if metadata fetch fails, the card degrades to a styled URL block.

### Obsidian Native Asset Blocks

Peak Composer must treat Obsidian-native and plugin-native files as first-class elements. The Composer shell can render them beautifully, but it must not become their storage owner.

First native asset types:

- **Base block:** renders a `.base` file or embedded base syntax as an editable database-like preview. The original `.base` file remains valid YAML and should still open in Obsidian Bases.
- **Canvas block:** renders a `.canvas` / JSON Canvas file as a compact map preview with open/zoom controls. The original file remains JSON Canvas.
- **Excalidraw block:** renders an Excalidraw drawing preview with open/edit controls through the Excalidraw plugin when available. The drawing file remains in the vault.
- **Attachment block:** renders PDFs, audio, video, and images with richer chrome while preserving the original vault attachment.

Source contract:

- the Markdown note stores a normal Obsidian link/embed such as `![[Projects.base]]`, `![[Knowledge.canvas]]`, or `![[Workflow.excalidraw.md]]`;
- Peak stores no private copy of the asset content;
- block settings that affect rendering should prefer standard file metadata or recoverable view state;
- if the native adapter is unavailable, the block degrades to a standard Obsidian link/embed.

AI contract:

- AI can summarize, explain, or suggest edits against native asset content;
- any write must route through the asset's own adapter or open the original editor;
- AI should never silently rewrite JSON Canvas, Base YAML, or Excalidraw data without a preview and rollback path.
- native preview blocks still need hover actions for move/insert/comment/Intelligence plus adapter actions such as open original, summarize, and comment.

### Math / Formula Blocks

MVP behavior:

- block formulas render as formulas, not code;
- individual formula cards have their own micro controls for move, insert, comment, and AI explain;
- inline formulas render naturally inside normal paragraphs;
- AI can generate an additional formula preview from a typed intent below the section.

Source contract:

- standard Markdown math and LaTeX remain the first write target;
- AI explanations should stay outside the formula source unless the user explicitly accepts an explanatory paragraph;
- formula card grouping is a rendering layer, not a private storage format.

### Slash Insert

The slash menu should be practical, not a command dumping ground.

First groups:

- Basic: paragraph, heading, checklist, quote;
- Media: image, gallery, embed;
- Data: table, CSV table;
- Structure: callout, divider, link card;
- AI: rewrite selection, turn into table, summarize section.

### Intelligence Sidecar

The Intelligence sidecar is for the proactive Copilot Brief, task sessions, source/context inspection, Review navigation and accepted History. It must not become the only way to edit or a second owner of document changes.

Its current product surfaces are:

- `Copilot Brief`: next moves, related materials and unplaced thoughts projected from sensing;
- `Copilot Session`: task conversation, capabilities, context chips, progress and run receipt;
- transient `Review`: navigation and explanation for candidates rendered at document anchors;
- `History`: accepted transactions, source-aware diff, location and safe rollback.

## AI Integration

Peak Composer should make AI actions feel attached to document objects, not detached in chat.

Useful first actions:

- generate a contextual AI draft from the selected block through the `+` menu, slash menu, or Copilot action;
- turn selected paragraph into a table when it contains comparable dimensions, stages, sources, or alternatives;
- create a callout from selected text;
- write a caption for selected image;
- summarize a table;
- normalize table headings;
- extract action items from a section;
- convert a plain URL list into link cards;
- rewrite selected paragraph with a diff preview.

Execution boundary:

- app layer owns the active Composer View and selected block;
- service layer can propose edits through an explicit request/response contract;
- no service-layer singleton should own editor runtime state;
- every AI edit should return a patch candidate, preview, or transaction plan before write.

Block-AI interaction decision (2026-07-11, finalized in the `peak-composer-editing-view-2026-07-09` mock):

- **Trigger**: one capsule menu per block — short action pills + a "指令" trigger that morphs the pill in place into a single-line instruction input (no second panel). A block with a proactive Copilot long suggestion upgrades to a combined card (gradient suggestion row + 生成, capsule row underneath).
- **Result splits by operation, and the split is normative**: a rewrite of existing prose streams onto the sentence itself and presents a rendered, in-place diff. A pure insertion mounts a real draft block at the intended source position. A deletion keeps the original block at that position with a removable deletion treatment. Object changes are rendered inside the real object: list item, table cell/row/column, image frame/caption, property row, formula or native preview. A detached result card cannot become the primary preview for any of these operations.
- Both remain drafts until accepted, then enter the Markdown transaction / undo stack and create an addressable History transaction — consistent with "every AI edit returns a preview before write" above.
- The mock's inline word diff is a real char-level LCS; production may upgrade to whole-word (Chinese segmentation) but the in-place, rendered, word-level *shape* is the requirement.
- Selection formatting is one combined toolbar. A single semantic text unit has no redundant scope label; true cross-boundary selection identifies the affected Blocks, list items or table cells. One visible cross-structure selection is one undo transaction, but its source patch is partitioned into inline semantic-unit subranges. Every format wrapper must stay inside its owning paragraph, list item, table cell, heading, quote or equivalent text-bearing unit; a wrapper must never contain `p`, `li`, `ul/ol`, `table`, `tr`, `td/th` or a Composer Block. Bold, italic and strikethrough use independent Markdown delimiters in each unit. Underline, text color and highlight use independent, removable HTML-enhanced Markdown in each unit. Links are restricted to one semantic unit. Font size is not exposed.
- Frontmatter expands from a fixed three-row sample into a typed property surface. The view distinguishes deterministic program-derived values from semantic AI candidates. The app-owned Vault field/tag profile remains a vault-wide index, but the current-note workflow exposes a persistent, low-emphasis `添加属性` row directly beneath the existing properties. It opens a bounded overlay picker with autofocus search, a small common-field set, exact/prefix/fuzzy discovery, inline custom creation, keyboard navigation, and a secondary internally scrolling `浏览全部` path. It must never render the whole Vault schema into the document flow. Fields already present, program-maintained fields, configured system prefixes, and single-use noise are excluded from the unopened picker; full schema statistics and conflict governance belong to a separate Vault-level surface. Choosing or creating a field closes the picker and creates an editable candidate at the real Frontmatter row. Only explicit acceptance writes YAML. The AI trigger is labelled `AI 建议` before execution; counts appear only when they represent real generated candidates, not the number of available actions. Every AI-derived field remains a per-field candidate until individually accepted.
- The left disclosure control and drag handle are one control family: identical 30×30 bordered hit targets, radius and icon weight. An expanded Block/section shows an up chevron whose action is collapse; a collapsed Block/section shows a down chevron whose action is expand. Do not rotate the up chevron into a left-pointing state. Ordinary Blocks collapse to one line, headings collapse the section, and neither operation writes Markdown.
- The interactive object-diff reference is [`diff-patterns-lab.html`](../../gstack/peak-composer-editing-view-2026-07-09/diff-patterns-lab.html).
- See the mock README section "Block AI Interaction (2026-07-11 final)" for the full discussion, rejected alternatives, and preview screenshots.

## Technical Shape

This is a design document, not an implementation mandate. The open-source editor tooling research shows that Milkdown, MDXEditor, Vditor, Cherry Markdown, Tiptap, BlockNote, Lexical, Plate, and Editor.js all have useful ideas, but none should be assumed as a drop-in Obsidian editor replacement before round-trip testing.

The accepted host architecture is:

- `app/` owns the dedicated view registration, open/switch commands, source synchronization, and active Composer adapters;
- `ui/` owns React block components, the minimal view strip, block controls, object toolbars, Intelligence sidecar projections, and mockable UI state;
- `core/` owns block model types and Markdown source contracts;
- `service/` owns AI actions that transform selected block content.

The dedicated view must not modify the existing Obsidian Markdown CodeMirror runtime. In particular, it must not register Composer-specific decorations, widgets, keymaps, state fields, transaction filters, or view plugins against the standard editor. Composer owns its own rendering/editing host and writes through explicit range/native-file transactions. The internal editing engine remains an implementation choice and may be tested independently, but it cannot make the standard CodeMirror editor a hidden runtime dependency of Composer behavior.

External editor engines should be used in two narrower ways first:

- isolated prototypes that test Markdown round-trip behavior;
- UI pattern references for slash menus, block handles, object toolbars, table controls, and AI actions.

Important implementation rules:

- preserve line/position mapping for every block transaction;
- detect source changes made outside Composer and reparse or fail closed before writeback;
- mount heavy React widgets only for selected or visible blocks;
- avoid global CSS overrides of Obsidian core editor;
- preserve a direct open/switch path between Composer and the standard Markdown editor without format conversion;
- expose theme-safe tokens rather than hardcoded theme skins;
- keep mobile behavior behind a separate design pass.

## Implementation Phases

### Phase 0: Feasibility Spike

Goal: prove that a dedicated view can parse, render and safely write image/table/callout blocks without modifying the existing Markdown editor.

Deliverables:

- dedicated Composer View registration and file-open adapter;
- block parser spike over the active file source;
- selected block model with source range;
- one image block with resize transaction;
- one table block with cell focus;
- external-source revision detection and a safe switch back to the standard editor.

Exit criteria:

- source positions remain correct after edits;
- Composer undo/redo and transaction rollback remain source-safe;
- editing or reopening the same file in the standard editor does not corrupt or convert it;
- Composer refuses or rebases a write when the source revision changed externally.

### Phase 1: Composer Shell

Goal: ship the view shell without overcommitting to every block type.

Deliverables:

- minimal view strip;
- canvas shell;
- left block controls;
- Intelligence sidecar shell;
- source sync strip;
- current-block source preview;
- explicit `Open in Peak Composer` and `Open in standard editor` paths.

Exit criteria:

- user can open Composer on any Markdown note;
- unsupported blocks fall back to safe source/rendered blocks inside Composer or can be opened in the standard editor;
- no vault-wide style regressions.

### Phase 2: First Three Blocks

Goal: solve the three most visible editing pains.

Deliverables:

- Image Block;
- Table Block;
- Callout Block;
- slash insert for those blocks;
- AI actions for image prompt/caption and table conversion.

Exit criteria:

- image resize writes correct Markdown;
- table edits round-trip to Markdown;
- callout editing keeps the visual shell stable.

### Phase 3: Link Cards And AI Patch Review

Goal: make Composer feel connected to Document Copilot.

Deliverables:

- link card conversion;
- block-level AI action menu;
- diff preview for generated edits;
- rollback trail for the latest AI write.

### Phase 4: Native Asset Blocks

Goal: make Obsidian-native and plugin-native assets feel first-class in the document without taking ownership of their storage.

Deliverables:

- Base block preview;
- Canvas block preview;
- Excalidraw block preview;
- open-original and adapter fallback behavior;
- Copilot summaries for native assets.

### Phase 5: Advanced Blocks

Only after the Markdown-safe path is reliable:

- rich table upgrade;
- image gallery;
- stronger native asset skins;
- mobile bottom-sheet editing;
- shared style settings.

## Validation Plan

Design validation:

- review the static mock against the product boundary;
- check whether the single long document communicates writing density, Markdown syntax coverage, object editing, and native asset handling without explanation;
- verify that no duplicate outline/search/gallery/comment column appears inside Composer;
- ask whether image/table/native-file actions are visible at the point of need.

Technical validation:

- editor transaction tests for source mapping;
- round-trip tests for Markdown image/table/callout syntax;
- undo/redo tests;
- Composer/standard-editor switch tests and external source-revision conflict tests;
- large-note performance check with many blocks;
- theme compatibility smoke test.

User validation:

- ask three Obsidian users to insert and edit an image, table, and callout;
- watch whether they reach for source mode;
- record which actions they expected near the block versus in the Intelligence sidecar.

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Source mapping drift | Wrong ranges can corrupt notes | block transactions must be range-based and covered by tests |
| Private syntax creep | Users may lose trust if notes stop being portable | standard Markdown by default, explicit advanced upgrade only |
| Overbuilt shell | A full Notion clone would delay the useful part | ship image/table/callout first |
| Theme conflict | Obsidian users heavily customize themes | use scoped classes and theme-safe variables |
| Mobile mismatch | Hover tools do not work on touch | keep mobile as a separate interaction pass |
| AI write anxiety | Users may fear invisible edits | anchored patch preview, source inspection, source strip, accepted History and rollback |

## Open Decisions

- What is the exact user-facing name: `Peak Composer`, `Document View`, or `Beautiful Editor`?
- Should link cards store metadata in fenced blocks, frontmatter sidecars, or cache only?
- How much table functionality can stay in plain Markdown before needing a rich block?

## Host Decision Locked On 2026-07-22

- Peak Composer is a dedicated Obsidian view type over the same Markdown/native source files.
- It does not augment or replace the existing Markdown CodeMirror editor.
- Switching views changes the editing surface, not the source format or file ownership.
- Source revision checks, explicit transactions and fail-closed conflict handling protect edits made from either view.

## Block Action Row Decision Locked On 2026-07-22

- A hovered or focused Block exposes one row, ordered `在下方插入 / 复制 / 评论 / contextual AI actions / History / 指令`.
- Contextual AI actions are visible in that row. Do not add an `AI 建议 · N` button that must be clicked to reveal them.
- `在下方插入` keeps the existing toggle and in-flow draft behavior; this decision changes its placement, not its semantics.
- Merely revealing the row never runs AI. Clicking an AI pill or submitting `指令` creates the existing review-only candidate transaction.
- The row is transient reading chrome, excluded from copied images/content and hidden during text selection, clean reading and collapsed-Block states.

## Historical Mock Decisions From 2026-07-15

This section preserves the original mock decisions for traceability. Its three-tab Intelligence wording is superseded by the current [`Composer Intelligence Sidecar UI Contract`](2026-07-15-composer-intelligence-sidecar-ui.md): the current top level is `Copilot / History`, while Ambient is a sensing/runtime projection inside the Copilot brief.

- Block and formula-card drag reorder are part of the interaction contract; the left rail owns only the drag grip.
- Historical note: this version used `在下方插入 / 评论 / AI 建议` with a second AI-menu toggle. The current Block Action Row decision above supersedes that hierarchy; only the insert action retains its first-click-open / second-click-close behavior.
- The Intelligence dock has three equal modes: Copilot, Ambient, and History. Editing history is not nested under Ambient.
- Copilot keeps its composer at the bottom and automatically assembles focused-object, nearby, and high-confidence related context; one context button exposes or adjusts that bundle instead of a permanent current-block/section/document selector.
- Ambient Push is not a chat transcript. It shows inferred Current Work State, Session Thought Trace, and confidence-labelled related notes; paths and signal details stay collapsed until requested.
- History records accepted content transactions, locates the changed block, shows before/after source, and rolls back the actual mock state.
- Structural comparisons are vertical. A source list/formula/table appears above the proposed object, never squeezed into a permanent left/right split.
- Image and native-object generation show a real waiting/streaming lifecycle. Mermaid, Canvas, and Excalidraw re-render after each typed patch before acceptance.
- The bottom Markdown status strip is compact by default and expands only on request; it must never become a second permanent inspector.

The canonical per-block operation matrix is [`2026-07-15-composer-block-ai-capability-contract.md`](2026-07-15-composer-block-ai-capability-contract.md). It separates fixed editor operations, evidence-triggered Copilot Review suggestions, and incremental native-object generation; UI implementations should not recreate that policy as component-local label arrays.

## External Format References

These references matter because Peak Composer must not accidentally take ownership of formats that already have Obsidian-native or plugin-native storage.

- Obsidian Bases creates `.base` files, and Bases syntax is valid YAML that defines views, filters, and formulas.
- Obsidian Canvas uses the JSON Canvas format. JSON Canvas files use the `.canvas` extension and are meant to be readable, interoperable, and extensible.
- Obsidian's Canvas product page describes Canvas as an infinite visual space where notes and media can be embedded, and Canvas views can be embedded in notes.
- The Obsidian Excalidraw plugin stores and edits Excalidraw files in the vault and supports embedding drawings into documents.

Design implication:

- Peak can render a better shell for these assets.
- Peak can add comments, AI summaries, open/edit shortcuts, and source trust indicators.
- Peak must leave the original storage format intact.
- If an adapter is missing, the user should still see a normal Obsidian link/embed fallback.

## V1 Acceptance Criteria

Peak Composer V1 is ready when:

- a user can open a normal Markdown note in Composer;
- image, table, and callout blocks have visible edit affordances;
- each supported block round-trips to readable Markdown;
- unsupported blocks do not break the note;
- switching back to Source or Live mode is instant and safe;
- AI actions produce reviewable edits rather than silent rewrites;
- the feature can be disabled without losing content.

## Do Not Build First

Do not start with:

- a new database layer;
- a global workspace replacement;
- a private all-block document format;
- a full mobile editor;
- a theme marketplace;
- complete spreadsheet parity;
- automatic AI rewriting without review.

The useful first product is smaller and sharper: make the existing Markdown note feel like a real document while the user edits the blocks that currently hurt most.
