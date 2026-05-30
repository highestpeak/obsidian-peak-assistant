# Peak Assistant — Onboarding & Configuration System Design

**Status:** Design handoff (designer + implementation)
**Author:** AI pair
**Date:** 2026-05-29
**Audience:** UI/UX designer producing mockups; implementation engineer afterward
**Builds on:** `2026-05-26-settings-mental-model-redesign.md` (Settings IA + mental model)
**Replaces:** the separate `OnboardingModal` + `HarnessOnboardingModal` flows; the implicit "set up via Settings tabs" path
**Related:** `2026-04-10-provider-mcp-skills-design.md` (MCP / Skill subsystem); `2026-05-25-agent-model-selection-design.md` (Curator Agent backend, already shipped PR1–PR4)

> **Reading order if you have 2 minutes**: §1 (the problem), §3 (the mental model the whole product teaches), §5.1 (the wizard step list), §6.1 (Overview tab in Settings). Everything else is reference detail.

---

## 1. Why this exists

Four real signals triggered this design:

1. **"我没看到 onboarding 里有 harness agent 我们的配置啊"** — the existing setup wizard (Welcome → Provider → Index → SystemCheck) never touches the model-routing setup. A new user finishes onboarding with Chat partially working but research/agent features underconfigured.
2. **"什么是 quick 什么是 deep 什么是 premium"** — internal routing tiers are not user concepts. Teaching them during onboarding makes the product feel like a model control panel instead of an Obsidian assistant.
3. **Progress is opaque** — the current top dots show that the user is somewhere in a flow, but not *where*, *what remains*, or *whether they can go back*. This breaks the user's sense of control.
4. **Index setup is too action-first** — Knowledge Index setup should first detect the current vault/index state (existing index, missing notes, changed notes, semantic readiness) before asking the user to run anything.

And one structural signal:

5. **Settings, Chat, Copilot, Search all consume the same configuration** — but today they each surface their own different mental model. Chat shows a model picker. Quick Search shows raw profile pills. Copilot silently picks `Agent`. AI Analysis hard-codes `Deep`. The user has to learn a different vocabulary at every surface.

**The fix is not a prettier wizard.** The fix is a user-mental-model onboarding: first explain what Peak can do, then connect a provider, then confirm model behavior and vault readiness, then send the user into a first successful action.

## 2. Scope

This document defines:

- The unified product mental model (reframed from the user's first-run perspective)
- The configuration data model (what's stored, what's derived, what readiness means)
- The single onboarding wizard (replaces both existing wizards)
- The progress indicator contract (step title + hoverable step map, not anonymous dots)
- How the new Settings IA exposes the same model post-onboarding (the wizard is just a curated journey through Settings)
- How Chat / Copilot / Search / AI Analysis / Quick Search expose **which capability** they're using and **how to fix it** when missing
- How Knowledge Index setup detects current state before recommending actions
- How the final screen launches the user's first successful Chat/Search/Analysis/Copilot action
- Visual system: tokens, components, copy, language

Out of scope (deferred):

- MCP / Skill marketplace UI (separate spec)
- Per-conversation model override UX in chat (mentioned only as a contract)
- Usage dashboard (deferred)
- Permission/safety rework (mentioned for completeness, no UI change in this brief)

## 3. The unified product mental model

The first-run user is not trying to configure a model router. They are trying to answer:

> "Can Peak Assistant actually help with my Obsidian vault now?"

So onboarding teaches the concepts in this order. Every surface — onboarding, Settings, and in-feature controls — reinforces the same model.

```
                  ┌─────────────────────────────┐
                  │  Work Surfaces              │
                  │  Chat · Vault Search ·      │
                  │  AI Analysis · Copilot      │
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  Provider                   │
                  │  OpenAI · Anthropic ·       │
                  │  Ollama · OpenRouter        │
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  AI Behavior                │
                  │  Fast answers · Research ·  │
                  │  stronger fallback if needed│
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  Vault Readiness            │
                  │  Existing index · changed   │
                  │  notes · semantic search    │
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  First Successful Action    │
                  │  Ask · Search · Analyze ·   │
                  │  Improve current note       │
                  └─────────────────────────────┘
```

### 3.1 Vocabulary contract

The following names are the user-facing vocabulary contract across this brief. Internal code names can remain in implementation notes, but they must not leak into product chrome:

| Old internal term | New user-facing term |
|---|---|
| Profile | Provider |
| Agent | Research |
| Agent Fast | Fast Lookup |
| Chat (as a profile slot) | Conversation |
| Copilot (as a profile slot) | (removed — Copilot is a surface; it uses Fast Lookup / Research) |
| Embedding | Knowledge Index |
| Web Search (as a profile slot) | Web Access |
| Agent Harness | Agent runtime (lives under Advanced) |
| MCP Servers | External tools (MCP) |
| Harness tier IDs (`localFast`, `localDeep`, `online`) | Fast Lookup / Research / "Use stronger model when needed"; never expose raw quick/deep/premium wording |

**The "Harness" word disappears from product chrome.** It may appear in implementation notes and code paths, but not in user-facing labels, commands, onboarding copy, or Settings tab names.

### 3.2 AI behavior and the Model Plan

The Model Plan is still the durable Settings concept, but it should not be the first thing onboarding teaches. Onboarding teaches surfaces first, then shows the Model Plan as "how Peak will run those surfaces."

| Row | User-facing label | Who uses it | Default behavior |
|---|---|---|---|
| Conversation | "Chat & daily writing" | Chat view, quick replies | Required |
| Fast Lookup | "Short answers and simple note actions" | Quick Search, simple Copilot actions, retries | Required for Green; may fall back to Conversation as Yellow |
| Research | "Vault research and synthesis" | AI Analysis, Vault Search, Auto Review, agent loops | Required |
| Use stronger model when needed | "Escalate research when quality matters more than cost/speed" | optional fallback from Research | Optional toggle (off by default) |
| Knowledge Index | "Vault search index" | semantic search, vector index | Optional (Fast index works without) |
| Web Access | "Current web lookup" | native web-capable model, else fallback provider | Optional |

The onboarding wizard configures Conversation, Fast Lookup, and Research (and optionally Knowledge Index via the index readiness step). Stronger fallback and Web Access stay defaults; the user discovers them in Settings later when they need them.

Important distinction: **Conversation** is the baseline chat row. **Fast Lookup** and **Research** are model-behavior rows. **Use stronger model when needed** is a fallback policy, not a third work mode, and should not be taught as a peer concept in Step 2.

### 3.3 Readiness states

Every surface needs to answer: *am I ready for this user action?* Three readiness levels:

- **Green** — fully configured, will run
- **Yellow** — runnable with degraded quality (e.g. text-only search because embeddings are not set, Fast Lookup falls back to Conversation, stronger fallback is off, etc.)
- **Red** — cannot run; surface must show a clear CTA to fix

Examples:
- Chat: Red if no Conversation model bound.
- Quick Search: Yellow if only Conversation is bound (uses it for Fast Lookup); Green if Fast Lookup is bound separately.
- Vault Search semantic mode: Red if no embeddings; downgrades to text mode with Yellow banner.
- AI Analysis: Yellow if stronger fallback is off (no escalation available); Red if no Research model.

The Settings **Overview** tab is the readiness dashboard for the whole product. Every individual surface gets a small inline readiness chip + repair CTA.

## 4. Configuration data model

### 4.1 What's stored

Storage stays where it is today (no schema rewrite for this brief). The mental-model labels are a UI re-mapping over current fields:

```
Provider              ←→  Profile (ProfileRegistry)
Model Plan: Conversation  ←→  activeChatConfig
Model Plan: Fast Lookup   ←→  activeAgentFastConfig  +  HarnessSettings.localFast (precedence: Harness wins)
Model Plan: Research  ←→ activeAgentConfig + HarnessSettings.localDeep (precedence: Harness wins)
Model Plan: Use stronger model when needed ←→ HarnessSettings.online + escalation settings
Model Plan: Knowledge Index ←→ activeEmbeddingConfig
Model Plan: Web Access    ←→  activeWebSearchConfig
Knowledge Index level     ←→  settings.search.indexLevel
Knowledge Index status    ←→  IndexService.getIndexStatus() + stored index stats
External tools            ←→  MCP server list + per-server permission
Safety                    ←→  settings.defaultPermissionMode
```

The wizard reads/writes through these fields. No data migration is required.

### 4.2 Derived state

The Overview / readiness model is derived (never stored). Compute on render from the fields above:

```
planReadiness  = Green if Conversation ∧ Fast Lookup ∧ Research are bound
               = Red if Conversation or Research is missing
               = Yellow if Fast Lookup falls back to Conversation
indexReadiness = Green if SQLite ready and the recommended index action is complete
               = Yellow if SQLite ready but index is text-only, stale, partial, or explicitly skipped
               = Red if SQLite/native module cannot initialize
providerReadiness = Green if at least one provider/runtime tests successfully
                  = Red if no usable provider exists
toolsReadiness = Green if no required MCP servers exist OR required servers are healthy; Yellow/Red by tool criticality
```

Onboarding completion requires `providerReadiness !== Red`, `planReadiness !== Red`, and `indexReadiness !== Red`. Fast text-only, stale-but-usable index, and explicit Skip are allowed to finish, but the Done summary and Settings Overview must show Yellow, not pretend the Knowledge Index is fully configured.

## 5. The Onboarding wizard

One entry. One Modal. One state machine. But the visible user journey is **7 primary steps**, not a raw dump of internal setup states.

`OnboardingModal` (existing class) is extended to host all steps. `HarnessOnboardingModal` is deleted. Existing "setup model plan" entry points open the same Modal at the relevant primary step.

### 5.1 Primary step list

| # | Step | User question answered | Skippable | Shown in model re-run mode |
|---|---|---|---|---|
| 1 | Welcome | What am I setting up? | No | No |
| 2 | What Peak can do | What can I actually use after this? | No | No |
| 3 | Add Provider | Which AI service/runtime powers this? | No | No |
| 4 | Choose how Peak should work | Fast, cheap, research-quality, local/private? | No | Yes — entry point |
| 5 | Check your vault index | Does Peak understand my vault already? | Yes, as Yellow | No |
| 6 | System check | Is everything ready enough to start? | No | No |
| 7 | Ready to try | What should I try first? | No | Yes, summary only |

Internal substates such as "pick bootstrap model", "run curator", "review generated plan", "edit plan", and "regenerate with note" live inside Step 4. They do not become separate top-level progress dots.

### 5.2 Progress indicator contract

The screenshot's anonymous dot row is not enough. The top of every wizard screen must show both position and meaning:

```text
Step 4 of 7 · Choose how Peak should work
```

Progress behavior:

- Keep the compact dots/pills, but pair them with the current step label.
- Hover/focus on any dot shows a tooltip with the step name and one-line purpose.
- Completed steps are clickable back-navigation.
- Future steps are visible but disabled.
- Detour substates keep the parent step active and update the sublabel, e.g. `Step 4 of 7 · Reviewing your model choices`.
- Re-run mode shows the relevant shortened map, e.g. `Step 1 of 2 · Choose how Peak should work` → `Step 2 of 2 · Ready to try`.

### 5.3 Per-step spec

#### Step 1 — Welcome

- Plugin mark icon, title "Welcome to Peak Assistant", 2-sentence subtitle.
- Subtitle promise: "In a few minutes you can chat with your vault, search it, run analysis, and use Copilot on notes."
- Single primary CTA "Get started".
- No back button. No skip.
- Re-run mode skips this step.

#### Step 2 — What Peak can do

This is the teaching step. It teaches product surfaces, not model tiers.

Four cards:

```
Chat
  Ask questions, draft, summarize, and continue a conversation.
  Try later: "Summarize my notes from this week."

Vault Search
  Search by keyword now; unlock semantic search when the index is ready.
  Try later: "retrieval augmented generation"

AI Analysis
  Find connections, gaps, themes, and evidence across notes.
  Try later: "Find connections across my AI safety notes."

Copilot
  Improve the note you are currently writing.
  Try later: "Rewrite this section more clearly."
```

Footer line: "Peak uses different model behavior behind the scenes, but you do not need to choose every model manually."

CTA: "Got it — let's configure". Back to Welcome.

#### Step 3 — Add Provider

Renamed from "Provider/Profile" to **Provider**. This is the user's natural mental model: OpenAI, Anthropic, Ollama, OpenRouter, etc.

- Heading: "Add a provider".
- Subtitle: "Connect one AI provider or local runtime. You can add more later."
- **Already-saved providers** at top (if any): reuse existing `SavedProfileRow` component but label it as Provider in chrome.
- **Provider grid** below: 2 columns × 4 rows of provider/runtime chips with logos: Anthropic, OpenAI, Google, OpenRouter, Ollama, Perplexity, LiteLLM, Custom. Click chip → inline form expands.
- **Inline form**: reuse `AddProviderForm`. API key / local endpoint, Test button, Save. Test result inline. Continue disabled until ≥ 1 provider tests successfully.

Implementation note: the **OpenRouter Test bug** (`${baseUrl}/v1/v1/models` path) is fixed independently before this brief lands. It surfaces in the Test button, so it must be green by the time mockups go in.

#### Step 4 — Choose how Peak should work

This step configures the Model Plan, but it should read like a behavior choice, not a model-routing exam.

Visible controls:

- **Provider/model used to generate the recommendation**:
  - Heading: "Pick a starter model".
  - Subtitle: "Used once to recommend defaults. Cheap is fine — it does not power every future task."
  - If multiple providers are configured: provider switcher as pill row (≤ 4) or dropdown (> 4).
  - Model rows show model ID, friendly name, cost-per-1M, and a "Recommended" badge.
- **Two quick questions**:
  - Monthly API budget: "$0 / local", "$5–20", "$50+".
  - Preference: "Fast responses", "Balanced", "Research quality", "Local/private".
- **Optional behavior toggle**:
  - Label: "Use a stronger model when needed".
  - Helper: "For research tasks where quality matters more than speed or cost."
  - Off by default unless the user picked "Research quality".

Running state:

- No centered spinner alone.
- Show `ProgressChecklist` with:
  1. Checking available providers
  2. Detecting local models
  3. Matching tasks to model behavior
  4. Building your recommendation
- Footer: "Usually 5–15 seconds."
- Cancel link bottom-left.

Review state:

- Baseline row: `Conversation`.
- Behavior rows: `Fast Lookup`, `Research`.
- Optional row/toggle: `Use a stronger model when needed`.
- Each row shows model ID, provider label, cost/speed hint, used-by badges, and a short rationale.
- "Why this recommendation" is collapsed by default.
- Actions: Back, Regenerate, Edit, Accept.

Copy rule: never show raw Quick/Deep/Premium or "Cascade" copy. If escalation is enabled, say: "Start fast, use Research when confidence is low."

#### Step 5 — Check your vault index

This replaces action-first "Configure Knowledge Index". The step opens by detecting current state before recommending any action.

Heading: "Check your vault index".

Detected state rows:

- SQLite engine: Ready / Installing native module / Failed.
- Existing index: `N notes indexed` or `No index yet`.
- Vault coverage: `N eligible notes · M missing · K changed since last index`.
- Semantic search: Available / Missing embeddings / Provider unsupported.
- Current mode: Text only / Semantic / Skipped.

Recommended actions:

- **Use existing index** — shown when coverage is good enough and not stale.
- **Update changed notes** — shown when most content is indexed but some notes changed.
- **Build text index** — default when no semantic provider is configured.
- **Enable semantic search** — shown when embeddings are available or can be added.
- **Skip for now** — allowed, but marks Knowledge Index Yellow.
- **Rebuild from scratch** — Advanced disclosure only, never the default.

Important behavior:

- If an existing usable index is detected, show Ready immediately and do not start a full re-index.
- Do not run indexing merely because the user opened the step.
- The primary CTA should be the recommended action, not always "Build index".

#### Step 6 — System check

System check is a readiness summary, not a second setup form.

Rows:

- Provider: connected / failed / missing.
- AI behavior: Conversation, Fast Lookup, Research configured.
- Vault index: Green / Yellow / Red with reason.
- Web Access: available / not configured.
- Safety: current note-change permission posture.

Red rows block Done and show repair CTAs. Yellow rows allow Done with clear degraded-state copy.

#### Step 7 — Ready to try

The final screen is a launchpad for the first successful experience.

- Big check, "You're ready to use Peak Assistant."
- Summary card:
  - Providers: *list of provider/runtime names*
  - AI behavior: *Conversation = X · Fast Lookup = Y · Research = Z · stronger fallback off/on*
  - Index: *N documents indexed* / *Text search only* / *Skipped*
- Primary CTA: **"Open Chat"**.
- Action cards:
  - **Ask in Chat** — Try: "Summarize my notes from this week."
  - **Search your vault** — Try: "retrieval augmented generation"
  - **Run AI Analysis** — Try: "Find connections across my AI safety notes."
  - **Use Copilot on this note** — Try: "Rewrite this section more clearly."
- Secondary CTA: "Open Settings".

### 5.4 Re-run mode

Entry points:

- Settings "Re-run recommendation" → Step 4.
- Knowledge Index repair CTA → Step 5.
- Provider repair CTA → Step 3.
- Command Center "Setup wizard" → full flow if Red, shortened repair flow if already mostly ready.

Re-run mode shows a shortened progress map and skips unrelated steps.

### 5.5 State machine

The reducer can still keep implementation-level substates, but the UI groups them under primary steps:

```
PrimaryStep =
  | 'welcome'
  | 'capabilities'
  | 'provider'
  | 'ai-behavior'
  | 'index-readiness'
  | 'system-check'
  | 'ready-to-try'

AiBehaviorSubstep =
  | 'choose-bootstrap'
  | 'preference-questions'
  | 'running-curator'
  | 'review-recommendation'
  | 'edit-recommendation'
  | 'redo-input'
```

Implementation paths can remain close to today's reducer during PR-A, but the progress indicator and copy must present the grouped primary-step model.

## 6. Settings IA — where each concept lives after onboarding

The wizard is a curated path. Settings is the full surface. Both speak the same vocabulary.

The five-tab IA from the 2026-05-26 spec is adopted verbatim:

```
Overview | AI Setup | Knowledge Index | Tools | Advanced
```

(The current six tabs — Profiles, MCP Servers, Search & Indexing, Agent Harness, Maintenance, General — are remapped, not data-migrated.)

### 6.1 Overview tab (Settings home)

The product's **readiness dashboard**. Default landing.

Layout (top to bottom):

1. **Readiness block** — 5 rows, each with a state chip (Green / Yellow / Red) + repair CTA:
   - Providers: *N connected · M need keys*
   - AI behavior: *Balanced · required rows bound*
   - Knowledge Index: *Semantic · 1240 docs ready*
   - Web access: *Available (native)* or *Configure*
   - Safety: *Apply note changes automatically* (link to Safety)
2. **AI behavior block** — read-only summary of the Model Plan rows.
3. **Quick actions** — "Run setup wizard", "Test providers", "Rebuild index".

Rule: if any row is Red, the corresponding repair CTA opens the wizard at the appropriate step (e.g. no Conversation model → wizard Step 4 Edit; no SQLite → wizard Step 5).

### 6.2 AI Setup tab

1. **Recommended setups** — preset cards (Balanced / Lowest cost / Research quality / Local/private) + "Re-run recommendation" (opens wizard at Step 4).
2. **AI behavior / Model Plan** — the six rows are editable here:
   - Conversation, Fast Lookup, Research, Use stronger model when needed, Knowledge Index, Web Access.
   - Each row: selected model, "used by" badges (e.g. "Used by Chat, Quick Search"), Test button, Change button.
3. **Providers** — credential/runtime cards (today's `ProfileCard`, restyled and relabeled to match wizard Step 3).
4. **Advanced model controls** (collapsed) — temperature, reasoning effort, verbosity, timeouts.

### 6.3 Knowledge Index tab

- Index mode (Full / Fast / Skip) — same control as wizard Step 5.
- Auto-index, document types, ignore patterns, chunking.
- AI Analysis save/history behavior.

Important: this tab **does not** contain an AI Analysis model picker. AI Analysis uses Research from AI behavior / Model Plan, and that's stated as a one-liner with a link back to AI Setup.

### 6.4 Tools tab

- **External tools (MCP)** — server cards with trust/risk visible.
- **Skills** — folder + installed skills.
- **Web access detail** — native vs. fallback provider.

### 6.5 Advanced tab

- **Agent runtime** — backend (Auto / Peak / Claude SDK), escalation policy, per-agent overrides, hooks.
- Storage folders.
- Maintenance.
- Usage dashboard retention.
- Developer tools.

Do not show the word "Harness" in this tab's product chrome. Technical aliases can remain searchable in Settings search results.

## 7. Per-surface integration

Every surface (Chat, Copilot, Quick Search, Vault Search, AI Analysis) must:

- Show **which capability** it's using (badge / sublabel).
- Show its **readiness state** (Green/Yellow/Red chip).
- Offer an **inline repair CTA** when not Green.

This is what makes the mental model stick after onboarding — the same Conversation / Fast Lookup / Research vocabulary keeps appearing where the work happens.

### 7.1 Chat view

- Header sublabel: "Using **Conversation** · *model-id*".
- Click sublabel → opens Settings > AI Setup focused on the Conversation row.
- Per-conversation override UI is deferred; do not mock a conversation-level switcher in this brief.
- If no Conversation model is bound: header banner *"Pick a Conversation model to start chatting"* + button → wizard Step 4 Edit.
- If the Conversation provider fails mid-chat: inline error in chat thread + "Switch model" CTA.

### 7.2 Quick Search

- Search bar footer chip: "Fast Lookup · *model-id*". Click → Settings AI Setup.
- If Fast Lookup is not bound (Yellow): footer reads "Fast Lookup unset · using Conversation". Click → wizard Step 4 Edit.

### 7.3 Vault Search (semantic)

- Mode toggle: Semantic / Text.
- If Knowledge Index embeddings are missing: Semantic option is greyed; tooltip reads *"Add an embedding model to use semantic search"*; clicking opens wizard Step 5.
- If index outdated (Yellow): inline "Re-index" CTA in result header.

### 7.4 AI Analysis

- Header sublabel: "Using **Research** · *model-id* · Stronger fallback: *off / model-id*".
- If Research is not bound (Red): blocking empty state with "Set up Research" → wizard Step 4 Edit.
- If stronger fallback is off (Yellow): non-blocking banner *"Stronger fallback is off — research tasks will stay on the Research model."*

### 7.5 Copilot (note + meta)

- Note Copilot single actions ("rewrite this", "summarize"): use **Fast Lookup**. Show sublabel.
- Auto Review / Vault Review (multi-step): use **Research**. Show sublabel.
- No dedicated Copilot model picker exists at top level. Advanced override lives in `AI Setup > Advanced model controls > Copilot override`.

### 7.6 Command Center

- "Setup wizard" item → opens unified Onboarding (re-run mode if provider / plan / index readiness are not Red, full mode otherwise).
- The current "Setup Harness Wizard" entry is **removed**. There is one wizard now.

## 8. Visual system

### 8.1 Tokens — strict rules

- All colors / radii / spacing come from `--pk-*` tokens in `src/styles/peak-tokens.css`.
- **Do not** reference `--interactive-accent` / `--background-modifier-*` directly. Today's invisible "selected" states are caused by `bg-[--interactive-accent]/10` color-mix producing near-transparent fills on dark themes — switching to `--pk-accent-soft` fixes this for all surfaces at once.
- New tokens needed (add to `peak-tokens.css` if missing):
  - `--pk-accent-soft` — explicit soft accent fill; target ratios defined in §11
  - `--pk-surface-elevated` — modal/card surface
  - `--pk-surface-hover` — hover state
  - `--pk-border` — neutral 1 px borders
  - `--pk-border-strong` — selected state borders
  - `--pk-muted` — secondary text
  - `--pk-success`, `--pk-warning`, `--pk-danger` — readiness chips

### 8.2 Components

| Component | Used in |
|---|---|
| `Button` (shadcn) | All actions. Primary = filled accent. Secondary = ghost. Destructive = ghost in `--pk-danger`. No raw `<button>`. |
| `RadioCard` (new) | Wizard Steps 5 and 8; Settings preset cards; reusable selected-card styling for bootstrap/model choices. |
| `AIBehaviorCard` / `ModelPlanCard` (new) | Wizard Step 4 review; Settings Overview AI behavior block. |
| `ReadinessChip` (new) | Settings Overview; every surface's status chip. |
| `StepIndicator` (existing, restyled) | Wizard top bar with label + hover/focus tooltips. |
| `SavedProfileRow` (existing, rename visually) | Wizard Step 3 + Settings Providers. Same component, no fork. |
| `AddProviderForm` (existing) | Same. |
| `ProgressChecklist` (new) | Wizard Step 6 right column. |

### 8.3 Modal frame

- Width: 560 px (wizard) and 860 px (settings) — already correct.
- Max-height: `calc(100vh - 120px)`. Wizard inner content scrolls when needed (Bootstrap list, Edit Plan).
- Outer modal padding: 0. Inner content padding: 24 px horizontal × 20 px vertical.

### 8.4 Step indicator

- Top line always shows `Step N of M · Step title`.
- Dot row remains compact, but every dot has hover/focus tooltip: step title + one-line purpose.
- Active dot = wide pill (32 px) in `--pk-accent`.
- Past dot = narrow (16 px) in `--pk-accent` at 50 % opacity and is clickable.
- Future dot = narrow in `--pk-border`, visible but disabled.
- Detour substates keep the parent primary dot active and update the title/sublabel.
- Re-run mode shows only relevant primary steps; skipped steps do not reserve dots.

### 8.5 Card selection (canonical rule)

Used for all card choices (preferences, bootstrap model rows, index mode, setup presets):

- Unselected: 1 px `--pk-border`, hover bg `--pk-surface-hover`.
- Selected: 3 px left border in `--pk-accent`, bg `--pk-accent-soft`, Lucide `Check` icon at far right.
- **Never** rely on `bg-[--anything]/10` opacity for the selected fill. That's the root cause of today's invisible state.

### 8.6 Loading

- Never centered spinner alone for waits > 1 s.
- Always pair Loader2 with a textual title describing the work.
- For waits > 3 s, decompose into a `ProgressChecklist` so the user can see progress.
- For waits > 10 s, also include an estimated time line and a Cancel link.

### 8.7 Language

- **All wizard + settings strings in English.** Chinese vault content remains untouched; this is only about chrome.
- **All user-facing strings live in `templates/config/onboarding.json` and `templates/config/settings.json`**, loaded by `TemplateManager`. Per project rule: never hardcode i18n strings in logic files. This makes the future bilingual switch trivial (drop a `.zh.json`).
- Voice: terse, direct, no marketing fluff. "Pick a starter model" not "Let's pick your perfect starter model!".

### 8.8 Icons

- Lucide only.
- No emoji anywhere in chrome.
- Approved icons: `Check`, `X`, `ChevronLeft`, `ChevronRight`, `Loader2`, `Sparkles`, `Wand2`, `Pencil`, `RefreshCw`, `Plus`, `Trash2`, `Globe`, `Cpu`, `Database`, `MessageSquare`, `Search`, `BarChart3`.

## 9. Mockup deliverables for the designer

Produce mockups (light + dark) for:

**Wizard:**
1. Step indicator: full mode start / mid / end + hover tooltip + re-run shortened version
2. Modal frame (560 px) — generic shell
3. **Welcome**
4. **What Peak can do** — Chat / Vault Search / AI Analysis / Copilot cards
5. **Add Provider** — empty / with saved providers / form expanded / test success / test failed
6. **Choose how Peak should work** — provider/model picker + preference cards + stronger fallback toggle
7. **Generating recommendation** — mid progress / error variant
8. **Review AI behavior** — Conversation + Fast Lookup + Research rows / stronger fallback off/on / rationale collapsed/expanded
9. **Edit AI behavior** — compact dropdowns + cost summary
10. **Regenerate with note** — empty / typed
11. **Check your vault index** — existing index healthy / partial stale index / no index / semantic unavailable
12. **Index action states** — use existing / update changed notes / build text index / enable semantic / advanced rebuild disclosure
13. **System check** — all green / yellow allowed / red repair CTA
14. **Ready to try** — launchpad cards for Chat / Search / AI Analysis / Copilot

**Settings:**
15. **Overview** tab — all-green / one yellow + repair CTA / one red + repair CTA
16. **AI Setup** tab — recommended setups + AI behavior rows + Providers list
17. **Knowledge Index** tab
18. **Tools** tab — MCP server card with trust info
19. **Advanced** tab — agent runtime collapsed

**Surface integration:**
20. **Chat view** header sublabel + repair CTA
21. **Quick Search** footer chip with capability label
22. **Vault Search** with Semantic greyed (embeddings missing) + tooltip
23. **AI Analysis** with stronger fallback off banner
24. **Copilot** simple action using Fast Lookup + Auto Review using Research

**Component states:**
25. `RadioCard` unselected / hover / selected / disabled
26. `AIBehaviorCard` + `ReadinessChip` states

## 10. Implementation phasing

Once mockups are approved, ship as **six independent commits / PR slices** so each one is reviewable on its own:

- **PR-A — State machine merge.**
  Move `harness-onboarding/state.ts` → `onboarding/state.ts`, group internal substates under the 7 primary steps, and merge `OnboardingModal` + `HarnessOnboardingModal` into one. Delete `HarnessOnboardingModal`. Re-point model setup entry points → Step 4 re-run mode. **No visual changes**; behavior parity first.

- **PR-B — String extraction + English.**
  Move all wizard + settings copy to `templates/config/onboarding.json` and `templates/config/settings.json`. English only. Wire `TemplateManager` lookups. Adds bilingual stub `.zh.json` (empty) for future use.

- **PR-C — Visual redesign.**
  Apply Step 2 surface teaching, labeled progress indicator with tooltips, card selection fix, `ProgressChecklist`, launchpad Done screen, and `--pk-*` token migration across all wizard surfaces. Add `--pk-accent-soft` and other tokens to `peak-tokens.css`. **This is the biggest PR — does not change behavior or storage.**

- **PR-D — Settings IA remap.**
  New `Overview`, `AI Setup`, `Knowledge Index`, `Tools`, `Advanced` tabs. Rename Profile chrome to Provider, expose AI behavior rows over current fields, and keep old storage (no data migration). Old tabs hidden behind a developer flag for one release.

- **PR-E — Per-surface integration.**
  Add capability sublabels + readiness chips + repair CTAs to Chat / Quick Search / Vault Search / AI Analysis / Copilot. Add Knowledge Index detection/action states so opening the step never blindly starts a full re-index. Independent and parallelizable.

- **PR-F — Independent: OpenRouter Test bug.**
  Fix `testProviderConnection.ts:51` so OpenRouter (and OpenAI) don't get `${baseUrl}/v1/v1/models`. Lands anytime, unblocking the Test button in Wizard Step 3.

## 11. Design decisions locked before mockups

- **Step 2 teaches surfaces, not model tiers:** Chat / Vault Search / AI Analysis / Copilot are the first-run concepts. Fast Lookup and Research appear later as model behavior.
- **Provider wording:** user-facing chrome says Provider / Add provider. Internal `Profile` remains an implementation/storage name only.
- **Progress indicator:** labeled step text is mandatory (`Step N of M · Title`), and every dot/pill must expose its step name on hover/focus.
- **Stronger fallback is not a third work mode:** show it as a toggle/sentence: "Use a stronger model when needed." Do not call it Quality Review, Premium, or a peer tier.
- **Escalation reveal logic:** conditional. Show only when Fast Lookup and Research resolve to different bindings (`profileId` or `modelId` differs). Hide for identical bindings or missing rows.
- **Knowledge Index step detects first:** it must show existing index count, coverage, missing/changed notes, semantic readiness, and recommended action before running any indexing.
- **Done screen is a launchpad:** keep "Open Chat" as primary, but also show action cards for Search, AI Analysis, and Copilot with concrete try-this prompts.
- **Edit behavior vs. AI Setup:** same underlying component family, two densities. Wizard uses compact dropdown rows; Settings uses rich rows with used-by badges, test actions, and reset affordances.
- **Per-conversation override in Chat:** defer to a follow-up brief. This brief shows Conversation inheritance and repair only.
- **Stronger fallback missing threshold:** Yellow universally. Leaving it off should never block Chat, Fast Lookup, Research, Search, or onboarding completion.
- **`--pk-accent-soft`:** target 8–10% accent over light surfaces and 14–18% over dark surfaces, implemented as explicit theme tokens. The designer must verify visibility on `--pk-surface-elevated`; implementation must not recreate this with `/10` opacity utilities.

## 12. Non-goals (explicitly)

- No new model catalog. Curator backend (PR1–PR4 already landed) stays as is.
- No per-conversation chat model override UI in this brief.
- No MCP marketplace UI.
- No Skill installation UX.
- No usage dashboard.
- No safety/permission mode redesign UI.
- No mobile-specific wizard layout (covered in `2026-04-18-mobile-support-design.md`).

---

**End of brief.** Designer: start with §5 (Wizard) + §6.1 (Overview tab) + §9 (deliverables list). Implementation engineer: read §5.5 (state machine), §10 (phasing), §3.1 (vocabulary contract).
