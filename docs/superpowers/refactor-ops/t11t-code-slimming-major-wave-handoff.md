# T11T Code Slimming Major Wave Handoff

> Owner intent: this must be a real code-slimming wave, not another small cleanup. Preserve product functionality. Reduce code by retiring duplicate implementation shapes, old compatibility paths, half-wired UI, hidden runtime globals, and unused export surfaces.

## 0. Owner Summary

Give this file to Claude Code as one prompt.

Claude should not rediscover the whole project from scratch. It should read the two Codex reports first, do a bounded preflight matrix, then implement all safe/medium-safe tracks in one session.

Source-of-truth reports:

- Readable map: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/refactor-ops/t11s-r-codex-code-consolidation-investigation.html`
- Detailed evidence appendix: `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/refactor-ops/t11s-r-code-slimming-detail-appendix.html`

Expected style of Claude's final note:

- Chinese-first.
- Include changed files grouped by track.
- Include code reading guide.
- Include before/after LOC table.
- Include protected features verified.
- Include skipped tracks with evidence.
- Include verification commands and results.

## 1. Copyable Prompt For Claude Code

Paste everything below to Claude Code.

```text
You are implementing T11T Code Slimming Major Wave for Obsidian Peak Assistant.

Repository:
/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

Context:
- T11R closed boundary audit to 0 findings.
- T11S first attempt was not accepted as a major slimming wave because it reduced only ~131 LOC.
- Codex has now produced two owner-reviewed code-slimming reports:
  1. Readable map:
     /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/refactor-ops/t11s-r-codex-code-consolidation-investigation.html
  2. Detailed evidence appendix:
     /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/superpowers/refactor-ops/t11s-r-code-slimming-detail-appendix.html
- Use those two docs as source-of-truth. Do not ask the owner to shuttle many small prompts.

Owner goal:
- Reduce product code volume while preserving product capability.
- Improve modularity and readability.
- Remove duplicate implementation shapes, old compatibility paths, fake UI, unused export surfaces, and hidden runtime globals.
- Do NOT delete major features just to hit LOC targets.

Impact Contract:
- Primary metric: product code LOC net reduction >= 2,500 LOC.
- Target metric: product code LOC net reduction >= 4,000 LOC.
- Stretch metric: product code LOC net reduction >= 6,000 LOC if safe.
- Product code LOC means `cloc src styles.css`, not tests/docs.
- Test/docs/package cleanup must be reported separately and cannot be counted as product code reduction.

Required tracks:
1. Deletion-first safe cleanup.
2. Runtime ownership tail cleanup.
3. Copilot panel shell/family consolidation.
4. Stub / half-wired UI cleanup.
5. Shared UI ownership cleanup.

Optional tracks, only after required tracks are meaningfully advanced:
6. Settings section shell.
7. Usage Dashboard shell.
8. Quick Search V2 shell cleanup.
9. CSS dead namespace cleanup after component changes.
10. Package/dependency pruning.

Protected scope:
- Do NOT remove Usage Dashboard.
- Do NOT collapse Chat into Chat Studio only. Keep the three Obsidian views: ChatView, ProjectListView, ConversationOutlineView.
- Do NOT remove Vault X-Ray unless owner explicitly approves a product deletion.
- Do NOT remove Copilot actions or change action ids.
- Do NOT remove core search/index/agent capability.
- Do NOT remove Harness / Command Gateway substrate.
- Do NOT change SQLite schema semantics without fixture/snapshot evidence.
- Do NOT introduce ui -> app, service -> ui, service -> app, core -> upstream, or service/core -> obsidian imports.
- Do NOT create a god component, god hook, EverythingPort, AppPort, HostServices, RuntimeBag, or raw app/plugin bag.
- Do NOT mechanically merge `src/ui/component/shared-ui/button.tsx` with `src/ui/components/primitives/Button.tsx`; they are different design systems.
- Do NOT edit the two Codex report HTML files except to add a link to your new implementation note if truly needed.

