# Owner Code Review Issue Log

Date started: 2026-06-30

Scope: rolling owner review notes for Peak Assistant modernization follow-up. This document records issues raised by the owner during code reading, plus confirmed code facts and preliminary remediation direction. It is intentionally a review log, not an implementation plan. No code changes are implied until the owner explicitly asks to modify code.

Maintenance rule: after each new owner review question, append a new issue entry here with:

- Owner concern
- Confirmed code facts
- Preliminary judgement
- Possible follow-up direction

## Issue 1 - Ambient clock adapter is too small and over-claims determinism

Owner concern:

`DefaultAmbientClock` is only a wrapper over `Date.now()`. It feels like too much ceremony for a single method and may not deserve its own file/class.

Relevant files:

- `src/app/ambient/DefaultAmbientClock.ts`
- `src/service/ambient/ports/AmbientPorts.ts`
- `src/service/ambient/AmbientPushRuntime.ts`
- `src/app/ambient/ObsidianAmbientEditorContextAdapter.ts`
- `src/app/ambient/LlmAmbientExplanationAdapter.ts`

Confirmed code facts:

- `DefaultAmbientClock.now()` only returns `Date.now()`.
- `AmbientPushRuntime` uses `ports.clock.now()` for morning briefing gap checks and push-history timestamps.
- The comment calls this a "monotonic clock", but `Date.now()` is wall-clock time and can move if the system clock changes.
- The comment claims fake clocks make debounce / cooldown / briefing-gap assertions deterministic, but editor trigger cooldown still uses direct `Date.now()` in `ObsidianAmbientEditorContextAdapter`.
- LLM explanation cooldown also uses direct `Date.now()` in `LlmAmbientExplanationAdapter`.

Preliminary judgement:

The clock port is useful as a test seam for the pure runtime, especially briefing-gap logic. The separate `DefaultAmbientClock.ts` file is probably too fine-grained. The comment overstates what the current abstraction actually covers.

Possible follow-up direction:

- Keep `AmbientClockPort` if runtime tests need fake time.
- Rename/comment it as wall-clock unless moving to a true monotonic source.
- Either route all Ambient cooldown/debounce time through the same clock, or narrow the comment to the actual runtime usage.
- Consider inlining the default implementation into `composeAmbientRuntime.ts` or a small adapter bundle instead of keeping a dedicated file.

## Issue 2 - Inline prompts bypass the template system

Owner concern:

Prompt and system prompt text should not be scattered through TypeScript files. Template-style prompts should live under the plugin `templates/` folder and be rendered with variables through the existing template mechanism.

Relevant existing template infrastructure:

- `templates/prompts/*.md`
- `src/core/template/TemplateManager.ts`
- `src/core/template/TemplateRegistry.ts`
- `src/core/prompt/PromptId.ts`
- `test/prompt-template-registry-golden.test.ts`

Confirmed code facts:

- The project already has `TemplateManager.render(id, data)` with Handlebars-style rendering and caching.
- Prompt registry golden tests treat `PromptId -> TEMPLATE_METADATA -> templates/prompts/*.md` as the source-of-truth contract.
- `LlmAmbientExplanationAdapter` builds both user prompt and system prompt inline.
- This is not isolated. Inline or semi-inline LLM-facing text appears in several areas.

Confirmed high-priority inline prompt locations:

- `src/app/ambient/LlmAmbientExplanationAdapter.ts`
- `src/service/usage/optimization/prompt.ts`
- `src/service/copilot/CopilotMetaAgentStream.ts`
- `src/service/copilot/vault/VaultMetaAgentStream.ts`
- `src/service/agents/ai-graph/infer-thinking-tree.ts`
- `src/service/agents/ai-graph/graph-system-prompt.ts`
- `src/service/agents/ai-graph/GraphAgent.ts`
- `src/service/agents/report/ReportOrchestrator.ts`
- `src/service/agents/harness/curator/prompt.ts`
- `src/service/copilot/actions/index.ts`
- `src/service/lint/insights.ts`
- `src/ui/view/copilot/review/InsightInlineChat.tsx`
- `src/service/agents/vault-sdk/webSearchTool.ts`
- `src/service/chat/tools/chatToolBuilder.ts`
- `src/core/constant.ts` for `PLAN_MODE_SYSTEM_PROMPT`
- `src/service/skills/builtin/index.ts`

Preliminary judgement:

This is a systemic source-of-truth problem. The codebase currently has three prompt sources:

- Registered templates under `templates/prompts`
- Inline TypeScript prompt strings
- Half-migrated flows where system prompts use templates but user prompts are still assembled in code

Possible follow-up direction:

- Add prompt IDs and metadata for missing prompts.
- Move task instructions, system prompts, output contracts, and language rules into templates.
- Pass only variables from TypeScript.
- Allow pure data serialization in code when it is not instructional text.
- Add an audit/guard test to prevent new LLM-facing instruction literals from appearing in `src/`.
- Treat duplicated web-search system prompt as a single template-backed prompt.

## Issue 3 - Ambient LLM explanation conflates generation, data, and display limits

Owner concern:

The LLM explanation flow manually drains messages and returns a final string. It does not expose streaming updates. It trims and hard-truncates to 500 characters without configuration. The UI may only need to display a short version, but the data layer should not permanently discard the full model output.

Relevant files:

- `src/app/ambient/LlmAmbientExplanationAdapter.ts`
- `src/service/ambient/ports/AmbientPorts.ts`
- `src/service/ambient/AmbientPushRuntime.ts`
- `src/ui/store/ambientPushStore.ts`
- `src/ui/view/ambient-push/PushCard.tsx`
- `src/core/types/ambient.ts`
- `src/service/chat/service-manager.ts`
- `src/service/agents/core/sdkMessageAdapter.ts`

Confirmed code facts:

- `AmbientPushRuntime` first projects search items to UI, then runs LLM explanation asynchronously via `.then(...)`. The main Ambient recommendation display is not blocked by the explanation call.
- `AmbientExplanationPort.generateLlmExplanation()` returns `Promise<string | null>`, so the interface only supports final-string updates.
- The codebase already has streaming helpers such as `AIServiceManager.queryStream()` and SDK event translation to `text-delta`.
- `LlmAmbientExplanationAdapter` manually iterates SDK messages instead of using shared stream/collect helpers.
- `trim()` is used before returning.
- `500` is a hard-coded magic number. There is no Ambient setting for explanation max length.
- `PushCard` already has UI-layer display constraints such as line clamp / short display treatment, so data-layer truncation is not required for visual layout.

Preliminary judgement:

The current design is acceptable only if Ambient explanation is intentionally a tiny non-streaming badge. Even then, the hard-coded `500` should not live in the adapter. The current code loses information permanently and mixes model contract, returned data, and UI display policy.

Possible follow-up direction:

- Move prompt text into templates.
- Prefer returning full trimmed text from the adapter.
- Let UI decide preview length with CSS, tooltip, expansion, or a separate display field.
- If max length is needed, make it a named setting or constant with a clear reason.
- Consider changing the port to support streaming deltas if the product wants progressive explanation display.
- Use shared `collectText` or `queryStream` plumbing instead of custom SDK-message draining.

## Issue 4 - Trivial Ambient adapters make the file graph noisy

Owner concern:

Small one-use adapters such as `ObsidianAmbientSettingsAdapter` may not deserve dedicated files/classes. The codebase becomes harder to read when simple wiring is spread across many tiny files. Some implementations could be local anonymous objects in the composition function, while ports can remain as the contract.

Relevant files:

- `src/app/ambient/ObsidianAmbientSettingsAdapter.ts`
- `src/app/ambient/DefaultAmbientClock.ts`
- `src/app/ambient/AmbientUiProjectionAdapter.ts`
- `src/app/ambient/composeAmbientRuntime.ts`
- `src/service/ambient/ports/AmbientPorts.ts`
- `test/ambient-source-guard.test.ts`

Confirmed code facts:

- `ObsidianAmbientSettingsAdapter` is 23 lines and wraps `AppContext.getSettings()` plus `saveSettings()`.
- `DefaultAmbientClock` is 10 lines.
- `AmbientUiProjectionAdapter` is 37 lines and directly forwards to Zustand store methods.
- `composeAmbientRuntime.ts` imports and instantiates each adapter separately.
- The source guard protects the boundary between `src/service/ambient` and app/UI/sqlite imports. It does not require every adapter implementation to live in its own file.

Preliminary judgement:

The port boundary is useful. The implementation file granularity is probably too fine. T8 made the dependency boundary explicit, but some adapter implementations are so thin that separate files increase navigation cost more than they help.

Possible follow-up direction:

- Keep `AmbientPorts` as the runtime contract.
- Keep substantial adapters in separate files: editor context, search, persistence, briefing, LLM explanation if it remains complex.
- Inline trivial one-use implementations into `composeAmbientRuntime.ts` or an `ambientAdapters.ts` bundle.
- Avoid exporting implementation classes that are not reused outside composition.
- Update tests only if they accidentally assume file count or implementation class names.

## Issue 5 - `composeSettingsActions` is an app-to-UI command facade

Owner concern:

The owner asked what `src/app/commands/composeSettingsActions.ts` is for and whether its role is understandable.

Relevant files:

- `src/app/commands/composeSettingsActions.ts`
- `src/service/settings/SettingsActionsPort.ts`
- `src/app/react/ReactElementFactory.tsx`
- `src/ui/context/ServiceContext.tsx`
- `src/ui/view/settings/MaintenanceTab.tsx`
- `test/t11p-remaining-ui-app-tail-regression.test.ts`

Confirmed code facts:

- `composeSettingsActions(appContext)` returns a `SettingsActions` object consumed through `useServiceContext().settingsActions`.
- The interface groups actions by UI-facing domains: `setup`, `maintenance`, and `knowledgeIndex`.
- Most methods delegate directly to existing `PeakCommandActions` functions.
- `startStagedFullIndexing()` is implemented locally because it needs `app`, plugin settings, data storage folder, and `progressReporter` to construct `IndexInitializer`.
- `ReactElementFactory` composes `settingsActions` once while building the `ServiceProvider`.
- Regression tests explicitly forbid settings tabs from importing `@/app/commands/PeakCommandActions` directly and require `composeSettingsActions.ts` to exist.

Preliminary judgement:

The file is a boundary/facade composer. Its purpose is to keep settings UI free of app-shell command imports while preserving existing command implementations. That boundary makes sense. The downside is that many methods are thin pass-throughs, so the file can feel like ceremony unless the reader knows the T11P goal.

Possible follow-up direction:

- Keep the `SettingsActionsPort` contract if UI/app boundary remains a modernization goal.
- Improve naming or comments only if needed: this is not a settings reducer or settings state manager; it is a UI action facade.
- Consider whether `PeakCommandActions` should eventually be decomposed by domain so `composeSettingsActions` delegates to smaller app services instead of one large legacy command module.
- Avoid moving UI labels/icons into this composer; current code correctly leaves labels and grouping presentation in UI tabs.

## Issue 6 - Event subscriptions need an event flow map

Owner concern:

The codebase has many event subscriptions and dispatches. It is hard to tell which event is emitted where, who listens to it, and what state or side effect is triggered. The owner wants a table or diagram artifact for this, without turning it into one giant unreadable graph.

Relevant files:

- `src/core/eventBus.ts`
- `src/app/context/AppContext.ts`
- `src/ui/view/SettingsView.tsx`
- `src/service/search/index/indexUpdater.ts`
- `src/ui/hooks/useModels.ts`
- `src/service/context/SessionContextService.ts`
- `src/service/chat/context/ContextUpdateService.ts`
- `src/service/usage/UsageTrackingService.ts`
- `src/app/usage/composeCuratorPushRuntime.ts`
- `src/service/search/index/cascade/CascadeWorker.ts`
- `src/ui/view/shared/scroll-utils.ts`
- `src/ui/view/chat-view/ChatViewComponent.tsx`
- `src/ui/view/chat-view/view-Messages.tsx`
- `src/ui/view/project-list-view/*`

