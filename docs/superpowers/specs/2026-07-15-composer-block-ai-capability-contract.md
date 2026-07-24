# Composer Block AI Capability Contract

**Status:** product contract and implementation roadmap  
**Date:** 2026-07-15  
**Updated:** 2026-07-24 — object-native table range selection; message-embedded run artifacts, anchored streaming review, and accepted-transaction linkage
**Related mock:** [`docs/gstack/peak-composer-editing-view-2026-07-09/index.html`](../../gstack/peak-composer-editing-view-2026-07-09/index.html)  
**Current IA lab:** [`docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html`](../../gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html)
**Parent design:** [`2026-07-09-peak-composer-editing-view.md`](2026-07-09-peak-composer-editing-view.md)
**Modular implementation architecture:** [`2026-07-24-peak-composer-ai-capability-modularity-architecture.md`](2026-07-24-peak-composer-ai-capability-modularity-architecture.md)

## 1. Why This Contract Exists

Composer currently has three kinds of intelligence that are easy to confuse:

1. **Fixed block operations** are predictable tools attached to a block type. A list can be reordered or converted to a table; an image can be opened, cropped, annotated, or captioned. These actions exist even before an AI review.
2. **Copilot Review suggestions** are findings from reviewing the actual document. They appear only when there is evidence, such as a missing list item, an unsupported claim, a broken link, or a process paragraph that would benefit from a diagram.
3. **Incremental generation operations** change a structured object over time. Mermaid can gain a node and then an edge; Canvas can gain cards one by one; an image goes through prompt planning and generation before a bitmap exists.

The UI must never show generic `AI paragraph / AI table / AI image / AI formula` buttons under every paragraph. The block type defines what is possible; document evidence determines what is worth suggesting now.

## 2. Shared Interaction Grammar

### 2.1 Reading, focus, and menus

- Reading state stays clean. Hover adds only a subtle block boundary and reveals the drag handle and local block tail.
- Click focuses a block. Focus updates Intelligence and keeps its local controls reachable.
- `在下方插入`, `Easy Copy`, `评论`, and `AI 建议` share the block-tail hover row. Insert/comment/AI are one-click toggles; Easy Copy opens one format chooser for text, Markdown, HTML or image output.
- The left rail owns disclosure/collapse and press-and-hold drag. Insertion, comments, and AI do not create a second left-side toolbar.
- Cross-structure text selection remains native. The selection toolbar combines deterministic formatting, Paste URL, Easy Copy, comment and AI actions. It omits a label for one semantic text unit and labels real cross-Block, cross-list-item or cross-table-cell scope.
- Table range selection is object-native, not browser text selection. Primary-pointer drag selects the rectangle between two cells; `Shift + click` extends from the existing anchor. The same model supports one-row horizontal ranges, one-column vertical ranges, full rectangles, and ranges crossing `thead`/`tbody`. Selection tint must preserve every internal grid line, draw one continuous outer perimeter, and place the floating action toolbar outside the table so it cannot intercept another cell. Double-click returns to text editing inside one cell.
- Bold, italic, strikethrough, underline, text color and Highlightr may span paragraphs, Blocks, list items and table cells, but the visible range is compiled into one inline patch per semantic unit inside `p / li / td / th` (or the equivalent text-bearing element). These patches share one transaction/undo ID. No formatting element may wrap a Block, list item, row, cell or table; otherwise Markdown structure and browser layout are corrupted. Standard formats preserve per-unit Markdown syntax; underline/color/mark use per-unit removable HTML-enhanced Markdown. Pasting an `http(s)` URL over a non-collapsed one-unit range wraps that text as one Markdown link; a link cannot span multiple semantic units. Invalid URL, collapsed cursor, multi-unit range and ordinary text keep normal paste semantics. Font size is not exposed.

### 2.2 Result placement

AI results are rendered where the resulting object will live:

| Operation | Review surface |
| --- | --- |
| Rewrite the same prose | Word-level diff directly on the block |
| Edit or reorder a list/checklist | Item-level edits, inserts, deletes and move markers inside the real list |
| Patch a table | Cell/row/column/schema markers inside the real table |
| Insert a new object | Real editable draft at the insertion position |
| Delete an object | Original object at its real position with a recoverable deletion treatment |
| Change metadata | Changed fields and tags inside the metadata block |
| Change a native diagram/file | Re-rendered preview after every typed source patch, in the same object shell |
| Replace/generate an image | Timed generation state, then original/candidate switching in the same image frame; alt/caption diff separately |

