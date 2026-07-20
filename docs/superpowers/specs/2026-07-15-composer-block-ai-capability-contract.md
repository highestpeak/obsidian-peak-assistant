# Composer Block AI Capability Contract

**Status:** product contract and implementation roadmap  
**Date:** 2026-07-15  
**Updated:** 2026-07-20 — message-embedded run artifacts, anchored streaming review, and accepted-transaction linkage
**Related mock:** [`docs/gstack/peak-composer-editing-view-2026-07-09/index.html`](../../gstack/peak-composer-editing-view-2026-07-09/index.html)  
**Current IA lab:** [`docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html`](../../gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html)
**Parent design:** [`2026-07-09-peak-composer-editing-view.md`](2026-07-09-peak-composer-editing-view.md)

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
- `在下方插入`, `评论`, and `AI 建议` are one-click toggles. The first click opens the in-flow surface; the next click closes that same surface.
- The left rail owns press-and-hold drag only. Insertion, comments, and AI do not create a second left-side toolbar.
- Cross-block text selection remains native. Selection tools operate on the selected Markdown ranges as one transaction.

### 2.2 Result placement

AI results are rendered where the resulting object will live:

| Operation | Review surface |
| --- | --- |
| Rewrite the same prose | Word-level diff directly on the block |
| Reorder or structurally transform an object | Original object above, proposed object below |
| Insert a new object | Real editable draft at the insertion position |
| Change metadata | Changed fields and tags inside the metadata block |
| Change a native diagram/file | Re-rendered preview after every source patch |
| Generate an image | Timed generation state, then a real image attachment preview |

All review surfaces use one transaction footer: status, action name, `接受`, `还原/丢弃`, and optional `重试`. A result must not be represented by an explanatory paragraph when the product can render the actual proposed object.

### 2.3 Vertical comparison rule

Transform comparisons are stacked vertically. Wide side-by-side comparisons are prohibited for list-to-table, checklist reorder, formula split, table transpose, and native-object revisions because the proposed object may be much wider or taller than its source.

### 2.4 Generation lifecycle

Every costly generation exposes real progress:

1. queued and context assembled;
2. model streaming or source patches arriving;
3. preview repeatedly re-rendered;
4. generation complete and collected into a transient `ProposedChangeSet`, still unwritten;
5. Review navigates the pending changes in document source order;
6. explicit acceptance writes each Markdown or native-file change and creates one independent History transaction for that accepted change.

History stores accepted transactions, not findings, pending previews, rejected changes, stale changes, hovers, or abandoned candidates. A costly unresolved candidate may stay in the active session cache so the user can reopen it before the review session ends without presenting it as document history.

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
| Frontmatter / properties | Edit value; add/remove tag; normalize date; copy source | Property warning; missing schema field; duplicate/near-duplicate tag; stale timestamp | Propose one field or tag at a time | Show changed values and candidate tags inside the metadata block; accept writes YAML |
| Document title / H1 | Rename; change heading level; copy link | Shorten title; clarify scope; propose subtitle or next-level outline when structure is missing | Stream a new heading or outline below the title | Rename is an in-place text diff; outline is a real inserted heading/list |
| Heading H2-H6 | Rename; promote/demote; move section | Missing bridge; section too broad; reader question; duplicate heading | Generate child outline or section draft | Heading rewrite stays in place; new structure is inserted below |
| Paragraph | Edit; split; merge; turn into quote/callout/list | Polish; shorten; add example; unsupported claim; missing source; process suitable for a visual; parallel dimensions suitable for a table | Stream rewrite, citation, example, formula, or visual only when its trigger exists | Rewrite is an in-place diff; new formula/image/table is rendered as a real draft object |
| Bullet / numbered list | Add/remove item; indent/outdent; reorder; switch bullet/number; convert to checklist/table | Missing item; mixed dimensions; poor order; duplicate items; action list not expressed as tasks | Insert one item, reorder items, or create a proposed table | Original list above and proposed list/table below; accept replaces the original |
| Checklist | Toggle; edit item; add/remove; indent; reorder by priority/status | Missing owner/deadline; ambiguous action; priority mismatch; completed-item cleanup | Reorder or enrich individual tasks | Original checklist above, proposed checklist below; checkbox state remains editable |
| Quote | Edit; convert to paragraph; attach source/footnote | Missing attribution; quote too long; unclear relevance | Generate citation metadata or a short explanation below | Quote text diff is in place; source note is inserted below |
| Callout | Edit title/body; change callout type; collapse; convert to paragraph | Type does not match meaning; missing warning/action; callout too dense | Generate a better title or split into multiple callouts | Type/title/body changes render inside the same callout |
| Internal link | Open; rename alias; replace target; show backlinks | Broken target; better canonical target; target summary is stale | Search and propose replacement targets | Link patch is inline and preserves `[[target|alias]]` syntax |
| External link | Open; copy; fetch metadata; convert to link card | Dead URL; missing title; citation quality warning; snapshot recommended | Fetch title/summary/image and build a link card | Inline link patch or real link-card draft; never an explanatory card |
| Footnote / citation | Jump to definition; edit; move definition | Missing definition; source mismatch; unsupported quote | Generate or repair the definition | Footnote reference and definition update in one range-safe transaction |
| Image / attachment | Fullscreen lightGallery; zoom/pan/rotate; crop; annotate; resize; edit caption; replace | Missing caption/alt; suggest diagram/photo style; image inconsistent with nearby text; regenerate variant | Prompt planning, model generation, progressive preview, local edits | Loading state precedes bitmap; accept writes attachment and Markdown embed |
| Markdown table | Cell edit; row/column; delete; align; sort; formula; transpose; paste/export CSV | Poor schema; repeated values; missing column; summarize; derive formula; convert prose/list | Patch a cell, row, column, formula, or schema one step at a time | Original table above, proposed table below; accept writes plain Markdown table |
| Inline math | Edit LaTeX; convert to display math; copy source | Undefined variable; malformed expression; notation mismatch | Propose corrected expression or variable definition | Rendered formula stays visible with source diff available |
| Display formula | Edit source; explain; split; variable table; number equation | Formula too dense; undefined symbol; likely error; prose explanation missing | Add named subexpressions, definitions, derivation steps, or an explanatory diagram | Original formula above; named split/derivation below; accept replaces or inserts typed math blocks |
| Code block | Edit; language switch; copy; wrap/unwrap | Missing language; syntax issue; explanation/test/example requested | Stream code diff or generate companion output block | Code diff remains inside the block; source fence is preserved |
| Mermaid | Preview/source toggle; copy source/image; open editor | Missing branch; disconnected node; unclear labels; flow inconsistent with prose | Add/remove/update node or edge per patch and re-render after each patch | Mermaid source is authoritative; preview is refreshed before accept |
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
- `anchor`: block id, source range, and source revision when the finding is local;
- `kind`: claim, evidence, structure, style, link, visual, math, task, metadata, or native-object;
- `evidence`: matched text, structural signal, broken reference, or cross-note relation;
- `proposedAction`: a compatible capability id;
- `confidence`, `costClass`, and a user-readable reason for surfacing it now;
- `status`: `visible`, `snoozed`, `dismissed`, `consumed`, or `stale`.

