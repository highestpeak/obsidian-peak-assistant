# File Atlas Design Spec

**Status:** phase 0-1 implemented (first slice)
**Date:** 2026-07-08
**Owner surface:** active document navigation / Quick Search adjacent surface / Document Copilot context handoff
**Source:** synthesized from the 2026-07-08 product discussion about single-file search, block navigation, persisted Copilot insights, resource layers, anchors, Git enhancement, and Command Gateway control.

## Summary

File Atlas is an ordered, block-level map of the current document. It is not a better word cloud, not a flat search-result list, and not a replacement for Document Copilot. Its job is to help the user see what exists inside the active file, where each thing lives in document order, what prior AI or lint insights are already attached to those blocks, and which blocks should be handed off to Document Copilot for action.

The core product statement:

> File Atlas is an ordered block-level map of the current document, enriched with persisted insights and resource layers, used to inspect, navigate, select, and hand off context to Document Copilot.

The most important correction from the discussion is that Atlas Tree must not show resources as summary counters such as `3 paragraphs · 1 table · 2 claims`. Paragraphs, tables, images, code blocks, formula blocks, links, claims, evidence, examples, and actions should appear directly as tree nodes in their original document order. Counts can exist only as collapsed-state summaries, not as the main model.

## Reader And Purpose

This document is for the product owner, designer, and implementation agent who need to decide whether File Atlas is worth building, how it differs from existing Search and Document Copilot features, and what data model must be designed correctly before UI work starts.

After reading, the reader should be able to:

- explain the File Atlas mental model;
- distinguish File Atlas from Document Copilot and Vault Lint;
- review the proposed UI layers and toggles;
- understand why block anchoring matters;
- understand how Git improves anchor reliability without becoming a hard dependency;
- split the work into implementation phases.

## Current Context

The starting point was a Vault Search / Heading mode screenshot where the current file can already be searched by heading, link positions can be shown, and result graph ideas are nearby. That existing direction is valuable, but it is still heading-centric. File Atlas generalizes the idea from "search within headings" to "navigate the document object tree".

The research and product discussion surfaced several reusable signals:

- VS Code has strong single-file navigation patterns: outline, breadcrumbs, minimap, sticky scroll, go-to-symbol, and file timeline.
- Obsidian has native concepts File Atlas should respect: backlinks, unlinked mentions, local graph, properties, search operators, internal links, external links, and embeds.
- Readwise and Zotero show that highlights, annotations, notes, and tagged highlight-level resources are often more useful than whole-document tags.
- Enterprise document systems treat metadata, taxonomy tagging, classification, OCR, and field extraction as first-class document operations.
- Search UX research suggests filters should use concrete labels. File Atlas should say `Images`, `Tables`, `Vault links`, `External links`, `Claims`, and `Actions`, not vague labels such as `metadata` or `category`.

## Naming

Chosen name: **File Atlas**.

Reason:

- `File` keeps the feature grounded in the active file, not the whole vault.
- `Atlas` suggests a map of structure, resources, and relationships.
- The name is broader than `Search`, less technical than `Inspector`, and less execution-oriented than `Copilot`.

Rejected or secondary names:

| Name | Reason not chosen |
| --- | --- |
| Note Atlas | More PKM-flavored, but less general than File Atlas. |
| Document Lens | Good for analysis, but weaker as a navigation and resource map. |
| File Lens | Too narrow; sounds like a preview. |
| Resource Map | Clear but less product-like. |
| Context Map | Too AI-context-oriented and not specific enough to the file. |

Primary command label:

```text
Open File Atlas
```

## Product Boundary

The key boundary is:

```text
File Atlas selects, locates, inspects, and indexes.
Document Copilot generates, rewrites, fixes, splits, and applies.
```

File Atlas should not become another Copilot panel. It should make Copilot better by giving the user a cleaner way to choose context.

### File Atlas Owns

- Ordered document block tree.
- Current file structure navigation.
- Raw resource inventory in original document order.
- Persisted insight display in original document order.
- Layer toggles and presets.
- Right-side inspector for selected tree node.
- Selection tray for collecting blocks.
- Hand-off to Document Copilot.
- Anchor status and reliability display.
- Lightweight metadata visibility.

