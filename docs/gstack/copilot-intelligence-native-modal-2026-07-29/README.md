# Copilot Intelligence Native Editor Modal Mock

Design-only HTML mock for `docs/superpowers/specs/2026-07-29-copilot-intelligence-native-editor-modal.md`.

Open:

```text
file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/copilot-intelligence-native-modal-2026-07-29/index.html
```

What this mock demonstrates:

- Obsidian native editor remains the writing surface.
- `Copilot Intelligence` opens as a modal companion, not as Composer View.
- Top-level IA stays `Copilot / History`.
- The `Copilot` area is split into two Copilot presentations: automatic suggestions and conversation.
- The automatic suggestion column reuses the Composer sidecar suggestion card semantics, preset set, and ranking model.
- The conversation column reuses the shared prompt composer shape instead of introducing a new input component.
- Current file, selection, material snapshot and source revision are visible.
- Full review is not a modal tab; suggestions can hand off to Composer Review when the user wants a one-time comprehensive review.
- History is separate and can be opened directly for current-file write records.

This folder is a static design artifact. It is not production UI and does not imply runtime implementation is complete.