All review surfaces use one transaction footer: status, action name, targeted instruction when model output can be regenerated, version/history navigation, `接受`, `还原/丢弃`, and optional `重试`. A result must not be represented by an explanatory paragraph when the product can render the actual proposed object. A prompt, trigger label, suggestion reason, or “generate a new X” sentence is provenance—not candidate content. Structured targets such as Base, table, chart and native diagrams use an object-shaped progress renderer and resolve into the typed object; they must not flash raw source unless source/code is itself the requested output.

### 2.3 Object-native comparison rule

The first review surface is the object itself. Text, headings and links use inline diff; lists use item-level markers; tables use cell/row/column markers; images use one frame with original/candidate switching; Frontmatter uses field rows; formulas and native objects re-render typed patches in their existing shell. A larger vertical or `Before / After` comparison is an optional inspection surface only when the object-native view cannot explain a schema, geometry or format conversion legibly. It must not replace the anchored document preview.

### 2.4 Generation lifecycle

Every costly generation exposes real progress:

1. queued and context assembled;
2. model streaming or source patches arriving;
3. preview repeatedly re-rendered;
4. generation complete and collected into a transient `ProposedChangeSet`, still unwritten;
5. Review navigates the pending changes in document source order;
6. explicit acceptance writes each Markdown or native-file change and creates one independent History transaction for that accepted change.

History stores accepted transactions, not findings, pending previews, rejected changes, stale changes, hovers, or abandoned candidates. A costly unresolved candidate may stay in the active session cache so the user can reopen it before the review session ends without presenting it as document history.

Every model-generated output keeps a variant lifecycle inside the same anchored review transaction: `variants[]`, one `activeVariantId`, targeted instruction, previous/next/history navigation, and explicit acceptance of one completed active variant. Regeneration appends instead of overwriting. This applies to prose rewrite/insert, semantic filename, caption, AI image edit, Base/native typed generation, and other model-derived objects. Deterministic crop/rotate/format operations use preview/restore and document Undo/Redo rather than pretending to create model variants.

### 2.5 Clipboard and attachment transaction rule

- Easy Copy is one output contract used by a selected range, a whole Block, and an addressable formula micro-block. It exposes `plain text / Markdown / HTML / image`; the image branch clones and rasterizes the existing rendered target without restyling or flattening it. Lists, tables, KaTeX, images and inline styling keep their current visual structure. Plain text and source output preserve semantic newlines and indentation, especially fenced code, list items and table rows. Mermaid image/plain output addresses the rendered diagram while Markdown addresses authoritative fenced source; object header chrome is excluded. Only Composer chrome, comments, findings and pending patches are excluded. A formula group and each formula card can be copied independently.
- Clipboard permission failure must be visible. Text copy may use the platform fallback; image copy may offer PNG download. The UI must not report a successful system copy when the browser or Obsidian host denied it.
- Pasting an image is a collapsed-caret document operation, not an existing-image toolbar action. It creates a new image Block at the caret; a mid-paragraph caret splits the text into a preceding paragraph and continuation paragraph around that image Block. The bitmap, proposed attachment path, semantic rename and Markdown embed remain one pending transaction until the user accepts.
- Deterministic image operations include filename sanitation, collision suffixing, resize, crop, rotate, flip, compression, format conversion and metadata stripping. Rectangle crop is direct manipulation with movable geometry and resize handles; free crop directly records a lasso. Rotation exposes discrete left/right 90° operations plus a bounded straighten adjustment. Their exact geometry and transforms persist into the candidate preview and survive returning to adjustments. AI may propose semantic names, alt/caption text, background removal, object erase or generative edits, but those are separate versioned reviewable candidates. AI image edit first collects an instruction or editable preset and only then generates.
- Existing attachments are immutable by default. Accepting a conversion/edit writes a new attachment and swaps the controlled reference; accepting rename moves the attachment and updates every reference included in the reviewed transaction. Undo restores the previous reference and keeps recovery information for the original asset.

### 2.6 Inline link navigation rule

- A live Vault wikilink and an external URL remain semantic, keyboard-focusable links in Composer. AI targeting must not replace their primary navigation semantics.
- Clicking a Vault link delegates its exact note, subpath and anchor to the Obsidian host. Clicking an external link opens the preserved real URL without replacing the Composer document.
- The anchored hover surface leads with the direct destination (`打开 note.md` or `访问 https://…`); relationship explanation, target synchronization, summary and source-check AI actions follow it. Both the inline link and the destination control navigate to the same target.
- A stale Vault link is explicitly non-navigable and offers repair/removal instead of pretending the deleted target can open.

## 3. Capability Classes

### Fixed operation

Always available for a compatible block. It should be deterministic or have a clear editor meaning. Examples: sort table, edit formula source, open Canvas, crop image.

### Contextual Copilot suggestion