A finding is visible only when its capability supports the target and its evidence threshold passes. Selecting it starts or updates a Copilot collaboration session; it does not silently create a document patch. Users may also invoke any fixed compatible operation manually without waiting for a finding.

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
2. show `current / total` plus `上一处` and `下一处` controls;
3. navigation scrolls and focuses the real target object and updates the sidecar explanation together;
4. navigation does not mutate the frozen run context, create a new chat message, or rerank the Copilot Brief;
5. accepting or rejecting the current change advances to the next unresolved change when one exists;
6. the navigator remains stable when resolved changes are retained for this review session.

Text changes use a unified inline diff at the anchor. Structural transforms remain vertical. A modal may provide a larger unified or before/after inspection surface, but it does not replace the anchored document preview.

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

When a run creates a `ProposedChangeSet`, Copilot enters a transient Review stage. Candidates stream and re-render at their real document anchors. Review freezes the run context, exposes source-order previous/next navigation, and lets the user accept, reject, regenerate, or inspect each proposed change. The document anchors are the review truth source; the sidecar explains the active change and provides controls rather than duplicating the candidate. Pending, rejected, and stale changes never appear in History.

### History

History is the second top-level work surface. It shows accepted transactions as a timeline, locates the changed object, renders Markdown/native unified or before-after state, and supports rollback. Each accepted receipt records action, target, time, scope, diff/typed patch, provenance (`user`, `AI-assisted and accepted`, `user-adjusted AI`, or `system rollback`), source revisions, and its parent run/change-set/change IDs. History can return to and expand the originating run receipt, while the receipt's artifact browser can open each accepted transaction; this linkage never merges their storage or lifecycle.

Direct user edits and accepted AI-assisted changes are visibly distinguishable. Rollback appends an inverse transaction; it does not erase the original receipt. Session/document/Git adapters may enrich History, but conversation messages, findings, model traces, pending candidates, rejections, and session-cache generations are not accepted document history.

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
  anchor?: ComposerSourceAnchor;
  kind: FindingKind;
  evidence: FindingEvidence;
  proposedAction: ComposerCapability['id'];
  confidence: number;
  costClass: ComposerCapability['cost'];
  reasonNow: string;
  status: 'visible' | 'snoozed' | 'dismissed' | 'consumed' | 'stale';
};

type ProposedChange = {
  id: string;
  changeSetId: string;
  anchor: ComposerSourceAnchor;
  sourceOrder: ComposerSourceOrder;
  operation: ComposerPatchOperation;
  patch: ComposerTypedPatch;
  preview: ComposerCapability['preview'];
  status: 'pending' | 'accepted' | 'rejected' | 'stale';
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

The app layer owns the capability registry, Ambient runtime projection, run envelope, proposed change-set lifecycle, and adapters. Markdown, Base, Canvas, Excalidraw, Mermaid, and attachment adapters produce typed patches and stable source-order locators; UI renders findings, patch events, and review state, then asks for explicit acceptance.

## 9. Mock Status and Roadmap Boundary

### Demonstrated across the full mock and current IA lab

- one-click toggle for insert, comment, and AI surfaces;
- vertical list/table/formula comparison;
- timed image generation before a real generated bitmap appears;
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

- CodeMirror source-range adapters and transaction tests;
- typed capability registry and evidence-based suggestion engine;
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
