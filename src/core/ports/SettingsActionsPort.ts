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

export type { IndexLevel };

export interface SettingsSetupActions {
	openHarnessWizard(): void;
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
	refreshRelatedNotes(): void;
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
	startStagedFullIndexing(opts?: { level?: IndexLevel }): Promise<void>;
	runVectorEnrichmentPending(): Promise<void>;
	runLlmEnrichmentPending(): Promise<void>;
	compareSearchResults(): Promise<void>;
}

export interface SettingsActions {
	/** Open the plugin settings modal (legacy: T11N entry point). */
	openSettings(): void;
	/** Activate the chat assistant view. */
	openAssistant(): void;
	setup: SettingsSetupActions;
	maintenance: SettingsMaintenanceActions;
	knowledgeIndex: SettingsKnowledgeIndexActions;
}