Confirmed code facts:

- The main event bus is `EventBus` in `src/core/eventBus.ts`, backed by `app.workspace.trigger/on/offref`.
- `ViewEventType.SETTINGS_UPDATED` is the string value `peak:settings-updated`.
- `AppContext` listens to `SETTINGS_UPDATED`, refreshes `this.settings`, and toggles devtools globals when `enableDevTools` changes.
- `SettingsView` listens to `SETTINGS_UPDATED` to refresh the settings UI state.
- `indexUpdater` listens to the raw string `peak:settings-updated`.
- `useModels` listens to the raw string `settings-updated`, which is a different event name from `ViewEventType.SETTINGS_UPDATED`.
- `SessionContextService` maps several events into context/activity operations: `MESSAGE_SENT`, `COPILOT_ACTION`, `SEARCH_QUERY`, `AI_ANALYSIS_COMPLETE`, and `RESOURCE_ATTACHED`.
- Usage and cascade flows also dispatch/listen through the bus, including `USAGE_RECORDED` and `CASCADE_COMPLETED`.

Preliminary judgement:

This is not just a volume problem. The event topology is undocumented, and the code mixes typed event enum usage with raw string subscriptions. That makes it difficult to audit causality, lifecycle, and naming drift.

Possible follow-up direction:

- Create a table-first event map with columns: event, emitters, listeners, state changes, side effects, unsubscribe/lifecycle, notes.
- Split diagrams by domain instead of drawing one mega-graph: settings, chat/project navigation, context/session activity, usage/cost, search/indexing.
- Include source anchors for each emitter/listener so the table can be checked mechanically.
- Consider a later source-scan test or report to catch raw string event drift.

## Issue 7 - DevTools/test helpers are scattered and may contain stale globals

Owner concern:

There are many test/debug/devtools helper methods in runtime code. Some may no longer be used. They should not be scattered across `context`, `debug`, and inline blocks in `AppContext`. The owner prefers collecting related helpers into one place near the context/devtools registration path, and likely removing the standalone `debug` folder if it only contains one helper.

Relevant files:

- `src/app/context/AppContext.ts`
- `src/app/context/test-tools.ts`
- `src/app/context/graph-cleanup.ts`
- `src/app/debug/system-info.ts`
- `docs/DEVTOOLS_GUIDE.md`
- `docs/MEMORY_LEAK_AUDIT.md`

Confirmed code facts:

- `src/app/debug` currently contains only `system-info.ts`.
- `system-info.ts` exports `getVaultPersona()`, and current source references show it is imported only by `AppContext`.
- `graph-cleanup.ts` exports only `cleanupGraphTable()`, documented as a DevTools helper.
- `test-tools.ts` contains `GraphInspectorTestTools`, `streamWithStreamLog`, and `AISearchAgentTestTools`.
- `AppContext.handleDevToolsSettingChange()` registers many globals: `testGraphTools`, `testAISearchTools`, `indexDocument`, `indexDocumentFull`, `runPendingLlmIndexEnrichment`, `runPendingVectorIndexEnrichment`, `getVaultPersona`, `cleanupGraphTable`, `dumpV2State`, `captureV2Debug`, `testBackboneMap`, `testKnowledgeIntuition`, `testClassify`, and `testPipelinePhases`.
- `dumpV2State` and `captureV2Debug` are currently defined inline inside `AppContext`, not in a dedicated devtools helper file.
- Source search found `testBackboneMap()` and `testKnowledgeIntuition()` methods on `AISearchAgentTestTools`, but did not find `testClassify()`, `testPipelinePhases()`, or `testSlotRecall()` methods in the current `test-tools.ts`; the `AppContext` console hint still mentions `testSlotRecall`.
- `service/tools/search-graph-inspector/*` appears to be actual tool implementation used by the graph inspector layer, not just DevTools wrappers.

Preliminary judgement:

The cleanup target should be the app-level DevTools registration surface, not the production `service/tools` implementations. Right now DevTools code is split across one `debug` folder, two `context` helper files, and inline code in `AppContext`; there are also likely stale/broken global aliases.

Possible follow-up direction:

- Create one app-context-adjacent devtools module, for example `src/app/context/devtools.ts` or `src/app/context/devtools-tools.ts`, that owns registering and unregistering all `window.*` helpers.
- Move `getVaultPersona`, `cleanupGraphTable`, `dumpV2State`, `captureV2Debug`, and test-tool global aliases under that module or a small local bundle.
- Delete `src/app/debug` if `system-info.ts` is moved and nothing else remains.
- Audit each global helper against real methods before preserving it; stale hints/aliases such as `testSlotRecall`, `testClassify`, and `testPipelinePhases` should either be restored intentionally or removed.
- Keep production search graph inspector tools in `service/tools/search-graph-inspector`; only consolidate the DevTools wrappers and registration code.

## Issue 8 - `src/app/events/Register.ts` name does not match its current chat-navigation responsibility

Owner concern:

`src/app/events/Register.ts` looks like a generic event registration module by path/name, but its content is not just event infrastructure. It contains chat/conversation-specific behavior: detecting conversation markdown files, injecting a "switch to chat view" button into `MarkdownView`, and opening the linked conversation in chat. The owner suspects this should be renamed or moved to a chat-related domain instead of living under generic `app/events`.

Relevant files:

- `src/app/events/Register.ts`
- `main.ts`
- `src/ui/view/chat-view/chatNavigation.ts`
- `src/service/chat/navigation/ChatNavigationPort.ts`
- `src/styles/peak-components.css`

Confirmed code facts:

