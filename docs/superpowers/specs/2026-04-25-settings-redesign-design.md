# Settings Redesign — Design Spec

**Date:** 2026-04-25
**Status:** Draft

## Problem

The current Settings UI has critical UX issues:

1. **Embedding dual-knob trap** — Users must configure embedding in both Profile (`embeddingEndpoint` + `embeddingModel`) AND `search.chunking.embeddingModel` — two different locations. Missing either causes silent vector search degradation with no user-visible error.
2. **37+ per-prompt model selectors** — ModelConfigTab exposes individual model overrides for every PromptId. No user understands the difference between `ai-analysis-dimension-recon` and `ai-analysis-task-consolidator`.
3. **Deprecated settings still shown** — `maxMultiAgentIterations` and `maxJudgeCalls` are displayed with "deprecated/reserved" labels.
4. **Useful settings hidden** — `attachmentHandlingDefault`, `Profile.enabled`, `Profile.embeddingApiKey`, `SdkSettings` (CLI path, pool size, warmup) have no UI.
5. **Tab grouping incoherent** — "Model Config" embeds Profile CRUD; "Doc & Search" mixes AI Analysis, Hub Discover, and chunking.
6. **ProfileKind too narrow** — Only 4 kinds (`anthropic-direct`, `openrouter`, `litellm`, `custom`). Missing first-class support for OpenAI, Google, Perplexity, Ollama.
7. **Model dropdown is plain text input** — Users must know exact model IDs. No browsing, no search, no capability metadata.
8. **No health status** — No indication whether Agent profile, Embedding profile, or SQLite are properly configured.
9. **Single-mode only** — Settings only accessible via Obsidian's Settings tab. No standalone modal for quick access.

## Architecture: Three-Tier, Profile-Centric

### Tier 1: Essential UI (always visible)
Core settings that every user needs. Organized into 3 tabs.

### Tier 2: Advanced UI (collapsed sections)
Power-user settings accessible via expandable sections within the tabs. Hidden by default but discoverable.

### Tier 3: `peak-config.json` (vault root)
Extreme customization only relevant to developers/power-users. JSON file in vault root, version-controllable.

### Dual-Mode Rendering
The same `SettingsRoot` React component renders in two contexts:
- **Obsidian Settings tab** — via existing `PluginSettingTab` subclass (registered automatically)
- **Standalone modal** — via a new command `Peak: Open Settings` that opens a Modal wrapping `SettingsRoot`

Both modes share identical UI. The component detects context and adapts only minor chrome (e.g., no close button in settings tab mode).

## Tab Structure

### Tab 1: Profiles

