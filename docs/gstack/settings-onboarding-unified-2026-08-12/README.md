# Settings and Onboarding Design Package

Status: current product contract and target mocks · production implementation not started · interaction not verified in Obsidian.

This directory is the current review package for Peak Assistant's Settings and Onboarding work. It replaces the 2026-08-06 visual variants as the design reference.

## Start here

- [`index.html`](./index.html) — the single entry point and document map.
- [`2026-08-09 capability brief`](../../superpowers/specs/2026-08-09-onboarding-settings-capability-content-flow-brief.md) — the current source of truth for required capability, content, state and flow.
- [`Settings configurable capability inventory`](../../superpowers/specs/2026-08-12-settings-configurable-capabilities-by-group.md) — every user control, automatic default, status, operation and current wiring fact, organized by the four Settings groups.
- [`settings.html`](./settings.html) — target experience for long-term configuration and system status.
- [`onboarding.html`](./onboarding.html) — target experience for minimum setup and the first real task.
- [`Knowledge Index progress`](../knowledge-index-workspace-2026-08-11/index.html) — focused run view for indexing progress, order, speed, ETA, file types and per-document work.

These HTML files are self-contained local artifacts and should be opened directly. They do not require a temporary localhost server.

## Source-of-truth order

1. The capability brief decides what the product must preserve and how success is verified.
2. The Settings configurable capability inventory decides which group owns every long-term control and records current implementation truth.
3. The current Settings and Onboarding mocks show one target interaction and visual response to that contract.
4. The Knowledge Index mock owns the detailed feedback for an active indexing run.
5. The 2026-08-06 redesign package and visual calibration board are historical exploration only.

If the documents disagree, use this order. Historical variants must not be treated as implementation requirements.

## Shared product model

The two mocks use the same nouns and responsibility boundaries:

- **AI & Models** keeps one continuous configuration chain together: connection → available models → task defaults.
- Connections, models and task defaults remain distinct levels inside that page; an account is not a model, and a model is not a product feature.
- **Agents** keeps the second control chain together: Hermes execution → available tools → permissions → confirmations.
- Agent capability and safety remain distinct levels inside that page; enabling a capability never silently grants unrestricted access.
- There is no generic **Features** destination. Each option lives with the thing it changes: models and generation routes in AI & Models; Agent execution, tools and access rules in Agents; Search, Atlas and Ambient behavior in Knowledge & Search; outputs, retention and appearance in Advanced.
- **Peak Hermes** owns Agent workflow, permissions and receipts; Codex, Claude Code and model connections supply compatible execution capability.
- **Knowledge settings** own long-term scope and quality. The Knowledge Index workspace owns a current run's progress, errors and history.
- **Onboarding** verifies only the dependencies needed for one first task. It does not duplicate full Settings.

## Settings direction

- Obsidian's own Settings sidebar stays visible. Peak does not add a competing second sidebar.
- Peak categories are the only persistent header structure and stay centered in the plugin content area. There is no Settings search: the four destinations — AI & Models, Agents, Knowledge & Search, Advanced — and their internal grouping must be clear enough to navigate directly. Save feedback uses a temporary toast; setup progress remains in Onboarding instead of becoming a permanent Settings destination.
- No global `Standard / Advanced` mode. `Advanced` is one low-frequency destination containing clearly separated Files & Data, Privacy & Retention, Appearance, and Diagnostics & Maintenance sections.
- The default page is `AI & Models`: connections and model catalogs appear first, followed by task defaults using the hierarchy `product feature → action group → concrete action`.
- Product actions that do not use a generative model say so explicitly.
- Connection, model catalog and task defaults share one owner; Agent execution, tools, permissions and confirmations share another. Important privacy status remains visible from Agents even though detailed privacy controls live in Advanced.
- Provider and capability status uses clear states rather than assuming that saved credentials imply readiness.

## Onboarding direction

1. Choose one first outcome.
2. Verify one connection that can complete it.
3. Reuse and check the existing Vault / Index state.
4. Open the real product workspace with a safe editable starter task.

The flow distinguishes `Setup complete` from `First success`, saves progress, keeps the primary action visible, and provides direct next destinations instead of ending on an empty success page.

## Mocked interactions

### Settings

- Header tab navigation inside the native Obsidian Settings context
- Automatic setup that combines a quality / cost strategy with an independent cloud / local data route, previews the effect, and preserves manual overrides
- Primary and additional connection groups, with an OpenRouter detail that separates connection health from online catalog, cache and bundled fallback state
- Expandable product feature → action model hierarchy, plus a focused action picker with inheritance and per-action advanced overrides
- Add-connection modal with the six primary launch connections and a lower-pressure additional list
- Real safety modes: Read only, Ask every time, Accept reviewed edits and Bypass confirmations
- Peak Hermes, Codex and Claude Code execution routes shown separately from model choice
- Segmented index depth and contextual advanced disclosure
- File-type scope detail that distinguishes extraction / indexing capability and includes Peak Sheet and Peak AI Graph
- Advanced Files & Data, Privacy / Usage / Retention, Workspace behavior, Appearance / Accessibility and Diagnostics / Maintenance controls
- Save/effect feedback for controls

### Onboarding

- Goal selection with task-specific dependency explanation
- Progressive disclosure of connection choices
- Provider selection and verification state
- Existing index reuse and accelerated status refresh
- Back/continue with preserved choices
- Final first-task launchpad

## Truth boundary

This is a target design. Current or partially implemented capabilities must still be verified against production source before implementation. In particular, Codex and Claude Code ordinary-generation and Agent capabilities require separate verification; OpenRouter and Ollama model lists must use fresh runtime/catalog evidence; Knowledge Index readiness must not be inferred from a static preference.

## Historical evidence

- [`2026-08-06 redesign exploration`](../onboarding-settings-redesign-2026-08-06/index.html) — early flow, shell and Provider/model chooser variants.
- [`Visual calibration board`](../onboarding-settings-redesign-2026-08-06/visual-calibration/index.html) — Raycast, Linear, macOS, ChatGPT and VS Code references.
- [`2026-08-06 redesign brief`](../../superpowers/specs/2026-08-06-onboarding-settings-launch-readiness-redesign.md) — recording diagnosis and first-round design decisions.

These files remain for traceability. They are superseded by this package for current design review.
