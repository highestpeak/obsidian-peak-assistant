# Peak Composer · Fluid writing interaction mock

Open [`index.html`](./index.html) in a browser.

## What this mock decides

- The primary `在下方插入` action creates and focuses an empty Markdown block.
- Paragraph / heading / list / task / quote / Callout / code / formula are typed,
  not selected from a block-type toolbar.
- Complex objects use a separate compact picker.
- Image, Base, Canvas, and Excalidraw share `新建 / 引用已有`.
- Table starts from a small editable grid.
- AI Sheet is a design contract only. It is visibly marked `待接线` and must not
  appear in production until runtime, serializer, create/reference ports,
  transaction writeback, reparse, and History are real.

## Production boundary

This mock is not real Obsidian acceptance and contains no production data path.
The implemented production slice for this decision lives in:

- `src/ui/view/composer/chrome/NewBlockDraft.tsx`
- `src/ui/view/composer/chrome/EditableText.tsx`
- `src/ui/view/composer/chrome/InsertTypeMenu.tsx`
- `templates/config/composer.json`

Without Obsidian CDP evidence, interaction acceptance remains
`INTERACTION NOT VERIFIED`.