### Document Copilot Owns

- Generating claims, evidence, examples, actions, questions, decisions, risks, summaries, and rewrite suggestions.
- Rewriting a section.
- Polishing or compressing text.
- Filling missing evidence or conclusions.
- Splitting a section into a new note.
- Applying link suggestions.
- Creating new content or modifying current content.

### Vault Lint Or Maintenance Owns

- Vault-wide health checks.
- Rule-based metadata compliance.
- Broken-link audit when it becomes a broader maintenance workflow.
- Template compliance enforcement.

File Atlas may show persisted issues from Copilot, Vault Lint, or future maintenance runs. Showing an issue is in scope; fixing it directly is not.

## Core Mental Model

File Atlas is an ordered document object tree.

Headings are containers, not the only navigable objects. The tree should preserve the original sequence of the document while allowing layers to be toggled on and off.

Example shape:

```text
H1 Interview story
  H2 Project background
    Paragraph · Opening context
      Claim · I owned the core refactor
      Evidence · Migration before/after contrast
    Table · Project phase comparison
    Image · Architecture screenshot
  H2 Technical challenge
    Paragraph · State sync issue
    Code block · TypeScript · 32 lines
    Claim · The old design risked dual runtime ownership
    Evidence · Two runtime paths existed side by side
  H2 Result
    Paragraph · Final summary
    Action · Run one real rehearsal
```

The tree should not collapse this into:

```text
H2 Technical challenge · 2 paragraphs · 1 code block · 2 evidence
```

That compact summary can be a collapsed badge, but it cannot be the primary representation because it loses order, block identity, and navigability.

## Layer Model

File Atlas has two conceptual layers: raw blocks and insight blocks.

### Raw Block Layer

Raw blocks come from deterministic parsing of the current Markdown file or active editor buffer.

Raw block types:

- file root;
- frontmatter / properties;
- heading;
- paragraph;
- list item;
- task;
- callout;
- blockquote;
- table;
- code block;
- math / formula block;
- image;
- embed;
- attachment;
- footnote;
- vault link;
- external link;
- block link;
- heading link;
- naked URL.

Important rule: links are not one generic category. The tree and filters must distinguish at least:

| Link class | Examples | Product meaning |
| --- | --- | --- |
| Vault links | `[[note]]`, heading links, block links | Internal knowledge navigation. |
| External links | `https://...`, `mailto:`, DOI, GitHub, docs, articles | Internet or external reference. |
| Embeds / attachments | `![[image.png]]`, PDFs, canvas, audio, video | File resources, not ordinary links. |

First version can identify external link domain and link text without checking the network.

### Insight Layer

Insight blocks are generated or persisted by Document Copilot, AI analysis, Vault Lint, or user review, then anchored back to document blocks.

Insight block types:

- claim;
- evidence;
- example;
- action;
- question;
- decision;
- risk;
- summary;
- missing source;
- stale link;
- metadata warning;
- user-confirmed note.

These are tree nodes, not a separate chat artifact and not only count badges. They appear under or near the raw block they are anchored to, preserving the reading sequence.

Each insight must carry provenance:

- generated by which capability;
- run id;
- time;
- model or engine when useful;
- source block anchor;
- whether the user confirmed it;
- whether the anchor is active, stale, or unresolved.

Without provenance, the user will not trust old AI-generated claims.

## Atlas Tree

The Atlas Tree is the left or primary navigation surface.

It should show:

- document root;
- headings as containers;
- raw blocks according to enabled layers;
- insight blocks according to enabled layers;
- resource nodes in document order;
- issue nodes in document order;
- compact block labels;
- lightweight status markers.

It should support:

- keyboard navigation;
- expand/collapse by heading and by block groups;
- jump to block in editor;
- select block for Inspector;
- multi-select blocks into the Selection Tray;
- filtering by layer without changing document order.

Heading rows should always remain visible. Turning off headings would destroy orientation.

## Inspector

Atlas Tree should not carry every detail inline. A right-side Inspector should show details for the selected node.

For a raw block, Inspector can show:

- source preview;
- line range;
- nearest heading;
- block type;
- links inside the block;
- attachments or embeds;
- copied text or markdown;
- anchor id / hash in debug mode.

For a resource node, Inspector can show:

- link target or attachment target;
- link text;
- domain for external links;
- whether it is a vault link or external link;
- source block;
- quick open / reveal action.

For an insight node, Inspector can show:

- insight text;
- source excerpt;
- generated-by capability;
- run id;
- anchor status;
- confirmation state;
- option to send this insight and source block to Document Copilot.

## Selection Tray

File Atlas should have a Selection Tray, not an execution panel.

The user can collect blocks, resources, or insights, then send them to Document Copilot as clean context.

Allowed Atlas action:

```text
Send to Document Copilot
```

Disallowed direct Atlas actions:

- rewrite this section;
- split into new note;
- fill missing evidence;
- auto-fix metadata;
- create a task plan;
- apply link suggestions.

Those can be offered by Document Copilot after receiving selected context.

## Layer Toggles

The tree can become noisy if every block type is visible at once. File Atlas needs layer toggles from the first version.

The visible top-level toggles should be:

```text
Blocks / Resources / Insights / Issues
```

Recommended meaning:

| Toggle | Includes |
| --- | --- |
| Blocks | paragraphs, lists, tasks, callouts, blockquotes, generic text blocks. |
| Resources | vault links, external links, attachments, embeds, images, tables, code blocks, math. |
| Insights | persisted claim, evidence, example, action, question, decision, risk, summary. |
| Issues | missing source, stale link, unresolved anchor, duplicate heading, metadata warning, too-long block. |

Tasks are high-frequency enough to be shown by default even if generic `Blocks` is off.

### Advanced Filters

An advanced popover should expose individual filters.

```text
Block types
[ ] Paragraphs
[ ] Lists
[ ] Tasks
[ ] Callouts
[ ] Quotes

Resource types
[ ] Vault links
[ ] External links
[ ] Attachments
[ ] Embeds
[ ] Images
[ ] Tables
[ ] Code blocks
[ ] Math

Insight types
[ ] Claims
[ ] Evidence
[ ] Examples
[ ] Actions
[ ] Questions
[ ] Decisions
[ ] Risks
[ ] Summaries

Issue types
[ ] Missing source
[ ] Stale anchor
[ ] Unresolved anchor
[ ] Metadata warning
[ ] Duplicate heading
[ ] Too long

Density
( ) Compact
( ) Normal
( ) Detailed
```

### Default Visibility

Recommended default:

- Headings: always on.
- Resources: on.
- Insights: on.
- Issues: on.
- Tasks: on.
- Generic paragraphs/lists/quotes: off.

This makes the default view a high-signal map rather than a full AST dump.

## Presets

Presets are more useful than asking users to manage many checkboxes.

Recommended presets:

| Preset | Purpose | Layers |
| --- | --- | --- |
| Overview | First look at what matters in the file. | Headings + Resources + Insights + Issues + Tasks. |
| Reading | Read through the document structure. | Headings + Paragraphs + Callouts + Images + Tables. |
| Writing | Review argument and next actions. | Headings + Claims + Evidence + Examples + Actions + Issues. |
| Resources | Inspect reusable material. | Headings + Vault links + External links + Attachments + Images + Tables + Code + Math. |
| Debug | Developer / anchor troubleshooting. | All blocks + anchor ids + hashes + line ranges + provenance. |

## Product Shapes From The Discussion

The original product shapes are still useful, but they should now be interpreted through the ordered block tree.

### File Map

Earlier framing: structure map with headings, section ranges, match counts, links, tasks, resources, and section signals.

Updated framing: File Map becomes the Atlas Tree itself. It is not a heading-only mode.

Implementation cost: low to medium if the first slice builds on existing heading parsing and adds deterministic Markdown block extraction.

### Resource Shelf

Earlier framing: current-file resources such as links, backlinks, external URLs, tasks, callouts, tables, code blocks, attachments, and embeds.

Updated framing: resources appear in the Atlas Tree in document order, with an optional Resource preset or filtered shelf projection.

