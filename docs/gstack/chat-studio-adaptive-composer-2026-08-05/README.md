# Chat Studio Adaptive Composer mock

This folder is a design-only, interactive proposal for the Chat Studio message
composer. It does not modify or prove production behaviour.

The mock translates the interaction observed in the 2026-08-05 reference video
into Chat Studio semantics:

- reading older messages collapses the composer into a single-line floating pill;
- returning to the latest turn morphs the same shell into the full composer;
- focus, drafts, attachments, open menus, and active runs keep the composer open;
- the next message's concrete context remains visible while typing and opens into
  an evidence-style provenance view;
- that view follows the whole lifecycle: **Will include** before send, a **Frozen**
  snapshot while the run is active, and an **Actually used** receipt on the
  completed assistant message;
- every stack layer opens into one inline inspector showing its concrete content,
  source, inclusion reason, budget, and compression or omission treatment;
- the context view mirrors `docs/11-feature-chat-context.html` and the current
  `ChatProfile` order: required, optional, compressed, empty, and explicitly
  excluded inputs are shown separately;
- Add, Context, Assistant, and Model use one popover family and one spatial anchor;
- run feedback and contextual suggestions live above the composer instead of
  permanently occupying its toolbar.

The page contains a small **Interaction demo** panel on the right. Use it to move
between Reading, Latest, and Running states. The real scroll container also drives
the compact/expanded transition.

The Context popover deliberately matches the composer width. Its left side is the
ordered slot stack; its right side lists data that is not part of the next turn,
including the full Vault, inactive variants, parent-branch history, and web results
that have not been retrieved yet. Human-readable descriptions are the default;
the token limits and compression rules remain available behind **Technical
details** instead of dominating the first view.

Click any numbered layer to inspect it. Only one layer stays open at a time.
Arrow keys move through the stack, Enter or Space opens the focused layer, and
Escape closes the layer before it closes the whole Context popover. Empty layers
remain inspectable so the omission reason is explicit.

Static review captures are included for the expanded, context-evidence, compact,
Add-menu, running, and narrow-window states. The live HTML is the design source;
the PNGs are only checkpoints.

## Open

From the plugin root:

```bash
python3 -m http.server 8173
```

Then open:

```text
http://127.0.0.1:8173/docs/gstack/chat-studio-adaptive-composer-2026-08-05/index.html
```

The page can also be opened directly with `file://`.

## Review boundary

- This is one selected visual direction, not a production implementation plan.
- Menu contents represent the intended information architecture and may include
  capabilities that still require production wiring or acceptance.
- The existing Chat Studio implementation specification remains authoritative for
  runtime ownership, persistence, and capability truth.
