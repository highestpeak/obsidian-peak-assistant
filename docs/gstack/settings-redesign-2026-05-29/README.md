# Peak Assistant Settings Redesign — Static HTML Mock

Created: 2026-05-29

This folder contains an HTML mockup of the new Peak Assistant settings IA, used for review before any production code lands.

## Paths

- HTML mock: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/settings-redesign-2026-05-29/index.html`
- Shared CSS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/settings-redesign-2026-05-29/mock.css`
- Tab / icon JS: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/settings-redesign-2026-05-29/mock.js`
- Reference image archive: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/settings-redesign-2026-05-29/assets/`

Open `index.html` directly in a browser. The five tabs across the top switch panels in-page. The reference images are inlined in a collapsed `<details>` strip at the bottom of the page.

## What was rendered

Single `index.html` file with five tab panels matching the spec IA:

| Tab | Sections |
| --- | --- |
| Overview | Peak readiness, AI behavior summary, Actions |
| AI Setup | Recommended setup presets, AI behavior rows, Providers, Custom endpoints, Advanced model controls (collapsed, 11 fields) |
| Knowledge Index | Index readiness panel (with recommended-action row), Index behavior (with Refresh interval), Search quality (with Inspector links disclosure, 5 fields), AI Analysis output (with Summary lengths disclosure), Advanced chunking (6 fields), Advanced rebuild (4 actions) |
| Tools | External tools (each row expands to show MCP transport/command/args/env), Web Access, Skills, Capture destinations |
| Advanced | Agent runtime (with stronger-model disclosure: allow + target + max + threshold), Storage and folders (with Derived folders disclosure), Proactive suggestions (7 toggles + Tuning disclosure with 7 advanced cooldowns), Usage and retention, Maintenance (categorised: Index / Knowledge graph / Verification & cleanup), Danger zone (collapsed), Developer (Graph viz / SDK process settings / Legacy compatibility disclosures) |

### Production-fidelity field coverage

After cross-checking against the current Peak Assistant production settings, the mock now covers every user-facing field that exists today:

- Profile fields: name, kind, baseUrl, apiKey, primaryModel, fastModel, embedding endpoint/key/model, custom headers — surfaced inside the `providerEdit` modal.
- Custom endpoints (LM Studio / LiteLLM / vLLM): full add/edit/test/delete + "Add from preset" flow.
- Index behavior: Index mode, Auto-index, Refresh interval, Document types (12 pills), Ignore patterns.
- Advanced chunking: Max chunk size, Chunk overlap, Min document size, Skip code blocks, Code block placeholder, Max code chars.
- Inspector links: Keyword count, Tag count, Folder grouping toggle, Folder group min count, Folder group max depth.
- AI Analysis: Auto-save, Save folder, Recent history, Exclude saved analyses, Session summary words, Short summary length, Full summary length.
- Agent runtime: Backend (Auto / Peak / Claude Agent SDK), Safety, Allow escalation, Target stronger model, Max escalations per loop, Confidence threshold, Hooks.
- Storage: Data storage folder, Chat root folder, Derived folders (Prompts/Attachments/resources-summary-cache/Hub-Summaries/User-Profile), SQLite backend.
- Proactive suggestions: Master switch, Inline gutter, Morning briefing, Status bar, Auto-open, AI explanations, Learn from feedback + 7 tuning advanced (trigger/doc switch/writing pause/min change/max suggestions/graph hops/AI explanation cooldown).
- Usage and retention: Tracking, Detailed log retention.
- Maintenance: Update index, Full pipeline, Cancel indexing, Refresh related notes, Refresh hub summaries, Recompute gap analysis, Analyze vault intuition, Verify database, Cleanup useless data, Build pending vectors, Run pending LLM enrichment, Global maintenance, Compare PPR search (under Advanced rebuild).
- Developer: Graph inspector toggle, MST prune depth, Skeleton backbone, MST leaf opacity, MST leaf width scale, SDK CLI path override, Pool size, Warmup on load, Legacy Vault Search SDK profile, Legacy provider configs view.
- Per-prompt overrides: dedicated table modal (`promptOverrides`).
- Attachment handling dropdown: inside Advanced model controls disclosure.

### Interactive modals

Clicking buttons opens the matching modal. Multiple modals can chain (Add Provider → providerEdit). Esc, overlay click, or any `Close/Cancel` button closes the active modal.

