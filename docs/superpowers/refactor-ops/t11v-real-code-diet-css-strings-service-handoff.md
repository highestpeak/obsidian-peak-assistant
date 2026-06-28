# T11V Real Code Diet Handoff

> Owner correction after T11U: T11U reduced only -1,248 LOC and is not accepted as the target wave. Stop squeezing tiny React panels. T11V must attack the real large pools: CSS selector duplication, compiled fallback string duplication, and high-LOC service/core implementation tables where safe.

## 0. Owner Summary

Give this file to Claude Code as one prompt.

T11U is useful partial progress, but it proved that "extract more UI shells" is not enough. The next wave must change strategy:

- CSS is still huge and mostly untouched.
- Runtime JSON templates are duplicated as compiled TypeScript fallback objects.
- Several service/core files are still 700-2,300 physical lines.
- We must preserve features, but we no longer need prelaunch-grade duplicate compatibility/fallback surfaces everywhere.

Current baseline after T11U:

```text
cloc src styles.css --quiet --json --timeout 120
SUM code LOC: 111,767
Boundary audit: 0 findings
```

Known high-signal pools:

| Pool | Current signal | Why it is a real slimming pool |
|---|---:|---|
| `src/styles/peak-components.css` | 4,483 physical lines | Repeated `.pktw-root` + `.peak-design-root` selector pairs and large legacy style namespaces. |
| `src/ui/view/usage-dashboard/components/charts/dashboard-charts.css` | 1,438 physical lines | Dashboard-specific CSS; likely has retired ContextRing / old card style tails. |
| `src/ui/view/*/*Strings.ts` + dashboard fallback | ~2,500 physical lines | Duplicates `templates/config/*.json` source-of-truth. |
| `templates/config/*.json` | Already exists | Can become the single default source where safe. |
| large service/core files | many 700-2,300 line files | Some are real algorithms; some may contain tables/helpers that can be extracted or consolidated. |

Expected Claude final note:

- Chinese-first.
- Start with whether T11V met the Impact Contract.
- Report product LOC delta from `cloc src styles.css`.
- Separate CSS, TS, test, docs, and package deltas.
- Include exact deleted CSS selector sections and string fallback changes.
- Include visual QA / risk notes for CSS changes.
- Include protected features verified.
- Include skipped pools with evidence.

## 1. Copyable Prompt For Claude Code

Paste everything below to Claude Code.