Implementation cost: medium. Outgoing links, tasks, images, tables, and code blocks are cheap. Backlinks and unlinked mentions are more expensive but Obsidian metadata cache can help.

### Metadata Health

Earlier framing: properties/frontmatter health panel: missing fields, inconsistent fields, tags, aliases, status, source, confidence.

Updated framing: Atlas can show frontmatter as a block and surface persisted metadata warnings. Rule generation or auto-fixing belongs to Vault Lint or Document Copilot.

Implementation cost: medium. Reading properties is easy; deciding schema rules must stay conservative.

### Evidence Mode

Earlier framing: extract claims, evidence, examples, actions, and questions from the file.

Updated framing: generating these belongs to Document Copilot. File Atlas displays persisted insight nodes from prior Copilot runs and lets the user select them.

Implementation cost: medium for display and persistence; high only if generation is added, which is out of Atlas scope.

### Signal View

Earlier framing: keyword count, TextRank, top terms, repeated words, concept density, section heat.

Updated framing: these are auxiliary signals, not a main product surface. They may appear as subtle badges, inspector fields, or Debug/Overview hints.

Implementation cost: low, but product value is lower than block navigation and resource display.

## Ideas Reclassified After Boundary Review

Some ideas are valuable but should not be owned directly by File Atlas.

| Idea | Final ownership | File Atlas role |
| --- | --- | --- |
| Gap Finder | Document Copilot / Vault Lint generates; Atlas displays persisted gap nodes. | Show `missing source`, `unanswered question`, or `needs evidence` nodes. |
| Split / Merge Advisor | Document Copilot. | Show selected block ranges and send to Copilot. |
| Decision / Action Extractor | Document Copilot generates. | Display persisted decisions/actions in tree order. |
| Citation / Source Audit | Vault Lint or Copilot. | Show external links, domains, source blocks, and persisted stale/missing-source issues. |
| Timeline View | Possibly future File Atlas projection. | Date/entity nodes can be detected and selected; full timeline is a projection, not v1. |
| Reuse Basket | File Atlas Selection Tray. | In scope. |
| Rewrite / Refactor Panel | Document Copilot. | Out of scope except handoff. |
| Related Inside File | Future Atlas relation projection. | Could show same-entity/same-link relationships later. |
| Template Compliance | Vault Lint / Copilot. | Show warnings only. |
| Reading Paths | Document Copilot generates. | Atlas can provide selected blocks as input. |
| Entity Board | Future Atlas projection. | Entity nodes can appear in tree or Inspector. |
| Maintenance Actions | Copilot / Command Gateway capability. | Atlas can trigger handoff, not apply edits directly. |
| Custom graph editing / saving | Future "Collection notes + Canvas reuse" — discussion archive and pre-research questions in `docs/research/2026-07-09-collection-notes-canvas-reuse/README.md` (registered in roadmap backlog). Saved note sets become vault-native MOC collection notes (links are the data); spatial arrangement and manual edges reuse Obsidian Canvas instead of a bespoke graph editor. | Graph subview stays read-only: system views (1-hop / 2-hop), layout presets, node popover (open / focus / add to tray). No create / connect / save / delete. |

## Block Anchoring

Anchor means how File Atlas knows that a tree node or insight corresponds to a specific piece of source text.

Line numbers are not enough. If a user adds two paragraphs above line 126, the old line 126 may point to the wrong block. This is especially dangerous for persisted Copilot insights such as claims, evidence, and actions.

Principle:

```text
Insight nodes must be anchored to document blocks, not raw line numbers.
```

Recommended first data shape:

```ts
interface FileAtlasAnchor {
  filePath: string;
  blockId: string;
  nearestHeading: string | null;
  blockType: string;
  ordinalInHeading: number;
  contentHash: string;
  lineStart: number;
  lineEnd: number;
  status: "active" | "stale" | "unresolved";
}
```

The fields work together:

| Field | Purpose |
| --- | --- |
| `filePath` | Locates the file when no rename information is available. |
| `blockId` | Stable-ish id assigned by the current parse. |
| `nearestHeading` | Helps recover after local edits. |
| `blockType` | Avoids matching a paragraph to a table or code block. |
| `ordinalInHeading` | Helps recover if content hash changes slightly. |
| `contentHash` | Strongest non-Git match signal. |
| `lineStart` / `lineEnd` | Human-friendly location and fallback. |
| `status` | Makes uncertainty visible instead of pretending the anchor is correct. |

