# Plugin Command Gateway Review UI reference

Status: design-only, high-fidelity production reference. This does not change
the React implementation or merge the Gateway branch into the owner checkout.

This focused mock replaces the earlier flow prototype as the visual source of
truth for `Settings → Tools → External plugin commands`.

Owner feedback incorporated:

- row actions are anchored in one stable far-right `Access` column;
- each eligible row has one far-right `Allowed` switch; off means `Not allowed`
  and on means `Allowed`, with no row menu or explicit `Block` state;
- system-excluded rows replace the switch with one disabled
  `Unavailable` state;
- `Allow filtered` applies to the current search and filters;
- the split menu also exposes `Allow all eligible commands`;
- bulk Allow excludes unknown, destructive, modal-only, unavailable, already
  allowed commands;
- plugin containers are compact list groups rather than action cards.
- Purpose stays internal to curator/runtime policy and is not shown as an
  owner-editable field; expected effects are written directly into summaries.
- Scan shows live plugin name, plugin/command counts, progress, spinner, and a
  temporarily locked command list before returning to the stable Review state.

An explicit-deny distinction may still exist in internal policy or migration
data, but it is intentionally not exposed in the primary owner Review UI. The
visual contract is two-state authorization plus system-owned `Unavailable`.

The mock uses example commands and never reads or changes an Obsidian Vault.
Run `node validate.mjs` to verify the structural design contract and JavaScript
syntax.
