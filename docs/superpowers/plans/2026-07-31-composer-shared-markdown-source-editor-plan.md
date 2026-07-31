# Composer shared Markdown source editor implementation plan

Date: 2026-07-31

## File plan

1. `src/service/composer/newBlockDraft.ts`
   - add source-aware formatted-break and selected-format deletion semantics;
   - keep the canonical mark serializer as the only formatting writer.
2. `src/service/composer/blockOps.ts`
   - add a current-snapshot list-item indent/outdent transaction builder.
3. `src/ui/view/composer/chrome/MarkdownSourceEditor.tsx`
   - introduce the single DOM/projection/selection/IME/command core;
   - include a bounded local source-history adapter for drafts.
4. `src/ui/view/composer/chrome/NewBlockDraft.tsx`
   - remove the private contenteditable implementation;
   - bind draft source commands to the shared editor.
5. `src/ui/view/composer/chrome/EditableText.tsx`
   - retain `DirectEditController` as the persistence adapter;
   - render the shared editor for editable leaves;
   - route B/I/U, source-aware deletion, history and structural callbacks.
6. `src/ui/view/composer/ComposerRoot.tsx`
   - bind persisted list Tab/Shift+Tab to the structure transaction.
7. `test/`
   - extend pure and structural contracts;
   - add a production-harness browser regression.

## Execution order

1. Write failing source-command and shared-component contract assertions.
2. Implement source semantics and list operations.
3. Add the shared editor core with command deduplication and local history.
4. Migrate the draft path.
5. Migrate persisted editable leaves and list structure callbacks.
6. Run focused tests and the production browser flow.
7. Run the full production build and inspect the final diff for ownership.
8. Selectively stage only this task's hunks and commit.

## Protected scope

- Do not change complex resource editors.
- Do not replace `DirectEditController` or Composer transaction/history stores.
- Do not change the canonical inline HTML serialization contract.
- Do not edit unrelated Intelligence sidecar or Peak Sheet work already present
  in the worktree.
- Do not describe harness success as real Obsidian acceptance.

## Completion criteria

- `NewBlockDraft` contains no private contenteditable projection lifecycle.
- `EditableText` and the draft both render `MarkdownSourceEditor`.
- B/I/U and their matching `beforeinput` events produce one edit.
- Enter after bold, italic and underline preserves the format and starts outside
  it.
- nested list Tab/Shift+Tab retains focus and source structure;
- deleting a selected formatted run removes empty wrappers;
- IME composition remains native until `compositionend`;
- focused tests, production browser QA and `npm run build` pass;
- task-owned changes are committed without staging pre-existing work.

## Implementation result

- Both the new-block draft and persisted editable leaves now use
  `MarkdownSourceEditor`; the draft no longer owns a second contenteditable
  implementation.
- The shared core owns Markdown projection, source selection, IME boundaries,
  B/I/U arbitration, formatted deletion, formatted Enter, list indentation and
  draft-local Undo/Redo.
- Persisted list indentation remains structure-owned and commits through the
  Composer transaction hub, with focus restored after reparse.
- Complex table/reference/resource editors remain on their existing dedicated
  paths.

## Verification

- Focused Composer source, projection, IME, list, direct-edit and visual
  contract tests: passed.
- `node test/composer-shared-markdown-editor.qa.mjs`: passed for both draft and
  persisted adapters with no page or console errors.
- `npm run build`: passed, including bundle syntax and Simulator boundary
  checks.
- Full test suite: 384/388 passed. The four failures are pre-existing,
  unrelated worktree/baseline failures in Chat Studio theme wiring, protected
  sidecar imports and the concurrent frontmatter candidate UI.
- Real Obsidian keyboard acceptance: `INTERACTION NOT VERIFIED`; no Obsidian CDP
  listener was available, so browser-harness evidence was not upgraded to
  real-app acceptance.
