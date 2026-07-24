# Peak Composer Component Consistency Contract

Date: 2026-07-22
Status: owner-review design contract applied to the static Composer mock; production implementation pending
Owner surface: dedicated Peak Composer View
Global parent rule: [`docs/conventions/ui-design.md`](../../conventions/ui-design.md), “Peer action consistency contract”

## Why This Exists

Peak Composer accumulated several valid interaction experiments in one long-running mock. The result exposed the right capabilities, but the visual grammar drifted: peer controls used 6, 7, 8, 9, 10 and pill radii; some hover states were blue while adjacent AI actions were violet; object, selection and review actions did not always reveal their hierarchy.

This contract does not make every element identical. It defines six stable component families so a user can recognize what a control does before reading its label.

## Core Judgment

The unit of consistency is:

```text
interaction role + density + state
```

It is not:

```text
implemented by AI / implemented by code
```

AI is shown with a sparkle icon, a short divider, or action wording. It does not get a second height, radius, background or hover grammar when it sits beside ordinary actions.

## Shape Hierarchy

| Level | Family | Geometry | Resting treatment | Composer examples |
|---|---|---|---|---|
| 1 | Inline action capsule | 28px high, `--pk-radius-pill` | transparent; accent tint on hover/focus | Block `在下方插入 / 复制 / 评论 / AI 建议 / 指令`; formula sub-block actions |
| 2 | Compact toolbar control | 28px high, `--pk-radius-md`; icon-only is 28×28 | transparent or surface; accent tint on hover/focus | selection formatting, image/table/native tools, review navigation |
| 3 | Structural rail control | 30×30, `--pk-radius-md` | bordered surface with quiet shadow | top-level disclosure and drag handle; these two are exactly matched |
| 4 | Review action | 30px high, `--pk-radius-md` | secondary surface; semantic primary/danger state | accept, reject, retry, restore, cancel, “接受为新块” |
| 5 | Status chip | 20–22px, `--pk-radius-pill` | semantic tint; never looks like a primary CTA | insight type, warning, count, provenance, saved/copied status |
| 6 | Shell / panel | `--pk-radius-lg` outer shell, `--pk-radius-md` nested controls | overlay surface, one border, one shadow rung | Block/selection/object toolbar shell; copy, link, comment and review panels |

The 30px rail is intentionally one step larger than the 28px compact toolbar control because it sits outside the document and must make block structure discoverable. Nested formula rails may remain 28×28, but collapse and drag controls within the same rail must match each other.

## Component Contracts

### 1. Combined Block Action Row

- One row contains deterministic actions first, then one divider, then the current AI actions.
- `在下方插入 / 复制 / 评论` and every AI suggestion share 28px height, pill radius, font, icon size, resting background and hover/focus surface.
- The sparkle identifies the AI region; it is not a filled decoration and does not create a second toolbar.
- The per-block generation ledger uses the standard Lucide `History` clock-arrow icon. `Undo` is reserved for restore/rollback actions and must not stand in for history browsing.
- Opening `指令` morphs this same shell into input state. It does not spawn another command bar.
- A block hover reveals the row; text selection suppresses it so the selection toolbar has one clear owner.
- Addressable formula sub-blocks use this exact same row inside the formula card: `在下方插入 / 复制 / 评论 | 解释公式 / 拆分公式 / 变量表 / History / 指令`. They must not render a first common-action row plus a second AI row, or keep an intermediate `AI · N` opener. Trigger scope and result scope are separate contracts: `解释公式 / 拆分公式` remain micro-block results, but `变量表` projects to one formula-group result surface because it must support current formula, arbitrary multi-select, and full-group comparison. The result must remember the trigger formula, default to the full group, merge true shared variables once with formula-location badges, and keep formula-specific variables visibly grouped; it must not nest a three-formula comparison inside one formula card.
- Actions from a formula row retain the formula sub-block as their trigger target. Flattening the chrome must not silently widen insert, copy, comment, history, custom instruction, or any quick AI result other than the explicitly labelled group-projection `变量表`.

### 2. Document Undo / Redo