Preflight phase, bounded:
Before editing code, spend at most 20 minutes producing a concise candidate matrix in your own response/log:
- Track
- Candidate files
- Expected product LOC delta
- Risk
- Verification command
- Skip rule

Then continue implementation in the same session unless a hard blocker appears.
Hard blockers:
- The expected product LOC delta cannot plausibly reach 2,500 without deleting protected features.
- A required track conflicts with protected scope.
- Current worktree has user changes in the same files that make safe editing impossible.

If hard-blocked, stop with a read-only blocker report. Otherwise implement.

Track 1 — Deletion-first safe cleanup:
Use the detailed appendix as starting evidence.
Candidates:
- Dead UI families:
  - `src/ui/component/mine/ModelSelector.tsx`
  - `src/ui/component/mine/LLMOutputControlSettings/**`
  - `src/ui/component/mine/NavigableMenu.tsx` JSX, preserving any live type-only exports if needed
  - `HoverMenuWrapper` / unused hover-menu public API if importer scan confirms no real use
- `ai-elements` unused exports:
  - `src/ui/component/ai-elements/index.ts`
  - keep/move active Reasoning usage if still live
  - evaluate `motion` package tail only if ai-elements/shimmer becomes unused
- Usage Dashboard chart dead export:
  - `src/ui/view/usage-dashboard/components/charts/ExplainerPanel.tsx`
  - `BrandAvatar` alias wrapper if it is only a primitive alias
- T11R unused adapter/port set:
  - `src/app/adapters/VaultPortAdapter.ts`
  - `src/app/adapters/VaultEventAdapter.ts`
  - `src/app/adapters/HostMetadataAdapter.ts`
  - `src/app/adapters/WorkspaceObserverAdapter.ts`
  - `src/app/adapters/WorkspaceBusAdapter.ts`
  - paired ports only if they have no real consumers
- Low-risk type shims:
  - `@/service/search/index/cascade/types`
  - `@/service/search/index/chunkTypes`
  - `@/service/search/index/types`
  - `@/service/mcp/types`
  - Do NOT do `@/service/chat/types` in this wave unless the split is trivial and fully typed.

Track 1 requirements:
- Use `rg` to prove no live importers before deleting.
- Add/update source guards for retired paths.
- Do not delete a file just because it is barrel-exported; verify real callers.

Track 2 — Runtime ownership tail cleanup:
Required candidates:
- Retire `ContextBuilder` fallback:
  - files: `src/service/chat/context/ContextBuilder.ts`, `ContextPipeline.ts`, `src/service/chat/service-conversation.ts`, `src/service/chat/service-manager.ts`
  - goal: remove the deprecated ContextBuilder path if ContextPipeline is always wired, or fail loud if not wired.
  - add focused test/guard proving ConversationService no longer imports or constructs ContextBuilder.
- Remove service-level bridge singleton:
  - file: `src/service/agents/harness-bridge/ClaudeAgentSDKBridge.ts`
  - callers: `FollowupChatAgent.ts`, `DocSimpleAgent.ts`
  - goal: app/service composition injects a bridge or narrow AgentRunnerPort; no `let _instance` + `getAgentBridge()` service singleton.
- Remove Copilot modal phase module global:
  - files: `src/ui/view/copilot/CopilotResultContent.tsx`, `src/app/copilot/modals/CopilotResultModal.tsx`
  - goal: use modal-owned controller/ref/prop callback, not `_currentSetPhase`.

Optional runtime tail:
- `ProgressReporterPort.defaultReporter` only if there is already a clean RunEnvelope/app-owned dependency path. Otherwise document as intentionally deferred.
- TextRank legacy string fallback only if historical index compatibility is not needed.