- `main.ts` imports `registerCoreEvents`, `removeAllChatViewButtons`, and `clearPendingConversationTimeouts` from `src/app/events/Register.ts`.
- `registerCoreEvents()` registers Obsidian workspace events: `active-leaf-change` and `file-open`.
- On markdown file open/leaf change, the file checks whether the markdown path maps to a stored chat conversation via `aiManager.findConversationIdByVaultPath(file.path)`.
- If it is a conversation file, it schedules `addChatViewButton()`.
- `addChatViewButton()` directly manipulates `MarkdownView.contentEl`, creates `.peak-chat-view-button-container` / `.peak-chat-view-button`, renders a Lucide `MessageCircle`, and on click calls `createChatNavigation(...).openConversationInChat(...)`.
- The same file owns DOM cleanup helpers and pending timeout cleanup.
- Styling for the injected button lives in `src/styles/peak-components.css` under `peak-chat-view-button`.

Preliminary judgement:

The file is event-triggered, but its domain is chat conversation markdown navigation. The current path/name overgeneralizes the responsibility and makes architecture reading harder: a reader expects generic event wiring but finds chat-specific DOM injection and navigation.

Possible follow-up direction:

- Rename/move the module toward the behavior it owns, for example `src/app/chat/registerConversationMarkdownAffordance.ts`, `src/app/chat/ConversationMarkdownButton.ts`, or `src/app/chat/registerChatMarkdownEvents.ts`.
- Keep the workspace event registration wrapper if useful, but separate generic workspace lifecycle wiring from chat-specific DOM injection.
- Consider extracting the DOM/button part from the workspace listener part so the event map can document the listener cleanly.
- Update `main.ts` imports and any docs once the name is changed.

## Issue 9 - Standalone Vault X-Ray surface should be retired; Vault Lint should become an internal Vault Intelligence health provider

Owner concern:

The codebase currently has two product loops mixed together. The old standalone `Vault X-Ray` loop exposes its own command, tab, `Scan Now` button, health score, dimension scores, and repair opportunities. The desired future product loop is the unified Copilot Picker / Vault Intelligence entry: `Cmd+Shift+O` -> `Document / Vault / Setting` -> Vault tab -> vault status, past vault reviews, suggested intents, Research / View last report -> `VaultAutoRunModal`.

The owner wants to retire X-Ray as an independent UI/product surface, while keeping Vault Lint as an internal health signal provider used by Vault Intelligence.

Relevant files:

- `src/app/commands/Register.ts`
- `src/app/commands/PeakCommandActions.ts`
- `src/app/view/types.ts`
- `src/app/view/ViewManager.ts`
- `src/app/view/VaultXRayView.ts`
- `src/ui/view/vault-lint/VaultXRayPanel.tsx`
- `src/ui/view/vault-lint/hooks/useVaultLintRunState.ts`
- `src/ui/view/vault-lint/components/*`
- `src/app/lint/*`
- `src/service/lint/*`
- `src/ui/view/copilot/*`
- `src/ui/view/copilot/vault/VaultAutoRunModal.tsx`
- `src/ui/view/copilot/vault/VaultAutoRunContent.tsx`
- `test/vault-lint-runner.test.ts`
- `test/vault-lint-contract.test.ts`

Confirmed code facts:

- `buildCoreCommands()` still registers command id `peak-vault-xray` with name `Open Vault X-Ray`.
- `openVaultXRay()` calls `viewManager.activateVaultXRayView()`.
- `ViewManager` imports/registers `VaultXRayView`, maps `VAULT_XRAY_VIEW_TYPE`, and exposes `activateVaultXRayView()`.
- `view/types.ts` includes `VAULT_XRAY_VIEW_TYPE = 'peak-vault-xray-view'` and includes it in `STANDALONE_PEAK_VIEW_TYPES`.
- `VaultXRayView` is a standalone `ItemView` that dynamically renders `VaultXRayPanel`.
- `VaultXRayPanel` displays title `Vault X-Ray`, a `Scan Now` button, score/dimension UI, and repair opportunities via `HealthInsightsPanel`.
- `useVaultLintRunState` exists only under the standalone `vault-lint` UI path and feeds the X-Ray panel.
- `main.ts` binds Vault Lint runtime into `AppContext`, then composes Vault Review runtime; comments already state `VaultAutoRunModal`, picker, and history modal reach Vault Review via `AppContext.tryGetVaultReviewRuntime()`.
- `VaultAutoRunContent` already renders a Health snapshot card using `health.score`, so health signals are already partly visible in the Vault Intelligence surface.
- Existing tests still explicitly guard `VaultXRayPanel.tsx` behavior, so tests would need to be updated when the standalone surface is retired.

Preliminary judgement:

The product direction should be: remove the standalone X-Ray entry and UI, not remove lint capability. `Vault Lint` should become one internal step/provider in the Vault Intelligence run: vault fingerprint/cache decision -> health signal refresh as needed -> digest -> agent review -> report persistence -> Vault Intelligence UI.

Possible follow-up direction:

- Remove the `Open Vault X-Ray` command registration.
- Remove `openVaultXRay()` if no other caller remains.
- Remove `VAULT_XRAY_VIEW_TYPE`, `VaultXRayView` registration, and `activateVaultXRayView()` from `ViewManager`.
- Delete or retire `src/app/view/VaultXRayView.ts`.
- Delete or retire standalone UI files under `src/ui/view/vault-lint/*`, including `VaultXRayPanel`, `useVaultLintRunState`, `ScoreRing`, `DimensionBars`, and `HealthInsightsPanel` if not reused by Vault Intelligence.
- Keep `src/app/lint/*` and `src/service/lint/*` as the internal health provider/runtime.
- Move any still-useful health UI concepts into Vault Intelligence copy/components under terms like `Vault health`, `Knowledge health`, `Repair signals`, `Structural issues`, or `Readiness signals`.
- Update tests so they no longer assert standalone X-Ray behavior, while preserving boundary tests for the lint runtime/provider.

## Issue 10 - Port/type contracts are scattered under `service`, while host adapters are scattered under capability folders

Owner concern:

Many files under `src/service/**` are not service implementations. They are pure contracts, ports, or shared data types. These should generally live under `src/core` because they define cross-layer boundaries and domain shapes rather than service orchestration. Separately, `src/app/navigation` contains Obsidian-backed adapter implementations that are closer to `src/app/adapters/*` than to an app-level navigation domain.