- Composer must not depend on a custom persistent top toolbar: the prototype's `Composer View / Diff 样式库 / Markdown 已保存` strip is demo chrome, not a production host contract. The persistent visible affordance is one compact Undo/Redo pair at the right edge of Composer's own bottom document-status bar; keyboard shortcuts remain available everywhere outside native text-edit ownership.
- After a committed transaction, Undo or Redo, show one transient document-adjacent notice near the lower canvas edge. It contains the state (`改动已写入 / 已撤销 / 已重做`), exact transaction label, and only the currently valid `撤销 / 重做` actions. It auto-hides without clearing either stack or disabling shortcuts, and it must not become another per-Block toolbar.
- The persistent pair uses standard `Undo2 / Redo2` icons in matched 28px `radius-md` controls; disabled state remains visible so the location never moves. The transient notice uses the shared quiet overlay surface, `radius-md`, one-line status copy and compact text controls; invalid actions are omitted there. Tooltips and accessible names include the next transaction label and shortcut.
- This stack contains only committed document transactions: direct edits, accepted AI changes, accepted structural/object transforms, and explicit inverse rollbacks. Pending candidates use restore/discard and candidate-version navigation instead.
- `⌘Z / Ctrl+Z` and `⇧⌘Z / Ctrl+Y` operate on the document stack only when focus is outside a text input or active editable range. Native input/contenteditable undo keeps ownership while the user is editing an instruction or text range.
- A new committed transaction after Undo clears Redo. Undo/Redo does not replace the durable History ledger: the Block `History` icon remains a clock-arrow, and History rollback appends an inverse transaction rather than deleting the original record.

### 3. Selection Toolbar

- Deterministic formatting, Easy Copy, comment and AI text actions remain in one floating shell.
- Format icons are compact square toolbar controls, not pills. Text actions use the same 28px height and `--pk-radius-md` geometry.
- Separators express operation groups: formatting / comment / AI. They do not imply different component systems.
- A Code Block selection suppresses rich formatting. Cross-structure selection behavior follows the editing-view contract and does not change the toolbar geometry.
- Link, color and Easy Copy popovers use the shared panel shell and return focus to their trigger when closed.

### 4. Object Toolbars

- Image, table, native file and chart-mode toolbars share the same shell, 28px controls, icon scale, hover and focus rules.
- An object's available commands may differ; the chrome does not.
- A table toolbar stays above the table and an image toolbar stays inside the image frame, but placement is a surface modifier rather than a new button style.
- Destructive object commands use danger color only in hover/confirmation state; geometry stays unchanged.

### 4. Block Rail And Disclosure

- Top-level disclosure and drag are both 30×30, same border, radius, icon weight and shadow.
- Expanded uses an up chevron to mean “向上收起”; collapsed uses a down chevron to mean “向下展开”.
- The rail is structural navigation, not a command capsule, so it uses `--pk-radius-md`, not pill radius.

### 5. Review And Transaction Controls

- Inline diff, object review, selection review, native review, chart draft and bottom change navigator reuse one review-action grammar.
- Primary acceptance uses accent or success emphasis; reject/danger uses error semantics; restore/retry/cancel stay secondary.
- All review controls keep the same 30px height and `--pk-radius-md`. A semantic color cannot change their shape.
- Every AI-created additive draft exposes a visible targeted-instruction field plus `版本导航 / 接受 / 重新生成 / 丢弃` in this review family; in-place rewrite review exposes the same instruction primitive beside `重新生成`. Enter and the regenerate button are equivalent submissions. Empty input means generic regeneration; non-empty input is frozen into the next candidate's run context and visible status, remains editable for the following iteration, but never enters Markdown unless the candidate is accepted. Visually the draft remains part of the document flow: neutral white content, a neutral outline without decorative color rails or shadow, one quiet separator, and a compact review footer. A pending draft must not add a tinted full-card band, nested review-card outline, or a second ordinary Block action row; collapse, drag and ordinary Block actions return only after acceptance turns the candidate into a real Block. With one candidate, version navigation is omitted instead of showing two useless disabled arrows. With two or more candidates, previous/count/next form one segmented 30px control sharing the review buttons' height and vertical center. Initial textual generation and regeneration both stream visibly into the real candidate body with a live caret and progress state; a timed pause followed by a complete-body swap is not streaming. Regeneration is a direct action, not a return to the source AI menu: it appends a new review-only candidate inside the same draft transaction, keeps prior candidates addressable, and accepts only the currently visible completed version. While streaming, accept, repeat-regenerate and version navigation are disabled; the instruction field remains editable so the next request can be prepared, and discard remains available as cancellation.
- Success feedback happens in place. Copy actions temporarily replace their label/icon with a check and return automatically; they do not open a confirmation panel.

### 6. Status And Provenance

- Insight types, issues, counts, source provenance and AI/model markers are status chips.
- All status chips use pill radius and one typography rung. Color encodes semantics only when an icon or label also carries the meaning.
- Interactive issue chips may be clickable, but they remain status-first and must not visually compete with the action toolbar.

### 7. Intelligence Sidecar And Result Browser Bridge

