# Plugin Command Gateway Review UI reference

Status: design-only, high-fidelity production reference. This does not change
the React implementation or merge the Gateway branch into the owner checkout.

This focused mock replaces the earlier flow prototype as the visual source of
truth for `Settings → Tools → External plugin commands`.

Owner feedback incorporated:

- row actions are anchored in one stable far-right `Access` column;
- each row has one state control (`Off`, `Allowed`, `Blocked`, or
  `Unavailable`) instead of separate Allow / Turn off / Block buttons;
- `Allow filtered` applies to the current search and filters;
- the split menu also exposes `Allow all eligible commands` and `Block current
  filter`;
- bulk Allow excludes unknown, destructive, modal-only, unavailable, already
  allowed, and explicitly blocked commands;
- plugin containers are compact list groups rather than action cards.

The mock uses example commands and never reads or changes an Obsidian Vault.
Run `node validate.mjs` to verify the structural design contract and JavaScript
syntax.
