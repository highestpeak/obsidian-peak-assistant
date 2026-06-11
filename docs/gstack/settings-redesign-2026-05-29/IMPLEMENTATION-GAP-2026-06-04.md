# Settings Redesign — Implementation Gap Audit (2026-06-04)

Comparison of the static mock against the currently shipped Settings UI.

## Inputs

- Mock: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/settings-redesign-2026-05-29/index.html`
- Current-state screenshots: `/Users/zhangjike/Downloads/clipsaver/20260604-121624/`
  - `01` Advanced bottom (Danger zone area + maintenance tail)
  - `02` Advanced middle (maintenance list + Index/KG/Advanced groups)
  - `03` Advanced top (Re-run setup wizard ×2, Agent runtime, Tier bindings)
  - `04` Tools (Web Access + External tools expanded form)
  - `05` Tools (Web Access + empty External tools)
  - `06` Knowledge Index lower (Doc types, Ignore patterns, PageRank, Chunking, AI Analysis)
  - `07` Knowledge Index upper (INDEX LEVEL / INDEXING headers, no readiness panel)
  - `08` AI Setup lower (Add Profile, Custom endpoints, Advanced expanded with SDK SETTINGS, AI behavior at bottom)
  - `09` AI Setup upper (Providers list, no preset grid, no AI behavior on top)
  - `10` Overview (only Chat + Copilot rows — empty page)

## Vocabulary contract (regression check)

Forbidden in primary chrome (per spec `2026-05-29-settings-interface-design.md`):
`Profile`, `Harness`, `Quick`, `Deep`, `Premium`, `Agent Fast`, `MCP Servers`, `Embedding`, `Tier`.

Currently leaking:
- [ ] AI Setup — `Add Profile` (should be `Add Provider`). Mock anchor `#aiSetup` row at line 348.
- [ ] Advanced — `Tier model bindings`, `Tier Fast Lookup Model`, `Tier Research Model`. Mock puts these under AI Setup → AI behavior with the words `Conversation`, `Fast Lookup`, `Research`.
- [ ] AI Setup → Advanced disclosure — `SDK SETTINGS` group leaked into Tab 2. Mock moves SDK fields to Tab 5 → Developer disclosure.

## Cross-cutting style regressions

- [ ] Knowledge Index and Advanced still use ALL-CAPS muted `SECTION HEADER` style (`INDEX LEVEL`, `INDEXING`, `GRAPH SEARCH`, `CHUNKING`, `AI ANALYSIS`, `AGENT RUNTIME`, `TIER MODEL BINDINGS`, `ESCALATION POLICY`, `INDEX`, `KNOWLEDGE GRAPH`, `ADVANCED`). Mock uses `section__title` (13px / 600 / primary text) — see `mock.css:174-180`.
- [ ] Disclosures default expanded in current build. Mock pattern: `<details>` collapsed by default for Advanced model controls, Inspector links, Summary lengths, Advanced chunking, Advanced rebuild, Stronger model, Derived folders, Tuning, Danger zone, Graph viz, SDK process, Legacy compatibility.
- [ ] Card chrome inconsistent — Overview / AI Setup use new `.row` (`border + 12px radius + 14px padding`), Knowledge Index / Advanced fall back to flat list rows.

---

## Tab 1 · Overview — `index.html#overview`

Spec source: `index.html` lines 31–166.

### Section 1: Peak readiness — 5 rows

- [ ] Row `Providers` — icon `plug`, chip `chip--green Ready`, muted `3 connected`, btn `Manage` → opens `providerList`. Mock line 37–48.
- [ ] Row `AI behavior` — icon `sparkles`, chip `chip--yellow Needs attention`, muted `Fast Lookup falls back to Conversation`, btn `Fix` → opens `chooseModel` with `data-context-capability="Fast Lookup"`. Mock line 50–61.
- [ ] Row `Knowledge Index` — icon `db`, chip `chip--green Ready`, muted `96% indexed`, btn `Check` → opens `stub` jump-to-tab. Mock line 63–74.
- [ ] Row `Web Access` — icon `globe`, chip `chip--neutral Optional`, muted `Not configured`, btn `Setup` → opens `webAccess`. Mock line 76–87.
- [ ] Row `Safety` — icon `shield`, chip `chip--green Ready`, muted `Ask before risky writes`, btn `Review` → opens `safety`. Mock line 89–100.