Produced by document review or a strong local signal. It includes the evidence that triggered it. Examples: “this list mixes stages and structures; convert to a table”, “this claim lacks a source”, or “this Mermaid flow has no failure branch”.

### Incremental operation

Produces one or more typed patches and re-renders after each patch. It can be AI-assisted but must preserve the adapter/source contract. Examples: add one Canvas node, add one Mermaid edge, or append a Base filter.

### Direct edit

Normal in-place editing without AI. Task checkboxes, table cells, headings, links, tags, and captions remain directly editable.

## 4. Markdown Core Capability Matrix

| Core type | Fixed direct operations | Contextual Copilot Review suggestions | Incremental / generative operations | Writeback contract |
| --- | --- | --- | --- | --- |
| Frontmatter / properties | Edit value; add/remove tag; normalize date; copy source; open Vault field statistics | Property warning; missing schema field; duplicate/near-duplicate tag; singleton/rare key; type conflict; stale timestamp | Deterministic program fill for derivable values; semantic AI proposal one field/tag at a time | Show origin, changed values and candidate tags inside the metadata block; accept writes only the reviewed YAML fields |
| Document title / H1 | Rename; change heading level; copy link | Shorten title; clarify scope; propose subtitle or next-level outline when structure is missing | Stream a new heading or outline below the title | Rename is an in-place text diff; outline is a real inserted heading/list |
| Heading H2-H6 | Rename; promote/demote; move section | Missing bridge; section too broad; reader question; duplicate heading | Generate child outline or section draft | Heading rewrite stays in place; new structure is inserted below |
| Paragraph | Edit; split; merge; turn into quote/callout/list; apply bold/italic/strike Markdown or underline/text-color/highlight HTML enhancement; inspect a styled token's source on hover/focus | Polish; shorten; add example; unsupported claim; missing source; process suitable for a visual; parallel dimensions suitable for a table; propose a new token-level emphasis/color style | Stream rewrite, citation, example, formula, or visual only when its trigger exists | Rewrite is an in-place diff; new formula/image/table is rendered as a real draft object. Inline wrappers are written inside each semantic text unit; AI style proposals remain previews until an explicit formatting transaction is accepted |
| Bullet / numbered list | Add/remove item; indent/outdent; reorder; switch bullet/number; convert to checklist/table | Missing item; mixed dimensions; poor order; duplicate items; action list not expressed as tasks | Insert one item, reorder items, or create a proposed table | Edit/insert/delete/move markers stay inside the real list. A list-to-table review keeps that real list visible exactly once and shows only the proposed table at the same anchor; it must not clone, dim, or restate the original list. Accept replaces the list; dismiss leaves it unchanged |
| Checklist | Toggle; edit item; add/remove; indent; reorder by priority/status | Missing owner/deadline; ambiguous action; priority mismatch; completed-item cleanup | Reorder or enrich individual tasks | Item-level diff stays in the checklist and preserves checkbox state; accept patches only the addressed items |
| Quote | Edit; convert to paragraph; attach source/footnote | Missing attribution; quote too long; unclear relevance | Generate citation metadata or a short explanation below | Quote text diff is in place; source note is inserted below |
| Callout | Edit title/body; change callout type; collapse; convert to paragraph | Type does not match meaning; missing warning/action; callout too dense | Generate a better title or split into multiple callouts | Type/title/body changes render inside the same callout |
| Internal link | Open; rename alias; replace target; show backlinks | Broken target; better canonical target; target summary is stale | Search and propose replacement targets | Link patch is inline and preserves `[[target|alias]]` syntax |
| External link | Open; copy; fetch metadata; convert to link card | Dead URL; missing title; citation quality warning; snapshot recommended | Fetch title/summary/image and build a link card | Inline link patch or real link-card draft; never an explanatory card |
| Footnote / citation | Jump to definition; edit; move definition | Missing definition; source mismatch; unsupported quote | Generate or repair the definition | Footnote reference and definition update in one range-safe transaction |
| Image / attachment | Direct paste; semantic rename review; fullscreen lightGallery; Easy Copy; zoom/pan; direct rectangle/free crop; left/right 90° rotate plus straighten; flip/resize/compress/format/metadata; edit caption; replace; compose several images into one `grid / hero / strip / story` HTML Block | Missing caption/alt; semantic filename candidate; suggest diagram/photo style or multi-image composition; image inconsistent with nearby text; regenerate/edit variant | Prompt planning, image understanding, background removal/object erase/generative editing, progressive preview | Paste is one attachment+embed draft; crop geometry and transform state persist into the visible candidate; local conversion and AI edits write a new attachment; rename/caption/AI-edit keep targeted variants and history; rename updates file+reviewed references; original asset stays recoverable; an existing caption streams and diffs directly in its `figcaption`, with review inside the same figure; only a missing caption creates a caption slot, never a sibling paragraph. A multi-image composition remains one raw HTML block in the Markdown file, keeps the individual attachments and captions, and synchronizes its `data-layout` so Markdown Preview renders the same arrangement |
| Markdown table | Native text selection inside a cell; drag/Shift continuous rectangular cell selection; `Cmd/Ctrl-click` discontinuous cell toggle; horizontal/vertical/cross-row ranges; row/column; merge; clear selection; delete; align; sort; formula; transpose; paste/export CSV | Poor schema; repeated values; missing column; summarize; derive formula; convert prose/list | Patch a cell, row, column, formula, or schema one step at a time | Text selection remains a native inline range. Cell selection is a distinct object range with preserved grid lines and an external floating toolbar. Discontinuous cells remain independently visible; merge enables only when they form a complete rectangle inside one table section. Cell/row/column changes stay inside the real table; the first `rowspan/colspan` upgrades only that block to raw HTML because pipe Markdown cannot represent merged cells |
| Chart block | Switch bar/line/pie; inspect fenced source; copy; replace source table | Wrong chart type; unreadable scale; missing label; misleading aggregation | Derive typed series/config from visible table data or a reviewed query | Type controls are real tabs with exactly one active state; every switch re-renders the chart and synchronizes fenced `chart` source; candidate remains separate until accepted |
| Inline math | Edit LaTeX; convert to display math; copy source | Undefined variable; malformed expression; notation mismatch | Propose corrected expression or variable definition | Rendered formula stays visible with source diff available |
| Display formula | Edit source; explain; split; variable table; number equation; Easy Copy this formula or its parent formula group as text/LaTeX/HTML/exact rendered image | Formula too dense; undefined symbol; likely error; prose explanation missing | Add named subexpressions, definitions, derivation steps, or an explanatory diagram | Keep the rendered formula in its object shell and expose the LaTeX patch. Formula detail state is keyed by `(formulaId, detailType)`: the same formula may keep `explain + split + variables` open together, and different formulas may keep any combination open together. Reopening the same key focuses its existing surface rather than duplicating it; closing or regenerating one key never closes another. Every detail surface owns a targeted AI instruction, regenerate action, candidate versions/history, active-version acceptance and independent close. Each variable table stays inline and lists only its formula; no parent projection or implicit cross-formula scope is allowed. Image copy preserves KaTeX rather than emitting raw source; accepting split writes the active typed math candidate, while accepted explanation/variable views remain formula-local annotations |
| Code block | Edit; language switch; copy; wrap/unwrap | Missing language; syntax issue; explanation/test/example requested | Stream code diff or generate companion output block | Code diff remains inside the block; source fence, semantic newlines and indentation are preserved in plain/Markdown copy |
| Mermaid | Preview/source toggle; shared Easy Copy; open editor | Missing branch; disconnected node; unclear labels; flow inconsistent with prose | Add/remove/update node or edge per patch and re-render after each patch | Header owns only preview/source mode; copy and AI live in the shared flattened Block row; Mermaid source is authoritative; preview is refreshed before accept |
| Embed / transclusion | Open source; refresh; convert to link; show source range | Stale embed; context mismatch; missing surrounding explanation | Generate a summary or replace the target reference | Preserve native embed syntax and target path |
| Horizontal rule / spacer | Delete; move; convert to section break | Excessive break or missing section boundary | None by default | Direct Markdown edit only |