Relevant files:

- `src/service/navigation/VaultNavigationPort.ts`
- `src/service/navigation/WikilinkPort.ts`
- `src/service/editor/EditorCommandsPort.ts`
- `src/service/preview/VaultPreviewPort.ts`
- `src/service/stats/VaultStatsPort.ts`
- `src/service/ports/ProgressReporterPort.ts`
- `src/service/settings/SettingsActionsPort.ts`
- `src/service/view/ViewActivationPort.ts`
- `src/service/chat/ports/ChatVaultWriterPort.ts`
- `src/service/search/ports/AnalysisDocVaultWriterPort.ts`
- `src/service/agents/report/ReportSessionPort.ts`
- `src/service/ambient/ports/AmbientPorts.ts`
- `src/service/lint/ports/VaultLintPorts.ts`
- `src/service/copilot/actions/CopilotActionPorts.ts`
- `src/service/copilot/panels/CopilotPanelPorts.ts`
- `src/service/copilot/vault/ports/VaultReviewPorts.ts`
- `src/service/search/background/ports/QuickSearchBackgroundPorts.ts`
- `src/service/usage/curator/CuratorPushPorts.ts`
- `src/app/navigation/AppVaultNavigationAdapter.ts`
- `src/app/navigation/AppWikilinkAdapter.ts`
- `src/app/navigation/AppEditorCommandsAdapter.ts`
- `src/app/navigation/composeNavigation.ts`
- `src/app/adapters/HttpClientAdapter.ts`
- `src/app/adapters/NoticeNotifier.ts`
- `src/app/adapters/ObsidianProgressReporter.ts`
- `src/core/ports/*`

Confirmed code facts:

- Existing `src/core/ports` already contains pure host/core boundary ports such as `HttpClientPort`, `NotifierPort`, `DocumentVaultReaderPort`, `VaultWriterPort`, `HostMetadataPort`, `VaultMetadataResolverPort`, and `VaultFileRef`.
- `src/service/navigation/VaultNavigationPort.ts`, `WikilinkPort.ts`, `EditorCommandsPort.ts`, `VaultPreviewPort.ts`, `VaultStatsPort.ts`, `ProgressReporterPort.ts`, and similar files are pure interface/type surfaces.
- Source scans of service `*Port.ts`, `*Ports.ts`, `*types.ts`, and `*Contract.ts` found no real app/UI/Obsidian implementation imports, aside from comments. This supports treating many of them as pure contracts.
- `AppContext`, `ServiceContext`, UI components, and app adapters import many of these contracts from `@/service/...`, so the service directory is acting as a public contract registry.
- `src/app/navigation/*` imports Obsidian types such as `App`, `MarkdownView`, `TFile`, `WorkspaceLeaf`, and implements ports like `VaultNavigationPort`, `WikilinkPort`, and `EditorCommandsPort`.
- Existing `src/app/adapters/*` already contains similar host adapters: `HttpClientAdapter`, `NoticeNotifier`, and `ObsidianProgressReporter`.

Preliminary judgement:

The owner-proposed architecture rule is sound:

- `core/ports` = pure contracts and cross-layer capability interfaces; no Obsidian, no UI, no implementation.
- `app/adapters` = Obsidian/browser/platform concrete implementations of those contracts.
- `service` = actual business workflows, runtimes, orchestration, and domain services.
- `ui` = presentation and interaction; consumes ports, does not know host APIs directly.

The current layout is not catastrophically wrong, but it mixes historical "by feature" placement with clean boundary placement. `service/navigation` is the clearest example: it contains contracts, while the implementation lives under `app/navigation`. The names force readers to reconstruct the architecture mentally.

Possible follow-up direction:

- Move broadly shared pure ports to `src/core/ports`, starting with navigation/editor/preview/stats/progress/settings/view/chat-vault-writer/report-session/analysis-doc-writer.
- Consider moving domain data shapes imported heavily by UI/app to `src/core/types/<domain>` or `src/core/<domain>`, especially when they are plain data rather than service implementation details.
- Keep service-internal implementation types near the service when they are tightly coupled to a specific runtime or algorithm, such as many harness loop/context/tool internal types.
- Move `src/app/navigation/*` to `src/app/adapters/navigation/*`, preserving the navigation capability subfolder instead of flattening everything into `src/app/adapters`.
- Consider the same adapter grouping rule for other host-backed implementations: preview, stats, chat vault writer, quick-search host/background, lint adapters, and copilot adapters.
- Avoid a giant move in one pass; migrate by boundary group and update import aliases/tests in small waves.

Additional naming constraint:

The owner may later build a separate standalone app. In that world, "host" becomes ambiguous because both Obsidian and the standalone app are hosts/runtimes. Therefore, avoid making `host` the long-term generic folder name unless it is qualified. Short-term `src/app/adapters/<capability>` is acceptable. Longer-term, if multiple runtime hosts exist, prefer an explicit runtime/platform split such as `src/platforms/obsidian/*` and `src/platforms/standalone/*`, or `src/adapters/obsidian/*` and `src/adapters/standalone/*`, while keeping shared contracts in `src/core/ports`.

## Issue 11 - `src/app/preview` is a vault preview adapter, not a UI preview feature folder

Owner concern:

`src/app/preview` looks like a product/UI preview area, but it actually contains an Obsidian-backed adapter for reading vault content and generating resource URLs. It is similar to `src/app/navigation`: both are app-layer implementations of narrow ports over Obsidian APIs. The folder should probably be grouped under an adapter/platform implementation area rather than standing alone as `app/preview`.

Relevant files:

- `src/app/preview/AppVaultPreviewAdapter.ts`
- `src/app/preview/composeVaultPreview.ts`
- `src/service/preview/VaultPreviewPort.ts`
- `src/ui/component/mine/resource-preview-hover.tsx`
- `src/ui/component/mine/streamdown/WikilinkHoverPreview.tsx`
- `src/ui/component/mine/StreamdownIsolated.tsx`
- `src/ui/view/quick-search/hooks/useVaultSearch.ts`
- `src/ui/context/ServiceContext.tsx`
- `src/app/context/AppContext.ts`