- The accepted adaptive sidecar keeps its own information architecture and density, but consumes the same `--pk-*` colors, radius rungs, shadows and interaction states as the document canvas.
- `Copilot / History` is a segmented navigation control, not a pair of action capsules. Its selected state may use a filled surface, but both tabs remain geometry peers.
- Brief, session and review actions map to the same compact toolbar and review-action families used in the document. AI does not receive a special radius inside the sidecar either.
- The sidecar prompt composer is a focused input container and may use `--pk-radius-xl`; its icon actions still use the shared compact icon-button geometry. This is a documented family difference, not drift.
- Related-material labels and counts are status chips. `打开完整视图` is a toolbar/review action. The shared controlled Result Browser reuses the same button, tab, chip and panel families rather than importing a second Vault Search skin.
- This consistency bridge must not rewrite or fork the accepted adaptive sidecar. `intelligence-panel.js` / `intelligence.css` remain the shared static source, and production Result Browser remains a shared component extraction rather than Composer-owned duplicated UI.

## Token And Primitive Mapping

The static mock loads `src/styles/peak-tokens.css` under `.peak-design-root`. Production must not copy mock variables.

| Composer role | Production mapping |
|---|---|
| shell border/surface/shadow | `--pk-border`, `--pk-surface-overlay`, `--pk-shadow-popover` |
| inner toolbar control | `--pk-radius-md`; planned `ToolbarAction` / existing `IconButton` where intent matches |
| action capsule | `Button variant="ghost"` plus a reviewed capsule modifier; never `Pill` unless it is a toggleable filter |
| rail control | `IconButton` geometry plus Composer rail modifier for the 30px hit target |
| status | `Chip` variant |
| review CTA | `Button` primary / secondary / danger |
| panel | `--pk-radius-lg`, `--pk-border`, `--pk-surface-overlay`, appropriate shared shadow rung |

The production primitive gap is a compact text/icon `ToolbarAction`. It should be added before Composer ships rather than growing `composer-* button` selectors or misusing the filter `Pill`.

## State Matrix

Every interactive family must define:

| State | Required behavior |
|---|---|
| Rest | readable label/icon, no accidental primary emphasis |
| Hover | same geometry; tint and text color change only |
| Focus visible | 2px accent ring with offset; never rely on hover alone |
| Active / selected | explicit pressed/selected state, not a persistent hover imitation |
| Disabled | reduced opacity, `not-allowed`, no hover promotion |
| Busy | retains dimensions; progress replaces content without layout shift |
| Success | in-place check/status, short-lived unless the domain state is persistent |
| Error | error color plus text/icon explanation; geometry unchanged |

Desktop Composer uses dense 28–30px controls because it is a mouse/keyboard Obsidian surface. Any future touch mode must raise interactive hit targets to at least 44px without changing the component-family hierarchy.

## Anti-Patterns

- Same toolbar, different radii because one action is AI.
- Blue hover on deterministic actions and violet hover on adjacent peer AI actions.
- Turning formatting icons, status chips, review buttons and panels into identical pills.
- A one-off radius or shadow selector for image, table, Base, Canvas or Excalidraw.
- A mock-only token copied into production.
- Success implemented as another modal, preview or confirmation click when the action already completed.

## Acceptance Matrix

The integrated mock is accepted only when browser QA confirms:

1. Block common and AI actions have identical computed height, radius, resting background, hover and focus behavior.
2. Every formula sub-block exposes common and contextual AI actions in one direct-child row, with no `AI · N` trigger and no second AI menu; actions remain scoped to that formula except for the documented `变量表` result projection, which keeps the trigger identity while rendering current/multi/all formula scope at the group level.
3. Selection format/comment/AI actions share one 28px toolbar density; icon-only controls are square and text controls use the same radius rung.
4. Image, table and native toolbars share shell radius/border/shadow and control height/radius.
5. Disclosure and drag have identical 30×30 geometry.
6. Review actions across text, object, chart and navigator use 30px / radius-md geometry.
7. Chips use pill radius while panels use radius-lg; the page does not collapse into one bubbly radius.
8. Keyboard focus is visible and no state change causes toolbar layout shift.
9. Desktop and narrow viewport produce no horizontal overflow; narrow-screen Intelligence remains a fixed right drawer.
10. Sidecar tabs, brief actions, review actions and Result Browser controls resolve to the same global component families without changing the accepted adaptive lifecycle.

## Scope Boundary

This document is the current owner-review visual and interaction contract. The static mock demonstrates it. It does not mean the dedicated production Composer View, `ToolbarAction` primitive, source adapter, or writeback runtime is implemented. Owner feedback on the interactive mock may still revise the family matrix before implementation planning.