## 5. Obsidian Native and Plugin Core Matrix

| Core type | Fixed operations | Contextual Copilot suggestions | Incremental operations | Source-of-truth boundary |
| --- | --- | --- | --- | --- |
| Base `.base` | Preview/source; switch view; compact sort/filter/property controls; open file; copy path/source | Better view; missing filter; useful formula/property; result set too broad | Add/update one YAML view, filter, formula, or property at a time | Valid Base YAML remains authoritative; unsupported views fall back to native open |
| JSON Canvas `.canvas` | Preview/source; zoom; open Canvas; copy source/image/path | Missing node/edge; disconnected cluster; summarize nodes; convert prose into cards | Add/update/remove one node or edge and re-render continuously | JSON Canvas nodes/edges stay valid and importable |
| Excalidraw `.excalidraw.md` | Preview/source; fullscreen; open drawing; copy image/source/path | Missing relation; diagram too dense; extract process; improve layout/labels | Add/update/remove elements and bindings in small patches | Excalidraw text/data remains plugin-compatible; preview is not a flattened replacement |
| Dataview / query block | Preview/source; run; copy result; change display mode | Query error; expensive scan; better grouping/filter | Patch one clause and rerun | Query source remains Markdown; results are derived |
| PDF / media embed | Open; fullscreen; page/time jump; annotate; copy reference | Relevant page/segment; missing citation; extract table/image | Generate anchored notes or citations | Original attachment is immutable; annotations and references are separate data |

