# Composer Unified History Filter Mock

Design-only mock for owner review. It does not change production Composer code.

## What this mock decides

- Keep one unified History timeline.
- Promote the common record-type filter to visible buttons: All, AI generation,
  Copilot, and document edits.
- Put secondary facets in one owned popover; never nest native `select` menus.
- Omit repeated `All` values. An empty group means all.
- Keep only time in the row's trailing column. Source is represented by its
  icon/color and accessible label.
- Show plain-language, markup-free summaries. Full source/result content stays
  in the detail modal.
- Use the target excerpt to distinguish legacy activities instead of repeating
  `Legacy AI generation`.

## Interaction

- Click a record-type button to filter the sample list.
- Open `更多` and multi-select change type, result status, or target scope.
- Active secondary filters appear as removable chips below the primary row.
- `Escape`, close, or `完成` closes the filter popover.

## Scope

This is an HTML design artifact only. Production implementation and real
Obsidian interaction verification are intentionally out of scope.
