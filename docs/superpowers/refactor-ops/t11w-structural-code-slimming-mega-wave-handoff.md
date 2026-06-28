# T11W Structural Code Slimming Mega Wave Handoff

## Owner Intent

本轮不是继续做 CSS / strings / dead-file 边角料。T11T-T11V 已经证明，安全删除池基本吃完后，继续小步清理只会得到 `-500` 到 `-1,600 LOC` 的结果，节奏太慢。

T11W 的目标是通过结构性收敛减少代码量，同时保持功能不退役：

- 不删除 Usage Dashboard。
- 不删除 Chat 三栏 view 能力。
- 不删除主要 Copilot / Quick Search / Settings / Onboarding 功能。
- 不靠删除 feature 命中 LOC。
- 通过重复 UI 形态合并、schema/config-driven renderer、shared primitives、repo/query helper、兼容壳退休来减少体积。

## Current Baseline

Run before starting:

```bash
cloc src styles.css --quiet --json --timeout 120
npm run audit:boundary
```

Known baseline after T11V review-fix:

| Metric | Value |
| --- | ---: |
| Product LOC (`src + styles.css`) | 110,126 |
| Boundary findings | 0 |
| `src/ui/view` | 37,575 |
| `src/service` | 32,515 |
| `src/core` | 21,232 |
| `test` | 21,087 |

Largest product pools found by Codex scan:

| Pool | LOC | Files | Why It Matters |
| --- | ---: | ---: | --- |
| `src/ui/view/copilot` | 9,048 | 54 | Many action panels share shell/list/status/action patterns. |
| `src/ui/view/quick-search` | 7,841 | 55 | V2 components, stores, hooks, report/process/source views overlap. |
| `src/ui/view/chat-view` | 6,183 | 43 | `*Retained` names and message/composer/index components indicate compatibility residue. |
| `src/ui/view/usage-dashboard` | 5,434 | 35 | Six screens repeat card/KPI/empty/loading/action patterns. |
| `src/ui/view/settings` | 3,749 | 22 | Settings rows/cards/combobox/profile components overlap shared primitives. |
| `src/ui/component` + `src/ui/components` | 6,436 | 78 | Two component roots and duplicate primitive families. |
| `src/core/storage/sqlite` | 7,699 | 33 | Repo classes repeat row mapping, JSON parsing, upsert, pagination, query patterns. |
| `src/service/search/index` | 5,387 | 23 | `indexService.ts` is still 1,886 code LOC; phase orchestration can be split only if net-negative. |

## Impact Contract

This is a major wave only if it materially reduces code volume.

Primary metric:

- `cloc src styles.css --quiet --json --timeout 120`

Hard floor:

- At least **-8,000 product LOC**.

Target:

- **-15,000 product LOC**.

Stretch:

- **-22,000 product LOC**.

Secondary metric:

- `cloc src styles.css test templates/config --quiet --json --timeout 120`
- If test helpers are consolidated, report this separately. Do not use test-only reduction to satisfy the product LOC hard floor.

Stop rule:

- First do read-only Stage 0 investigation inside this same prompt.
- If expected safe product reduction is **below -8,000 LOC**, stop before implementation and return a blocker report.
- If expected safe product reduction is `-8,000` or more, implement all safe and medium-safe tracks in one session.
- If the final reduction misses `-8,000`, commit only if build/tests are green, but label it **partial progress, NOT accepted T11W**.

## Required Tracks

Execute as an internal DAG. Do not ask the owner for one prompt per track.

### Track A: Copilot Panel Family Consolidation

Scope:

- `src/ui/view/copilot/panels/*`
- `src/ui/view/copilot/review/*`
- `src/ui/view/copilot/components/*`
- `src/ui/view/copilot/copilot-action-surfaces.tsx`

Current signal:

- `src/ui/view/copilot/panels` alone is about 3,066 physical lines.
- Many panels repeat `CopilotPanelShell`, summary blocks, grouped rows, severity/status badges, copy/save actions, empty states, source rows, and action buttons.

Goal:

- Create shared panel renderers for common shapes:
  - summary + rows
  - findings list
  - grouped-by-file list
  - copy/save/open-note action header
  - severity/status badge rows
  - source/evidence list
- Convert simple panels to descriptors or compact wrappers.
- Keep special mutation-heavy panels explicit where needed, but extract their repeated row/action primitives.

