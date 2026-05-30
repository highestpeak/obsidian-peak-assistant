# Chat Message V5 Notes

Date: 2026-05-29

Input v4 stays selected. This pass only changes message-level interactions.

## More menu position

The menu should not open over the answer text. The answer keeps a quiet document-like reading surface, while actions live in a narrow right-side gutter:

- visible on hover or focus;
- copy / regenerate / star / follow-up / more are anchored to the message object;
- the More menu opens from the gutter into reserved side space, so it never covers the body text.

This matches the product principle: reading is primary, controls are available but spatially subordinate.

## Follow-up interaction

Follow-up is not a generic panel and not a permanent list of chips below every answer. It is a local reply composer scoped to the selected assistant answer:

- opens after `Ask follow-up`;
- shows a small context chip: same answer + same context;
- offers 2-3 suggested continuation chips;
- reuses the quiet input vocabulary in a smaller local composer;
- can still adjust context/model through the compact run chip if needed.

The mental model is "continue from this answer", not "start a new workflow".

## Preferred files

- `24-message-menu-gutter-v5.html`
- `25-message-followup-composer-v5.html`

