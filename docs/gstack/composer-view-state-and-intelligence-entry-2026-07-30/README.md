# Composer View State and Intelligence Entry Mock

Design-only artifact for the owner feedback collected on 2026-07-30.
It does not change production behavior.

Implementation follow-up:

- [`2026-07-30-composer-view-comments-intelligence-follow-up-plan.md`](../../superpowers/plans/2026-07-30-composer-view-comments-intelligence-follow-up-plan.md)

Open:

```text
file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/composer-view-state-and-intelligence-entry-2026-07-30/index.html
```

Rendered states:

- `preview-first.png` — new Composer leaf, comments and Intelligence closed
- `preview-intelligence.png` — user-opened Intelligence with the compact context toolbar
- `preview-native.png` — Native Markdown with a current-leaf Composer action

## Problem inventory

1. Every new Composer View currently opens the comment rail, which compresses
   the writing surface.
2. Intelligence currently initializes open and slides in when a Composer mounts,
   even when the user previously closed it.
3. Intelligence does not explain whether it was opened from the toolbar, a
   document suggestion, a comment handoff, or another contextual entry.
4. The standalone scope row wastes horizontal space and separates scope from
   the update policy and entry provenance that explain the current projection.
5. The current `Native Markdown / Composer` control changes the future default
   open policy; it does not convert the current leaf, although its appearance
   suggests that it should.
6. Native Markdown has no equally discoverable, local entry back into Composer.

## Recommended state ownership

| State | Owner | Initial value | Persistence |
| --- | --- | --- | --- |
| Comment rail visibility | current Composer leaf | closed | never copied to a new Composer leaf |
| Intelligence manual visibility preference | workspace | closed on first use | last explicit toolbar open/close |
| Intelligence contextual visibility | current leaf | closed | temporary; does not rewrite the manual preference |
| Intelligence open source | current Intelligence presentation | none | captured as run/session provenance |
| Scope selection | workspace Intelligence preference | current document | persists across view changes |
| Sidecar tab, focus and scroll | current leaf | Copilot/top | leaf-local |
| Current document view type | current leaf | resolved by open policy | changes only through the current-view action |
| Future default document view | plugin setting | Native Markdown for new installs | does not convert an existing leaf |

## Entry provenance

Recommended values:

- `toolbar`
- `automatic-suggestion`
- `ask-copilot`
- `comment-handoff`
- `history-deep-link`
- `native-editor`

The run receipt keeps the stable value and the origin
document/block/comment/finding identifier. This provenance is not a permanent
toolbar chip:

- a plain toolbar open shows no source label;
- contextual opens explain themselves inside the focus/session card, for example
  `来自自动建议 · 补一个输出型 PKM 产品的具体例子`;
- History and run details can expose the full stable provenance when needed.

## Motion rule

- Initial mount and restored-open state render directly at their final geometry:
  no right-to-left entrance animation.
- Only an explicit user transition from closed to open uses the 180 ms sidecar
  motion.
- Closing may animate because it is also an explicit transition.
- Reduced motion renders every state without translation.

## View-switch rule

- `切到原生 Markdown` converts the current Composer leaf immediately.
- `在 Composer 中打开` is a local Native Markdown view-header action.
- `以后打开 · Composer/原生 Markdown` is a separate preference control.
- Changing the future default never converts the current leaf.
