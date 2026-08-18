// T11P (Track B): Grouped, namespaced action surface UI consumes through
// `useServiceContext().settingsActions`. Replaces the static imports of
// `@/app/commands/PeakCommandActions` previously held by `MaintenanceTab`,
// `AISetupTab`, `AdvancedTab`, `OverviewTab`, and `KnowledgeIndexTab`
// (the latter via three `import('@/app/commands/PeakCommandActions')`
// dynamic shims).
//
// Per Codex review #1:
// - UI keeps labels, group order, icons, and layout.
// - App provides named operations only.
// - No flat 20-function bag; no UI descriptors in app code.
// - No raw `PeakCommandActions` re-exports.
//
// Implementation: `src/app/commands/composeSettingsActions.ts`.

import type { EnvironmentSnapshot } from '@/service/agents/harness/curator/types';
import type { IndexLevel } from '@/core/search/indexTypes';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { IndexReadinessProjection, IndexRunResult } from '@/core/ports/IndexRunCoordinatorPort';

export type { IndexLevel };

export interface SettingsSetupActions {
	openHarnessWizard(): void;
	/** Ensure the required native SQLite component matches the current Electron ABI. */
	repairBetterSqlite(): Promise<{ ready: boolean; message: string; checks: string[] }>;
	/**
	 * Probe the user's environment for the Curator (RAM, profiles, vault
	 * language ratio, Ollama). The adapter binds `app` from `AppContext`;
	 * callers pass only the probe knobs the wizard exposes.
	 */
	detectHarnessEnvironment(opts?: {
		ramGB?: number;
		skipLanguageProbe?: boolean;
	}): Promise<EnvironmentSnapshot>;
}

export interface SettingsMaintenanceIndexActions {
	updateIndex(): Promise<void>;
	runFullPipeline(): Promise<void>;
	cancelIndexing(): void;
	refreshHubSummaries(): Promise<void>;
	recomputeGapAnalysis(): Promise<void>;
	analyzeVaultIntuition(): Promise<void>;
}

export interface SettingsMaintenanceGraphActions {
	runVectorEnrichmentPending(): Promise<void>;
	runLlmEnrichmentPending(): Promise<void>;
	runGlobalMaintenance(): Promise<void>;
}

export interface SettingsMaintenanceVerificationActions {
	verifyDatabaseHealth(): Promise<void>;
	cleanupUselessData(): Promise<void>;
	buildUserProfile(): Promise<void>;
}

export interface SettingsMaintenanceDangerActions {
	clearUserProfileBuildRecord(): Promise<void>;
	deleteIndexData(): Promise<void>;
}

export interface SettingsMaintenanceActions {
	index: SettingsMaintenanceIndexActions;
	graph: SettingsMaintenanceGraphActions;
	verification: SettingsMaintenanceVerificationActions;
	danger: SettingsMaintenanceDangerActions;
}

export interface SettingsKnowledgeIndexActions {
	/**
	 * Trigger a staged full indexing run at the current (or supplied)
	 * level. Wraps the `IndexInitializer.performStagedFullIndexing`
	 * construction site previously inlined in `triggerFastIndex` and
	 * `applyLevelChange`.
	 */
	startStagedFullIndexing(opts?: { level?: IndexLevel }): Promise<IndexRunResult>;
	prepareFastIndex(): Promise<{ disposition: 'reused' | 'started' | 'attached'; runId: string | null; readiness: IndexReadinessProjection }>;
	getReadiness(): Promise<IndexReadinessProjection>;
	runVectorEnrichmentPending(): Promise<void>;
	runLlmEnrichmentPending(): Promise<void>;
	compareSearchResults(): Promise<void>;
}

export interface SettingsLaunchActions {
	openChatStudio(): Promise<{ opened: boolean; message?: string }>;
	openVaultSearch(): Promise<{ opened: boolean; message?: string }>;
	openFileAtlas(): Promise<{ opened: boolean; message?: string }>;
	openComposer(): Promise<{ opened: boolean; message?: string }>;
	openRecentNote(): Promise<{ opened: boolean; message?: string }>;
}

/** Narrow, app-owned persistence surface for settings UIs and onboarding. */
export interface SettingsPersistenceActions {
	current(): MyPluginSettings;
	updateAll(updates: Partial<MyPluginSettings>): Promise<void>;
	update<K extends keyof MyPluginSettings>(key: K, value: MyPluginSettings[K]): Promise<void>;
	updateSearch<K extends keyof MyPluginSettings['search']>(
		key: K,
		value: MyPluginSettings['search'][K],
	): Promise<void>;
}

/**
 * Optional deep-link into a specific settings tab. Passed from callers
 * that resolved a `configureAction` (ArtifactReceiptCard, ComposerPlusMenu)
 * through `resolveConfigureTab`. When omitted, the modal opens on its
 * default (Overview) tab.
 */
export interface OpenSettingsOptions {
	tab?: 'aiModels' | 'agents' | 'knowledgeSearch' | 'advanced';
}

export interface SettingsActions {
	/** Open the plugin settings modal (legacy: T11N entry point).
	 * Task E1 — accepts an optional deep-link so `configureAction` on
	 * receipts/composer routes users straight to the right tab. */
	openSettings(options?: OpenSettingsOptions): void;
	/** Activate the chat assistant view. */
	openAssistant(): void;
	settings: SettingsPersistenceActions;
	launch?: SettingsLaunchActions;
	setup: SettingsSetupActions;
	maintenance: SettingsMaintenanceActions;
	knowledgeIndex: SettingsKnowledgeIndexActions;
}