Currently shipped: only `Chat` (Ready) and `Copilot` (Optional). All 5 mock rows must replace those two.

### Section 2: AI behavior (read-only summary) — 4 rows

Sub: "Read-only summary. Change bindings in **AI Setup**." Mock line 105.

- [ ] Row `Conversation` — icon `message`, right side: mono `OpenAI GPT-5 mini` + `chevronRight` (no chip, no button). Mock line 107–117.
- [ ] Row `Fast Lookup` — icon `zap`, right side: muted `Falls back to Conversation` + `chevronRight`. Mock line 119–129.
- [ ] Row `Research` — icon `microscope`, right side: mono `Claude Sonnet` + `chevronRight`. Mock line 131–141.
- [ ] Row `Use stronger model when needed` — icon `trendingUp`, right side: chip `chip--neutral Off` + `chevronRight`. Mock line 143–153.

Currently shipped: section does not exist.

### Section 3: Actions — action strip

- [ ] Btn `Run setup` (icon `wrench`) → opens `runSetup`. Mock line 159.
- [ ] Btn `Test providers` (icon `plug`) → opens `testProviders`. Mock line 160.
- [ ] Btn `Check index` (icon `db`) → opens `checkIndex`. Mock line 161.
- [ ] Btn `Try Chat` PRIMARY (icon `message`) → opens chat. Mock line 162.

Currently shipped: section does not exist.

---

## Tab 2 · AI Setup — `index.html#aiSetup`

Spec source: `index.html` lines 171–458. Required section order: **Recommended setup → AI behavior → Providers → Custom endpoints → Advanced model controls**.

### Section 1: Recommended setup — 4-up preset grid

- [ ] Preset card `Balanced` (icon `scale`, "Best of both quality and everyday cost.") — default selected, gets accent-soft bg + 3px left accent border + check icon. Mock line 178–183.
- [ ] Preset card `Lowest cost` (icon `zap`). Mock line 184–189.
- [ ] Preset card `Research quality` (icon `microscope`). Mock line 190–195.
- [ ] Preset card `Local/private` (icon `shield`). Mock line 196–201.

Currently shipped: section does not exist.

### Section 2: AI behavior — 6 rows (must appear BEFORE Providers)

Each row: `[icon][title+desc][chip][value-mono][btn Change]`.

- [ ] `Conversation` — chip `Ready` + mono model + `Change` → `chooseModel`. Mock line 208–219.
- [ ] `Fast Lookup` — chip `chip--yellow Falls back` + muted `Uses Conversation model` + `Change`. Mock line 221–232.
- [ ] `Research` — chip `Ready` + mono model + `Change`, plus `row__meta` usedby chips `Vault Search / AI Analysis / Copilot`. Mock line 234–250.
- [ ] `Use stronger model when needed` — chip `Off` + muted `Not configured` + `Setup` → `strongerModel`. Mock line 252–263.
- [ ] `Knowledge Index` — chip `Ready` + mono `voyage-embed-text` + `Change`. Mock line 265–276.
- [ ] `Web Access` — chip `Optional` + muted `Off` + `Setup`. Mock line 278–289.

Currently shipped: this section is at the BOTTOM of the panel and only has Conversation / Fast Lookup / Research, no chips, "Set up" button instead of `Change`. Must move to top and complete.

### Section 3: Providers — connected provider rows