## 6. Findings, Proposed Changes, and Review

Copilot must not collapse “something may be worth doing” and “content is ready to be written” into one object. The contract has three separate types.

### 6.1 `SuggestionFinding`

A `SuggestionFinding` is an evidence-backed opportunity surfaced in the Copilot Brief. It does not contain an accepted document mutation and is not part of History.

- `id`: stable finding id;
- `fingerprint`: document/source identity + canonical anchor + finding kind + evidence signature; used to deduplicate detectors and refreshes without treating different proposed actions as different problems;
- `anchor`: block id, source range, and source revision when the finding is local;
- `evidenceRevision`: the source/evidence revision against which this finding was validated;
- `kind`: claim, evidence, structure, style, link, visual, math, task, metadata, or native-object;
- `evidence`: matched text, structural signal, broken reference, or cross-note relation;
- `proposedAction`: a compatible capability id;
- `confidence`, `costClass`, and a user-readable reason for surfacing it now;
- `status`: `visible`, `snoozed`, `dismissed`, `consumed`, or `stale`.

A finding is visible only when its capability supports the target and its evidence threshold passes. Selecting it starts or updates a Copilot collaboration session; it does not silently create a document patch. Users may also invoke any fixed compatible operation manually without waiting for a finding.

The document-local `AI 建议` affordance and the Copilot Brief must project the same app-owned finding record. They are two entry points, not two suggestion stores. The following synchronization rules are normative:

- one fingerprint resolves to one active finding ID for the same evidence revision, even when multiple detectors or refreshes discover it;
- opening, snoozing, dismissing, consuming, or invalidating a finding from either surface updates the other surface immediately;
- `dismissed` is scoped to the current evidence revision. It must not reappear on every scan; it may be reissued only when the anchor/evidence changes materially and passes the threshold again;
- `consumed` means the issue was resolved by an accepted AI change or by a verified direct edit. A finding may link to the resulting `changeId` or direct transaction, but it does not itself become History;
- source changes that invalidate the anchor or evidence move the old finding to `stale`. A stale finding cannot start an old proposed action; the runtime must revalidate, relocate safely, or issue a new revision;
- seen/unseen, hover, expanded/collapsed, and per-surface scroll position are projection metadata, not additional finding lifecycle states.

### 6.2 `ProposedChangeSet`

A `ProposedChangeSet` is the transient review result of one Copilot run. It freezes the run envelope and groups one or more typed changes without claiming that any of them has been written.

- `id`, `runId`, capability id, and optional originating finding ids;
- frozen context revision and target/source revisions used by the run;
- `changes: ProposedChange[]`;
- `activeChangeId` for Review navigation;
- `status`: `generating`, `reviewing`, `resolved`, or `cancelled`;
- optional session-cache retention metadata for costly generation.

The change set belongs to the transient Review stage inside Copilot. It is not a third top-level Intelligence tab and it is not History.

### 6.3 `ProposedChange`

A `ProposedChange` is one atomic, independently reviewable candidate inside a change set.

- `id` and parent `changeSetId`;
- `anchor`: target object, source range, source revision, and adapter-specific locator;
- `sourceOrder`: a stable document-order key supplied by the source adapter;
- `operation`: rewrite, insert, delete, metadata patch, vertical transform, or native-object patch;
- `before`, typed patch payload, and renderable proposed state;
- `previewMode`: inline diff, vertical transform, inserted object, or incremental native patch;
- `status`: `pending`, `accepted`, `rejected`, or `stale`;
- evidence/provenance needed to explain the change and create an accepted receipt.

Accepting or rejecting one change must not implicitly resolve unrelated changes in the set. A finding may produce no change, one change, or many changes.

### 6.4 Source-order navigator

Review uses the document, not the sidecar list, as the spatial truth source:

1. order changes by the adapter-provided `sourceOrder`, never by suggestion rank, confidence, or generation arrival time;
2. show `第 N 处`, unresolved count, `上一处` and `下一处`; per-change character/cell/row deltas stay at the anchored candidate rather than the global navigator;
3. navigation scrolls and focuses the real target object and updates the sidecar explanation together;
4. navigation does not mutate the frozen run context, create a new chat message, or rerank the Copilot Brief;
5. accepting or rejecting the current change advances to the next unresolved change when one exists;
6. the navigator remains stable when resolved changes are retained for this review session.

Every change uses the most specific anchored preview its object supports. A modal may provide a larger unified or Before/After inspection surface, but it does not replace the anchored document preview.

### 6.5 Stale and source-revision rules

