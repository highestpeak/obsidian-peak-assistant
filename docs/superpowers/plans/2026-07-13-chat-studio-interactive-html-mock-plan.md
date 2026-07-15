# Chat Studio Interactive HTML Mock Plan

> **Authority boundary:** This is an execution-history plan and design rationale only. Gate sequencing remains useful, but it cannot override the [Chat Studio complete implementation spec](../specs/2026-07-15-chat-studio-complete-implementation-spec.md), which is the implementation master. Use [`discussion-synthesis.md`](../../gstack/chat-studio-interactive-2026-07-13/discussion-synthesis.md) and [`decisions.md`](../../gstack/chat-studio-interactive-2026-07-13/decisions.md) only as supporting history.

## Goal

Create a production-shaped, interactive HTML mock for Chat Studio before any product UI implementation.

The HTML mock is the visual reference for this historical design process, not the implementation master. Image generation is a supporting tool for tightly scoped visual-detail variants only; it does not generate the final screen.

The functional baseline is [`docs/11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html). Every user-visible capability described there must either appear in the mock or be explicitly marked as intentionally deferred.

## Why the previous approach failed

The static Image Gen iterations failed for structural reasons:

- they produced a complete visual before spacing, hierarchy, and interaction had been agreed;
- they imported a generic AI-product visual language that did not match Peak Assistant's existing UI;
- they made large global changes between rounds, so feedback could not isolate which decision was wrong;
- they showed only one state, hiding menus, streaming, search, topic expansion, artifacts, and composer behavior;
- the generated typography and spacing could not be adjusted precisely after feedback;
- the centre column was treated as a poster or document instead of a working chat surface.

The corrected workflow is HTML-first, stateful, and decision-by-decision.

## Locked principles

1. **Standalone Chat Studio surface**
   - Mock the Studio itself, not the surrounding Obsidian application chrome.
   - Keep the left / centre / right functional model.
   - Do not add a Peak logo, Peak heading, mascot, or decorative product header.

2. **Peak house style before competitor style**
   - Competitor research informs interaction patterns only.
   - Visual values come from the existing `--pk-*` token system.
   - The reference surfaces for house style are current Chat, Quick Search, Settings, and shared primitives.
   - No new palette, radius family, shadow language, or typography system is invented inside the mock.

3. **Tight density**
   - Use the existing 4px spacing grid.
   - Prefer 4 / 8 / 12 / 16px gaps; 20 / 24px require a clear reading-boundary reason.
   - Avoid 32–48px empty gaps inside working areas.
   - Rows are normally 28–34px high, not 44–56px.
   - The centre reading column is spacious enough for prose but never resembles a landing page.

4. **One decision per review round**
   - Do not present three unrelated full-screen designs.
   - A/B/C variants change one component or one layout rule while keeping everything else fixed.
   - The selected decision is immediately folded back into the canonical HTML mock.

5. **Visible controls must have honest behavior**
   - Active controls work in the mock.
   - Disabled controls are visually and semantically disabled.
   - Current false affordances such as local-only role selection, read-only model summary, and disabled microphone are not promoted as real capabilities.

6. **No product implementation before mock acceptance**
   - The mock may reuse names, states, and tokens, but does not import production React components.
   - Product code changes start only after the canonical desktop state and required interaction states are accepted.

## Deliverable structure

Create the mock under:

```text
docs/gstack/chat-studio-interactive-2026-07-13/
├── index.html                  # canonical interactive mock
├── mock.css                   # token mapping + layout + component styles
├── mock.js                    # state machine and interactions
├── fixtures.js                # realistic projects, threads, messages, tools, artifacts
├── validate.mjs               # local links, anchors, and required-state validation
├── README.md                  # controls, review links, accepted decisions
├── decisions.md               # one-line decision log, not implementation history
├── assets/
│   └── imagegen/              # selected local-detail references only
└── variants/
    ├── centre-density.html    # temporary A/B/C switch definitions
    ├── composer.html
    ├── left-navigation.html
    └── right-index.html
```

The mock must work from a local HTTP server and should also remain usable from `file://` when browser restrictions allow it.

## Mock architecture

### Canonical screen model

```text
Chat Studio
├── Left navigation
│   ├── compact search
│   ├── New conversation
│   ├── Projects
│   │   └── project conversations
│   └── Earlier / standalone conversations
├── Centre working surface
│   ├── conversation header
│   ├── message viewport
│   │   ├── user messages + resources
│   │   ├── assistant messages
│   │   ├── reasoning / tool progress
│   │   ├── actions / suggested next
│   │   └── inline follow-up
│   └── composer
└── Right conversation index
    ├── search
    ├── Overview / Artifacts
    ├── topic groups
    ├── message rows
    └── artifact groups / rows
```

### State model

The canonical HTML keeps one state object:

```js
{
  view: 'active-conversation',
  activeProjectId: 'project-1',
  activeConversationId: 'conversation-1',
  leftWidth: 248,
  rightWidth: 304,
  rightTab: 'overview',
  expandedProjects: ['project-1'],
  expandedTopics: ['topic-1'],
  composerStatus: 'ready',
  runSettingsOpen: false,
  messageMenuOpen: null,
  theme: 'light',
  reviewVariant: 'canonical'
}
```

State changes update all three columns from the same fixtures. Do not maintain separate duplicated selections for each column.

### URL-addressable review states

Every important state must be directly openable and shareable:

```text
index.html#active
index.html#new
index.html#streaming
index.html#tool-run
index.html#resources
index.html#artifacts
index.html#narrow
index.html#empty
```

Query parameters are reserved for temporary design variants:

```text
index.html?variant=centre-a#active
index.html?variant=centre-b#active
index.html?variant=centre-c#active
```

The currently selected review state and column widths may persist in `localStorage`, but every URL state must reset deterministically when opened directly.

## Density contract

These values are the starting contract, not a suggestion to enlarge later:

| Area | Starting value | Allowed review range |
|---|---:|---:|
| Left column | 248px | 220–280px |
| Right column | 304px | 280–336px |
| Centre header | 44px | 40–48px |
| Centre content width | 720px | 680–760px |
| Navigation row | 30px | 28–34px |
| Message vertical gap | 18px | 14–22px |
| Section gap inside sidebars | 12px | 8–16px |
| Composer collapsed height | 84px | 76–96px |
| Composer horizontal margin | 12px | 8–16px |
| Standard radius | 4px / 8px | existing tokens only |

Additional rules:

- no standalone product header above the three columns;
- no centre hero heading in the active conversation state;
- no card wrapper around every message;
- no large blank buffer between the final message and Composer;
- user and assistant content share one reading rhythm rather than becoming two unrelated card styles;
- the right index uses rows and indentation, not stacked dashboard cards;
- the left active state uses a small indicator plus restrained background, never a large bright pill.

## Functional coverage

### Left column interactions

The mock must support:

- type-to-filter project and conversation names;
- clear search;
- create standalone conversation;
- expand / collapse project;
- select project overview;
- create conversation inside a project;
- select project or standalone conversation;
- reveal a compact context menu for rename / open source / delete;
- collapse all projects;
- selected conversation remains synchronized with centre and right columns.

### Centre column interactions

The mock must support these view states:

- Home;
- all projects;
- all conversations;
- project overview;
- project conversation list;
- pending new conversation;
- active project conversation;
- active standalone conversation;
- no active conversation.

The active conversation state must include:

- title header;
- open-source and regenerate-title affordances;
- date separator;
- user message with attachments;
- assistant message with rich text;
- reasoning collapsed / expanded;
- tool-run summary collapsed / expanded;
- streaming text state;
- message metadata;
- Copy / Regenerate / Star / Branch / Trace;
- More menu;
- inline follow-up;
- suggested next actions;
- save-to-note feedback;
- convert-to-project suggestion.

### Composer interactions

The mock must support:

- focused / unfocused input;
- multiline growth within a bounded height;
- attachment picker simulation;
- attachment chip removal;
- `[[` context suggestion simulation;
- Run settings popover;
- Vault Search and Web Search toggles;
- ready / submitted / streaming / cancelled states;
- send button visibility based on real input;
- stop action while streaming;
- keyboard hints without turning the Composer into a toolbar.

Role, microphone, and model routing must be shown only if the mock also communicates their real current status. The default canonical variant should omit controls that do not affect the request.

### Right column interactions

The mock must support:

- Overview / Artifacts switch;
- search within the active tab;
- expand / collapse topic;
- mixed message and artifact rows in chronological order;
- click a message row to scroll and briefly highlight its centre message;
- artifact groups for Images / Diagrams / Files / Code;
- empty states for a new conversation;
- no suggestion that artifact rows are a persistent library or full file manager.

### Layout interactions

The mock must support:

- drag-resize left and right columns;
- double-click divider to reset its width;
- collapse right column to a narrow rail for centre-focus review;
- restore right column without losing selected tab or query;
- narrow desktop state at approximately 1100px;
- light / dark theme using the same `--pk-*` semantic roles.

## Interactive review mechanism

### Reviewer controls

The product mock itself remains clean. Review controls are hidden by default and appear only through:

- `D` — open / close the review drawer;
- `1`–`8` — switch fixture state;
- `A`, `B`, `C` — switch the current component variant;
- `R` — reset state and column widths;
- `T` — toggle light / dark;
- `[` and `]` — previous / next review decision.

The review drawer shows:

- current state;
- current decision under review;
- A/B/C descriptions;
- exact values changed by the variant;
- a short feedback field stored locally;
- copyable URL for the current state.

Review UI must not be visible in screenshots unless explicitly enabled.

### Variant implementation

Variants use `data-*` attributes and CSS variables, not duplicated pages:

```html
<body data-review="centre-density" data-variant="b">
```

```css
[data-review="centre-density"][data-variant="a"] {
  --mock-message-gap: 14px;
  --mock-reading-width: 680px;
}
```

This allows instant A/B/C switching while holding content and state constant.

## Image Gen protocol

Image Gen is not used for a full-page Chat Studio mock.

It may be used only after the HTML structure for a component works, for one of these bounded questions:

- active conversation row treatment;
- assistant message identity / action gutter;
- Composer focus boundary;
- Run settings popover hierarchy;
- topic group expansion marker;
- artifact row icon / metadata treatment;
- empty-state illustration or subtle texture, only if the interface actually needs one.

### Required input for each Image Gen request

1. A screenshot crop from the current HTML mock.
2. The exact component boundary to modify.
3. One design question.
4. Locked constraints: dimensions, token palette, typography, surrounding UI.
5. A request for three comparable options with all unrelated structure unchanged.

Example:

> Keep this 720×96 Composer crop unchanged in size, typography, controls, and token colors. Generate three variants only for the focused boundary and bottom-toolbar separation: A hairline, B inset ring, C subtle raised surface. Do not alter spacing or add controls.

### Output and selection

- Store generated crops under `assets/imagegen/<decision-id>/`.
- Keep only the selected image and a small contact sheet in the final mock folder.
- Record the chosen treatment in `decisions.md`.
- Rebuild the treatment as HTML/CSS using project tokens.
- Never embed generated text, layout measurements, or rasterized controls into the final mock.

## Review sequence and gates

### Gate 0 — House-style calibration

Before building the mock:

- capture current Chat, Quick Search, and Settings at the same viewport;
- extract real row heights, font sizes, padding, border, radius, and selected states;
- create a one-screen style calibration inside the review drawer;
- confirm the density contract and whether the existing purple accent remains the canonical accent.

**Exit condition:** the mock's token mapping and density values match the product family; no layout variant work begins before this gate is accepted.

### Gate 1 — Skeleton and column behavior

Build only:

- three-column shell;
- real column widths;
- drag / reset / collapse behavior;
- basic header and row placeholders;
- 1440px and 1100px states.

Review decisions:

- left / centre / right proportions;
- panel separators;
- global density;
- whether right collapse is a rail or a complete hide.

**Exit condition:** no area feels like a separate unrelated app and the centre has clear visual priority.

### Gate 2 — Centre active conversation

Build the complete active thread with realistic content, then review one decision at a time:

1. reading width;
2. user-message treatment;
3. assistant identity and metadata;
4. rich text rhythm;
5. action placement;
6. suggested-next treatment;
7. distance from final message to Composer.

Image Gen may contribute component crops only after items 1–4 work in HTML.

**Exit condition:** the centre can be used for a long conversation without looking like a document page, dashboard, or oversized message-card stack.

### Gate 3 — Composer

Implement all ready / submitted / streaming states and the Run settings popover.

Review decisions:

- collapsed height and multiline growth;
- attachment presentation;
- footer control order;
- focus / error / streaming boundary;
- which current false affordances are omitted.

**Exit condition:** the Composer is compact, writable, and understandable without a large purple frame or duplicate controls.

### Gate 4 — Left navigation

Implement project and conversation flows using the same fixtures as the centre.

Review decisions:

- project vs standalone-conversation hierarchy;
- selected and hover states;
- search location;
- menu discoverability;
- row density.

**Exit condition:** the left column communicates the working scope without a product brand row or a second icon rail.

### Gate 5 — Right index

Implement Overview / Artifacts, topic expansion, search, and click-to-scroll.

Review decisions:

- right-column title and information hierarchy;
- topic vs message indentation;
- artifact metadata density;
- empty-state behavior;
- relationship between source message and artifact row.

**Exit condition:** the right column reads as conversation recall and navigation, not an empty inspector or a fake persistent artifact library.

### Gate 6 — Full-state QA

Verify:

- all URL states;
- light and dark;
- 1440px and 1100px;
- keyboard interaction;
- focus visibility;
- scroll and click-to-highlight;
- menus and popovers stay within viewport;
- no horizontal page overflow;
- no unintentional empty flex/grid children;
- mock content covers tools, attachments, long messages, errors, and no-artifact states.

**Exit condition:** the mock is accepted as the implementation reference. Only then create the production implementation plan.

## Feedback format

Each review round asks for feedback at the decision level:

```text
Decision: centre message density
Selected: B
Keep: reading width and action position
Change: user message still too prominent
Reject: rounded surface and extra top padding
```

Do not ask “which full design do you like?” and do not replace the entire screen after one component receives negative feedback.

## Verification commands for the future mock

```bash
git diff --check -- docs/gstack/chat-studio-interactive-2026-07-13/
node docs/gstack/chat-studio-interactive-2026-07-13/validate.mjs
```

Browser QA must report at minimum:

- missing local assets;
- console errors;
- horizontal overflow at 1440px and 1100px;
- interaction failures for every required state;
- screenshot paths for the canonical active, streaming, artifacts, and narrow states.

## Non-goals for this planning phase

- no Image Gen output;
- no full-page visual variants;
- no product React/CSS edits;
- no new runtime capability;
- no renaming Artifacts into a persistent library without a product contract;
- no mobile design promise before desktop Studio is accepted;
- no implementation handoff until the interactive mock passes all gates.

## First execution step after approval

Run Gate 0 only: capture the current product family's style calibration, map the real `--pk-*` tokens into the mock, and create the empty interactive shell with reviewer controls hidden. Stop for review before adding messages, Composer detail, or Image Gen variants.
