# Chat Studio interactive mock

> **Authority boundary:** This package is design rationale, evidence, and review history only. The implementation master is the [Chat Studio complete implementation spec](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md). If anything in this package conflicts with that master, the master wins; this package cannot override it.

This folder contains the HTML-first design source for the complete Chat Studio UI. It is deliberately separate from production React code. `index.html` is the single comprehensive interaction entry: it absorbs the later 2026-08 active-conversation Composer refinement while retaining the original three-column, project, message, resource, model, and Assistant flows.

For implementation, start with the [canonical implementation spec](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md). Use [`discussion-synthesis.md`](./discussion-synthesis.md) only to understand owner feedback, rejected proposals, and decision rationale. The source audit behind the visual decisions is recorded in [`calibration.md`](./calibration.md), and the gate-by-gate acceptance log lives in [`decisions.md`](./decisions.md). The product verdict is available as a visual report in [`product-strategy.html`](./product-strategy.html) and as background rationale in [`2026-07-14-chat-studio-product-positioning-and-composer-v2.md`](../../superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md).

### Documentation map

| Need | Read |
|---|---|
| Implement the complete production UI, runtime wiring, persistence, tests, and acceptance | [`2026-07-15-chat-studio-complete-implementation-spec.md`](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md) |
| Understand the whole discussion and where each conclusion belongs | [`discussion-synthesis.md`](./discussion-synthesis.md) |
| Inspect current production Chat Studio behaviour | [`11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html) |
| Understand how Chat context reaches a request | [`11-feature-chat-context.html`](../../11-feature-chat-context.html) |
| Review the product rationale that was absorbed into the master | [`2026-07-14-chat-studio-product-positioning-and-composer-v2.md`](../../superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md) |
| See accepted/rejected/open decisions by review gate | [`decisions.md`](./decisions.md) |
| Check local capability truth and competitor evidence | [`research-and-inventory.md`](./research-and-inventory.md) |
| Interact with the proposal | [`index.html`](./index.html) and [`composer-lab.html`](./composer-lab.html) |

## Current checkpoint

Gate 9: answer-action priority and responsive overflow aligned.

- three-column standalone Chat Studio shell;
- existing `--pk-*` light/dark tokens, typography, radius, borders, and 4px spacing grid;
- the canonical cross-surface [`Prompt Input Consistency`](../../conventions/prompt-input-consistency.md) contract: Chat Studio owns the visual baseline while other surfaces reuse the input kernel and grammar without inheriting Chat-specific runtime state;
- Pinned → Projects → Recent navigation with realistic list volume, opaque state-aware row menus, visible title typing, and drag-to-project feedback;
- split project-row interaction: the chevron only expands/collapses, while the project name opens a project home with conversations, stars, resources, plans, and a project-scoped Composer; the compact pass preserves all of those surfaces while replacing the four boxed stat cards with a quieter inline summary; the standalone hero-level “Edit description” action is removed, while the description itself remains directly editable and offers an explicit AI rewrite draft that never saves automatically;
- one Composer DOM instance changes placement by state: the project home places it in the centre flow after project identity and before project collections, with the same short-greeting + three editable starters mental model as new chat; an active conversation restores it below the scrolling message canvas;
- the active-conversation Composer is now the later adaptive final direction inside this same mock: reading older history collapses the same input surface to a compact pill; returning to the latest turn, focusing, drafting, attaching resources, or opening a menu expands it without losing the draft;
- the expanded active Composer has an inspectable, same-width **Context stack**: expected layers and explicit request scope are separate from excluded inputs, each layer can disclose its source, reason, and treatment, and the mock never claims that the whole Vault or inactive variants are silently sent to the model;
- New chat and Project home deliberately retain their existing Composer geometry. The adaptive state is not a whole-Chat redesign and must not leak into those start surfaces;
- project home owns its four centre-level collections and therefore hides the conversation-only right index instead of repeating conversations, stars, resources, and plans in both columns;
- a knowledge-search command that delegates to the existing production `QuickSearchModal`; this Chat Studio mock deliberately does not redraw Vault Search, AI Search, or Vault Intelligence internals, while conversation-title filtering stays separate;
- a component catalog covering input resources, Streamdown content, generated-artifact proposals, process disclosure, status, and message actions;
- right-column **Outline / Resources** navigation with real scroll targets; direction/type filters appear only in Resources, not as an isolated control in Outline;
- one main Composer for both ordinary messages and targeted follow-up, using a visible reply anchor instead of a nested input;
- a default `project context + auto model` work contract; Vault Search and Web Search are independent, combinable extensions rather than a mutually exclusive source preset;
- searchable concrete-model selection grouped by configured Profile, with Provider/model identity, real capability/context metadata, and explicit unknown states;
- composable model filters for declared capability and context-window floor, with AND semantics, active-filter count, and one-step clear;
- no Composer-level Fast / Balanced / Best fiction: Settings Recommended presets, Harness tiers, and reasoning/output controls remain separate concepts and are not exposed as active controls unless the runtime consumes them;
- strict Composer ownership: `+` adds resources, Source controls Vault/Web switches, `/` invokes workflows, and a non-default Assistant is visibly stored as the current conversation identity;
- a searchable Assistant picker and a prompt-first AI Assistant builder; knowledge, tools, behavior details, and model preference are optional advanced settings rather than mandatory first-screen fields;
- a separate [`composer-lab.html`](./composer-lab.html) covering `[[` document selection, `/` workflows, attachments, reply anchors, combinable sources, Profile/model search, Assistants, prompt-first AI Assistant creation, running, permission, and narrow states;
- a centered Composer in the empty conversation state, preceded by the concise `今天想推进什么？` greeting and followed by three editable, non-auto-send starting prompts; after the first message it returns to the bottom rail;
- “View all” conversation history uses the production-backed `chat / agent / plan / canvas / template / custom` taxonomy, combines title query and type with AND semantics, deduplicates rows, and excludes pinned design documents;
- a priority-aware answer action rail: Copy / Retry / Star / Branch / Trace remain persistent, adaptive actions are promoted inline while space exists, and More appears only when lower-priority raw / Markdown / JSON copy, Vault save, or targeted follow-up actions are genuinely compressed; the menu lists only those hidden actions and never duplicates visible controls;
- resizable left and right columns, collapsible right column, direct URL review states, and hidden review controls;
- no Peak logo, product masthead, Obsidian chrome, new visual palette, or Image Gen material.

The production-vs-proposal boundary and competitor evidence are recorded in [`research-and-inventory.md`](./research-and-inventory.md). The mock validates interaction structure; it does not prove that a model capability, reasoning setting, Assistant contract, generated-artifact runtime, or re-created native Search UI is already wired in production. Search internals remain owned by the production Quick Search surface.

Known authority corrections are recorded in the implementation master: New/Empty/Project views hide the conversation-only right rail; project scope is not duplicated as a Composer shelf chip; ConversationType is history/filter metadata rather than a creation mode; Vault Search must be wired to real retrieval or shown unavailable; fixture Plans/Assistants/Artifacts do not prove a production domain model. PNG files in this folder are review snapshots, not requirements. In particular, a screenshot may predate the 2026-07-15 removal of Fast/Balanced/Best language; use the live HTML and implementation master instead.

## Open

From the repository root:

```bash
python3 -m http.server 8173
```

Then open:

```text
http://127.0.0.1:8173/docs/gstack/chat-studio-interactive-2026-07-13/index.html#active
```

The page also works from `file://` in browsers that permit local stylesheet/script loading.

Static review snapshots: [`preview-gate2.png`](./preview-gate2.png), [`preview-project-home.png`](./preview-project-home.png), [`preview-project-description-edit.png`](./preview-project-description-edit.png), [`preview-new-chat-clean.png`](./preview-new-chat-clean.png), [`preview-conversation-type-filter.png`](./preview-conversation-type-filter.png), [`preview-native-search-handoff.png`](./preview-native-search-handoff.png), [`preview-run-model.png`](./preview-run-model.png), [`preview-composer-v2.png`](./preview-composer-v2.png), [`preview-assistant-builder.png`](./preview-assistant-builder.png), and [`preview-product-strategy.png`](./preview-product-strategy.png).

## Review controls

- drag either divider to resize; double-click it to restore the baseline width;
- use arrow keys while a divider is focused for 4px keyboard resizing;
- `D` toggles the hidden review drawer;
- `1`–`9` opens `#active`, `#project`, `#catalog`, `#new`, `#streaming`, `#tool-run`, `#resources`, `#artifacts`, and `#empty`;
- `A`, `B`, `C` changes only centre reading width/message gap for controlled comparison;
- `T` toggles the existing Peak light/dark token sets;
- `R` resets state, widths, theme, filters, and variant.
- in an active conversation, scroll upward to see the compact Composer; click it to return to the full input, then open **Context stack** to inspect the next-turn context model.

## Density baseline

| Area | Baseline | Review range |
|---|---:|---:|
| Left | 248px | 200–300px |
| Right | 304px | 220–360px |
| Centre header | 44px | 40–48px |
| Reading/Composer width | 720px content inside 760px padded rail | 680–760px content |
| Navigation row | 30px | 28–34px |
| Message gap | 18px | 14–22px |
| Composer | 84px without shelf | +30px when explicit context exists |

Below 1000px the mock starts at 200px left / 220px right, preserving all three columns and the 440px centre minimum at the 894px review viewport.

## Validation

```bash
node docs/gstack/chat-studio-interactive-2026-07-13/validate.mjs
node docs/gstack/chat-studio-interactive-2026-07-13/qa-gate2.mjs
```

`qa-gate2.mjs` expects the documented local server on port `8173`. It currently verifies 160 owner-feedback checks: the 1728×880 and 894×835 layouts, priority-aware answer actions and truthful More overflow, raw/follow-up execution, Suggested next overflow, source proportions, model search and capability/context filters, project disclosure versus navigation, project-home resources/plans, the shared project/new-chat start-state mental model, inline human + AI-assisted project-description editing with an explicit save boundary, removal of the duplicate project right index, draft isolation and inline Composer placement, restoration of the conversation right index and bottom Composer, Composer source/model/Assistant flows, native-Search handoff, independent Vault-document and typed conversation-history pickers, the new-chat greeting and non-auto-send starters, empty-state placement, right-column filtering, and the product report.
