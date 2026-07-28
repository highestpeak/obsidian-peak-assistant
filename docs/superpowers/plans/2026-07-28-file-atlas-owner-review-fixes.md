# File Atlas owner-review fixes

## Scope

Implement the owner-approved File Atlas corrections from the 2026-07-28 UI
review:

1. Move graph node/edge counts out of the control toolbar and into the existing
   canvas HUD beside the current graph-copy actions.
2. Model a Markdown list as one collapsible List block with addressable
   ListItem/Task children, preserving nested-list hierarchy.
3. Double-clicking a tree row closes File Atlas, activates the source Markdown
   editor, focuses it, and reveals the selected block.
4. Show Keywords, Statistics, and Location for every selected block, using
   kind-aware text/stat sources and explicit empty keyword state.
5. Keep only Most used and Name file-rail sorting, make the sort affordance
   visibly interactive, migrate legacy Recently viewed preferences to Most
   used, and freeze Most-used order for the lifetime of an open modal.
6. Remove the nested/native focus chrome from the document search input while
   preserving the outer focus-visible treatment.

## Invariants

- A list with 21 items remains one document block; its children are addressable
  units and must not inflate the document block count.
- Task items render once, nested under their owning List.
- Clicking selects in Atlas; double-clicking opens in the editor. Twisty and
  tray controls never trigger row double-click behavior.
- Group nodes retain Location information.
- Parent aggregate text is counted exactly once; list/heading descendants must
  not be double-counted.
- Existing Copy graph / Copy graph image behavior remains unchanged.
- The Recent file group remains; only the Recently viewed sort mode is removed.
- Focus removal applies only to the inner input chrome. The outer search focus
  ring remains accessible.

## Verification

1. Focused parser/tree/rail/Inspector contract tests.
2. Full `npm run test`.
3. Production `npm run build`.
4. Real Obsidian CDP assertions for:
   - list expand/select;
   - double-click modal close + active Markdown leaf + cursor line/focus;
   - graph HUD count placement;
   - visible sort affordance and stable order;
   - search focus without an inner border/shadow.

## Execution result

- Focused File Atlas suite: 7/7 passed.
- Full suite: 337/339 passed. The two failures are pre-existing Chat Studio /
  code-theme source-contract failures outside this change set.
- Production build and bundle syntax check: passed.
- Real Obsidian interaction: `INTERACTION NOT VERIFIED`. The running app had no
  CDP listener, so the implementation was not copied into the user's dirty main
  plugin checkout and coordinate clicking was not used as substitute evidence.