Re-anchor strategy:

1. Prefer exact content hash match.
2. If not found, match same nearest heading + same block type + similar ordinal.
3. If still not found, fuzzy match near the old line range.
4. If confidence remains low, mark `unresolved`.
5. If the block is found but content changed, mark `stale`.

## Git-Aware Anchors

Git should enhance anchors, not become a hard dependency.

Product principle:

```text
File Atlas does not require Git, but Git makes anchor reliability better.
```

When Git is available, the anchor can record version context:

```ts
interface FileAtlasGitProvenance {
  gitHead: string | null;
  fileBlobSha: string | null;
  fileRelPath: string;
  lineStartAtVersion: number;
  lineEndAtVersion: number;
  patchContext?: string;
}
```

Benefits:

- map old line ranges through diffs instead of blindly trusting old line numbers;
- detect whether an insight was generated from an older file version;
- show which commit or blob an insight came from;
- recover through file rename or move more reliably;
- mark insights stale when their source block changed.

Reliability states:

| State | Meaning |
| --- | --- |
| Basic | No Git. Use content hash, heading, ordinal, and fuzzy matching. |
| Versioned | Git detected. Store commit/blob/diff context. |
| Managed | Recommended Git plugin enabled. Command Gateway can route richer Git capabilities. |

Dirty working tree behavior:

- File Atlas can still parse the current editor buffer.
- Anchors created from dirty content should show `working-tree` provenance.
- If there are many uncommitted changes, Atlas may warn that historical anchors are more likely to drift.

Git should be recommended, not required. Later onboarding or settings can recommend installing/enabling a Git plugin for version-aware anchors.

## Command Gateway Integration

File Atlas UI should not directly own Git runtime, shell commands, or plugin-specific APIs. It should request capabilities through Command Gateway.

Candidate capabilities:

```text
fileAtlas.open
fileAtlas.anchor.resolve
fileAtlas.anchor.version
fileAtlas.git.status
fileAtlas.git.diffMap
fileAtlas.git.openHistory
fileAtlas.selection.sendToCopilot
```

Command Gateway can route each capability to:

- no-Git fallback;
- built-in lightweight Git adapter;
- recommended Git plugin adapter;
- future MCP / Git provider.

This keeps runtime ownership at the app layer and lets File Atlas stay a UI and document-model surface.

## Persistence Model

File Atlas needs persistence for insight nodes and anchor metadata. It should not rely on chat history as the only place where Copilot output lives.

Persisted insight record should include:

```ts
interface FileAtlasInsight {
  id: string;
  filePath: string;
  kind:
    | "claim"
    | "evidence"
    | "example"
    | "action"
    | "question"
    | "decision"
    | "risk"
    | "summary"
    | "missing-source"
    | "stale-link"
    | "metadata-warning"
    | "user-note";
  text: string;
  anchor: FileAtlasAnchor;
  git?: FileAtlasGitProvenance;
  provenance: {
    source: "document-copilot" | "vault-lint" | "ai-analysis" | "user";
    runId?: string;
    createdAt: string;
    model?: string;
    promptId?: string;
    confirmedByUser?: boolean;
  };
}
```

The persistence store can be decided later. The important design constraint is that insight nodes must survive the original Copilot chat run and be reattached to the current document tree whenever File Atlas opens.

## Suggested UI Layout

Primary layout:

```text
Top bar:
  Open File Atlas title / active file / reliability state / presets / layer toggles

Main:
  Atlas Tree                          Inspector
  ordered block tree                  selected node details

Bottom or side:
  Selection Tray
```

Top bar controls:

- preset selector;
- top-level layer toggles;
- advanced filter popover;
- anchor reliability indicator;
- send selection to Document Copilot.

Atlas Tree row examples:

```text
H2 Technical challenge
  Paragraph · State synchronization problem
  Vault link · [[Runtime ownership]]
  External link · docs.anthropic.com
  Code block · TypeScript · 32 lines
  Claim · Old runtime ownership was split
  Evidence · App layer and service layer both had runtime paths
  Action · Verify one real run
```