- Every accept revalidates the target source revision and adapter locator.
- If the user edits an overlapping target after generation, only the affected pending change becomes `stale`; unrelated changes remain reviewable.
- A stale change cannot be accepted. The user may discard it or regenerate it against the new source.
- Moving the cursor or navigating between changes does not make a change stale.
- If an adapter cannot safely relocate a target, it must fail closed and explain why rather than writing at a guessed position.

### 6.6 Run artifacts and accepted transactions

One Copilot Run may retain local `Changes`, `Insights`, `Sources`, and a redacted `Trace`, all keyed by stable `runId`. These are execution/review artifacts, not top-level Intelligence work surfaces and not document history. Trace contains only verifiable capability/tool actions, source references, produced artifacts, validation results, status, timing and errors; it must not persist or expose hidden prompts, raw reasoning, thinking tokens, or chain-of-thought. Runtime strategy labels such as `Fast Lookup` remain metadata rather than product capabilities.

The run record and History use separate records with bidirectional references. The run record may store `acceptedTransactionIds`; each accepted History transaction stores `originRunId`, `changeSetId`, and `changeId`. Accepting two changes from the same set creates two independently locatable, diffable, and rollbackable transactions. Rejected, stale, abandoned, preview-only, insight, source, and trace artifacts may remain under the run/session retention policy, but never become History transactions.

## 7. Intelligence Dock Ownership

### Top-level ownership

Intelligence has exactly two top-level work surfaces:

1. **Copilot** — awareness, collaboration, capability execution, and transient review;
2. **History** — accepted document transactions and rollback.

Ambient is not an equal third tab. Review is also not an equal third top-level tab.

### Copilot Brief and Ambient runtime

The Ambient runtime continuously evaluates current work state, related material, recent work, and unplaced thoughts. Its user-facing projection is the default Copilot Brief: ranked next moves, related material, and unplaced thoughts, with refresh, dismiss, and “why now” controls.

Internal labels such as `Current Work State`, `Session Thought Trace`, model trace, or Ambient pipeline names are not primary UI navigation. The Brief describes what may help, why it is relevant now, and what will happen if the user chooses it. Ambient does not silently write Markdown and does not append every refresh as a conversation message.

### Copilot collaboration session

The collaboration session discusses and executes a concrete task. Its composer is fixed at the bottom and automatically includes the focused object, nearby content, high-confidence Ambient relations, and the user's explicit attachments. There is no persistent `当前块 / 本节 / 全文` selector; context is visible and editable through context chips and one context picker. The complete composer is shown in the collaboration session, not on the passive Brief or while Review controls own the footer.

The Q&A flow represents a run with one receipt and its key insight. That same message expands into the run artifact browser: `Changes / Insights / Sources / Trace` switch in place, ordinary entries render immediately below the receipt, and long content expands inline. Ordinary artifacts do not open a modal or a separate workbench. A dedicated wide view is allowed only for relationship graphs or similarly spatial artifacts that cannot be understood at thread width. The four categories never become permanent tabs or an unbounded tool-log feed.

### Transient Review

When a run creates a `ProposedChangeSet`, Copilot enters a transient Review stage. Candidates stream and re-render at their real document anchors. Review freezes the run context, exposes source-order previous/next navigation, and lets the user accept, reject, regenerate, or inspect each proposed change. Every model-generated review surface—including rewrite, insert, semantic rename, image caption/edit, Base view and native typed generation—exposes a targeted instruction field plus variant history. Enter and regenerate/retry submit the same value, the instruction is frozen into the appended candidate version, prior versions remain reachable, and only accepting the active completed version can write its result. Deterministic transforms continue to use recalculate/restore instead of pretending to regenerate from a prompt. The document anchors are the review truth source; the sidecar explains the active change and provides controls rather than duplicating the candidate. Pending, rejected, and stale changes never appear in History.

### History

History is the second top-level work surface. It shows accepted transactions as a timeline, locates the changed object, renders Markdown/native unified or before-after state, and supports rollback. Sidecar review acceptance and inline Block AI acceptance use the same commit-to-History bridge; an inline rewrite must not enter only the session Undo/Redo stack. Each accepted receipt records action, target, time, scope, diff/typed patch, provenance (`user`, `AI-assisted and accepted`, `user-adjusted AI`, or `system rollback`), source revisions, and its edit-burst/session or parent run/change-set IDs. The projection may collapse adjacent direct edits with the same explicit edit-burst ID and accepted AI changes with the same run/change-set ID into expandable visual batches. It must not infer a batch from timestamp proximity, change the true transaction count, or turn the group into a rollback unit: every child retains its own ID, diff, locate, rollback and origin. History can return to and expand the originating run receipt, while the receipt's artifact browser can open each accepted transaction; this linkage never merges their storage or lifecycle.

