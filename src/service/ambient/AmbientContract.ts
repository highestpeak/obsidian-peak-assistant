// T8: Ambient capability contract & dependency inventory.
//
// Mirrors `src/service/lint/VaultLintContract.ts`: a dependency-light
// description of WHAT the Ambient runtime is, what it consumes, and
// where its current resolution sites live. The contract intentionally
// references string paths to keep this file free of Obsidian / sqlite
// / UI imports — the source-guard test scans the file for forbidden
// import specifiers and the dependency inventory itself.
//
// Future work (Current Work State / Session Thought Trace) is named
// as a *future-only* term at the bottom — it is NOT implemented in
// T8. Implementation lands in a later capability redesign.

import type {
	AmbientPushItem,
	AmbientPushSettings,
	BriefingItem,
	TriggerType,
} from './types';

// ---------------------------------------------------------------------------
// Capability identifiers
// ---------------------------------------------------------------------------

export const AMBIENT_PUSH_REFRESH_CAPABILITY_ID = 'ambient.push.refresh' as const;
export const AMBIENT_BRIEFING_STARTUP_CAPABILITY_ID = 'ambient.briefing.startup' as const;

export type AmbientCapabilityId =
	| typeof AMBIENT_PUSH_REFRESH_CAPABILITY_ID
	| typeof AMBIENT_BRIEFING_STARTUP_CAPABILITY_ID;

// ---------------------------------------------------------------------------
// Current inputs / outputs (descriptive — not validated)
// ---------------------------------------------------------------------------

export interface AmbientPushRefreshInput {
	/** What caused the trigger. `manual` is the panel / command path. */
	trigger: TriggerType;
	/** Active editor file path when known. */
	sourceFilePath: string | null;
	/** Current snapshot of ambient settings. */
	settings: AmbientPushSettings;
}

export interface AmbientPushRefreshOutput {
	items: AmbientPushItem[];
	sourceFilePath: string;
}

export interface AmbientBriefingStartupInput {
	now: number;
	settings: AmbientPushSettings;
}

export interface AmbientBriefingStartupOutput {
	items: BriefingItem[];
	shown: boolean;
}

// ---------------------------------------------------------------------------
// Dependency inventory
// ---------------------------------------------------------------------------

export interface AmbientAppContextResolution {
	site: string;
	access: string;
	purpose: string;
}

export interface AmbientSingletonResolution {
	site: string;
	singleton: string;
	purpose: string;
}

export interface AmbientSideEffect {
	site: string;
	kind:
		| 'vault.read'
		| 'metadata.read'
		| 'sqlite.read'
		| 'sqlite.write'
		| 'index.state.read'
		| 'index.state.write'
		| 'ui.store.write'
		| 'llm.request'
		| 'workspace.event.subscribe'
		| 'editor.dispatch';
	target: string;
}

export interface AmbientConsumer {
	site: string;
	purpose: string;
}

export interface AmbientDependencyInventory {
	capabilityIds: readonly AmbientCapabilityId[];
	stateOwner: string;
	appContextResolutions: readonly AmbientAppContextResolution[];
	singletonResolutions: readonly AmbientSingletonResolution[];
	sideEffects: readonly AmbientSideEffect[];
	consumers: readonly AmbientConsumer[];
	briefingCategories: readonly BriefingItem['category'][];
	/**
	 * Future-only terms. These appear in the product spec but are NOT
	 * implemented by the T8 runtime. They are listed here so future
	 * Codex review packets can locate the seam without re-scanning the
	 * spec each time.
	 */
	futureOnlyTerms: readonly string[];
}

// ---------------------------------------------------------------------------
// Current inventory snapshot (T8)
// ---------------------------------------------------------------------------

