# Codex Imagegen Prompt — Multi-Panel System

Use Codex built-in image generation, not gstack image generation.

Create a product UI mockup storyboard for an Obsidian plugin called Peak Assistant.

The mockup should show that Peak Assistant is not a standalone page and not only a narrow side panel. It is a multi-panel system inside Obsidian.

Required panels:

1. Docked right-side assistant panel:
   - compact,
   - current note context,
   - 2-3 recommendations,
   - pending review.

2. Pop-out command panel:
   - large centered overlay above the Obsidian workspace,
   - similar to a native modal/panel,
   - enough space for grouped action discovery,
   - action search,
   - current note context strip,
   - sections like Recommended, Document, Connect, Vault, Research, Manage.

3. Review/apply panel:
   - focused result panel,
   - candidate cards,
   - provenance badges,
   - confidence/reasons,
   - preview/diff,
   - apply selected, open sources, ignore, undo.

Important:

- Keep Obsidian visible behind the pop-out panel.
- The active note remains the product's center of gravity.
- The pop-out panel is not a full page and should not look like a SaaS dashboard.
- The action catalog should be grouped and searchable, not a huge equal-weight card grid.
- Show that `Suggest Links` and `Suggest Links (Graph)` are merged into `Connect Related Notes`; semantic/graph/agent become provenance badges later.
- Use quiet professional UI, restrained color, subtle shadow, compact typography, and 8px or smaller radii.

Avoid:

- marketing hero layout,
- full browser-app dashboard,
- decorative gradients,
- raw agent traces as the main surface,
- equal-weight grids of 20 actions,
- exposing semantic/graph/agent as separate top-level action choices.
