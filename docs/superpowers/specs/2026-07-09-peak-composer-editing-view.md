# Peak Composer Editing View Design

**Status:** design proposal + static UI mock
**Date:** 2026-07-09
**Owner surface:** active Markdown editor, Document Copilot, attachment/table/callout editing
**Related research:** `docs/research/2026-07-09-obsidian-editor-view-ui-plugins/report.md`
**Editor tooling research:** `docs/research/2026-07-09-open-source-editor-ui-tools/report.md`
**UI mock:** `docs/gstack/peak-composer-editing-view-2026-07-09/index.html`
**Native asset references:** Obsidian Bases help, Obsidian JSON Canvas announcement/spec, Obsidian Excalidraw plugin docs.

## Summary

Peak Composer is a one-stop editing view for Obsidian notes. It keeps Markdown and Obsidian-native files as the source of truth, but gives the user a calmer document-editing layer for the places where Obsidian still feels too code-like: images, tables, callouts, link cards, native embeds, slash insertion, and AI-assisted block actions.

The design mock must be validated with real vault content and data-shaped native assets, not decorative placeholders. Image blocks should load real attachments. Canvas blocks should render JSON Canvas-shaped data. Excalidraw blocks should render from real Excalidraw content or an adapter output, not a hand-drawn static illustration that only resembles a drawing.

At the same time, the UI should not constantly label itself as "real data" or expose file names as decorative badges. Real data is a validation requirement, not a visible product feature. Source details belong in the bottom source strip, Ambient context, hover affordances, or documentation.

The core product statement:

> Peak Composer is a clean editing layer over Markdown and native Obsidian assets. It makes rich document blocks feel editable without turning the vault into a private rich-text format.

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
- Peak already has Atlas / Ambient panel surfaces for outline, search, comments, and context; Composer should reuse that product shell instead of rebuilding those columns inside the editor view.
- A credible mock must show a long, mixed real document. Short marketing-copy examples are not enough to evaluate writing density, Markdown syntax coverage, block controls, source trust, or native asset previews.

External AI editor references applied in this iteration:

- Notion AI supports inline improvement from selected text, `/AI` blocks, AI-generated summaries/action items/custom content, and an accept/discard/try-again review loop. Composer should borrow that local review loop, but keep Markdown diff as the gate.
- Feishu Docs emphasizes document blocks, AI QuickView, and AI-assisted comment answers inside the document context. Composer should borrow the block-local feel and contextual comments, but avoid Feishu collaboration chrome because Obsidian/Atlas already owns the surrounding workspace.
- The adaptation for Peak is therefore: type-aware and content-signal-aware hover AI actions near the current block, a local streaming suggestion card, and Ambient as the persistent but secondary context surface.

Peak Composer should therefore start as a document block editing view. The first version should make existing Markdown blocks easier to see, insert, modify, and hand off to AI.

The interaction direction should borrow from Feishu's block editing, but stay native to Obsidian:

- the document stays visually central;
- the top of the view is a quiet status strip, not a permanent insert/image/table/native command cluster;
- Markdown-native text formatting stays in shortcuts, Markdown syntax, and Obsidian behavior instead of a large font/size/mark toolbar;
- each paragraph/table/image/callout/native embed has a lightweight left-side block affordance;
- standard Markdown should be modeled at real block-node granularity: document title, heading, paragraph, list, checklist, quote, callout, code, math, table, and embed are distinct Composer blocks with distinct source ranges and AI defaults, not one oversized visual section;
- block affordances and object controls should stay hidden in the default reading state and appear on hover, keyboard invocation, or a short action feedback state;
- Composer should not keep one document block visibly active by default; Ambient may remember the last interacted block without drawing a permanent outline in the canvas;
- inserting content uses `+` / slash entry near the cursor, not a heavy always-open block palette;
- AI should behave like a block-local editing partner, not only a right-panel chat. Hovering a block may reveal a compact AI quick-action tray near that block; opening a suggestion should render a local streaming card with accept, retry, and close controls before any Markdown write;
- AI quick actions should be generated from block type plus content signals, not from a fixed universal menu. Paragraphs may get rewrite, question, or example suggestions by default; table conversion appears only when the text contains parallel dimensions, stages, paths, or comparison structure; image/diagram generation appears only when the text contains process, route, graph, attachment, Canvas, or Excalidraw signals; formula extraction appears only for variables, algorithms, thresholds, or LaTeX/math signals. Formula blocks can offer explain, split, rewrite LaTeX, and generate example; image blocks can offer caption, regenerate, annotate, and polish; table blocks can offer summary, column generation, formula, and data cleanup; native Base/Canvas/Excalidraw blocks can offer adapter-aware summaries and transformations;
- the right panel is an Ambient Intelligence surface that follows the current block, not a generic tabbed inspector;
- outline, search, gallery, and comment navigation remain in Atlas Panel.

