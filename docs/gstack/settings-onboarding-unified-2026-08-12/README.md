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
- **Agents** keeps the second control chain together: Peak Hermes → external capabilities → permissions → confirmations.
- Agent capability and safety remain distinct levels inside that page; enabling a capability never silently grants unrestricted access.
- There is no generic **Features** destination. Each option lives with the thing it changes: models and generation routes in AI & Models; Agent execution, tools and access rules in Agents; Search, Atlas and Ambient behavior in Knowledge & Search; outputs, retention and appearance in Advanced.
- **Peak Hermes** is the single Agent runtime and owns workflow, permissions and receipts. Codex, Claude Code and model connections are execution providers selected through the Provider Registry / Capability Gateway after capability verification; they are not parallel runtimes.
- **Knowledge & Search** summarizes index state and provides scope shortcuts. The Knowledge Index workspace owns per-run depth, refresh behavior, file/folder scope, chunking, enrichment limits, rebuild impact, current progress and errors.
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
- A low-frequency `AI Control Center` entry at the end of AI & Models, after ordinary connection and feature-model controls
- A compact Automatic-model rule that explains what it affects, uses understandable outcome and processing-location language, and never overwrites manual choices
- Primary and additional connection groups, with an OpenRouter detail that separates connection health from online catalog, cache and bundled fallback state
- Borderless in-place model dropdowns on every product feature and configurable child action; choosing a routine model no longer opens a modal
- A single explicit `Advanced model settings…` row inside the dropdown preserves access to per-action controls without putting them on the everyday path
- Chat Studio and Composer include explicit image-understanding and image-generation routes instead of hiding media behind a generic feature default
- Add-connection modal presents every supported connection as one equal provider list; there is no miniature secondary tier inside the modal
- Real safety modes: Read only, Ask every time, Accept reviewed edits and Bypass confirmations
- One Peak Hermes runtime with a separate execution-provider selector; Codex and Claude Code are not presented as runtimes
- Vertical safety-mode picker, external MCP/tool-server setup, Web Access, and an entry to the separate Command Gateway workspace
- Clickable file-type and folder-exclusion details, plus concrete File Atlas, Ambient and Vault Intelligence controls
- Advanced exposes only the user-meaningful generated-media path; analysis, Skills, Inbox, DataStore and derived folders remain Peak-managed
- Save/effect feedback for controls

### Onboarding

- Goal selection with task-specific dependency explanation
- Progressive disclosure of connection choices
- Provider selection and verification state
- Existing index reuse and accelerated status refresh
- Back/continue with preserved choices
- Final first-task launchpad

## Truth boundary

This is a target design. Current or partially implemented capabilities must still be verified against production source before implementation. The source currently exposes `hermes-harness` and `provider-direct` backend kinds; Codex and Claude Code provider adapters still require separate verification before they may appear as ready execution providers. OpenRouter and Ollama model lists must use fresh runtime/catalog evidence, and Knowledge Index readiness must not be inferred from a static preference.

## Historical evidence

- [`2026-08-06 redesign exploration`](../onboarding-settings-redesign-2026-08-06/index.html) — early flow, shell and Provider/model chooser variants.
- [`Visual calibration board`](../onboarding-settings-redesign-2026-08-06/visual-calibration/index.html) — Raycast, Linear, macOS, ChatGPT and VS Code references.
- [`2026-08-06 redesign brief`](../../superpowers/specs/2026-08-06-onboarding-settings-launch-readiness-redesign.md) — recording diagnosis and first-round design decisions.

These files remain for traceability. They are superseded by this package for current design review.