export const AMBIENT_CURRENT_DEPENDENCIES: AmbientDependencyInventory = {
	capabilityIds: [
		AMBIENT_PUSH_REFRESH_CAPABILITY_ID,
		AMBIENT_BRIEFING_STARTUP_CAPABILITY_ID,
	],
	stateOwner:
		'Runtime binding lives on AppRuntimeRegistry (set/clear via AppContext). ' +
		'UI projection lives in useAmbientPushStore + useMorningBriefingStore. ' +
		'Persistence lives in ambient_push_log and index_state (vault.sqlite).',
	appContextResolutions: [
		{
			site: 'src/app/ambient/ObsidianAmbientSettingsAdapter.ts',
			access: 'AppContext.getSettings().ambientPush',
			purpose: 'Settings snapshot for trigger/search/projection decisions',
		},
		{
			site: 'src/app/ambient/ObsidianAmbientEditorContextAdapter.ts',
			access: 'AppContext.getApp().workspace + metadataCache',
			purpose: 'Editor event subscriptions + active editor projection',
		},
		{
			site: 'src/app/ambient/SearchAmbientSearchAdapter.ts',
			access: 'AppContext.getSearchClient()',
			purpose: 'Vault search driver for refresh pipeline',
		},
		{
			site: 'src/app/ambient/LlmAmbientExplanationAdapter.ts',
			access: 'AppContext.getApp() + AppContext.getPluginId()',
			purpose: 'Tier-2 LLM micro-explanation via queryWithProfile',
		},
		{
			site: 'src/app/ambient/SerendipityGutterPlugin.ts',
			access: 'AppContext.getApp().workspace.openLinkText',
			purpose: 'Gutter widget click → open suggested note',
		},
	],
	singletonResolutions: [
		{
			site: 'src/app/ambient/composeAmbientRuntime.ts',
			singleton: 'AppRuntimeRegistry.setAmbientRuntime()',
			purpose: 'One-shot runtime binding at plugin boot',
		},
		{
			site: 'src/app/ambient/SqliteAmbientPersistenceAdapter.ts',
			singleton: 'sqliteStoreManager.getAmbientPushRepo()',
			purpose: 'Push log + recurring pair queries',
		},
		{
			site: 'src/app/ambient/SqliteAmbientBriefingAdapter.ts',
			singleton:
				'sqliteStoreManager.getIndexStateRepo("vault") + sqliteStoreManager.getIndexContext("vault")',
			purpose: 'Briefing timestamps + mobius_node queries',
		},
		{
			site: 'src/app/ambient/SearchAmbientSearchAdapter.ts',
			singleton:
				'sqliteStoreManager.getMobiusNodeRepo() / getMobiusEdgeRepo() / getEmbeddingRepo("vault")',
			purpose: 'Serendipity 2-hop graph traversal + embedding distance',
		},
		{
			site: 'src/app/ambient/LlmAmbientExplanationAdapter.ts',
			singleton: 'ProfileRegistry.getInstance().getActiveAgentProfile()',
			purpose: 'Active profile for tier-2 LLM explanation',
		},
	],
	sideEffects: [
		{
			site: 'AmbientPushRuntime.handleTrigger',
			kind: 'workspace.event.subscribe',
			target: 'editor-change / file-open via AmbientEditorContextPort',
		},
		{
			site: 'AmbientPushRuntime.handleTrigger',
			kind: 'ui.store.write',
			target: 'AmbientUiProjectionPort.setItems / clearItems / recordPush',
		},
		{
			site: 'AmbientPushRuntime.handleTrigger -> persistence.logPushes',
			kind: 'sqlite.write',
			target: 'ambient_push_log via AmbientPushRepo.logPush',
		},
		{
			site: 'AmbientPushRuntime.recordAction -> persistence.recordAction',
			kind: 'sqlite.write',
			target: 'ambient_push_log via AmbientPushRepo.recordAction',
		},
		{
			site: 'AmbientPushRuntime.handleTrigger -> explanation.generateLlmExplanation',
			kind: 'llm.request',
			target: 'queryWithProfile (active agent profile)',
		},
		{
			site: 'AmbientPushRuntime.tryShowMorningBriefing',
			kind: 'index.state.read',
			target: 'ambient_last_briefing_ts / ambient_last_session_ts',
		},
		{
			site: 'AmbientPushRuntime.tryShowMorningBriefing',
			kind: 'index.state.write',
			target: 'ambient_last_briefing_ts / ambient_last_session_ts',
		},
		{
			site: 'AmbientPushRuntime.tryShowMorningBriefing -> briefing.loadBriefingItems',
			kind: 'sqlite.read',
			target: 'mobius_node (unresolved / changed hubs / decaying engagement)',
		},
		{
			site: 'AmbientPushRuntime.handleTrigger -> editorContext.extractContext',
			kind: 'metadata.read',
			target: 'metadataCache.getFileCache(active file)',
		},
		{
			site: 'AmbientPushRuntime.handleTrigger -> editorContext.extractContext',
			kind: 'vault.read',
			target: 'MarkdownView.editor.getValue() (no Vault.read)',
		},
		{
			site: 'AmbientPushRuntime.handleTrigger -> search.search',
			kind: 'sqlite.read',
			target:
				'SearchClient + Mobius{Node,Edge,Embedding}Repo via serendipity branch',
		},
		{
			site: 'AmbientPushRuntime.tryShowMorningBriefing -> projection.showMorningBriefing',
			kind: 'ui.store.write',
			target: 'useMorningBriefingStore.setItems / show',
		},
	],
	consumers: [
		{
			site: 'main.onload (Ambient Push bootstrap)',
			purpose: 'compose + bind runtime, start trigger, register gutter',
		},
		{
			site: 'main.initSqlite (Morning Briefing kickoff)',
			purpose: 'tryShowMorningBriefing on session start',
		},
		{
			site: 'src/app/commands/PeakCommandActions.ts:openRelatedNotes',
			purpose: 'Open related-notes panel + manual trigger',
		},
		{
			site: 'src/app/commands/PeakCommandActions.ts:refreshRelatedNotes',
			purpose: 'Manual trigger used by Settings -> Maintenance',
		},
		{
			site: 'src/ui/view/ambient-push/AmbientPushPanel.tsx',
			purpose: 'Refresh button + items projection consumer',
		},
		{
			site: 'src/ui/view/ambient-push/PushCard.tsx',
			purpose: 'open / insert link / dismiss → runtime.recordAction',
		},
		{
			site: 'src/app/ambient/SerendipityGutterPlugin.ts',
			purpose: 'Gutter widget click → open note + recordAction',
		},
	],
	briefingCategories: [
		'unresolved_connections',
		'changed_hubs',
		'decaying_engagement',
	],
	futureOnlyTerms: [
		'CurrentWorkState',
		'SessionThoughtTrace',
		'CrossSessionContextThread',
	],
};