## Product Boundary

Peak Composer owns:

- an alternate editor view for the active file;
- visual block rendering for standard Markdown structures;
- visual shells for Obsidian-native asset embeds such as Bases, Canvas, Excalidraw, PDF, audio, video, and other vault attachments;
- block selection, movement, insertion, and property editing;
- image/table/callout/link-card editing affordances;
- source sync status and safe fallback to Obsidian source mode;
- AI actions that operate on selected blocks.

Peak Composer does not own:

- replacing Obsidian's workspace or file explorer;
- duplicating Atlas Panel's outline, search, gallery, or comment navigation;
- fake collaboration chrome such as avatars, share buttons, or document title bars that do not exist in the plugin product model;
- building a Notion-style database system;
- forcing every note into a private block schema;
- converting `.base`, `.canvas`, Excalidraw, or other plugin-native files into Peak-owned data;
- global theme restyling for the whole vault;
- vault-wide linting, indexing, or knowledge graph features;
- destructive rewrites without a visible source diff or rollback.

## Experience Model

Peak Composer has four visible layers.

### 1. Document Canvas

The center of the view looks like an Obsidian note rendered as a document, not a code buffer and not a separate collaboration product. Text remains close to Obsidian Live Preview, but visual blocks become stable interactive objects. This is the Feishu-like part of the design: the page itself carries the work, while chrome stays quiet until the user selects or hovers a block.

The canvas should support:

- editable title and body text;
- current-block context for Ambient without permanent visible selection;
- inline block handles near the left edge of every active block;
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

It should also avoid always-visible Insert, Image, Table, Native file, and Intelligence buttons. Those actions belong near the current block, selected object, slash menu, or Ambient surface.

### 3. Block Tools

The user should not hunt through settings or command palette for common document actions. Tools appear near the selected object.

Tool surfaces:

- block `+` menu near the current line;
- left-side block handle for move, insert, remove, comment, and Intelligence actions;
- no always-visible AI generation strip below every section; AI generation should be invoked from the current block's `+`, slash menu, content-aware hover quick actions, or Ambient action so the document stays readable;
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

### 4. Ambient Intelligence And Source Sync

The right side of the Composer view should mirror the Ambient Push design direction: a persistent context-aware panel that follows the selected block and can show AI suggestions, patch previews, source trust, and native adapter actions.

It should not be a generic three-tab inspector labeled AI / comments / sources. Comments and sources can appear as contextual cards inside the Ambient panel, while their broader navigation remains in Atlas Panel.

The user must always know whether the rich surface is still writing clean Markdown.

Source sync should show:

- whether the selected block is standard Markdown;
- what syntax will be written;
- whether an advanced block requires a fenced format;
- a one-click path to source mode;
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

Block editing happens in place. The Ambient panel can show review, comments, source preview, and deeper settings, but common operations should stay near the block.

Examples:

- use the current block's `+` menu or Ambient Intelligence to insert a paragraph, table, image, formula, native embed, or AI draft, then preview the generated patch before any source write;
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

The bottom source strip confirms that the note is still safe Markdown. The Ambient panel can also show the source for the selected block without forcing the user to leave Composer.

### Return

The user can leave Composer at any time. The file remains readable in normal Obsidian, and uninstalling Peak Assistant should not make the note unusable.

## Screen Inventory

| Screen / surface | Primary job | Reads | Writes | Key actions |
| --- | --- | --- | --- | --- |
| Composer canvas | Edit the current note as a document | active editor buffer, block parse tree | Markdown transactions | select block, edit text, drag block, insert block |
| Minimal view strip | Keep source safety visible without adding product chrome | active mode, source sync state | view mode state only when host chrome lacks it | Source/Live fallback, Composer status |
| Current-line `+` menu | Insert a content block at the cursor | current cursor line | block insertion request | image, table, callout, link card, AI draft |
| Left block handle | Manipulate one block without opening a panel | selected block metadata | block movement / insertion / removal / comment / AI request | move, insert, remove, comment, Intelligence |
| Object toolbar | Fast rich-block actions | selected image/table/native block metadata | block transaction or adapter action | crop, zoom, annotate, row/column edit, open original, summarize |
| Inline AI suggestion | Review one proposed edit at the point of need | selected block text and AI patch candidate | accept/reject/diff request | apply patch, preview diff, ignore |
| Ambient Intelligence panel | Keep current-block AI and source context visible | selected block model, AI suggestions, source preview, native adapter state | AI patch request, comment, native adapter action | summarize, suggest, generate image, show source, rollback |
| Source sync strip | Preserve trust in Markdown | pending transactions, block grammar | view switch or rollback | open source, compare, rollback |
| Native asset block | Render and operate on Obsidian-native files inside the document | vault file link, target file metadata, adapter preview | original target file only through its adapter | open original, preview, summarize, comment, refresh |