- [ ] Row `Anthropic Direct` — brand icon, chip `Connected`, `Test` + `Edit`. Mock line 296–307.
- [ ] Row `OpenAI` — brand icon (Simple Icons official OpenAI mark, not generic), chip `Connected`. Mock line 309–320.
- [ ] Row `Ollama` — brand icon, chip `Connected`. Mock line 322–333.
- [ ] Row `OpenRouter` — brand icon (use OpenRouter's official 512×512-viewBox SVG, per CLAUDE.md UI Style rule). Mock line 335–346.
- [ ] `row-add` button labeled **`+ Add Provider`** → opens `addProvider` brand chooser. Mock line 348. ⚠️ Currently `Add Profile`.

### Section 4: Custom endpoints

- [ ] Endpoint row shows mono base URL + model count, chip `Enabled`, `Test` + `Edit`. Mock line 355–366.
- [ ] TWO side-by-side buttons under the rows: `+ Add custom endpoint` (flex:2) + `+ Add from preset` (flex:1). Mock line 368–371. ⚠️ Currently labels read `Add from Preset` + `Add Custom` and order is reversed.

### Section 5: Advanced model controls — DISCLOSURE (collapsed)

- [ ] `<details>` summary as a `row--disclosure`, muted `11 fields` + chevronDown. Mock line 375–386.
- [ ] Body fields: Temperature / Top P / Top K / Presence penalty / Frequency penalty / Reasoning effort / Text verbosity / Total timeout / Step timeout / Attachment handling / Per-prompt overrides (opens `promptOverrides` table modal). Mock line 388–453.
- [ ] **Remove SDK SETTINGS group from this disclosure** — they belong in Tab 5 → Developer → SDK process. Currently leaking into Tab 2.

---

## Tab 3 · Knowledge Index — `index.html#knowledgeIndex`

Spec source: `index.html` lines 463–861. Required section order: **Index readiness → Index behavior → Search quality → AI Analysis output → Advanced chunking → Advanced rebuild**.

### Section 1: Index readiness — bordered panel + recommended action row

This is the most important missing piece.

- [ ] Wrap rows in `.readiness-panel` (single bordered container with internal dividers). Mock line 469.
- [ ] Row `SQLite store` — icon `hardDrive`, chip `Ready`. Mock line 470–479.
- [ ] Row `Current index` — icon `fileText`, right side mono `1,842 files` + muted `96% coverage`. Mock line 480–490.
- [ ] Row `Missing or changed notes` — icon `alert`, chip `chip--yellow 71 to update`. Mock line 491–500.
- [ ] Row `Semantic readiness` — icon `sparkles`, chip `Provider connected`. Mock line 501–510.
- [ ] Row `Current mode` — icon `layoutDashboard`, mono `Fast Index`. Mock line 511–520.
- [ ] Bottom `.recommended-row` — accent-tinted, icon `refresh`, title `Recommended action`, desc `Update changed notes`, primary btn `Update now` + secondary btn `View changed notes`. Mock line 522–532.

Currently shipped: section does not exist. Closest current row is "Indexed files 6,050" sitting outside any panel.

### Section 2: Index behavior

- [ ] Row `Index mode` — segmented control 3-way: `Fast Index` / `Semantic Index` / `Full Knowledge Index`. Mock line 539–552. ⚠️ Currently a read-only text value.
- [ ] Row `Auto-index on startup` — toggle. Mock line 554–563.
- [ ] Row `Refresh interval` — form-number `15` + unit `min`. Mock line 565–574. ⚠️ Missing.
- [ ] Row `Document types` — pill picker, 12 pills: **Markdown / PDF / Images / Excalidraw / CSV / JSON / HTML / DOCX / XLSX / PPTX / Canvas / URL**. Mock line 576–598. ⚠️ Current pill set is wrong: contains `Url`, `Unknown`, `Conv`, `Project`, `Prompt`, `Dataloom`. Cull those, normalize casing.
- [ ] Row `Ignore patterns` — muted `6 patterns` + `Edit` btn → opens `ignorePatterns`. Mock line 600–610.

### Section 3: Search quality

- [ ] Row `Personalized PageRank` — toggle on. Mock line 616–625.
- [ ] **DISCLOSURE** `Inspector links` (currently missing). Summary right side: muted `Keyword 8 · Tag 5 · Folders on`. Mock line 627–681.
  - [ ] Inside: Keyword link count (8) / Tag link count (5) / Folder grouping (toggle) / Folder group minimum count (3) / Folder group max depth (2).

### Section 4: AI Analysis output

- [ ] Row `Auto-save results` — toggle on. Mock line 687–696.
- [ ] Row `Save folder` — mono `ChatFolder/AI-Analysis` + `Change` btn. Mock line 698–708.
- [ ] Row `Recent history` — number input `5`. Mock line 710–719.
- [ ] Row `Exclude saved analyses from search` — toggle on. Mock line 721–730. ⚠️ Missing.
- [ ] **DISCLOSURE** `Summary lengths (advanced)` — Session 60 / Short 25 / Full 200. Mock line 732–770. ⚠️ Missing.

### Section 5: Advanced chunking — DISCLOSURE (must collapse)

- [ ] `<details>` summary muted `6 fields` + chevronDown. Mock line 774–785.
- [ ] Body: Max chunk size (800 tok) / Chunk overlap (120 tok) / Min document size for chunking (400 tok) / Skip code blocks (toggle) / Code block placeholder (text) / Max code block chars (2000 chars). Mock line 786–835.
- [ ] Currently shows Max chunk size + Chunk overlap flat. Must wrap in disclosure and add the other 4 fields.

### Section 6: Advanced rebuild — DISCLOSURE (must collapse)

- [ ] `<details>` summary muted `4 actions`. Mock line 838–849.
- [ ] Body action strip: `Full re-index` / `Rebuild vectors` / `Run LLM enrichment` / `Compare PPR search`. Mock line 850–857.
- [ ] **Move** `Update Index`, `Full Pipeline`, `Cancel Indexing`, `Refresh Related Notes`, `Refresh Hub Summaries`, `Recompute Gap Analysis`, `Analyze Vault Intuition`, `Build User Profile` from current Advanced tab → Tab 5 Maintenance section (per mock IA).

---

## Tab 4 · Tools — `index.html#tools`

Spec source: `index.html` lines 866–1071. Required section order: **External tools → Web Access → Skills → Capture destinations**.

### Section 1: External tools (must come FIRST, currently second)

- [ ] Each tool is a `<details>` with `row--disclosure` summary: `[icon][title+desc][chip][chevronDown]`. Mock line 872–945.
- [ ] Summary chip vocabulary: `Connected` (green) / `Needs attention` (yellow) / `Off` (neutral).
- [ ] Expanded body form-grid fields: Transport (select stdio / SSE) / Command / Arguments / Environment (textarea). Mock line 884–901.
- [ ] Footer btn row: `Reconnect` + `Disable` + `Delete` (danger). For SSE: URL + Headers (JSON textarea), `Enable` (primary) + `Delete`. Mock line 902–906, 938–942, 975–978.
- [ ] Error state shows `stub-banner` with alert icon explaining the problem; per-field error annotation `form-status--error`. Mock line 924, 932.
- [ ] `row-add` button labeled **`+ Add external tool`** → opens `addExternalTool` modal. Mock line 983. ⚠️ Currently `Add tool server`.

### Section 2: Web Access

- [ ] Row `Provider` — icon `globe`, chip `Optional`, muted `Not configured`, `Setup` btn → opens `webAccess`. Mock line 989–1000.
- [ ] Row `Used by` — icon `user`, usedby chips `Chat` + `Research`. Mock line 1002–1012.

Currently: a single `Web search provider` row combining both — split per mock.

### Section 3: Skills (missing entirely)

- [ ] Row `Skills folder` — mono `_skills` + `Change` btn. Mock line 1018–1028.
- [ ] Row `Installed skills` — muted `12 found` + `Open` btn → opens skills inventory. Mock line 1030–1040.

### Section 4: Capture destinations (missing entirely)

- [ ] Row `Inbox folder` — mono `_inbox` + `Change`. Mock line 1046–1056.
- [ ] Row `Custom prompts folder` — mono `_prompts` + `Change`. Mock line 1058–1068.

---

## Tab 5 · Advanced — `index.html#advanced`

Spec source: `index.html` lines 1076–end. Required section order: **Agent runtime → Storage and folders → Proactive suggestions → Usage and retention → Maintenance → Danger zone (collapsed) → Developer**.

### Cleanup before adding sections

- [ ] Remove the duplicate "Re-run setup wizard" cards at the top (currently appears twice).
- [ ] Remove the hero `Advanced` + sub `Low-level controls...` block. Mock uses `section__title` per section.
- [ ] Remove `Open Prompt Templates` and `Diagnostics` rows from this tab (not in mock IA).

### Section 1: Agent runtime

- [ ] Row `Runtime mode` — auto/peak/sdk select. Title `Auto (in-process where supported), Claude Agent SDK for the rest` style.
- [ ] Row `Safety` — link to safety modal.
- [ ] **DISCLOSURE** `Use stronger model when needed` — allow toggle + target model picker + max escalations + threshold slider. (Re-use mock's `strongerModel` modal body inline as disclosure body.)
- [ ] Row `Hooks` — no toggle, `Coming soon` chip only.
- [ ] Row `Re-run setup wizard` — icon `wrench`, btn `Re-run` → opens `runSetup`. Appears EXACTLY ONCE.
- [ ] Strip `Tier model bindings` / `Fast Lookup Model` / `Research Model` rows — those belong in Tab 2 AI behavior under the names `Conversation` / `Fast Lookup` / `Research`. Vocabulary contract.

### Section 2: Storage and folders (missing entirely)

- [ ] Row `Data storage folder`.
- [ ] Row `Chat root folder`.
- [ ] **DISCLOSURE** `Derived folders` — Prompts / Attachments / resources-summary-cache / Hub-Summaries / User-Profile.
- [ ] Row `SQLite backend`.

### Section 3: Proactive suggestions (missing entirely)

- [ ] Master toggle.
- [ ] 7 sub-toggles: Inline gutter / Morning briefing / Status bar / Auto-open / AI explanations / Learn from feedback / (and 1 more per spec).
- [ ] **DISCLOSURE** `Tuning (advanced)` — 7 cooldowns: trigger / doc switch / writing pause / min change / max suggestions / graph hops / AI explanation cooldown.

### Section 4: Usage and retention (missing entirely)

- [ ] Row `Tracking` — toggle.
- [ ] Row `Detailed log retention` — number + unit.

### Section 5: Maintenance — restructure into 3 groups

Current Maintenance is a 13-row flat list. Mock structures as `action-strip`s under 3 sub-headers:

- [ ] Sub-group **Index**: Update index / Full pipeline / Cancel indexing / Refresh related notes / Refresh hub summaries / Recompute gap analysis / Analyze vault intuition.
- [ ] Sub-group **Knowledge graph**: Build pending vectors / Run pending LLM enrichment / Global maintenance.
- [ ] Sub-group **Verification & cleanup**: Verify database / Cleanup useless data. (`Compare PPR search` moves to Tab 3 Advanced rebuild.)

### Section 6: Danger zone — COLLAPSED `<details>`

- [ ] Wrap `Clear profile build record` + `Delete index data` in a collapsed `<details>` with red border accent.
- [ ] Each button opens `confirmDanger` modal with red-tinted confirm. Don't just paint buttons red inline.

### Section 7: Developer (missing entirely)

- [ ] **DISCLOSURE** `Graph viz` — Graph inspector toggle / MST prune depth / Skeleton backbone / MST leaf opacity / MST leaf width scale.
- [ ] **DISCLOSURE** `SDK process` — CLI path override / Pool size / Warmup on load. ⚠️ Currently in Tab 2 AI Setup → Advanced disclosure. Move here.
- [ ] **DISCLOSURE** `Legacy compatibility` — Legacy Vault Search SDK profile / Legacy provider configs view.

---

## Suggested PR slicing

Independent enough to ship one at a time. Each PR scoped to a single tab.

1. **PR-1 Overview** — smallest, biggest user-visible win. Adds 5-row readiness, AI behavior summary, Actions strip.
2. **PR-2 AI Setup reorder + Recommended setup grid + vocabulary fix** — moves AI behavior to top, adds preset grid, renames `Add Profile → Add Provider`, fixes Custom endpoint button order, removes SDK group.
3. **PR-3 Knowledge Index visual rewrite** — replaces ALL-CAPS headers, adds Index readiness panel, segmented Index mode, fixes Document types pills, wraps chunking + rebuild in disclosures, adds Inspector links + Summary lengths disclosures.
4. **PR-4 Tools complete** — reorder + add Skills + add Capture destinations + tool row disclosure pattern + rename button.
5. **PR-5 Advanced rewrite** — dedupe Re-run wizard, restructure Maintenance, add Storage / Proactive / Usage / Developer, collapse Danger zone, move SDK fields in from Tab 2.

PR-3 and PR-5 are the largest. PR-1 should land first to validate the new section/row primitives are wired correctly before applying them in bulk.

---

## Source mapping

Where each tab's content currently lives. New per-tab files in `src/ui/view/settings/tabs/` are the thin shells; most of the legacy density sits in the older flat `*.tsx` siblings, which got embedded wholesale.

### Shell + composition

- `src/ui/view/SettingsView.tsx:33-118` — `SettingsRoot`, 5-tab switcher. Owns `activeTab` state. PR-1+ will need to pass a tab-switch handler down to OverviewTab so its row CTAs can navigate.
- `src/ui/view/settings/settingsStrings.ts:40-461` — schema + default copy for every tab. `overview.readiness.{providers,aiBehavior,knowledgeIndex,webAccess,safety}` strings already exist (currently dormant — PR-D OverviewTab swapped to surface adapters and never read them).
- `src/ui/components/primitives/{Row,Chip,Pill,Segmented,FormRow,Modal,BrandAvatar,IconButton,Popover,Button}.tsx` — primitive set. Mock anatomy `[icon][title+desc][chip][meta][btn]` is `Row` + sub-components (`Row.Icon`, `Row.Body`, `Row.Title`, `Row.Desc`, `Row.Right`, `Row.Value`, `Row.Meta`).

### Tab 1 · Overview

- File to rewrite: `src/ui/view/settings/tabs/OverviewTab.tsx` (213 lines).
- Currently drives off `src/ui/view/settings/hooks/useSurfaceReadiness.ts` + `CapabilityRegistry.getAll()`. PR-1 replaces this with 5 explicit static rows. Keep `useSurfaceReadiness` file alone — leave for later cleanup.
- Data sources needed:
  - **Providers** row: `ProfileRegistry.getInstance().getAllProfiles()` → count enabled.
  - **AI behavior** row: check `settings.harnessSettings.{localFastConfig, localDeepConfig, onlineConfig}` for fallback state.
  - **Knowledge Index** row: `IndexService.getInstance().getIndexStatus().indexedDocs` ÷ `app.vault.getMarkdownFiles().length` for coverage %.
  - **Web Access** row: static "Not configured" (no backing field yet — same as `ToolsTab.tsx:50`).
  - **Safety** row: `settings.harnessSettings.defaultPermissionMode`.
- Action strip targets: `openHarnessSetupWizard` (already imported in AISetupTab), tab-switch to `aiSetup`/`knowledgeIndex`, and a `try-chat` command.

### Tab 2 · AI Setup

- File: `src/ui/view/settings/tabs/AISetupTab.tsx` (211 lines).
- Embeds `src/ui/view/settings/ProfilesTab.tsx` (308 lines) under "Providers" via `<ProfilesTab hideStatusBar />`.
  - "Add Profile" copy is inside `src/ui/view/settings/components/AddProfileGrid.tsx` (54 lines). Vocab rename `Add Profile → Add Provider` here.
  - Custom endpoints UI: `src/ui/view/settings/components/CustomEndpointSection.tsx` + `CustomEndpointCard.tsx`. Button order/labels here.
  - **Advanced disclosure** (the temperature/topP/SDK block leaked into AI Setup): bottom of `ProfilesTab.tsx:102-` (search for `advancedOpen`). PR-2 must split this — model controls stay, SDK group moves out.
- AI behavior section: `AISetupTab.tsx:53-104` — currently AT THE BOTTOM after `<ProfilesTab/>`. Reorder by moving this JSX block above the Providers section, and the "Recommended setup" preset grid is brand-new (no existing component).
- Safety section: `AISetupTab.tsx:107-113` (`SafetySegment`).

### Tab 3 · Knowledge Index

- File: `src/ui/view/settings/tabs/KnowledgeIndexTab.tsx` (30 lines) — thin shell, just embeds `<SearchTab/>`.
- All real content: `src/ui/view/settings/SearchTab.tsx` (153 lines).
  - Index Level header at top: actually `src/ui/view/settings/SearchIndexSection.tsx` (166 lines). This is the closest existing thing to the mock's "Index readiness" panel — but it's NOT a bordered panel, just 3 flat rows. PR-3 will replace the `SearchIndexSection` rendering with the mock's `.readiness-panel` (6 rows + recommended-action row).
  - ALL-CAPS section headers (`INDEXING`, `GRAPH SEARCH`, `CHUNKING`, `AI ANALYSIS`): `src/ui/view/settings/components/SectionHeader.tsx` (17 lines). PR-3 either replaces all usages with `pkset-section__title` markup, or deletes `SectionHeader` entirely.
  - Document types pills (with `Conv`/`Dataloom`/`Unknown` bugs): `src/ui/view/settings/components/DocTypePills.tsx` (28 lines) — labels likely come from `src/core/constant.ts` doc type enum. Need to inspect and prune.
  - Ignore patterns editor: `SearchTab.tsx:63-78` inline (replace with modal).
  - Chunking flat rows: `SearchTab.tsx:96-118` — wrap in `<details>`.
  - AI Analysis flat rows: `SearchTab.tsx:120-150` — add missing "Exclude saved analyses" toggle + Summary lengths disclosure.
- Index mode segmented control: today a `<select>` at `SearchIndexSection.tsx:115-131` — swap for `<Segmented>` primitive.

### Tab 4 · Tools

- File: `src/ui/view/settings/tabs/ToolsTab.tsx` (66 lines).
- Web Access section: inline in `ToolsTab.tsx:33-54`. Currently 1 row (Provider). PR-4 splits into Provider + Used-by rows per mock.
- External tools: `src/ui/view/settings/components/MCPServerSection.tsx` (104 lines) + per-server card `src/ui/view/settings/components/MCPServerCard.tsx` (225 lines).
  - Each card today is the "expanded form" pattern (Name/Transport/Command/Args + Connect/Disable/Delete). PR-4 wraps this in a `<details>` with the chip-bearing summary row.
  - "Add tool server" button is inside `MCPServerSection.tsx`. Rename to "Add external tool".
- Skills + Capture destinations sections: do not exist. Net-new in PR-4.

### Tab 5 · Advanced

- File: `src/ui/view/settings/tabs/AdvancedTab.tsx` (91 lines).
- Top duplicate "Re-run setup wizard": appears as the `pkset-banner` block at `AdvancedTab.tsx:45-52`, AND again inside `src/ui/view/settings/components/HarnessSettingsSection.tsx` (359 lines, search for `reRunBanner`). Pick one — mock keeps just one row in Agent runtime section.
- Agent runtime: `HarnessSettingsSection.tsx` (entire file). This is where "Tier model bindings"/"Quick"/"Deep" vocab leaks live (search `harness.tierBindings.*` strings). PR-5 needs to either rename in this component or move the Conversation/Fast Lookup/Research model pickers up to Tab 2 AI behavior and delete the tier section here.
- "Prompt Templates" section at `AdvancedTab.tsx:67-80`: not in mock. Delete.
- Maintenance: `src/ui/view/settings/MaintenanceTab.tsx` (130 lines). Already has 3 groups (`INDEX_ACTIONS`/`KNOWLEDGE_ACTIONS`/`ADVANCED_ACTIONS`) but renders as flat row lists, NOT mock's `action-strip` horizontal pill row. PR-5 changes the renderer; the action arrays mostly match mock's grouping after these moves: `compare-ppr` → Tab 3 Advanced rebuild; `clear-profile`/`delete-index` → Danger zone (collapsed `<details>`).
- Storage and folders: currently 4 fields inside `GeneralTab.tsx` (81 lines) which AdvancedTab embeds. PR-5 splits `GeneralTab` content across: Storage section (Data folder + Chat root + Derived folders disclosure), Tab 2 advanced model controls (Attachment handling), Tab 5 Developer disclosure (DevTools graph inspector).
- Proactive suggestions / Usage and retention / Developer (Graph viz / SDK process / Legacy compatibility): do not exist as sections. Net-new in PR-5.

### Cross-cutting components to remove or replace

- `src/ui/view/settings/components/SectionHeader.tsx` — ALL-CAPS muted header used by SearchTab/MaintenanceTab/SearchIndexSection. Replace with `pkset-section__title` markup. Likely deletable after PR-3 + PR-5.
- `src/ui/view/settings/components/SettingCard.tsx` — old card chrome. Already largely superseded by primitive `Row`; survives in SearchTab/SearchIndexSection/MaintenanceTab/GeneralTab. Replace usages with `Row` in PR-3/PR-5.
- `src/ui/view/settings/component/setting-field.tsx` (singular `component/`) — legacy. Audit for usages, likely deletable.

---

## Starting now: PR-1 Overview

This audit's first executable step is the OverviewTab rewrite. Proceeding from here without waiting for further approval — the user can review the diff.
