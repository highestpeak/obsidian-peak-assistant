# Plugin Command Gateway Review UI reference

Status: approved high-fidelity production reference. The matching React
implementation lives in this isolated Gateway branch and is not merged into the
owner checkout.

This focused mock replaces the earlier flow prototype as the visual source of
truth for `Settings → Tools → External plugin commands`.

Owner feedback incorporated:

- row actions are anchored in one stable far-right `Access` column;
- each eligible row has one far-right `Allowed` switch; off means `Not allowed`
  and on means `Allowed`, with no enclosing button panel, row menu, or explicit
  `Block` state;
- the Access column uses one fixed switch/icon slot and one fixed status-label
  slot, so label length never shifts the control horizontally;
- system-excluded rows replace the switch with one visually bare, disabled
  `Unavailable` status using the same alignment slots;
- `Allow filtered` applies to the current search and filters;
- the split menu also exposes `Allow all eligible commands`;
- bulk Allow excludes unknown, destructive, modal-only, unavailable, already
  allowed commands;
- plugin containers are compact list groups rather than action cards.
- Purpose stays internal to curator/runtime policy and is not shown as an
  owner-editable field; expected effects are written directly into summaries.
- `Scan commands` is the only refresh action. It discovers commands, compares
  changes, applies deterministic safety checks, and prepares explanations for
  review in one pipeline. Whether an explanation uses AI is an internal detail,
  not a second owner action.
- Scan shows live phase text, plugin/command counts, progress, spinner, and a
  temporarily locked command list before returning to the stable Review state;
  it never changes access.

An explicit-deny distinction may still exist in internal policy or migration
data, but it is intentionally not exposed in the primary owner Review UI. The
visual contract is two-state authorization plus system-owned `Unavailable`.

The mock uses example commands and never reads or changes an Obsidian Vault.
Run `node validate.mjs` to verify the structural design contract and JavaScript
syntax.