Track 3 — Copilot panel shell/family consolidation:
Required:
- Create or complete a reusable `CopilotPanelShell` under `src/ui/view/copilot/components/`.
- Consolidate at least 3 complete panel families beyond the existing TextStream pattern.
- Prioritize these families:
  1. Diff result family:
     - `FormatPolishPanel.tsx`
     - `TranslatePanel.tsx`
     - `RewriteSelectionPanel.tsx`
     - `PolishPanel.tsx` if safe
  2. Findings / issue-list family:
     - `ReviewPanel.tsx`
     - `KnowledgeGapsPanel.tsx`
     - `CorrectContentPanel.tsx`
     - `VaultHealthPanel.tsx` if safe
  3. Suggestion-list family:
     - `LinkSuggestPanel.tsx`
     - `SemanticLinkSuggestPanel.tsx`
     - `SmartConnectionsPanel.tsx`
     - `FindRelatedPanel.tsx`
     - `TagSuggestionPanel.tsx` if safe
     - `AddEvidencePanel.tsx` if safe

Track 3 requirements:
- Preserve action ids, apply/dismiss/open/copy behavior, labels, badges, empty states, and visual affordances.
- Shared component owns repeated header/body/footer/list/card structure.
- Thin wrappers own domain mapping and callbacks only.
- Do not build a vague god panel with many nullable props.
- If a wrapper remains almost as large as the original, the abstraction failed; re-plan that family.

Track 4 — Stub / half-wired UI cleanup:
Required candidates:
- Usage Dashboard chat bridge:
  - files: `src/ui/view/usage-dashboard/integration/chatBridge.ts`, `src/ui/view/chat-view/integration/messageReceiptSlot.ts`, `MessageViewItemRetained.tsx`
  - goal: one canonical registry. Dashboard provides renderer; Chat provides host position; app composition registers once.
- ContextRing:
  - file: `src/ui/view/usage-dashboard/components/ContextRing.tsx`
  - goal: either wire real chat-side context utilization updates or hide/remove the composer slot until it is real.
- WhatWasThisAbout footer verb:
  - file: `src/ui/view/usage-dashboard/components/WhatWasThisAbout.tsx`
  - goal: wire Open-in-X to navigation ports or hide/remove the fake footer action. No console-only action.
- Chat RunChip coming-soon rows:
  - file: `src/ui/view/chat-view/components/ComposerRetained.tsx`
  - goal: wire real role/model/source controls or hide disabled coming-soon rows.
- Chat suggestion tag no-op:
  - file: `src/ui/view/chat-view/hooks/useChatSession.ts`
  - goal: wire real handlers or hide controls. No console-only user-facing interaction.
- Settings PR-D legacy stub copy:
  - files: `src/ui/view/settings/settingsStrings.ts`, `templates/config/settings.json`
  - goal: delete unused per-surface legacy stub copy if Overview adapters no longer need it.

Track 4 requirement:
- Preserve Usage Dashboard and Chat views.
- Do not turn half-wired features into silent breakage. Either make them real or remove/hide the false affordance.

Track 5 — Shared UI ownership cleanup:
First write a small import matrix for:
- `src/ui/component/**`
- `src/ui/components/**`
- `src/ui/view/settings/component/**`
- `src/ui/view/settings/components/**`

Then complete at least one ownership migration:
- Preferred A: move `src/ui/component/diff/**` to `src/ui/components/shared/diff/**` and migrate all callers/tests.
- Preferred B: move `src/ui/component/prompt-input/**` to `src/ui/components/shared/prompt-input/**` if safe.
- Preferred C: move streamdown-related shared code from `src/ui/component/mine/**` to `src/ui/components/shared/streamdown/**` if safe.

Rules:
- Feature-local components stay under `src/ui/view/<feature>/components`.
- Primitives stay under `src/ui/components/primitives`.
- Legacy `src/ui/component` should shrink, not gain new files.
- Add source guard for whichever old import path is retired.

Optional Track 6 — Settings section shell:
Do if required tracks are on pace.
- Files: `KnowledgeIndexTab.tsx`, `OverviewTab.tsx`, `ToolsTab.tsx`, `AdvancedTab.tsx`
- Goal: `SettingsSection`, row/action strip helpers, fewer repeated `pkset-section` blocks.
- Do not redesign settings IA.

