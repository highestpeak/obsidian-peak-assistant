# Composer unified insert surfaces

## Goal

Make insertion and hover behavior feel like one live-rendered Composer rather
than several unrelated popover systems.

## Interaction contract

1. `+` always means direct insertion at the visible structural position.
2. Entering a block or list gap acquires one pointer-relative anchor. The anchor
   stays fixed until the pointer leaves the complete trigger/menu corridor.
3. Hovering the stable `+` opens its type menu after a short intent delay. A
   click is not required to reveal the menu.
4. A list gap offers direct list/task insertion. AI fill remains available only
   behind an explicit Sparkles action.
5. Choosing a block type opens one full-width inline draft at the destination.
   The default surface never exposes a Markdown/preview split.
6. Hover link previews are informational and delayed. AI link operations stay
   on explicit block/action surfaces.
7. Only one transient Composer surface owns the document at a time. Priority is
   `draft/pinned > selection > link > menu > block actions`.

## Implementation tracks

- Add a root-owned surface coordinator and use it across block rows, gaps,
  drafts, selections, and links.
- Replace continuous pointer tracking with acquire-and-lock anchoring.
- Add source-safe direct list-item operations and focus the inserted item after
  the transaction reparses.
- Replace `NewBlockDraft` with type-specific inline editors that serialize to
  the existing Markdown transaction path.
- Simplify and delay `LinkPreviewLayer`.
- Update the template-owned labels/timing policy and focused contracts.

## Protected scope

- Do not change the Obsidian Markdown CodeMirror editor.
- Do not change AI capability execution or candidate acceptance semantics.
- Do not change native-file ownership or introduce private persisted syntax.
- Preserve the existing transaction hub, revision checks, History, and Undo.

## Verification

- Focused unit/contract tests for list insertion, anchoring, draft serialization,
  surface priority, link dwell, and config drift.
- Production build.
- Real Obsidian CDP hover/focus/geometry verification when a listener is
  available; otherwise mark the interaction boundary explicitly.