Direct user edits and accepted AI-assisted changes are visibly distinguishable. Rollback appends an inverse transaction; it does not erase the original receipt. Session/document/Git adapters may enrich History, but conversation messages, findings, model traces, pending candidates, rejections, and session-cache generations are not accepted document history.

Composer Undo/Redo is a session-local cursor over the same committed document transaction model, not another History store. A compact standard-icon pair remains permanently available in Composer's bottom document-status bar, while shortcuts remain available without requiring a custom production header. After commit/undo/redo, a transient lower-canvas transaction notice exposes the exact transaction label and only currently valid actions, then may hide without clearing the controls or stack. Pending candidates remain outside the stack, editable prompt/text controls retain native undo ownership, and committing after Undo invalidates the Redo branch. History records direct user edits alongside accepted AI-assisted writes and explicit inverse rollbacks; Undo does not delete any durable receipt. A rollback requested from History appends a typed inverse transaction and therefore remains auditable across sessions.

## 8. Implementation Model

Production should expose a typed registry rather than hardcode labels in UI components:

```ts
type ComposerCapability = {
  id: string;
  supportedKinds: ComposerBlockKind[];
  class: 'fixed' | 'contextual' | 'incremental';
  preview: 'inline-diff' | 'vertical-transform' | 'insert-object' | 'native-stream';
  cost: 'local' | 'model-light' | 'model-heavy';
  guard(context: ComposerBlockContext): CapabilityGuard;
  run(envelope: ComposerRunEnvelope): AsyncIterable<ComposerPatchEvent>;
};

type SuggestionFinding = {
  id: string;
  fingerprint: string;
  anchor?: ComposerSourceAnchor;
  evidenceRevision: string;
  kind: FindingKind;
  evidence: FindingEvidence;
  proposedAction: ComposerCapability['id'];
  confidence: number;
  costClass: ComposerCapability['cost'];
  reasonNow: string;
  status: 'visible' | 'snoozed' | 'dismissed' | 'consumed' | 'stale';
  resolutionRef?: { changeId?: string; transactionId?: string };
};

type ProposedChange = {
  id: string;
  changeSetId: string;
  anchor: ComposerSourceAnchor;
  sourceOrder: ComposerSourceOrder;
  operation: ComposerPatchOperation;
  patch: ComposerTypedPatch;
  variants?: ProposedChangeVariant[];
  activeVariantId?: string;
  preview: ComposerCapability['preview'];
  status: 'pending' | 'accepted' | 'rejected' | 'stale';
};

type ProposedChangeVariant = {
  id: string;
  instruction?: string;
  payload: ComposerTypedPatch;
  status: 'generating' | 'completed' | 'failed' | 'discarded';
};

type ProposedChangeSet = {
  id: string;
  runId: string;
  contextRevision: string;
  changes: ProposedChange[];
  activeChangeId?: string;
  status: 'generating' | 'reviewing' | 'resolved' | 'cancelled';
};
```

The app layer owns the capability registry, Ambient runtime projection, run envelope, proposed change-set and variant lifecycle, and adapters. Markdown, Base, Canvas, Excalidraw, Mermaid, chart and attachment adapters produce typed patches and stable source-order locators; UI renders findings, patch events and active variant review state, then asks for explicit acceptance. Acceptance rejects a variant whose status is not `completed`.

## 9. Mock Status and Roadmap Boundary

### Demonstrated across the full mock and current IA lab

- one-click toggle for insert, comment, and AI surfaces;
- vertical list/table/formula comparison;
- timed image generation before a real generated bitmap appears;
- direct rectangle/free crop, discrete rotation/straighten and a stateful image candidate; semantic rename, caption and AI edit variant/history flows;
- one four-image HTML Block with pointer-operable `grid / hero / strip / story` layouts and synchronized Markdown source;
- initial bold, italic, underline, strikethrough, highlight and text-color samples with source-aware hover/focus UI and an AI style preview;
- native table text selection, continuous rectangle selection, `Cmd/Ctrl-click` discontinuous cells, and an external merge/clear toolbar whose merge state follows rectangular completeness;
- real-pointer bar/line/pie chart switching with fenced source synchronization;
- object-shaped Base generation followed by a typed Base candidate rather than prompt/source placeholder copy;
- Easy Copy payload checks for code newlines/indentation and Mermaid source-versus-rendered-target separation;
- incremental Mermaid, Canvas, and Excalidraw preview updates;
- compact Base rows and chips;
- Copilot and History as the two top-level Intelligence work surfaces;
- Ambient-derived next moves, related material, and unplaced thoughts projected into Copilot rather than exposed as a third tab;
- a task-oriented collaboration session with shared capability/context composer;
- one fixture `ProposedChangeSet` with eight independently statused changes, source-order previous/next navigation, editor-local targets, accept/reject controls, and History write-through;
- accepted History timeline, provenance tags, unified/before-after diff, locate, and rollback UI;
- cross-block text selection and focused-block context.

