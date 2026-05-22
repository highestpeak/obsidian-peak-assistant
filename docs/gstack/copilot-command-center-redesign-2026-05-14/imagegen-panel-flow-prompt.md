# Codex Imagegen Prompt — Obsidian Panel Flow

Use Codex built-in image generation, not gstack image generation.

Create a product UI mockup storyboard for an Obsidian plugin called Peak Assistant.

Important constraints:

- This is not a standalone web app page.
- The assistant lives inside an Obsidian right-side panel.
- The main note/editor remains visible and dominant.
- The panel is compact, roughly 320-420px wide.
- Show a progressive workflow, not a single dashboard.
- The design should feel like Obsidian: quiet, dense, restrained, professional.

Scene:

- Dark Obsidian desktop window.
- Left: faint file explorer.
- Center: markdown note with a selected paragraph.
- Right: Peak Assistant side panel.
- Bottom or top: a small command-palette style quick invocation layer.

Panel states to communicate in one storyboard:

1. Passive panel home:
   - current note context,
   - selection active,
   - 2-3 recommendations.

2. Quick action selected:
   - "Connect Related Notes",
   - scope is already inferred from the current selection.

3. Result review:
   - candidate note cards,
   - source/provenance badges,
   - confidence,
   - reason text,
   - preview/diff.

4. Safe apply:
   - apply selected,
   - open sources,
   - ignore,
   - applied diff/undo line.

Avoid:

- full-page Command Center dashboard,
- big three-column SaaS layout,
- marketing hero visuals,
- decorative gradients,
- huge card grid,
- raw agent trace as the main content,
- top-level semantic/graph/agent strategy choices.

The image should make the product feel like a fast Obsidian panel that can be called while writing, then expands only as much as the selected task requires.
