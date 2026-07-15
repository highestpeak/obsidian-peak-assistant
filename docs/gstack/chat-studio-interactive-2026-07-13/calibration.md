# Peak house-style calibration

> **Authority boundary:** This is visual-calibration evidence and design history only. The [Chat Studio complete implementation spec](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md) is the implementation master; this calibration cannot override its functional or implementation requirements.

Document role: visual calibration evidence only. The accepted Chat Studio UI/UX direction is summarized in [`discussion-synthesis.md`](./discussion-synthesis.md); this file must not override owner decisions or runtime-truth boundaries.

This is the visual baseline used by the Gate 0 mock. It was extracted from the current production tokens and the Chat, Quick Search, Settings, project-list, and shared-component surfaces. It is not a competitor mood board.

## Shared visual grammar

| Dimension | Production baseline | Gate 0 translation |
|---|---|---|
| Typeface | system sans: SF Pro Text / PingFang SC; mono for models, counts, and shortcuts | use `--pk-font-sans`; reserve `--pk-font-mono` for model/keyboard metadata |
| Type scale | 10 / 11 / 12 / 13 / 13.5 / 14 / 14.5 / 16 / 20 / 28px | 14px header, 14.5px message body, 10–12px sidebar metadata |
| Spacing | 4px grid: 4 / 8 / 12 / 16 / 20 / 24; larger values are page-level exceptions | keep all Studio working-area gaps within 4–24px |
| Radius | 4 / 8 / 12 / 16px; pill is semantic | 4px nav/actions, 8px controls, 10px user bubble, 12px Composer |
| Surfaces | continuous white/grey working surfaces, soft 1px separators, very weak shadows | no rounded outer panes; no Assistant cards; one subtle Composer shadow |
| Hover | `--pk-state-hover` or sunken surface | row-level response without elevation |
| Selected | accent tint + restrained indicator | left row uses tint plus 2px accent line |
| Focus | accent border + translucent ring | search and Composer share the same focus language |
| Icon controls | 14–16px icon in 28px button | compact toolbars, no decorative icon rail |

## Surface-specific findings

- **Chat:** Assistant content is a document flow, user content is the only regular message bubble, Composer is a 12px-radius bounded work surface, and action metadata is subordinate to reading.
- **Quick Search:** dense rows and flat inspectors are relevant; large modal/popup shadows are not.
- **Settings:** grouped cards and 32–48px page margins belong to configuration pages and must not migrate into Chat Studio.
- **Project list:** the compact form already proves the brand row can be removed. Gate 0 begins directly with search and create actions.

## Width decision

Current production Chat defaults are approximately 280px left and 320px right. Gate 0 intentionally starts at **248px / flexible / 304px** because the owner feedback repeatedly identifies excess spacing and weak centre emphasis. Both widths are adjustable within the agreed review ranges, so this is a controlled compaction proposal rather than a silent change to the house style.

## Hard constraints applied

1. No Peak logo, product title, welcome block, mascot, or standalone brand icon.
2. Purple is limited to selection, focus, send, and meaningful state; it is not decoration.
3. Assistant messages do not receive card backgrounds.
4. Side content is made from rows and separators, not stacked dashboard cards.
5. The final message stays close to Composer in short conversations; blank canvas is allowed above the recent exchange, not between reading and action.

## Primary code references

- `src/styles/peak-tokens.css`
- `src/styles/peak-components.css`
- `src/ui/view/chat-studio-view/ChatStudioView.tsx`
- `src/ui/view/project-list-view/ProjectListView.tsx`
- `src/ui/view/project-list-view/ConversationsSection.tsx`
- `src/ui/view/quick-search/SearchModal.tsx`
- `src/ui/view/settings/components/SettingsRow.tsx`
- `docs/conventions/ui-design.md`