Expected reduction:

- Hard: `-1,500`
- Target: `-2,500`
- Stretch: `-3,500`

Do not break:

- 28 action surface bindings.
- Copilot panel registry.
- Accept/reject/apply/save/copy behavior.

### Track B: Quick Search V2 Surface Consolidation

Scope:

- `src/ui/view/quick-search/components/V2*.tsx`
- `src/ui/view/quick-search/components/ai-analysis-*`
- `src/ui/view/quick-search/hooks/*`
- `src/ui/view/quick-search/store/*`

Current signal:

- `src/ui/view/quick-search` is about 7,841 LOC.
- V2 report/process/sources/footer/toc/round-block/inline-plan components likely repeat section shell, list row, loading/empty/error states, and action dispatch wiring.

Goal:

- Introduce one shared V2 section/layout renderer where it genuinely reduces repetition.
- Consolidate repeated AI analysis state rendering.
- Consolidate repeated event dispatch / result action wrappers.
- Keep search behavior and store ownership unchanged unless a tighter abstraction is clearly safe.

Expected reduction:

- Hard: `-1,500`
- Target: `-3,000`
- Stretch: `-4,500`

Do not break:

- Quick Search modal.
- Vault search.
- AI analysis save/recent/source flows.
- Graph agent flows.

### Track C: Usage Dashboard Screen + Chart Primitive Consolidation

Scope:

- `src/ui/view/usage-dashboard/screens/*`
- `src/ui/view/usage-dashboard/components/*`
- `src/ui/view/usage-dashboard/components/charts/*`
- `src/ui/view/usage-dashboard/UsageDashboard.tsx`

Current signal:

- Usage Dashboard is about 5,434 LOC plus large dashboard chart CSS.
- Six screens repeat card headers, KPI rows, field rows, empty/loading states, action strips, preview sections, and inline style variants.

Goal:

- Keep Usage Dashboard as a product feature.
- Consolidate screen cards and KPI/section scaffolds.
- Move repeated inline style variants into reusable components/classes.
- Keep each screen readable, but do not keep six bespoke copies of the same card grammar.

Expected reduction:

- Hard: `-1,000`
- Target: `-2,000`
- Stretch: `-3,000`

Do not break:

- Overview, Outcome Value, History, Budget Alerts, Provider Model, Optimization screens.
- Dashboard strings/config loading.
- Budget settings save behavior.

### Track D: Shared UI Primitive Root Unification

Scope:

- `src/ui/component/*`
- `src/ui/components/*`
- `src/ui/view/settings/components/*`
- `src/ui/view/settings/component/*`
- `src/ui/view/shared/*`

Current signal:

- There are two roots: `component` and `components`.
- There are native primitives, shared-ui shadcn wrappers, settings-specific row/card components, and project-specific primitives.

Goal:

- Choose one canonical primitive root for new shared code.
- Remove genuinely duplicate primitive wrappers.
- Migrate callers only when visual/behavior parity is clear.
- Do not do a mechanical migration that increases code.

Expected reduction:

- Hard: `-1,000`
- Target: `-2,000`
- Stretch: `-3,000`

Do not break:

- shadcn/Radix behavior.
- Settings layout.
- Prompt input.
- Streamdown/Wikilink hover behavior.

### Track E: Chat View Compatibility Residue

Scope:

- `src/ui/view/chat-view/components/*Retained*`
- `src/ui/view/chat-view/components/messages/*Retained*`
- `src/ui/view/chat-view/components/messages/*`
- `src/ui/view/chat-view/hooks/*`

Current signal:

- `ComposerRetained`, `HeaderRetained`, `MessageListRendererRetained`, `MessageViewItemRetained` suggest compatibility naming residue.
- Chat three-view registration is required, but old compatibility names should not remain if they are now the primary path.

Goal:

- Confirm whether `*Retained*` names are true old compatibility residue or just renamed current components.
- If current, rename to canonical names and remove duplicate wrappers/import aliases.
- Consolidate repeated message row/list/attachment rendering.

Expected reduction:

- Hard: `-500`
- Target: `-1,200`
- Stretch: `-2,000`

Do not break:

- ChatView.
- ProjectListView.
- ConversationOutlineView.
- Message streaming.
- Attachments and file-change displays.

### Track F: SQLite Repo / Query Helper Consolidation