Optional Track 7 — Usage Dashboard shell:
Do if required tracks are on pace.
- Files: `UsageDashboard.tsx`, screens, `BudgetAlerts.tsx`, charts CSS.
- Goal: `DashboardCard`, `DashboardSection`, shared formatters, detail body renderer.
- Do not delete screens.

Optional Track 8 — Quick Search V2 shell:
Do if required tracks are on pace.
- Files: `SearchModal.tsx`, `V2ProcessView.tsx`, `V2RoundBlock.tsx`, `timeline-helpers.tsx`, `searchSessionStore.ts`.
- Goal: V2 block shell, status/timeline helpers, stale state cleanup.
- Do not delete AI Graph or Vault Analysis paths.

LOC measurement:
Run before and after:
- `cloc src styles.css --quiet --json --timeout 120`
- also report physical line deltas if useful, but product code LOC is the primary metric.

Verification, run serially:
- `npm run build`
- `npm run audit:boundary`
- `npm run test -- test/copilot-action-surface-registry.test.ts`
- `npm run test -- test/copilot-action-runtime-ports.test.ts`
- `npm run test -- test/t11r-zero-obsidian-boundary-regression.test.ts`
- Add focused tests/guards for retired paths:
  - no `ContextBuilder` import in `service-conversation.ts`
  - no `getAgentBridge()` call sites if bridge singleton retired
  - no `_currentSetPhase`
  - no imports from retired shared UI paths
  - no fake `console.info` Open-in-X action if removed/wired

Important test note:
Run tests sequentially. Do not run multiple test files in parallel; this repo's test runner can share temporary bundle names and produce misleading output.

Commit discipline:
- Use English commit messages.
- Suggested commits:
  1. `refactor(t11t): remove safe dead exports and legacy shims`
  2. `refactor(t11t): retire runtime ownership tails`
  3. `refactor(t11t): consolidate copilot panel families`
  4. `refactor(t11t): clean half-wired dashboard and chat affordances`
  5. `refactor(t11t): clarify shared ui ownership paths`
  6. `docs(t11t): add code slimming implementation note`
- It is okay to split differently if the actual DAG requires it, but do not stop after a tiny first commit.

Required implementation note:
Create:
`docs/superpowers/refactor-ops/t11t-code-slimming-major-wave-implementation-note.md`

It must be Chinese-first and include:
1. Did this meet the Impact Contract? yes/no.
2. Does this count as a major code-slimming wave? yes/no.
3. Before/after product code LOC from `cloc src styles.css`.
4. Separate test/docs/package delta if any.
5. Track-by-track summary.
6. Changed files grouped by track.
7. Deleted/moved paths.
8. Protected features verified:
   - Usage Dashboard still present
   - Chat three views still registered
   - Vault X-Ray still present
   - Copilot action ids/bindings preserved
   - boundary audit still 0
9. Visual dependency maps with Mermaid or concise ASCII/HTML-like maps.
10. Code Reading Guide:
    - exact files to read
    - in what order
    - what question each file answers
11. Skipped tracks with evidence.
12. Verification commands and results.

Final response after implementation:
- Start with the impact table.
- Then list commits.
- Then list verification.
- Then list owner reading order.
- Be honest if product LOC reduction misses the minimum. If it misses, call it partial progress, not a major wave.
```

## 2. What This Prompt Is Optimized For

- One user prompt to Claude, not many small prompts.
- Claude still does bounded preflight, but continues implementation unless hard-blocked.
- Product capability is protected.
- Product source LOC is measured separately from tests/docs/package.
- The final note is owner-readable, with code reading guidance and skipped evidence.

## 3. Codex Review Checklist After Claude Returns

When Claude returns an implementation note, Codex should review:

- Did product code LOC reduce by at least `2,500`?
- If not, did Claude honestly call it partial?
- Did all required tracks move materially?
- Did it preserve Usage Dashboard, Chat three views, Vault X-Ray, Copilot action ids?
- Did boundary audit remain 0?
- Did it add a new god component or god port?
- Did it delete fake UI or wire it for real?
- Is the implementation note readable enough for owner review?