Inspector should stay readable and avoid making the tree row too dense.

## Metadata Handling

File Atlas should expose frontmatter/properties as part of the document tree, but it should not hardcode a large metadata taxonomy in logic.

First-cut metadata display:

- show existing properties;
- distinguish tags, aliases, dates, checkboxes, links, and text values;
- surface missing or suspicious fields only if a persisted rule or existing Vault Lint signal exists;
- allow selecting property blocks and sending them to Document Copilot.

Potential metadata fields that matter in this product domain:

- `type`;
- `status`;
- `project`;
- `source`;
- `confidence`;
- `tags`;
- `aliases`;
- `created`;
- `updated`;
- `owner`;
- `topic`.

These are examples for product thinking, not a hardcoded implementation contract.

## External Links And Internet Resources

External links deserve separate treatment from vault links.

First version should show:

- domain;
- link text;
- raw URL or markdown URL;
- source block;
- whether it is naked URL or named markdown link.

Later versions can add:

- broken / redirected / unavailable status;
- freshness check;
- role classification such as source, tool, reference, random link;
- domain grouping;
- source-quality notes.

Network checks are not required for v1.

## Implementation Phasing

### Phase 0: Contract And Parser Spike

Goal: prove that current Markdown can be parsed into an ordered block tree.

Deliverables:

- `DocumentBlock` data model;
- deterministic parser for headings, paragraphs, tasks, links, images, embeds, tables, code, math, callouts;
- block ids, hashes, line ranges;
- basic tests for ordered block extraction.

### Phase 1: Atlas Tree MVP

Goal: show current file as an ordered tree.

Deliverables:

- `Open File Atlas` command;
- Atlas Tree with headings, resources, tasks, and selected raw blocks;
- basic layer toggles;
- Inspector for selected raw/resource node;
- no persisted insight display yet.

Recommended default view:

```text
Headings + Resources + Tasks
```

### Phase 2: Persisted Insight Display

Goal: show prior Copilot/Lint insights inside the tree.

Deliverables:

- sidecar or database-backed insight store;
- anchor record shape;
- insight nodes: claim, evidence, example, action, question, decision, risk, summary, issue;
- provenance display;
- anchor status display.

### Phase 3: Selection Tray And Copilot Handoff

Goal: make Atlas useful as a context preparation surface.

Deliverables:

- multi-select blocks;
- Selection Tray;
- `Send to Document Copilot`;
- Document Copilot receives selected block payload with anchors and source excerpts.

### Phase 4: Git-Aware Reliability

Goal: improve anchor stability when Git is available.

Deliverables:

- reliability indicator: Basic / Versioned / Managed;
- optional Git provenance fields;
- diff mapping capability through Command Gateway;
- recommended Git plugin prompt;
- stale/unresolved insight handling.

### Phase 5: Advanced Projections

Goal: add high-value projections after the ordered tree is stable.

Candidates:

- Resource preset / shelf projection;
- entity board;
- timeline projection;
- same-entity inside-file relation view;
- source audit projection;
- debug anchor view.

## First Implementation Slice

The smallest useful first slice is:

```text
Open File Atlas
  -> parse active Markdown file into ordered blocks
  -> show headings + resources + tasks in document order
  -> distinguish Vault links from External links
  -> show selected node in Inspector
  -> support layer toggles
```

This avoids AI generation, persistence complexity, Git complexity, and Copilot integration while validating the central product idea.

## Risks And Failure Modes

| Risk | Failure mode | Mitigation |
| --- | --- | --- |
| Tree becomes too noisy | User sees every paragraph and stops using it. | Default paragraphs off; presets; compact density. |
| Atlas overlaps Document Copilot | Feature becomes another rewrite/generation panel. | Keep Atlas read/inspect/select; send context to Copilot for action. |
| Insights drift after edits | Old claims attach to wrong block. | Block anchors, content hashes, stale/unresolved states, Git enhancement. |
| Links become one generic pile | External references and vault navigation become indistinguishable. | Separate Vault links, External links, Embeds/Attachments. |
| Counts replace structure | User loses document order. | Blocks and insights are tree nodes; counts only collapsed summaries. |
| Git becomes a hard dependency | Non-Git users cannot use the feature. | Basic reliability mode must work without Git. |
| UI exposes too many filters | Controls feel like settings soup. | Four top-level toggles plus presets; advanced filters hidden. |
| Persistence becomes chat-history-only | Copilot insights disappear after the run. | First persisted insight model must be defined before insight UI. |