## UI Layout

The static mock uses this layout:

```text
minimal source/status strip
document canvas with block gutter | Ambient Intelligence panel
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
- Ambient panel carries contextual AI/source/native actions;
- source preview is trust infrastructure, not the visual center.

The default desktop target is a normal Obsidian editor pane. Mobile should be designed separately because hover toolbars need tap or bottom-sheet behavior.

## Block Specifications

### Block Insert And AI Draft

MVP behavior:

- each block exposes insert through the left-side `+` handle and keyboard slash menu;
- the insert menu contains concrete block types such as paragraph, heading, list, quote, callout, formula, image, table, Base, Canvas, Excalidraw, and AI draft;
- AI draft is a single contextual action, not four permanent AI buttons in the reading flow;
- generation can stream in Ambient or an inline patch preview, but generated output remains a preview until accepted into the Markdown buffer or native asset adapter.

Source contract:

- paragraph and formula outputs write standard Markdown / LaTeX where possible;
- table outputs default to plain Markdown tables;
- image outputs initially create an image prompt or attachment proposal, not a hidden binary write;
- native file outputs must route through the target adapter and show source impact before write.

### Image Block

MVP behavior:

- paste, drop, or slash insert creates a visible image block;
- caption is editable under the image;
- width can be changed by drag handle or object toolbar;
- fullscreen viewing uses a LoveIt-style `lightGallery` integration with thumbnail and zoom plugins;
- crop, annotate, replace, open-original, and AI caption actions appear from the Composer image object toolbar;
- AI can suggest a better image prompt, generate an alternate image, or generate a caption;
- alignment supports left, center, right, full width;
- replace/open/copy/delete are available on hover;
- source preview shows the exact Markdown link.

Source contract:

- default to standard Markdown image or Obsidian wikilink image;
- preserve existing `alt` text and wikilink size syntax;
- avoid hidden metadata unless needed for advanced layout.
- viewer markup may wrap the image in a `.lightgallery` anchor for runtime behavior, but the persisted source remains a normal Markdown image or Obsidian wikilink image.

Advanced later:

- crop;
- annotate;
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
- toolbar overlays must not cover the header row or active cell content;
- source preview stays a plain Markdown table.

Source contract:

- ordinary tables stay ordinary Markdown;
- merged cells, typed columns, formulas, and rich styling require explicit upgrade;
- upgrading should show a warning that the block will become Peak-specific or HTML-backed.

Advanced later:

- merged cells or spreadsheet-like formulas that cannot round-trip to plain Markdown;
- typed columns;
- sortable rows;
- column width persistence;
- import/export to CSV.

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

### Ambient Panel

The Ambient panel is for current-block context, AI suggestions, source trust, and adapter actions. It should not become the only way to edit.

Ambient panel groups:

- current file and selected block;
- slide-out AI suggestions and patch previews;
- image prompt / generated image actions;
- table normalization and Markdown boundary warnings;
- native asset summaries and adapter actions;
- source preview and rollback.

## AI Integration

Peak Composer should make AI actions feel attached to document objects, not detached in chat.

Useful first actions:

- generate a contextual AI draft from the selected block through the `+` menu, slash menu, or Ambient action;
- turn selected paragraph into a table when it contains comparable dimensions, stages, sources, or alternatives;
- create a callout from selected text;
- write a caption for selected image;
- summarize a table;
- normalize table headings;
- extract action items from a section;
- convert a plain URL list into link cards;
- rewrite selected paragraph with a diff preview.

Execution boundary:

- app layer owns the active editor view and selected block;
- service layer can propose edits through an explicit request/response contract;
- no service-layer singleton should own editor runtime state;
- every AI edit should return a patch candidate, preview, or transaction plan before write.

Block-AI interaction decision (2026-07-11, finalized in the `peak-composer-editing-view-2026-07-09` mock):

- **Trigger**: one capsule menu per block — short action pills + a "指令" trigger that morphs the pill in place into a single-line instruction input (no second panel). A block with a proactive Copilot long suggestion upgrades to a combined card (gradient suggestion row + 生成, capsule row underneath).
- **Result splits by action nature, and the split is normative**: a *rewrite* of existing prose streams onto the paragraph in place and presents a **rendered, in-place, word-level diff** (del/ins on the text itself, `−N +N` count, accept/restore/retry); an *additive* action (questions, table, formula explanation, link card, proactive suggestion, anything on an object block) streams into a separate **insertion preview card** ("新增 · 生成到块下方", accept-write/retry/discard) and never mutates the original. Diff is reserved for same-text edits; additive output must not be shown as a diff.
- Both remain drafts until accepted, then enter the Markdown transaction / undo stack with an Ambient rollback entry — consistent with "every AI edit returns a preview before write" above.
- The mock's inline word diff is a real char-level LCS; production may upgrade to whole-word (Chinese segmentation) but the in-place, rendered, word-level *shape* is the requirement.
- See the mock README section "Block AI Interaction (2026-07-11 final)" for the full discussion, rejected alternatives, and preview screenshots.

## Technical Shape

This is a design document, not an implementation mandate. The open-source editor tooling research shows that Milkdown, MDXEditor, Vditor, Cherry Markdown, Tiptap, BlockNote, Lexical, Plate, and Editor.js all have useful ideas, but none should be assumed as a drop-in Obsidian editor replacement before round-trip testing.

The likely safe architecture is:

- `app/` owns view registration, editor mode commands, and active editor adapters;
- `ui/` owns React block components, the minimal view strip, block controls, object toolbars, Ambient panel, and mockable UI state;
- `core/` owns block model types and Markdown source contracts;
- `service/` owns AI actions that transform selected block content.

The first implementation should prefer CodeMirror 6 decorations, widgets, and controlled transactions. A full contenteditable replacement is too risky because it can break Obsidian cursor behavior, plugin compatibility, and source mapping.

External editors should be used in two narrower ways first:

- isolated prototypes that test Markdown round-trip behavior;
- UI pattern references for slash menus, block handles, object toolbars, table controls, and AI actions.

Important implementation rules:

- preserve line/position mapping for every block transaction;
- mount heavy React widgets only for selected or visible blocks;
- avoid global CSS overrides of Obsidian core editor;
- expose theme-safe tokens rather than hardcoded theme skins;
- keep mobile behavior behind a separate design pass.

## Implementation Phases

### Phase 0: Feasibility Spike

Goal: prove that the active editor can identify and decorate image/table/callout blocks reliably.

Deliverables:

- block parser spike for active editor buffer;
- selected block model with source range;
- one image widget with resize transaction;
- one table widget with cell focus;
- rollback path to source mode.

Exit criteria:

- source positions remain correct after edits;
- Obsidian undo/redo still works;
- switching modes does not corrupt the file.

### Phase 1: Composer Shell

Goal: ship the view shell without overcommitting to every block type.

Deliverables:

- minimal view strip;
- canvas shell;
- left block controls;
- Ambient Intelligence panel;
- source sync strip;
- current-block source preview.

Exit criteria:

- user can open Composer on any Markdown note;
- unsupported blocks fall back to Live Preview or source rendering;
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
- Ambient summaries for native assets.

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
- mode switch tests;
- large-note performance check with many blocks;
- theme compatibility smoke test.

User validation:

- ask three Obsidian users to insert and edit an image, table, and callout;
- watch whether they reach for source mode;
- record which actions they expected near the block versus in the Ambient panel.

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Source mapping drift | Wrong ranges can corrupt notes | block transactions must be range-based and covered by tests |
| Private syntax creep | Users may lose trust if notes stop being portable | standard Markdown by default, explicit advanced upgrade only |
| Overbuilt shell | A full Notion clone would delay the useful part | ship image/table/callout first |
| Theme conflict | Obsidian users heavily customize themes | use scoped classes and theme-safe variables |
| Mobile mismatch | Hover tools do not work on touch | keep mobile as a separate interaction pass |
| AI write anxiety | Users may fear invisible edits | patch preview, Ambient source card, source strip, rollback |

## Open Decisions

- What is the exact user-facing name: `Peak Composer`, `Document View`, or `Beautiful Editor`?
- Should link cards store metadata in fenced blocks, frontmatter sidecars, or cache only?
- How much table functionality can stay in plain Markdown before needing a rich block?
- Should Composer be a full editor mode or a dedicated view type opened beside the source editor?

## Mock Decisions Locked On 2026-07-15

- Block and formula-card drag reorder are part of the interaction contract; the left rail owns only the drag grip.
- `在下方插入 / 评论 / AI 建议` share a block-tail action row and the same toggle rule: first click opens the local surface, second click closes it. Choosing an insertion type creates an editable in-flow draft rather than a notification-only action.
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