Confirmed code facts:

- `AppVaultPreviewAdapter` imports Obsidian `App` / `TFile` and implements `VaultPreviewPort`.
- The adapter only wraps three Obsidian vault operations: `app.vault.readBinary`, `app.vault.read`, and `app.vault.getResourcePath`.
- `composeVaultPreview(app)` only returns `new AppVaultPreviewAdapter(app)`.
- `VaultPreviewPort` has exactly three methods: `readBinary(path)`, `readText(path)`, and `getResourcePath(path)`.
- The port is composed in `AppContext`, passed through `ReactElementFactory` / `ServiceProvider`, and consumed as `useServiceContext().vaultPreview`.
- UI consumers use it for wikilink hover previews, resource/attachment hover previews, PDF iframe resource paths, Quick Search in-file search, and go-to-line content reads.

Preliminary judgement:

The current behavior is good as a boundary, but the folder name is misleading. This is not a page preview feature; it is an app/platform adapter that exposes vault-file preview reads to UI code without leaking raw Obsidian APIs.

Possible follow-up direction:

- Move `src/app/preview/*` to `src/app/adapters/preview/*` in the short term.
- Move `VaultPreviewPort` from `src/service/preview/VaultPreviewPort.ts` to `src/core/ports/VaultPreviewPort.ts` when doing the broader port cleanup.
- Consider whether the capability name should stay `preview` or become more explicit, such as `vault-preview`, `vault-resource-preview`, or `vault-content-preview`.
- Keep UI preview components where they are; only move the app-layer adapter and the pure port contract.

## Issue 12 - `src/app/search` and `src/app/quick-search` should be unified as one app-layer search domain

Owner concern:

The app layer currently has both `src/app/search` and `src/app/quick-search`. At first glance, this looks like two parallel search product areas. In reality, `quick-search` is the concrete Quick Search product surface/host bundle, while `search` currently contains only `composeBackboneEnv.ts`, a small app-layer environment composer for lower-level search/index/backbone logic. Keeping them as separate top-level app folders makes `composeBackboneEnv` look like an independent search system.

Relevant files:

- `src/app/quick-search/composeQuickSearchHost.ts`
- `src/app/quick-search/AppAnalysisDocVaultWriterAdapter.ts`
- `src/app/quick-search/SearchSessionReportAdapter.ts`
- `src/app/quick-search/background/*`
- `src/app/search/composeBackboneEnv.ts`
- `src/app/react/ReactElementFactory.tsx`
- `src/app/commands/PeakCommandActions.ts`
- `src/app/context/test-tools.ts`
- `src/service/search/index/helper/backbone/*`
- `src/service/search/background/*`
- `test/t11p-remaining-ui-app-tail-regression.test.ts`
- `test/t11q-service-app-tail-regression.test.ts`

Confirmed code facts:

- `src/app/search` currently contains only `composeBackboneEnv.ts`.
- `composeBackboneEnv(appContext)` returns a small `BackboneEnv` snapshot: `vault`, `rootFolder`, `autoSaveFolder`, `excludeAutoSaveFolder`, and `ignorePatterns`.
- The comment in `composeBackboneEnv.ts` says it exists so service-tier modules do not read settings through `AppContext` mid-stream.
- `composeBackboneEnv` is consumed by `PeakCommandActions` and `app/context/test-tools.ts` for backbone/knowledge intuition flows.
- `src/app/quick-search` contains a broader Quick Search app-layer host: `composeQuickSearchHost`, analysis doc vault writer, report session adapter, and background runtime adapters.
- `composeQuickSearchHost` builds file/path ops, settings snapshots, agent factories, markdown persistence helpers, chat interop, and Quick Search runtime access from `AppContext`.
- `src/app/quick-search/background` is a coherent sub-area for Quick Search background runtime adapters and composition.
- Existing tests reference the current paths directly, so any move needs test updates.

Preliminary judgement:

`composeBackboneEnv` is not unnecessary, but its location makes it feel like a separate search subsystem. The better model is: search-related app-layer adapters/composers live under one `src/app/search` domain, while internally staying fairly flat. `background/` can remain a subfolder because it is a real cluster; a single `composeBackboneEnv.ts` does not need its own nested `backbone/` folder.

Settings/config should remain centrally sourced from `AppContext` / plugin settings, but downstream algorithms should receive small explicit snapshots such as `BackboneEnv` rather than the entire settings tree.

Possible follow-up direction:

- Move `src/app/quick-search/*` into `src/app/search/*`.
- Keep `src/app/search/background/*` for the Quick Search background runtime adapters.
- Keep `composeBackboneEnv.ts` in the same `src/app/search` folder, likely as a flat file.
- Avoid adding `search/quick-search` or `search/backbone` unless the file count/complexity grows enough to justify it.
- Update path comments and tests that currently point at `src/app/quick-search/*` or `src/app/search/composeBackboneEnv.ts`.
- Keep the config snapshot pattern: app layer reads global settings, service/search algorithms receive narrow typed env/config objects.

## Issue 13 - React mounting, ItemView shells, view registration, and Obsidian modals should be grouped as one app UI host layer

Owner concern:

The current top-level app folders `src/app/react`, `src/app/shell`, `src/app/view`, and `src/app/modals` look like separate systems. In practice, they are all part of one boundary: mounting React UI into Obsidian's app shell through `ServiceProvider`, `ItemView`, and `Modal` wrappers. The distinction between these folders is mostly implementation grain, not product domain.

Relevant files:

- `src/app/react/ReactElementFactory.tsx`
- `src/app/shell/ReactItemViewHost.ts`
- `src/app/shell/ReactModalHost.ts`
- `src/app/view/*`
- `src/app/modals/*`
- `src/app/copilot/modals/*`
- `src/ui/context/ServiceContext.tsx`
- `src/ui/react/ReactRenderer.ts`
- `test/t11o-app-shell-relocation-regression.test.ts`