```text
You are implementing T11V Real Code Diet for Obsidian Peak Assistant.

Repository:
/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

Context:
- Boundary audit is already 0 and must stay 0.
- T11T reduced -2,523 LOC and barely met its primary threshold.
- T11U reduced only -1,248 LOC and is explicitly NOT accepted as the T11U target wave.
- T11U showed that React shell extraction alone will not produce a large enough code diet.
- Current product LOC baseline after T11U:
  `cloc src styles.css --quiet --json --timeout 120` => 111,767 SUM code LOC.

Owner goal:
- Preserve product functionality.
- Reduce code by removing duplication, compatibility fallback duplication, dead CSS, old selector namespaces, and real repeated implementation patterns.
- Do not delete major features just to hit LOC.
- Do not return another small partial wave unless hard-blocked with concrete evidence.

Impact Contract:
- Hard minimum: product code LOC net reduction >= 5,000.
- Target: product code LOC net reduction >= 8,000.
- Stretch: product code LOC net reduction >= 12,000 if safe.
- Product code LOC means `cloc src styles.css`, not tests/docs/templates.
- If expected safe reduction is < 5,000 after investigation, STOP BEFORE IMPLEMENTATION and return a read-only blocker report. Do not commit another tiny partial wave.
- If you implement and final reduction is < 5,000, label it partial progress and do not claim T11V accepted.

Required tracks:
1. CSS selector diet and dead namespace removal.
2. Compiled fallback string duplication retirement.
3. CSS build / generated style containment.
4. High-LOC service/core consolidation audit + safe reductions.
5. Residual UI stub/fake cleanup.
6. Guards and verification.

Protected scope:
- Do NOT remove Usage Dashboard.
- Do NOT remove Chat three Obsidian views: ChatView, ProjectListView, ConversationOutlineView.
- Do NOT remove Vault X-Ray.
- Do NOT remove Quick Search AI Graph or Vault Analysis.
- Do NOT remove Copilot actions or change action ids.
- Do NOT remove search/index/agent capabilities.
- Do NOT break template/config override behavior without explicitly replacing it.
- Do NOT weaken `npm run audit:boundary`.
- Do NOT introduce ui -> app, service -> ui, service -> app, core -> upstream, or service/core -> obsidian imports.
- Do NOT create god components/ports/hooks.
- Do NOT edit Codex HTML investigation reports.

Preflight gate:
Before editing code, produce a candidate matrix:
- Track
- Candidate files/sections
- Current line count
- Estimated LOC delta
- Risk
- Verification
- Stop rule

Then:
- If total safe expected delta >= 5,000, implement in the same session.
- If total safe expected delta < 5,000, stop before edits with a blocker report.

Track 1 — CSS selector diet and dead namespace removal

Starting files:
- `src/styles/peak-components.css` (~4,483 physical lines)
- `src/ui/view/usage-dashboard/components/charts/dashboard-charts.css` (~1,438 physical lines)
- `src/styles/tailwind.css` (~612 physical lines)
- `src/styles/streamdown-shadow-host.css` (~254 physical lines)
- `src/styles/codemirror.css` (~211 physical lines)

Primary strategy:
1. Build a CSS selector usage scanner:
   - Extract class selectors from CSS files, especially `.pk-*`, `.pkchat-*`, `.pk-dash-*`, `.pkset-*`, `.pk-attach-*`, `.peak-*`.
   - Scan `src/**/*.{ts,tsx,css}` for each class name.
   - Treat dynamic class construction carefully. If a family is generated by prefix, mark it "dynamic family, do not delete mechanically".
2. Delete CSS blocks where selectors have zero source hits and are not dynamic families.
3. Collapse repeated root selector pairs:
   - Many rules are duplicated as:
     `.pktw-root .foo,`
     `.peak-design-root .foo { ... }`
   - Where safe, replace with:
     `:where(.pktw-root, .peak-design-root) .foo { ... }`
   - Electron/Chromium supports `:where`; verify build and do a small visual smoke note.
4. Remove retired Dashboard CSS tails:
   - T11T deleted `ContextRing.tsx`; verify whether `.pk-context-ring*` selectors are now dead.
   - Verify old receipt/push selectors still have consumers before deleting.
5. Remove stale comment banners and duplicated explanatory comments when they no longer protect behavior.

Expected result:
- Hard contribution from CSS: >= 2,000 product LOC reduction.
- Target contribution from CSS: >= 3,500.

Verification:
- `npm run build`
- `npm run audit:boundary`
- Source scan report listing deleted selectors and why safe.
- If a browser/Obsidian visual smoke test is available, inspect:
  - Settings rows
  - Usage Dashboard overview
  - Chat composer
  - Copilot modal
  If not available, state that CSS visual QA remains required.

Track 2 — Compiled fallback string duplication retirement

Starting files:
- `src/ui/view/chat-view/chatStrings.ts` (~356 lines)
- `src/ui/view/settings/settingsStrings.ts` (~692 lines)
- `src/ui/view/onboarding/onboardingStrings.ts` (~669 lines)
- `src/ui/view/usage-dashboard/UsageDashboard.tsx` contains `FALLBACK_STRINGS` (~300+ lines)
- Existing runtime templates:
  - `templates/config/chat.json` (~134 lines)
  - `templates/config/settings.json` (~371 lines)
  - `templates/config/onboarding.json` (~213 lines)
  - `templates/config/dashboard.json` (~364 lines)

Important facts:
- `templates/config/*.json` are already the runtime source-of-truth.
- `tsconfig.json` already has `"resolveJsonModule": true`.
- Current TypeScript fallback objects duplicate the JSON template shape, causing maintenance burden and large product LOC.

Allowed approaches:
A. Import JSON as compiled defaults:
   - Example pattern:
     `import chatDefaults from '../../../../templates/config/chat.json';`
   - Export typed defaults from JSON:
     `export const DEFAULT_CHAT_STRINGS = chatDefaults as ChatStrings;`
   - Keep the existing deep merge behavior.
   - This keeps a bundled fallback while deleting huge object literals from `src`.
B. If JSON import path is awkward, create a tiny `loadConfigDefaults` helper that reads runtime template first and uses a minimal emergency fallback only for catastrophic missing file cases.
C. Keep only tiny minimal emergency fallback strings for fatal load failures; do not duplicate the entire JSON in TS.

Rules:
- Preserve template override behavior.
- Preserve TypeScript public APIs like `useChatStrings`, `useSettingsStrings`, etc.
- Do not delete the templates.
- Do not remove user-facing copy; move source-of-truth to JSON imports or minimal fallback.
- If a JSON import increases bundle slightly but product source LOC shrinks, that is acceptable for this prelaunch code diet.

Expected result:
- Hard contribution from string fallback retirement: >= 1,200 product LOC reduction.
- Target contribution: >= 2,000.

Verification:
- `npm run build`
- Focused tests or source guards:
  - DEFAULT_* exports still exist.
  - config template files still exist.
  - key representative strings resolve for Chat, Settings, Onboarding, Dashboard.

Track 3 — CSS build / generated style containment

Starting files:
- `scripts/concat-css.mjs`
- `src/styles/streamdown-isolated-css.ts`
- root `styles.css`
- `src/styles/*.css`

Investigate:
- `src/styles/streamdown-isolated-css.ts` is generated by `scripts/concat-css.mjs`.
- It contains very large embedded CSS/font data as one TS template string.
- `cloc` counts it lightly by line count, but it is still a source maintenance and review problem.

Allowed work:
- If safe, move generated `streamdown-isolated-css.ts` out of `src/` or add it to a generated-output path excluded from product LOC measurement only if the build still works and the repo convention agrees.
- Do NOT fake LOC reduction by changing the metric definition. `cloc src styles.css` is still the metric unless you update the handoff with a clear generated-code exception accepted by Codex/owner.
- If moving generated output changes imports, update them safely and verify bundle.

Expected result:
- This may not reduce `cloc`, but it can reduce maintenance confusion. Report separately.

Track 4 — High-LOC service/core consolidation audit + safe reductions

Starting high-LOC files:
- `src/service/search/index/indexService.ts` (~2,317 physical lines)
- `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts` (~1,292)
- `src/service/search/index/helper/backbone/buildBackboneMap.ts` (~1,211)
- `src/core/storage/sqlite/ddl.ts` (~1,145)
- `src/service/chat/service-manager.ts` (~998)
- `src/core/storage/sqlite/repositories/EmbeddingRepo.ts` (~873)
- `src/service/tools/search-graph-inspector/explore-folder.ts` (~869)
- `src/service/tools/search-graph-inspector/find-path/scorer.ts` (~850)
- `src/service/copilot/actions/index.ts` (~785)
- `src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts` (~780)
- `src/core/storage/vault/ChatStore.ts` (~774)

Important:
- Do not split files merely to redistribute LOC. Splitting is not slimming.
- Only implement if there is real repeated code, duplicated SQL mapping, duplicate constants/tables, or dead compatibility path.

Candidate patterns:
- SQLite repository repeated row mapping / statement wrappers.
- Search graph inspector duplicate scoring/normalization helpers.
- `service/copilot/actions/index.ts` large action declaration table:
  - If repeated action metadata blocks can be generated from compact descriptors without losing readability, consolidate.
  - Do not change action ids.
- `core/constant.ts` large domain constants:
  - Move large domain-specific tables into domain config files only if it reduces duplication or clarifies ownership.
  - Do not dump into another big file and count it as progress.

Expected result:
- Hard contribution from service/core: >= 800 product LOC reduction if safe.
- If no safe reduction found, document exact reason and do not force.

Verification:
- Existing targeted tests around search/index/copilot if touched.
- `npm run build`
- `npm run audit:boundary`

Track 5 — Residual UI stub/fake cleanup

Continue from T11U scan:
- `PickerReadinessAdapters.tsx` / `CopilotPickerContent.tsx` system diagnostics stubs.
- `InspectorSidePanel.tsx` placeholder comments.
- leftover console/debug logs.
- any `Coming soon` rows still visible in product UI.

Rules:
- Remove fake user-facing affordances or make them real.
- Do not delete roadmap comments that are not user-facing unless stale/misleading.

Expected result:
- Hard contribution: >= 300 product LOC reduction.

Track 6 — Guards and verification

Must run serially:

```bash
cloc src styles.css --quiet --json --timeout 120
npm run build
npm run audit:boundary
npm run test -- test/t11r-zero-obsidian-boundary-regression.test.ts
npm run test -- test/copilot-action-surface-registry.test.ts
npm run test -- test/copilot-action-runtime-ports.test.ts
```

Add focused tests/guards for:
- imported JSON defaults still resolve.
- deleted CSS selector classes do not appear in source.
- no reintroduction of old string fallback object literals over a chosen max size.
- no `ContextBuilder`, `getAgentBridge`, `_currentSetPhase` resurrection.
- no boundary regressions.

Do not run tests in parallel; `run-test.js` uses shared temp bundle names.

Implementation note:
Create:

```text
docs/superpowers/refactor-ops/t11v-real-code-diet-implementation-note.md
```

The note must include:
- Chinese summary.
- Commit hash.
- Before/after `cloc src styles.css` table.
- CSS delta, TypeScript delta, docs/tests delta.
- Deleted CSS selector/class report.
- String fallback strategy and exact files changed.
- Service/core files touched and why.
- Protected feature verification.
- Boundary audit result.
- Test results.
- Code reading guide.
- Mermaid diagrams for CSS/string default ownership after the wave.
- Skipped pools with evidence.

Commit rule:
- If hard minimum >= 5,000 product LOC reduction is met and verification passes:
  `refactor(t11v): real code diet across css and defaults`
- If hard minimum is not met:
  STOP BEFORE COMMIT unless Codex/owner explicitly approves partial progress.
```

## 2. Codex Notes For Owner

Why this is different from T11U:

- T11U mostly worked inside React TSX. That pool is no longer fluffy enough.
- T11V attacks CSS and duplicated defaults, where the actual remaining bulk is.
- It tells Claude not to commit another tiny partial wave unless the hard target is met.
- It preserves product features but relaxes unnecessary prelaunch duplicate fallback code.

Likely reduction math:

| Track | Conservative | Target |
|---|---:|---:|
| CSS selector/root duplication | 2,000 | 3,500 |
| Compiled fallback strings | 1,200 | 2,000 |
| Service/core repeated helpers | 800 | 1,500 |
| Stub/fake cleanup | 300 | 700 |
| **Total** | **4,300** | **7,700** |

This is still not guaranteed, so the prompt includes a hard preflight gate: if Claude cannot prove a safe path to 5,000 LOC, it should stop before editing instead of landing another partial commit.
