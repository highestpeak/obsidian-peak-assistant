# Composer shared Markdown source editor design

Date: 2026-07-31
Status: Accepted for implementation

## Outcome

Composer has one production Markdown editing core for both:

- a newly inserted, not-yet-persisted Markdown draft; and
- an existing persisted Markdown text leaf.

The core owns browser DOM mutation, Markdown projection, source-coordinate
selection, IME gates, keyboard/beforeinput arbitration, and selection restore.
Its host adapter owns persistence and object-specific structural transactions.

This removes the current behavior split where `NewBlockDraft.tsx` and
`EditableText.tsx` each implement their own contenteditable lifecycle.

## Product boundary

The primary “insert below” action creates one empty Markdown draft and focuses
it. Ordinary Markdown structures are typed directly:

- headings;
- paragraphs;
- lists and tasks;
- quotes and callouts;
- fenced code;
- formulas.

Complex resources keep explicit creation/reference entry points:

- image;
- table;
- Base;
- Canvas;
- Excalidraw.

This change does not merge those resource editors into the Markdown editor.

## Root causes addressed

1. Draft formatting and Enter are currently handled by both `keydown` and
   `beforeinput`, so one physical gesture can be applied twice on browsers that
   emit both events.
2. The visible caret at the end of formatted text maps before hidden closing
   source delimiters. Enter therefore inserts inside `**…**` or canonical HTML
   unless the source caret first exits the closing stack.
3. Draft and persisted editors separately implement projection, IME and
   selection restoration, allowing fixes to drift.
4. A persisted list leaf exposes only item content. List indentation must be
   delegated to its list owner because the structural prefix is outside the
   leaf's editable range.
5. Native deletion of a selected formatted run can leave an empty Markdown or
   HTML shell. Source-aware deletion must own that operation.

## Ownership contract

### `MarkdownSourceEditor`

The shared React component owns:

- exactly one unmanaged `contenteditable` subtree rendered from source;
- `textContent` as the lossless live source round trip;
- absolute DOM-to-source selection mapping;
- projection only after a syntax/structure transition, never per IME event;
- focus-safe selection restoration after projection;
- one command dispatch per physical gesture;
- native typing while an IME composition is active;
- optional local source history for an unpersisted draft.

### Draft adapter

The draft adapter owns:

- React draft state;
- source-aware format, deletion, Enter and list indentation commands;
- local Undo/Redo history;
- final insertion through the existing Composer transaction hub.

### Persisted adapter

The persisted adapter owns:

- debounced text bursts through `DirectEditController`;
- atomic explicit commands through the same controller and hub;
- hub Undo/Redo after the native dirty boundary;
- object-owned Enter and list indentation callbacks.

### Structure owners

List indentation is a structure transaction built from the current snapshot.
The list owner resolves the current block/unit after flushing, changes only the
item's leading indentation, reparses through the hub, and restores focus to the
same semantic item.

## Interaction invariants

1. One physical command produces at most one source edit.
2. `compositionstart` to `compositionend` receives no projection replacement
   and no durable flush.
3. Plain typing remains native contenteditable input.
4. Formatting never writes browser-owned `<b>`, `<i>` or `<u>` DOM.
5. Inline formatting uses the existing canonical Markdown/HTML serializer.
6. Enter at the visible end of a formatted run exits all adjacent closing
   delimiters before inserting the break.
7. Tab only prevents focus navigation when a list structure accepts the
   command.
8. Source selection direction survives formatting, indentation and projection.
9. React never owns descendants that the browser can delete. Editable
   projection uses one `dangerouslySetInnerHTML` boundary.
10. Draft local Undo/Redo and persisted hub Undo/Redo remain distinct history
    adapters over the same interaction core.

## Verification boundary

Required automated evidence:

- pure source command tests for formatted Enter, deletion and list indentation;
- structural guards proving both production paths render the shared editor;
- a Playwright flow against the real `ComposerRoot` harness covering draft
  typing, B/I/U, Enter, nested lists, deletion, Undo/Redo and no page errors;
- focused Composer suites;
- production build.

Harness evidence proves the production React component and transaction stack,
but it is not real Obsidian acceptance. Real Obsidian keyboard/IME acceptance
requires CDP and is reported separately.