Confirmed code facts:

- `src/app/react` contains 1 file: `ReactElementFactory.tsx`.
- `src/app/shell` contains 2 files: `ReactItemViewHost.ts` and `ReactModalHost.ts`.
- `src/app/view` contains Obsidian `ItemView` shells and view management: `ChatView`, `ProjectListView`, `AmbientPushView`, `UsageDashboardView`, `ChatStudioView`, `ConversationOutlineView`, `VaultXRayView`, `ViewManager`, `ViewSwitchConsistentHandler`, and `types`.
- `src/app/modals` contains Obsidian modal shells such as `SettingsModal`, `QuickSearchModal`, `HarnessOnboardingModal`, `CostEstimationModal`, `IndexingProgressModal`, `InputModal`, `ConfirmModal`, and others.
- `ReactModalHost` and `ReactItemViewHost` both wrap `ReactRenderer` and `AppContext`.
- `SettingsModal` imports both `ReactModalHost` and `createReactElementWithServices`, showing the current cross-folder app-shell wiring.
- `ViewManager` imports view shells from `src/app/view` and also imports `InputModal` from `src/app/modals`.
- Existing T11O tests and docs currently name `src/app/view`, `src/app/modals`, and `src/app/react` as the app-shell relocation targets.

Preliminary judgement:

The owner-proposed boundary is clearer:

- `src/ui` = actual React components and page content.
- `src/app/ui-host` = Obsidian app shell integration, React mounting, ItemView shells, Modal shells, and view registration.

The current split was useful during UI/app relocation, but it now creates extra top-level concepts. `react` and `shell` are too small to justify first-class app folders, and `view` / `modals` are not independent domains; they are both ways of hosting React or app UI inside Obsidian.

Possible follow-up direction:

- Create `src/app/ui-host`.
- Move `ReactElementFactory.tsx`, `ReactItemViewHost.ts`, `ReactModalHost.ts`, `ViewManager.ts`, `ViewSwitchConsistentHandler.ts`, view shells, view `types.ts`, and app modal shells into that boundary.
- Prefer a lightly grouped shape only if needed:
  - `src/app/ui-host/shell/*`
  - `src/app/ui-host/views/*`
  - `src/app/ui-host/modals/*`
- If keeping the owner's flattening preference, place the tiny shell/react files directly at `src/app/ui-host/*` and only group when file count grows.
- Decide whether `src/app/copilot/modals/*` stays under the Copilot app domain or joins `src/app/ui-host/modals/*`; they are also Obsidian modal shells but are currently domain grouped.
- Update tests/docs that currently treat `src/app/view`, `src/app/modals`, and `src/app/react` as canonical app-shell locations.
- Do not preserve `VaultXRayView` just for the move if Issue 9 is executed first; retire it with the standalone X-Ray surface instead.

## Issue 14 - `src/app` top-level folders reflect historical feature fragments rather than stable architectural roles

Owner concern:

`src/app` is currently grouped by many small capability fragments left by previous refactor waves. Some folders represent real feature/runtime composition, while others are one-file wrappers around Obsidian/platform capabilities. This makes the top-level app layer harder to scan: a reader sees `navigation`, `preview`, `stats`, `template`, `vault`, `runtime`, `react`, `shell`, and `view`, but cannot immediately tell which are feature domains, which are adapters, which are UI host shells, and which are lifecycle/context state.

Relevant files/folders:

- `src/app/runtime/AppRuntimeRegistry.ts`
- `src/app/context/AppContext.ts`
- `src/app/stats/AppVaultStatsAdapter.ts`
- `src/app/template/VaultContentProvider.ts`
- `src/app/vault/AppVaultReaderAdapter.ts`
- `src/app/vault/obsidian-utils.ts`
- `src/app/vault/vault-helpers.ts`
- `src/app/preview/*`
- `src/app/navigation/*`
- `src/app/adapters/*`
- `src/app/react/*`
- `src/app/shell/*`
- `src/app/view/*`
- `src/app/modals/*`

Confirmed code facts:

- `src/app/runtime` contains only `AppRuntimeRegistry.ts`.
- `AppRuntimeRegistry` is a meaningful class: it owns runtime binding lifecycle for Vault Lint, Ambient, Vault Review, Quick Search background, Copilot Action, and Curator Push runtimes; it supports fail-loud getters, soft `tryGet` accessors, double-bind protection, and clear/dispose behavior.
- Tests construct `new AppRuntimeRegistry()` directly and guard that it does not import Obsidian, sqlite, or `AppContext`.
- `AppContext` owns one `runtimeRegistry` instance and exposes thin static delegators.
- `src/app/stats` contains only `AppVaultStatsAdapter.ts`.
- `src/app/template` contains only `VaultContentProvider.ts`.
- `src/app/vault` contains `AppVaultReaderAdapter.ts`, `obsidian-utils.ts`, and `vault-helpers.ts`.
- These stats/template/vault files import Obsidian `App`, `TFile`, `TFolder`, or vault APIs and therefore are app/platform adapters or app-level Obsidian helpers.
- Several app top-level directories are one-file folders: `debug`, `events`, `react`, `runtime`, `search`, `stats`, `template`, and `usage`. Others are tiny folders such as `preview`, `settings`, `shell`, `adapters`, `chat`, `commands`, `context`, and `vault`.

Preliminary judgement:

`AppRuntimeRegistry` should remain a separate class, but `src/app/runtime/` as a one-file top-level directory overstates its role. It is app lifecycle/context state and belongs closer to `AppContext`, either under `src/app/context` or a future `src/app/lifecycle` boundary.

Likewise, `stats`, `template`, `vault`, `preview`, and `navigation` are mostly Obsidian-backed capability adapters/helpers. They should not each become first-class top-level app domains just because they wrap different slices of Obsidian.

Possible follow-up direction:

- Keep `AppRuntimeRegistry` as a class, but move it near app context/lifecycle, for example `src/app/context/AppRuntimeRegistry.ts` or `src/app/lifecycle/AppRuntimeRegistry.ts`.
- Consolidate Obsidian/browser/vault capability wrappers under `src/app/adapters`, with coarse grouping only when it earns its keep:
  - `src/app/adapters/vault/*`
  - `src/app/adapters/navigation/*`
  - `src/app/adapters/preview/*`
  - `src/app/adapters/platform/*`
- Move `AppVaultStatsAdapter`, `VaultContentProvider`, `AppVaultReaderAdapter`, `obsidian-utils`, and `vault-helpers` into that adapter/platform boundary if they remain app-owned Obsidian helpers.
- Treat `src/app/context`, `src/app/ui-host`, `src/app/adapters`, and larger feature/runtime composition domains as the primary app-layer roles.
- Keep larger feature/runtime composition folders only when they have real weight, such as `ambient`, `lint`, `copilot`, `search`, and `usage`.
- Avoid flattening everything into one `adapters` junk drawer; use a few coarse subgroups but avoid one-folder-per-file.
- Update tests/docs that currently hard-code old paths, especially boundary tests around `AppRuntimeRegistry`, app vault helpers, template provider, and stats adapter.

## Issue 15 - App-layer cleanup must separate directory consolidation from service-logic extraction

Owner concern:

The separate issue map `docs/superpowers/refactor-ops/2026-06-30-app-layer-service-logic-issue-map.md` adds an important dimension to this review log. Issues 10-14 mostly identify directory naming and app-layer grouping problems. The issue map shows a deeper problem: some app adapters do not merely wrap Obsidian/platform APIs; they contain ranking, scoring, traversal, prompt, digest, and maintenance workflow logic that belongs in service/domain code.

Relevant source map:

- `docs/superpowers/refactor-ops/2026-06-30-app-layer-service-logic-issue-map.md`

High-confidence files from the map:

- `src/app/copilot/actions/SqliteCopilotActionSemanticGraphAdapter.ts`
- `src/app/copilot/vault/SqliteVaultReviewDigestAdapter.ts`
- `src/app/ambient/SearchAmbientSearchAdapter.ts`
- `src/app/ambient/SqliteAmbientBriefingAdapter.ts`
- `src/app/commands/PeakCommandActions.ts`
- `src/app/context/graph-cleanup.ts`
- `src/app/ambient/LlmAmbientExplanationAdapter.ts`

Medium-confidence files from the map:

- `src/app/copilot/actions/AppCopilotActionAiAdapter.ts`
- `src/app/copilot/actions/ObsidianCopilotActionVaultAdapter.ts`
- `src/app/copilot/actions/AppCopilotActionSearchAdapter.ts`
- `src/app/copilot/actions/ObsidianCustomPromptSourceAdapter.ts`
- `src/app/ambient/SqliteAmbientPersistenceAdapter.ts`
- `src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`
- `src/app/debug/system-info.ts`

Confirmed code-reading conclusion:

- Directory cleanup alone is not enough. Moving a file from `src/app/navigation` to `src/app/adapters/navigation` is useful only when the file is actually host adapter code.
- If an app file owns algorithmic behavior, the right fix is not only renaming/moving; it should usually split into:
  - app layer: narrow host/data adapter or runtime composition;
  - service/core layer: algorithm, scoring, thresholds, prompt wording, result shaping, maintenance workflow.
- The issue map’s strongest examples involve app files containing `sort`, `score`, `threshold`, `topK`, graph traversal, prompt text, digest construction, cache policy, or multi-repo cleanup workflows.

How this merges with earlier issues:

- Issue 2 and Issue 3 already identified inline prompt/policy problems in `LlmAmbientExplanationAdapter`; the issue map confirms this is part of broader app-layer policy drift.
- Issue 7 noted DevTools/test helpers and graph cleanup scattering; the issue map sharpens `graph-cleanup.ts` as database maintenance service logic hidden under `app/context`.
- Issues 10, 11, 12, 13, and 14 cover app-layer directory shape; the issue map adds the rule that directories should not simply hide service logic under nicer names.
- Issue 9 says standalone X-Ray surface should be retired but Vault Lint capability retained; the issue map adds that health/digest construction must stay in service/Vault Intelligence logic, not app adapters.

Preliminary judgement:

The next planning pass should treat app cleanup as two axes:

1. App topology cleanup: consolidate one-file/tiny app folders into stable roles such as `context`, `ui-host`, `adapters`, and larger feature composition domains.
2. Responsibility cleanup: extract real domain/service logic out of app adapters before or while moving files.

If these are conflated, there is a risk of producing a cleaner-looking `src/app/adapters` tree that still contains serendipity ranking, briefing scoring, semantic graph suggestion, digest shaping, prompt wording, and maintenance workflows. That would improve navigation but not architecture.

Suggested priority imported from the issue map:

- First: `SearchAmbientSearchAdapter.serendipitySearch`.
- Then: `SqliteAmbientBriefingAdapter` briefing categories/scoring.
- Then: `PeakCommandActions.cleanupUselessData`.
- Then: `app/context/graph-cleanup.ts`.
- Then: `SqliteVaultReviewDigestAdapter`.
- Then: `SqliteCopilotActionSemanticGraphAdapter`.
- Then: `LlmAmbientExplanationAdapter` prompt/policy.
- Then: `AppCopilotActionSearchAdapter` availability semantics.
- Then: Copilot AI/vault adapter consolidation.
- Then: `ObsidianCustomPromptSourceAdapter` relocation.

Planning guidance:

- Do not solve this by creating a single giant `AppAdapter` or generic `VaultAdapter`.
- Prefer shared narrow ports for common capabilities: AI/prompter, vault reader, vault metadata resolver, vector search/search availability, semantic graph read access, and prompt source.
- App adapters may project host/runtime shapes into safe data structures, but service/core should own decisions, thresholds, scoring, ranking, prompt wording, and product fallback semantics.