## Non-Goals

File Atlas should not:

- replace Document Copilot;
- generate new claims/evidence/actions itself;
- rewrite or apply document changes directly;
- fix metadata directly;
- split notes directly;
- become a vault-wide graph;
- ship a custom graph editor (manual edges, private graph persistence) — saved note sets and spatial editing are deferred to Collection notes + Obsidian Canvas reuse (roadmap backlog);
- become a generic word cloud;
- require Git to open;
- require network checks for links in v1;
- hide uncertainty about stale anchors.

## Open Questions

1. Where should persisted insights live: SQLite, sidecar markdown/JSON, or an existing artifact store?
2. Should raw block parsing use Obsidian's metadata cache, a Markdown parser, or a hybrid?
3. How much of the existing Heading mode can be reused versus replaced by the ordered block model?
4. ~~Should File Atlas open as a Quick Search mode, a right sidebar view, or a command modal?~~ **Answered (2026-07-09):** File Atlas lives inside the existing `CopilotPickerModal` as its **Atlas tab**, replacing the old heading-filter view. The picker already carries the Atlas / Document Copilot / Ambient tab bar and the full-path header, so `FileAtlasPanel` mounts in `embedded` mode (its own mode-nav suppressed). The "Open File Atlas" command opens the picker with `initialTab: 'atlas'`. No standalone modal.
5. What is the first Document Copilot payload contract for selected blocks?
6. Which Git plugin should be recommended for `Managed` reliability mode?
7. Should backlinks and unlinked mentions appear in the first Resource layer, or wait until the basic ordered tree is proven?

## Decision Log

### Decision: Use File Atlas As The Product Name

Reason: It communicates a map of the active file and leaves room for structure, resources, insights, and handoff.

Alternatives: Note Atlas, Document Lens, File Lens, Resource Map, Context Map.

Trade-off: `Atlas` is slightly abstract, but the command label and UI can make it concrete.

### Decision: The Main Surface Is An Ordered Block Tree

Reason: The user explicitly rejected summary counters because they lose order and navigability.

Alternatives: heading tree with badges, resource shelf list, stats panel.

Trade-off: More complex parser and UI, but much stronger mental model.

### Decision: Persisted Insights Are Tree Nodes

Reason: Copilot output should not disappear into chat history. Claims, evidence, examples, and actions should remain visible where they belong in the document.

Alternatives: keep insights only in Copilot history; show them as counts beside headings; show them in a separate insight list.

Trade-off: Requires anchor model and persistence, but makes prior AI work reusable.

### Decision: Atlas Does Not Execute Copilot Work

Reason: Document Copilot already owns generation, rewrite, split, and apply workflows. Atlas should prepare context and preserve structure.

Alternatives: add rewrite/refactor/fix buttons inside Atlas.

Trade-off: Adds one handoff step, but keeps product responsibilities clean.

### Decision: Graph Subview Is Read-Only; Custom Graph Editing Is Cut (2026-07-09)

Reason: The v2 mock's graph builder bundled three different jobs. (1) Curating a set of related notes is a real recurring need, but its correct container is a vault-native MOC collection note where links are the data — not a private graph store. (2) Manually drawn edges are shadow data: a relationship that is real belongs in markdown as `[[link]]` so backlinks, native graph, and our own index can consume it; an edge living only in plugin storage drifts from the vault and needs a draft/save state machine just to stay coherent. (3) Spatial arrangement and freeform connection is Obsidian Canvas's core product; a bespoke reduced graph editor competes with a first-class host feature and loses.

Alternatives: keep the full graph builder inside File Atlas; ship it as a separate saved-graph-views feature with private persistence.