| Modal id | Trigger | What it shows |
| --- | --- | --- |
| `addProvider` | AI Setup `Add Provider` button | 8 brand chip grid (Anthropic, OpenAI, Google, Perplexity, Ollama, OpenRouter, LiteLLM, Custom). Selecting a chip opens `providerEdit`. |
| `providerEdit` | Per-provider `Edit` button | Full profile form (Connection, Models, Embedding) + Custom headers disclosure + Delete/Test/Save footer. Modal title prefilled with provider name. |
| `customEndpointEdit` | Custom endpoint `Edit` button | Edit a saved OpenAI-compatible endpoint. |
| `addCustomEndpoint` | AI Setup `Add custom endpoint` button | Endpoint name + base URL + API key form. |
| `addCustomFromPreset` | AI Setup `Add from preset` button | LM Studio / LiteLLM / vLLM presets that chain into `addCustomEndpoint`. |
| `chooseModel` | Capability row `Change` button | Searchable model picker with provider attribution. Modal title prefilled with the capability name ("Choose Conversation model" etc.). |
| `addExternalTool` | Tools `Add external tool` button | Name + transport + command/args/URL + env. |
| `ignorePatterns` | KI `Edit` next to Ignore patterns | Textarea with current globs. |
| `webAccess` | Any "Setup Web Access" button | Provider dropdown + API key + Used-by reminder. |
| `safety` | Overview `Review` next to Safety | 3-choice radio (Read only / Ask / Bypass). |
| `strongerModel` | AI Setup `Setup` next to Use stronger model when needed | Allow toggle + target model + max escalations + threshold slider. |
| `providerList` | Overview `Manage` next to Providers | Shortcut explainer; button jumps to AI Setup tab. |
| `runSetup` | Overview `Run setup` button | Confirms re-opening the onboarding wizard. |
| `testProviders` | Overview `Test providers` button | Batched per-provider ping results. |
| `checkIndex` | Overview `Check index` button | Shortcut explainer; button jumps to Knowledge Index tab. |
| `promptOverrides` | Advanced model controls `Open table` | Editable pinned-prompt → model table. |
| `confirmDanger` | Danger zone `Clear` / `Delete` | Red-tinted confirm dialog. Title and body customised per trigger. |
| `stub` | Any button without a dedicated modal | Generic explainer. Banner text passed via `data-context-body` on the trigger. |

### Inline interactivity (no modal)

- `<details>` disclosures across all five tabs expand in place. Their bodies render real form fields, not placeholders.
- Toggles, segmented controls, preset cards, pill pickers, and search-result radios all accept clicks.
- Tab switching is hash-routed: deep-link via `index.html#aiSetup` etc.
- Modal deep-link for review: `index.html?open=providerEdit#aiSetup` opens the AI Setup tab with the Provider Edit modal already open.

## Source attribution per element

### From the spec — `docs/superpowers/specs/2026-05-29-settings-interface-design.md`

- Tab IA and ordering: Overview / AI Setup / Knowledge Index / Tools / Advanced.
- All user-facing strings (Conversation, Fast Lookup, Research, Use stronger model when needed, Knowledge Index, Web Access, External tools, Agent runtime, etc.).
- Recommended-setup preset names and descriptions.
- Readiness chip vocabulary: Ready / Needs attention / Not ready / Optional.
- Capability row anatomy: icon, title, one-sentence description, optional `Used by` chips, readiness chip, current binding, primary action.
- Index readiness panel structure (SQLite store → Current index → Missing/changed → Semantic readiness → Current mode → Recommended action).
- Per-row repair CTA labels (Manage / Fix / Check / Setup / Change / Test / Edit / Review).
- Advanced runtime mode label (Auto / Peak runtime / Claude Agent SDK).
- Danger zone wording (Clear profile build record, Delete index data).
- Maintenance action strip names.

### From the reference images (layout, density, status expression)

- Single-column row layout with consistent left icon + body + right control alignment.
- Status chip placement on the right side of each row, not the left.
- Four-up preset grid for Recommended setup with check-state on the selected card.
- Readiness panel as a single bordered group with internal dividers, terminating in an accent-tinted recommended-action row (from Knowledge Index reference).
- Segmented control for Index mode (Fast / Semantic / Full) inline at row right.
- Pill picker for Document types, right-aligned.
- Dashed `+ Add external tool` row pattern.
- Collapsible disclosure for danger zone and developer subsections.
- Toggle + label compact density for Proactive suggestions and Usage and retention.

### Specifically NOT taken from images

- The reference images contain known imagegen OCR errors. Final wording for every visible string was sourced from the spec, not OCR'd from the PNGs.
- Reference image for Advanced shows a status-bar row that the spec puts inside Proactive suggestions; followed the spec.

