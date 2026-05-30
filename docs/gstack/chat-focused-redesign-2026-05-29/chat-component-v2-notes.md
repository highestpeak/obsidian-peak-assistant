# Peak Chat Component V2 Notes

Date: 2026-05-29

## Design Source

This revision follows the existing repo direction instead of replacing the chat UI:

- Keep the Obsidian-like dark left rail and conversation list.
- Keep assistant messages as document-like markdown text, not bordered cards.
- Keep message metadata and actions lightweight and mostly hover/last-message visible.
- Keep the input composer large, but hide secondary complexity in icon menus.
- Keep the right panel as a topic outline, not a role-by-role transcript.

Relevant historical sources:

- `docs/superpowers/specs/2026-04-22-chat-ui-redesign-design.md`
- `docs/superpowers/plans/2026-05-05-message-ui-v9-redesign.md`
- `docs/mockups/input-toolbar-final.html`
- `docs/gstack/usage-dashboard-mockups-2026-05-29/`
- `docs/gstack/onboarding-redesign-2026-05-29/`
- `docs/gstack/settings-redesign-2026-05-29/`

## Component Decisions

### Left Conversation List

The prior V2 light sidebar felt detached from the real product. The revised version returns to the current dark navigation shell, but makes the conversation rows denser and more meaningful:

- Project rows show title plus one-line scope.
- Conversation rows show title, preview, and date/time.
- Date sections remain simple: Today / This Week / Older.
- Active row can keep the current Obsidian blue selection; purple remains the product accent.

### Message Item

The message should feel like a readable working document. Too many bordered sub-panels make it noisy.

- Assistant answer has no enclosing card.
- Tool usage is a single collapsed line.
- Metadata row is small and stable.
- Copy / regenerate / star / branch remain icon-level.
- Refine, follow-up, and actions are text chips below the answer, not large buttons.

### Input Composer

The right side of the footer should not read as `Chat Auto Used` with equal weight.

- `Chat` is the conversation mode.
- `Auto model: gpt-5-mini` is the model routing state.
- `0 ctx` replaces green `Used 0`; it is a theme-colored context usage indicator, not a success badge.
- Secondary capability controls stay as icons on the left.

### Topic Outline

The current `USER / ASSISTANT` transcript is not an outline. The correct right panel is:

- Topic groups first.
- Message entries inside each topic.
- Each entry has role marker, title, preview, and time.
- Active message uses an accent left rail.
- No separate Current thread / Follow-ups / Actions / Errors sections.
