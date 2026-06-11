# Conversation Index Style Redesign

Date: 2026-06-02

Scope: design-only visual exploration for the Chat right sidebar. No product code was changed.

## Generated Variants

| Variant | File | Direction |
|---|---|---|
| A | `variant-a-obsidian-native-neutral.png` | Obsidian-native neutral sidebar. Best fit for current light UI. |
| B | `variant-b-dense-inspector.png` | Denser professional inspector. Best artifact hierarchy. |
| C | `variant-c-premium-knowledge-sidebar.png` | Dark-first unified workspace. Useful as long-term dark theme reference. |

## Recommendation

Implement an A + B hybrid:

- Use Variant A as the main visual target because it keeps the existing product structure and fixes the biggest style mismatch with the least disruption.
- Borrow Variant B's flatter artifact rows, aligned metadata, and stronger inspector rhythm.
- Do not use Variant C as the immediate target unless the whole chat workspace moves to a dark-first presentation.

## Visual Rules

- Remove pastel artifact thumb backgrounds from `file`, `code`, `diagram`, and `image` rows.
- Use one neutral icon container size across Topics, Artifacts, and Messages.
- Keep only one accent color for selected tabs, focus, and selected rows.
- Replace colorful message role badges with neutral role tokens.
- Make artifact type (`FILE`, `CODE`) a small monochrome chip or compact uppercase label.
- Keep card radius at 4-6px and borders at hairline weight.
- Use `--pk-*` tokens from `src/styles/peak-tokens.css`; do not add inline hex colors.
- Keep typography calm and system-native. Do not use monospace/typewriter styling for body or row titles.

## Implementation Pointers

- Component: `src/ui/view/chat-view/components/ConversationIndex.tsx`
- Main CSS: `src/styles/peak-components.css`
- Relevant selectors: `.pkchat-idx-msg*`, `.pkchat-idx-art*`, `.pkchat-idx__section-header`, `.pkchat-idx__tabs`, `.pkchat-idx__search`
- Follow `docs/conventions/ui-design.md`: use `--pk-*` tokens and shared primitives where they match intent.

## Prompt Summary

The generation brief used the supplied screenshot as the layout reference and asked for three distinct directions: native neutral, dense inspector, and premium knowledge sidebar. All variants explicitly removed the red annotation rectangle and the current pastel icon/badge system.