## Conventions followed

- Vocabulary contract enforced — `Profile`, `Harness`, `Quick`, `Deep`, `Premium`, `Agent Fast`, `MCP Servers`, `Embedding` do not appear in primary chrome. `Agent runtime` appears only inside Tab 5 Advanced.
- Brand icons sourced from Simple Icons (Anthropic, OpenAI, Ollama, Perplexity) and OpenRouter's official header SVG. No hand-rolled brand marks. See `feedback_brand_icons.md` in `~/.claude/.../memory/` for the resolution order.
- Generic UI icons are Lucide-style outlines, hand-coded inline.
- Selection state uses `--pk-accent-soft` background + `3px` left accent border + check icon (preset cards). Pills and segmented controls use accent-soft fill + accent foreground.
- Readiness chip colors:
  - Green = Ready (success-soft + check icon)
  - Yellow = Needs attention (warning-soft + alert icon)
  - Neutral = Optional / Off (surface-muted)
- All radii at `--pk-radius-lg` (12px) for cards/rows and `--pk-radius-md` (8px) for buttons.

## Tabs interaction

- Tab clicks switch panels in-place. No page reload.
- Toggles, pill pickers, preset radios, and segmented controls accept clicks for demo affordance.
- `<details>` is used for collapsed Advanced groups (model controls, chunking, rebuild, danger zone, developer disclosures).

## Relationship to onboarding mock

This mock sits next to the onboarding mock at `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/onboarding-redesign-2026-05-29/`. The two share design tokens (`--pk-*`) and Simple-Icons-based brand mark conventions, so they can later be merged into a single style sheet for production.

## What this mock does NOT include

- Obsidian's left settings sidebar — out of scope by spec rule.
- A dashboard hero or summary chart on Overview — spec explicitly forbids turning Overview into a dashboard.
- Real model-list autocompletion — `chooseModel` shows a fixed sample of 7 models from connected providers, not a live fetch.
- Real provider connection testing — `Test` buttons open a stub modal that explains what the production code would do (ping the provider's `/v1/models` endpoint).

## Where Agent Harness lives

The legacy `Agent Harness` tab is fully decomposed into the new IA — no settings were lost:

| Old Agent Harness field | New location |
| --- | --- |
| Tier model bindings (Local Fast / Local Deep / Online) | AI Setup → AI behavior → Fast Lookup / Research / Use stronger model when needed |
| Agent backend (Auto / Self-hosted / Claude Agent SDK) | Advanced → Agent runtime → Runtime mode |
| Permission mode (Read only / Accept edits / Bypass) | Advanced → Agent runtime → Safety (and Overview → Safety row) |
| Escalation policy (allow / max per loop / threshold) | Advanced → Agent runtime → Use stronger model when needed disclosure |
| Hooks | Advanced → Agent runtime → Hooks |
| Re-run setup wizard | Advanced → Agent runtime → Re-run setup wizard (also Overview → Actions → Run setup) |

The word `Harness` only appears inside Advanced; nowhere in primary chrome.

## Playwright review pass

Walked through every tab, every disclosure, every modal with Playwright (Chromium, viewport 1100×1400) and fixed the issues found:

- `<button class="choice-row">` and `<button class="provider-chooser__chip">` inherited the UA default `text-align: center`, which centered multi-line description text. Fixed with explicit `text-align: left`.
- Disclosure row chevrons sat at the body's vertical center, dropping below the title's first line on rows with multi-line descriptions. Switched `.row--disclosure` to `align-items: start` so the right-side meta + chevron align with the title line.
- Hooks row had a redundant disabled toggle next to its "Coming soon" chip. Removed the toggle.
- Re-run setup wizard had no dedicated entry. Added as a row in Advanced → Agent runtime with a wrench icon and "Re-run" button.
- Test providers modal's check icons rendered at default SVG size (24×24) inside the `kv-list` rows. Scoped icon size to 12×12 in `.kv-list`.

Interactive flows verified end-to-end via Playwright clicks:

- Add Provider → providerEdit chain closes the chooser before opening the editor.
- Esc closes every modal.
- Re-run setup wizard row exists exactly once in Advanced and opens `runSetup` on click.
- Every `<details>` disclosure opens to real form content, not a stub.

## Out-of-scope

- No production code touched. `src/`, `templates/`, `main.ts`, and any package files are unmodified.
- No `npm` build needed or run. This is a docs-only HTML mock.
