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
- There is no generic **Features** destination. Each option lives with the thing it changes: models and generation routes in AI & Models; Agent execution, tools and access rules in Agents; Search and Atlas behavior in Knowledge & Search; outputs, retention and appearance in Advanced. Vault Intelligence remains deferred while its new workspace contract is still changing.
- **Peak Hermes** is the single Agent runtime and owns workflow, permissions and receipts. Codex, Claude Code and model connections are execution providers selected through the Provider Registry / Capability Gateway after capability verification; they are not parallel runtimes.
- **Knowledge & Search** owns durable index scope, background refresh, batching/retries, embedding, summary and chunking defaults. The Knowledge Index workspace owns first-run setup, per-run depth and scope review, live progress, completion and rerun.
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

1. Detect whether a usable AI connection already exists. Reuse and verify it when possible; otherwise show a real unconfigured state and guide the user through one connection.
2. Bind three core jobs — Chat & Writing, Search & Analysis, and Agent & Tools — from short capability-filtered model lists. Agent choices must prove tool calling, structured output and the minimum context requirement; the onboarding picker never exposes known-incompatible models.
3. Detect the Vault state. Reuse a valid local index when available; for a new Vault, recommend the fastest local full-text index and leave semantic search, summaries, tags, entities and relationships for later runs.
4. Run an explicit System Check covering the AI connection, core model roles, Peak Hermes, Vault search, local storage and review-first safety defaults. Web access and media generation remain visible but optional.
5. Present the real product launchpad. Clicking an item opens that feature immediately; the onboarding page does not insert another prompt form. Composer uses the current note or falls back to a recent eligible note.

The default path is a five-step horizontal flow with no secondary step sidebar: `Connect AI → Core models → Prepare vault → System check → Try Peak`. It preserves the necessary checks from the current production wizard without making new users understand the full model catalog, budget strategy, advanced index pipeline or safety taxonomy. The mock includes reviewer controls for both `Not configured` and `Existing setup` states. The flow distinguishes `Setup complete` from `First success`, saves progress, keeps recovery local to the failing step, and provides direct next destinations instead of ending on an empty success page.

## Mocked interactions

### Settings

- Header tab navigation inside the native Obsidian Settings context
- A low-frequency `AI Control Center` entry at the end of AI & Models, after ordinary connection and feature-model controls
- A compact Automatic-model rule that explains what it affects, uses understandable outcome and processing-location language, and never overwrites manual choices
- Primary and additional connection groups, with an honest OpenRouter detail: the connection and bundled catalog are current; remote JSON updates and a persistent last-known-good cache remain target work
- One model-catalog management surface for source freshness, search, hidden models, aliases and capability evidence; these are catalog preferences, not three unrelated Settings pages
- Searchable in-place model pickers on every product feature and configurable child action; the feature tree starts fully collapsed, then reveals child actions only when the user asks for them; results come from the configured connection catalog, group many models under each Profile / Provider, expose capability and context hints, and support keyboard selection without opening a modal
- The same Provider → Model picker is reused by Agent execution, Knowledge embedding and Web access. There is no separate hard-coded Provider dropdown: Agents mirrors the same Hermes model binding shown under AI & Models, while unavailable or unverified models stay visible with a reason and cannot be selected.
- The picker follows the production `ComposerModelSelector` / `RoleModelPicker` contract: search Profile, Provider, model ID or capability; keep Automatic visible; group by enabled Profile; show the selected model; reserve `Advanced model settings…` for parameters, fallback and limits
- Chat Studio and Composer include explicit image-understanding and image-generation routes instead of hiding media behind a generic feature default; Chat Studio also exposes its default attachment-handling policy in the expanded feature
- Provider-native media routes are conditional: a media control appears only when the selected connection or model advertises and passes the required media capability
- Add-connection modal presents every supported connection as one equal provider list; there is no miniature secondary tier inside the modal
- Real safety modes: Read only, Ask every time, Accept reviewed edits and Bypass confirmations
- One Peak Hermes runtime with a shared execution-model selector; Codex and Claude Code appear as Provider connections inside that picker, not as runtimes
- Vertical safety-mode picker, external MCP/tool-server setup, Web Access, standard Agent Skills migration state, and an entry to the separate Command Gateway workspace
- Clickable file-type and folder-scope details, including a Whole Vault / include-folder choice and ignore patterns, with Office formats excluded from the product scope and Peak Sheet / AI Graph explained as separately governed formats; plus concrete File Atlas controls
- Advanced exposes exactly two storage boundaries: `Data root` for Peak-managed records and rebuildable data, and `Media root` for large generated media. Every internal subfolder remains derived rather than independently configurable.
- Knowledge rows show the setting name and current value at rest; longer explanations move to hover/focus help. Search quality keeps a folded Inspector-links group, while user-facing PPR / model-rerank switches are retired and analysis history remains in the AI Analysis workspace rather than becoming a setting.
- Save/effect feedback for controls

### Onboarding

- Five labeled horizontal steps: Connect AI → Core models → Prepare vault → System check → Try Peak
- Toggleable first-time and existing-setup review states, so empty connection and reuse behavior are both inspectable
- One-connection setup with API-key, local-service and local-authenticated-adapter variants, followed by authentication, compatible-model and minimum-request receipts
- Three necessary model roles with searchable, Provider-aware, capability-filtered choices; no full catalog or incompatible Agent model appears in onboarding
- Existing full-text index reuse or a fastest-first local full-text build for a new Vault; semantic and generated-knowledge work does not block first use
- A dedicated System Check for connection, roles, the single Peak Hermes runtime, local index, storage and safety, with optional Web and media status kept separate
- Back/continue with preserved choices
- A direct final launchpad for Chat Studio, Composer & Copilot, Vault Search, AI Search, File Atlas, AI Graph, Agent & Wizard and conditional media generation; no extra prompt editor or second confirmation

## Truth boundary

This is a target design. Current or partially implemented capabilities must still be verified against production source before implementation. Peak Hermes is the only target Agent runtime; Codex, Claude Code and ordinary model connections are execution providers and must pass the same Hermes capability gate before use. OpenRouter remote catalog sync, freshness validation and persistent fallback are not production-ready; Ollama remains runtime-discovered. MCP currently covers a narrower tools path than the full protocol, and Peak's legacy skill format still requires a standard Agent Skills compatibility layer. Knowledge Index readiness must never be inferred from a static preference.

## Historical evidence

- [`2026-08-06 redesign exploration`](../onboarding-settings-redesign-2026-08-06/index.html) — early flow, shell and Provider/model chooser variants.
- [`Visual calibration board`](../onboarding-settings-redesign-2026-08-06/visual-calibration/index.html) — Raycast, Linear, macOS, ChatGPT and VS Code references.
- [`2026-08-06 redesign brief`](../../superpowers/specs/2026-08-06-onboarding-settings-launch-readiness-redesign.md) — recording diagnosis and first-round design decisions.

These files remain for traceability. They are superseded by this package for current design review.