Trade-off: users lose in-place graph editing in v1, but the recurring-context job is preserved through the future "Collection notes + Canvas reuse" backlog item (save selection as a `type: collection` MOC note; Atlas renders any note's neighborhood read-only; optional export to `.canvas`). Full discussion archive and promotion questions: `docs/research/2026-07-09-collection-notes-canvas-reuse/README.md`; registered in `docs/roadmap.html` backlog, 2026-07-09.

Implementation constraint (2026-07-09): when the read-only graph subview ships, it must reuse the Vault Search Result Graph View rendering stack — `src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx` (cytoscape.js + fcose/cise/cola/dagre, presets constellation / flow-tb / flow-lr / folder / orbit). Extract it into a shared graph component and feed it a document-neighborhood subgraph; do NOT build a second graph renderer. The two surfaces must stay visually and behaviorally consistent (same presets, same node/edge styling, same interaction grammar).

### Decision: Git Enhances But Does Not Gate The Feature

Reason: Git-aware anchors are more reliable, but requiring Git would block ordinary users and first-run usage.

Alternatives: require Git for persisted insights; ignore Git entirely.

Trade-off: More adapter complexity, but clear reliability states make the behavior explainable.

## Mock Review 2026-07-09 (index-v2)

Reviewed mock: `docs/gstack/file-atlas-mock-2026-07-08/index-v2.html`. Verdict: visual language is fine; three structural deviations from this spec must be fixed in v3, and the graph subview grew into an out-of-scope product.

P0 findings (spec deviations):

| Finding | Spec requirement violated | v3 fix |
| --- | --- | --- |
| Tree is a flat list: two indent levels, decorative twisties, no collapse, no H2/H3 nesting. | "Ordered document object tree", "expand/collapse by heading and by block groups". | Real collapsible tree; collapsed heading rows show count summary (the only allowed count usage). |
| No presets; 4 layer chips + 26 independent checkboxes; Heading is filterable. | Presets section; "Heading rows should always remain visible"; risk "settings soup". | Preset segmented control (Overview / Reading / Writing / Resources) as primary entry, filter popover secondary with modified-dot; Heading removed from filters. |
| Insight rows and Inspector show no provenance, no anchor status; no top-bar reliability indicator. | Insight Layer provenance fields; anchor status display; reliability state Basic / Versioned / Managed. | Inspector gains Provenance and Anchor cards; anchor status dot on rows; reliability chip in doc context bar. |
| Graph subview is a full graph builder: create / search-add / manual edges / edge delete / draft-save state machine / custom saved views. | Non-goals: "not become a vault-wide graph"; no such feature anywhere in spec. | Graph reduced to read-only system views (1-hop / 2-hop) + layout presets + node popover. Editing reclassified — see Decision Log. |

P1 findings (interaction design): Inspector占50%但内容稀疏（改 60/40，内容补齐）；badge 列混装类型/链接类别/insight kind/状态四种语义（改为固定"类型 badge + 状态点"双槽）；multi-select 只有部分行有入口、tray 溢出无 +N 计数；大搜索框角色不明且 tree/graph 切换时 chrome 跳变（搜索降级为树内过滤输入）；未回答 open question #4 的窄容器形态（v3 增加 side-panel 宽度切换）。

P2 findings (mock-level bugs): 图编辑态选中 draft 图但画布仍渲染 7 节点旧图、meta chip 与画布节点数矛盾；graph 搜索结果行 title 与 meta 文字粘连（外层 span 无布局）；paragraph 行 data-sub 声称 "Hidden in Overview" 但默认显示；行号 gutter 固定 30px 三位数行号贴边。

## Review Checklist

Before implementation starts, confirm:

- File Atlas is still positioned as inspect/navigate/select/handoff, not execute.
- Atlas Tree shows block nodes directly, not only counts.
- Vault links, external links, and attachments are separate node types.
- Insight persistence is designed before insight display ships.
- Anchors are block-based, not line-number-only.
- Git reliability is optional and routed through Command Gateway.
- Defaults are high-signal: headings, resources, insights, issues, and tasks; generic paragraphs off.
- The first implementation slice can ship without AI, Git, or network checks.
