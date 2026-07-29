# File Atlas Copilot + Flatten Mock

Design-only mock for adding Composer-aligned Copilot suggestions to File Atlas and an icon-only flatten control beside filter / expand / collapse.

## Open

Open `index.html` in a browser:

```text
docs/gstack/file-atlas-copilot-flatten-2026-07-29/index.html
```

## Product Judgment

This idea is strong because File Atlas already turns a document into targetable objects: headings, lists, list items, links, resources, saved insights, and generated anchors. Composer works on document elements while writing; Atlas can work on the same element model while reading, inspecting, selecting, and routing.

The boundary should stay clear:

- File Atlas selects, reveals, filters, compares, and hands off.
- Copilot suggestions in Atlas are scoped to the selected element.
- The suggestion generator, preset set, ranking, and card semantics must stay identical to Composer Copilot.
- Rewrite / insert / transform actions should open Composer Review or a native-safe candidate flow.
- Atlas should not silently write Markdown or become a second Composer surface.

## Interaction Shape

- Right inspector gains `Copilot suggestions`.
- Selecting any Atlas row updates the Copilot scope and the first shared suggestion.
- The old separate quick actions are intentionally removed; Atlas must not maintain its own Copilot action taxonomy.
- Bottom tray remains useful for multi-select handoff.
- Filter and flatten controls are icon-only in the toolbar, with `aria-label` and tooltip text preserved.
- The flatten icon toggles the center tree into a flat source-order list.
- Flatten mode preserves the original parent path as a crumb instead of destroying hierarchy.

## Files

- `index.html` — static mock.
- `mock.css` — visual style.
- `mock.js` — local interactions for row selection, Copilot action states, and flatten toggle.
- `preview-desktop.png` / `preview-flat.png` / `preview-narrow.png` — generated screenshots after QA.
- `qa-manifest.json` — Playwright smoke-test output.