**Status bar** (top, always visible):
- Three chips showing health: `Agent: <model>` (green/red), `Embedding: <model>` (green/red), `SQLite: ready/unavailable` (green/red)
- Red chip = actionable link to fix (e.g., clicking red Embedding chip scrolls to the profile's Embedding section)

**Profile cards** (main content):
Each profile is a collapsible card containing all configuration for one AI connection:

- **Header** (always visible): Provider SVG icon + Profile name + Role badges (`Agent` / `Embedding`) + subtitle (kind · model · key status) + Test button + ⋯ menu (rename, duplicate, delete, enable/disable)
- **Body** (expanded):
  - **Connection** section: Type (dropdown: 8 ProfileKinds), Base URL, API Key, Auth Token
  - **Models** section: Primary Model (searchable combobox), Fast Model (searchable combobox)
  - **Embedding** section: Endpoint (optional, defaults to Base URL), API Key (optional, defaults to main key), Model (searchable combobox filtered to embedding models)
  - **Role toggles** (bottom): `Use as Agent` checkbox, `Use as Embedding` checkbox — replaces the old separate active selector dropdowns

**Add Profile button** — Opens a provider selection grid (8 cards with SVG icons), then creates a new profile with provider-specific presets.

**Advanced (collapsed):**
- LLM Output Control: temperature, topP, reasoningEffort, textVerbosity, timeouts
- SDK Settings: CLI path override, subprocess pool size, warmup on load

### Tab 2: Search & Indexing

**Indexing section:**
- Auto-index on startup (toggle)
- Document types (chip grid with toggles: Markdown, PDF, Image, Excalidraw, Word, Excel, PowerPoint, CSV)
- Ignore patterns (edit button → textarea overlay)

**Chunking section:**
- Max chunk size (number input)
- Chunk overlap (number input)

**AI Analysis section:**
- Web search method (dropdown: Local Chromium / Perplexity API)
- Auto-save results (toggle)
- Save folder (text input)
- Recent history limit (number input)

### Tab 3: General

**Folders section:**
- Data storage folder (text input with confirm)
- Chat root folder (text input with confirm)

**Behavior section:**
- Attachment handling (dropdown: Direct / Degrade to text)

**Developer section:**
- DevTools graph inspector (toggle)
- Graph Visualization Tuning (collapsed): cluster force, node radius, degree boost, min branch nodes — all sliders

### `peak-config.json` Content

```jsonc
{
  // Per-prompt model overrides (37 prompts)
  "promptModelMap": {
    "ai-analysis-evidence-plan": { "provider": "openai", "modelId": "gpt-4o" },
    // ... other prompts
  },
  // Inspector side panel parameters
  "inspectorLinks": {
    "keywordTopN": 10,
    "tagTopN": 5,
    "folderGroupingEnabled": true,
    "folderGroupMinCount": 3,
    "folderGroupMaxDepth": 2
  },
  // Graph visualization (advanced params not in UI)
  "graphViz": {
    "mstPruneDepth": 2,
    "skeletonBackboneOnly": false,
    "mstLeafOpacity": 0.25,
    "mstLeafWidthScale": 0.6
  },
  // Hub discover tuning
  "hubDiscover": {
    "enableLlmSemanticMerge": false,
    "maxRounds": 5,
    "maxJudgeCalls": 20,
    "minCoverageGain": 0.02
  },
  // Summary lengths
  "summaryLengths": {
    "short": 150,
    "full": 2000,
    "sessionWordCount": 1200
  },
  // Index refresh interval (ms)
  "indexRefreshInterval": 5000
}
```

The file is read once on plugin load and merged with defaults. If absent, defaults are used. Changes require plugin reload. A note in the UI callout explains this.

## ProfileKind Expansion

Expand from 4 to 8 kinds:

| Kind | Provider | Default Base URL | Icon |
|------|----------|-----------------|------|
| `anthropic` | Anthropic | `https://api.anthropic.com/v1` | Anthropic A logo (SVG) |
| `openai` | OpenAI | `https://api.openai.com/v1` | OpenAI logo (SVG) |
| `google` | Google | `https://generativelanguage.googleapis.com/v1beta` | Google G (SVG) |
| `perplexity` | Perplexity | `https://api.perplexity.ai` | Perplexity layers (SVG) |
| `ollama` | Ollama | `http://localhost:11434` | Ollama circle (SVG) |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | OpenRouter router (SVG) |
| `litellm` | LiteLLM | `http://localhost:4000` | Lightning bolt (SVG) |
| `custom` | Custom | (user provided) | Gear (SVG) |

Rename `anthropic-direct` → `anthropic` (migration: update existing profiles on load).

Each provider preset includes sensible defaults for `primaryModel`, `fastModel`, and (where applicable) `embeddingModel`.

## Searchable Model Combobox

Replaces all `<input>` and `<select>` model fields with a unified combobox component.

**Data source:** `model-catalog.json` — models filtered by provider kind. OpenRouter and LiteLLM show all providers grouped by vendor. Direct providers (Anthropic, OpenAI, Google, Perplexity) show only their own models. Ollama merges locally-detected models (via `/api/tags` endpoint) with catalog defaults.

**UI states:**
1. **Closed** — Shows selected model ID + capability tags (reason, vision, search, context window size)
2. **Open (browsing)** — Full dropdown with models grouped by `<optgroup>` vendor headers. Color-coded group dots.
3. **Open (filtering)** — Real-time substring match as user types. Matching text highlighted in purple. Empty groups auto-hidden.
4. **No match (Custom/LiteLLM)** — Shows "No matching models. Press Enter to use `<typed-id>`". Direct providers do not allow free text.

**Keyboard:** ↑↓ navigate, Enter select, Esc close, typing starts filter.

**Capability tags** read from `model-catalog.json` `capabilities` field:
- `reason` (yellow) — `capabilities.reasoning === true`
- `vision` (blue) — `capabilities.vision === true`
- `search` (green) — `capabilities.webSearch === true`
- `128K` / `200K` / `1M` (gray) — formatted from `capabilities.maxCtx`

## Model Catalog Expansion

Current: 6 providers, 85 models. Expand OpenRouter with:

| Vendor | Models to Add |
|--------|--------------|
| DeepSeek | `deepseek/deepseek-r1`, `deepseek/deepseek-r1-0528`, `deepseek/deepseek-chat-v3` |
| Meta | `meta-llama/llama-4-maverick`, `meta-llama/llama-4-scout`, `meta-llama/llama-3.3-70b`, `meta-llama/llama-3.1-405b` |
| Mistral | `mistralai/mistral-large-2`, `mistralai/mistral-medium-3`, `mistralai/codestral`, `mistralai/ministral-8b` |
| xAI | `x-ai/grok-3`, `x-ai/grok-3-mini`, `x-ai/grok-2` |
| Cohere | `cohere/command-a`, `cohere/command-r-plus`, `cohere/command-r` |
| Qwen | `qwen/qwen3-235b`, `qwen/qwen3-30b`, `qwen/qwen-2.5-72b` |
| NVIDIA | `nvidia/llama-3.1-nemotron-70b` |

Also add to Ollama catalog: `deepseek-r1`, `qwen3`, `gemma3`, `phi4`, `llama-3.3`, `mistral-small`.

Total after expansion: ~110 models.

## Embedding Dual-Knob Fix

**Problem:** Two separate configs must both be set for embeddings to work:
1. Profile: `embeddingEndpoint` + `embeddingModel`
2. Settings: `search.chunking.embeddingModel` (`{ provider, modelId }`)

The `embedClient.ts` reads from Profile, but `queryService.ts:65-68` and `indexService.ts:481-483` gate on `search.chunking.embeddingModel` before calling `embedText()`.

**Fix:** Eliminate `search.chunking.embeddingModel` as a separate config. The gating check in `queryService` and `indexService` should read from `ProfileRegistry.getActiveEmbeddingProfile()` instead. Single source of truth: the Profile's embedding fields.

The old `search.chunking.embeddingModel` field is kept in the type for backward compatibility but never read. On load, if it's set and Profile embedding is not, migrate the value into the active profile.

## Settings Removed from UI

These settings are **deleted entirely** (not moved to peak-config.json):

| Setting | Reason |
|---------|--------|
| `maxMultiAgentIterations` | Deprecated — slot pipeline does not use iterations |
| `maxJudgeCalls` | Legacy/reserved — not used by current hub pipeline |
| `searchSummaryModel` | Deprecated — replaced by `promptModelMap` |
| `search.chunking.embeddingModel` | Redundant — unified into Profile |
| `search.chunking.rerankModel` | Dead code — FlashRank throws, no reranker active |
| `vaultSearch.sdkProfile` | Legacy v1 — only used as migration source |
| `ai.llmProviderConfigs` | Legacy v1 — migrated to profiles on first load |

## Settings Surfaced (New UI)

| Setting | Location | UI Control |
|---------|----------|-----------|
| `Profile.enabled` | Profile card ⋯ menu | Toggle (enable/disable without deleting) |
| `Profile.embeddingApiKey` | Profile card → Embedding section | Password input |
| `attachmentHandlingDefault` | General tab → Behavior | Dropdown |
| `SdkSettings.cliPathOverride` | Profiles tab → Advanced (collapsed) | Text input |
| `SdkSettings.subprocessPoolSize` | Profiles tab → Advanced (collapsed) | Number input |
| `SdkSettings.warmupOnLoad` | Profiles tab → Advanced (collapsed) | Toggle |

## Component Architecture

```
SettingsRoot.tsx              — Tab switcher + dual-mode detection
├── ProfilesTab.tsx           — Status bar + profile list + add + advanced
│   ├── StatusBar.tsx         — Health chips (agent/embedding/sqlite)
│   ├── ProfileCard.tsx       — Collapsible card with all profile fields
│   │   ├── ConnectionSection.tsx
│   │   ├── ModelsSection.tsx
│   │   ├── EmbeddingSection.tsx
│   │   └── RoleToggles.tsx
│   ├── AddProfileGrid.tsx    — Provider selection grid (8 cards)
│   ├── LLMOutputControl.tsx  — Advanced collapsed section
│   └── SdkSettingsSection.tsx
├── SearchTab.tsx             — Indexing + Chunking + AI Analysis
│   ├── DocTypeGrid.tsx       — Chip toggle grid
│   └── IgnorePatternsEditor.tsx
├── GeneralTab.tsx            — Folders + Behavior + Developer
│   └── GraphVizSliders.tsx   — Collapsed slider group
└── ModelCombobox.tsx         — Shared searchable model selector component
```

## Data Flow

```
plugin load
  → loadData() → normalizePluginSettings()
  → ProfileRegistry.load(profiles, persistFn)
  → loadPeakConfig() → merge peak-config.json with defaults
  → SettingsRoot reads from plugin.settings + ProfileRegistry

user changes setting
  → useSettingsUpdate hook → plugin.settings mutation → saveSettings()
  → SettingsUpdatedEvent dispatched

user changes profile
  → ProfileRegistry mutation → persistFn → saveSettings()
  → (ProfileRegistry is the single source of truth for profiles)

peak-config.json
  → read once on load, merged with compiled defaults
  → not watched for changes (plugin reload required)
```

## Migration

On first load after update:
1. `anthropic-direct` ProfileKind → rename to `anthropic` in all existing profiles
2. `search.chunking.embeddingModel` → if set and active profile has no embedding model, copy value into profile
3. `vaultSearch.sdkProfile` → already migrated by existing `migrate-v1.ts`, now delete the field
4. `ai.llmProviderConfigs` → already migrated, now delete the field
5. Deprecated settings (`maxMultiAgentIterations`, `maxJudgeCalls`, `searchSummaryModel`, `rerankModel`) → remove from persisted data

## Mockups

Visual mockups available in `.superpowers/brainstorm/18773-*/content/`:
- `mockup-full-settings.html` — Full 3-tab interactive mockup (Profiles / Search & Indexing / General)
- `mockup-providers-expanded.html` — Add Profile provider grid + model catalog expansion table
- `mockup-searchable-dropdown.html` — Searchable model combobox (4 states: browse / filter / selected / free-text)
