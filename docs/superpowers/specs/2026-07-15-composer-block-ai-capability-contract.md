# Composer Block AI Capability Contract

**Status:** product contract and implementation roadmap  
**Date:** 2026-07-15  
**Related mock:** [`docs/gstack/peak-composer-editing-view-2026-07-09/index.html`](../../gstack/peak-composer-editing-view-2026-07-09/index.html)  
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
4. generation complete, still unwritten;
5. explicit accept writes the Markdown or native file.

History stores accepted transactions, not every hover or abandoned candidate. Candidate history may stay in the session cache so the user can reopen an expensive generation before the review session ends.

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

## 6. What Copilot Review Generates

Copilot Review scans the document and emits typed findings, not a universal action toolbar. Each finding contains:

- `anchor`: block id and source range;
- `kind`: claim, evidence, structure, style, link, visual, math, task, metadata, or native-object;
- `evidence`: the matched text, structural signal, broken reference, or cross-note relation;
- `proposedAction`: a capability id compatible with the anchored block;
- `confidence` and `costClass`;
- `previewMode`: inline diff, vertical transform, inserted object, or incremental native patch;
- `status`: queued, generating, ready, accepted, rejected, or stale.

A suggestion is visible only when its capability supports that block and its evidence threshold passes. Users can also invoke any fixed compatible operation manually without waiting for Review.

## 7. Intelligence Dock Ownership

### Copilot

Conversationally changes the article. The composer is fixed at the bottom and automatically includes the focused object, nearby content, high-confidence Ambient relations, and the user's explicit attachments. There is no persistent `当前块 / 本节 / 全文` selector; context is visible and editable through one context button.

### Ambient

Shows Current Work State, inferred intent, Session Thought Trace, and Related Push. Ambient does not own editing history and does not silently write Markdown. It supplies context signals that can become Copilot Review evidence.

### History

An equal third tab. It shows accepted transactions as a timeline, filters session/document/Git history, locates the changed object, renders Markdown/native before-after state, and supports rollback. Expensive unaccepted generations may be kept only for the current review session.

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
```

The app layer owns the capability registry and adapters. Markdown, Base, Canvas, Excalidraw, Mermaid, and attachment adapters produce typed patches; UI only renders patch events and asks for acceptance.

## 9. Mock Status and Roadmap Boundary

### Demonstrated in the static mock

- one-click toggle for insert, comment, and AI surfaces;
- vertical list/table/formula comparison;
- timed image generation before a real generated bitmap appears;
- incremental Mermaid, Canvas, and Excalidraw preview updates;
- compact Base rows and chips;
- Copilot, Ambient, and History as three explicit Intelligence modes;
- Current Work State, Session Thought Trace, Related Push, history timeline, and diff/rollback UI;
- cross-block text selection and focused-block context.

### Still production roadmap

- CodeMirror source-range adapters and transaction tests;
- typed capability registry and evidence-based suggestion engine;
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
3. Every proposed content change renders as its real target object.
4. Complex comparisons are vertical and readable at the Composer document width.
5. Incremental native edits visibly re-render before acceptance.
6. No accepted operation loses valid Markdown or native-file source.
7. Copilot, Ambient, and History retain separate ownership and visual hierarchy.
8. A user can reopen a recent expensive candidate during the active review session without paying for a second generation.
