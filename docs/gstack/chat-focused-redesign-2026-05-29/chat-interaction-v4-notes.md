# Chat Interaction V4 Notes

Date: 2026-05-29

This pass answers the core interaction question: if the default chat UI is quiet, how does the user still reach model/mode controls and message actions?

## Input Interaction

Default input keeps one run capsule:

`Chat · Auto model · 0 ctx`

Clicking that capsule opens a run settings popover with:

- Run mode: Chat / Agent / Plan.
- Model routing: profile auto model plus manual one-message override.
- Context: current note, vault search, context count.

This keeps mode/model/context discoverable without showing three equally weighted controls in the footer.

## Message Interaction

Default message keeps the answer readable. Actions are layered:

- Hover rail: Copy, Regenerate, Star, More.
- More menu: follow-up, rewrite, trace, create action, save to note, branch.
- Inline drawer: clicking Ask follow-up opens a compact composer directly under the answer.

The capabilities remain present, but they are triggered from the message object instead of permanently visible below every answer.

## Preferred Direction

Use:

- `19-input-default-v4.html` and `20-input-run-settings-v4.html` for input.
- `21-message-hover-default-v4.html`, `22-message-more-menu-v4.html`, and `23-message-inline-followup-v4.html` for message actions.

The principle is "quiet by default, complete on demand."