Scope:

- `src/core/storage/sqlite/repositories/*`
- `src/core/storage/sqlite/ddl.ts`
- repo row mappers / JSON parse helpers / upsert helpers / keyset pagination helpers.

Current signal:

- `src/core/storage/sqlite` is about 7,699 LOC.
- Repo classes repeat Kysely row mapping, JSON parse/stringify, upsert, batch query, and pagination grammar.

Goal:

- Extract small, typed helpers only where they remove real duplication.
- Keep Kysely type-safety.
- Do not introduce a god repo or weak `any` query bag.
- Reduce comment/boilerplate if comments merely restate method names.

Expected reduction:

- Hard: `-1,000`
- Target: `-2,000`
- Stretch: `-3,000`

Do not break:

- Existing repository public APIs.
- SQLite schema.
- Search/index storage behavior.

### Track G: Search / Index Service Structural Decomposition With Net Negative LOC

Scope:

- `src/service/search/index/indexService.ts`
- `src/service/search/index/indexInitializer.ts`
- `src/service/search/index/helper/*`
- `src/service/search/query/*`

Current signal:

- `indexService.ts` is still one very large file.
- Moving code into more files does not count unless total product LOC decreases and readability improves.

Goal:

- Identify repeated phase orchestration, progress reporting, batch/yield loops, debt scheduling, and maintenance routines.
- Extract only if it reduces net LOC or meaningfully deletes duplicated code.
- Do not perform a pure split that increases total code.

Expected reduction:

- Hard: `-800`
- Target: `-1,500`
- Stretch: `-2,500`

Do not break:

- Index build/update/delete/rename flows.
- Semantic edges.
- PageRank / folder hub maintenance.
- Existing search/index tests.

## Optional Track H: Test Infrastructure Consolidation

Scope:

- `test/*`
- `test/fixtures/*`

Current signal:

- Tests are about 21,087 LOC.
- Test LOC does not count toward the primary product LOC target.

Goal:

- Consolidate repeated fake ports, fake AppContext, sample vault rows, and boundary guard scanners.
- Only do this after product tracks are green.

Report separately:

- product LOC delta
- test LOC delta

## Protected Scope

Do not remove or degrade:

- Usage Dashboard.
- Chat three-pane / three-view capability.
- Quick Search modal and V2 analysis flow.
- Copilot action registry and 28 action surfaces.
- Settings tabs.
- Onboarding wizard.
- Current boundary floor: `npm run audit:boundary` must remain 0.
- T11R/T11P/T11V review-fix guard assumptions.

Feature deletion requires explicit owner approval. If a file looks unused but represents a visible feature, report it instead of deleting it.

## Verification

Required:

```bash
cloc src styles.css --quiet --json --timeout 120
npm run build
npm run audit:boundary
npm run test -- test/t11r-zero-obsidian-boundary-regression.test.ts
npm run test -- test/copilot-action-surface-registry.test.ts
npm run test -- test/copilot-action-runtime-ports.test.ts
```

Add focused tests for any new shared renderer/helper that carries behavior.

If touching Quick Search:

```bash
npm run test -- test/quick-search-background-runtime-ports.test.ts
```

If touching Usage Dashboard:

```bash
rg -n "UsageDashboard|BudgetAlerts|Optimization|Overview" test src/ui/view/usage-dashboard
```

If touching SQLite/search/index:

Run the closest existing repo/search/index tests. If full test is too slow, explain which focused tests were run and why.

## Final Implementation Note Requirements

Return a Chinese-first implementation note with:

1. Accepted or partial verdict.
2. Product LOC before/after/delta.
3. Test/template LOC before/after/delta, separately.
4. Track-by-track table:
   - files changed
   - LOC delta
   - pattern removed
   - risk
   - verification
5. Dependency / modularity diagram.
6. Code reading guide for owner:
   - read these files first
   - what pattern to notice
   - what old shape disappeared
7. Explicit skipped tracks with evidence.
8. Confirmation that no feature was deleted to hit LOC.

## Owner Review Standard

Codex will not accept T11W as a major wave if:

- product LOC reduction is below `-8,000`;
- boundary audit rises above 0;
- a major feature is removed without explicit owner approval;
- code merely moves between files without net reduction;
- shared abstractions become god components / god ports;
- final note is not readable enough for owner review.