The IA lab proves interaction semantics, not production persistence: source ranges, revisions, change identity, history storage, model output, and adapters are deterministic fixtures.

### Next integration iteration

- choose the owner-approved adaptive or explicit-stage navigation variant without changing the underlying lifecycle contract;
- replace fixture source order and change IDs with adapter-owned locators and durable run-envelope identities;
- make stale detection overlap-aware and preserve unaffected pending changes;
- bind per-change acceptance and batch grouping to app-owned transaction/History ports;
- retain the verified Brief, collaboration, Review, History, and narrow fixed-drawer behavior when merging into the shared mock.

### Production roadmap

- dedicated Composer View source-range/native-file adapters and transaction tests; do not install Composer behavior into the existing Obsidian Markdown CodeMirror editor;
- typed capability registry and evidence-based suggestion engine;
- app-owned finding registry with fingerprint deduplication, cross-surface projection and evidence-revision invalidation;
- stable source-order keys, range relocation, overlap detection, and fail-closed stale validation;
- durable run envelope, `ProposedChangeSet`, accepted receipt, and inverse-transaction schemas;
- real model streaming and generation persistence;
- complete Base/Canvas/Excalidraw adapters;
- attachment pipeline for generated images, crop, annotation, and captions;
- durable session/document/Git transaction history;
- keyboard and accessibility pass;
- touch/mobile interaction model;
- performance budget and virtualization for long documents.

## 10. Acceptance Rules

1. No block receives an incompatible generic AI operation.
2. Every contextual suggestion explains its evidence.
3. A `SuggestionFinding`, `ProposedChangeSet`, `ProposedChange`, and accepted History receipt are distinct objects with distinct statuses.
4. Every proposed content change renders at its real target object before acceptance.
5. Complex comparisons are vertical and readable at the Composer document width.
6. Incremental native edits visibly re-render before acceptance.
7. Review exposes stable `current / total`, previous/next source-order navigation, and per-change accept/reject without mutating the frozen run context.
8. An overlapping source edit marks only the affected pending change stale, and no stale change can be accepted.
9. Intelligence exposes only Copilot and History as top-level work surfaces; Ambient is a runtime projected into the Copilot Brief, and Review is transient inside Copilot.
10. The full composer appears in the collaboration session, while Review uses review-specific controls.
11. History contains only accepted direct or AI-assisted document transactions; rollback appends an inverse transaction and preserves the original receipt.
12. No accepted operation loses valid Markdown or native-file source.
13. A user can reopen a recent expensive unresolved candidate during the active review session without paying for a second generation or misclassifying it as History.
14. Every accepted `ProposedChange` creates one independently addressable History transaction, with bidirectional run/change/transaction links.
15. Run-local Insights, Sources, redacted Trace, rejected changes, and preview artifacts never become History transactions or permanent product tabs.
16. Trace exposes only verifiable actions and artifacts; no UI or persisted record exposes chain-of-thought or promotes runtime metadata such as `Fast Lookup` into a user capability.
17. The same Copilot run receipt owns compact summary, category switching, visible artifact rows, and inline long-content expansion; ordinary artifacts never require a modal, while a wide view is reserved for genuinely spatial artifacts.
18. Vault wikilinks and external URLs remain directly navigable from both the inline object and the first control in their hover surface; AI actions never replace the destination.
18. A document-local `AI 建议` entry and its Copilot Brief row resolve to the same `SuggestionFinding` ID and lifecycle state.
19. Dismissed findings do not reappear for the same evidence revision, consumed findings link to their resolution, and stale findings cannot launch or apply an action without revalidation.
20. A prompt, trigger label, suggestion reason or placeholder sentence never appears as candidate content when a typed object can be rendered.
21. Every model-generated review keeps prior variants, one active variant and targeted regeneration; only an active `completed` variant can be accepted.
22. Image crop/rotate/format review visibly carries the exact pending geometry/transform state, and returning to adjustments does not reset it.
23. Chart type switching is pointer-operable, exposes exactly one active tab and synchronizes the typed fenced source before acceptance.
24. Plain/source copy preserves semantic newlines and indentation, and object chrome is excluded from Mermaid rendered/source output.
25. Every structural transform, including list reorder and list-to-table, keeps the authoritative source object visible exactly once and renders only one target candidate; no cloned before-side, comparison arrow or source dimming is allowed.
