// T11P (Track B): Build the namespaced `SettingsActions` bundle that
// `ServiceContext` publishes. Each method delegates to the existing
// `PeakCommandActions` operation (which already owns the AppContext
// access) — this composer just groups them by named domain so UI does
// not import individual app commands directly.
//
// Construction lives in `ReactElementFactory`; the AppContext-backed
// `app` reference is captured once at boot so `setup.detectHarnessEnvironment`
// does not need callers to thread `app` through props.

import type { App } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';
import {
	analyzeVaultIntuition,
	buildUserProfileAction,
	cancelIndexing,
	cleanupUselessData,
	clearUserProfileBuildRecord,
	compareSearchResults,
	deleteIndexData,
	openAssistant,
	openHarnessSetupWizard,
	recomputeGapAnalysis,
	refreshHubSummaries,
	runFullIndexPipeline,
	runGlobalMaintenance,
	runLlmEnrichmentPending,
	runSearchFastIndex,
	runVectorEnrichmentPending,
	verifyDatabaseHealthAction,
} from '@/app/commands/PeakCommandActions';
import { SettingsModal } from '@/app/ui-host/modals/SettingsModal';
import { detectEnvironment } from '@/service/agents/harness/curator';
import type {
	IndexLevel,
	SettingsActions,
} from '@/core/ports/SettingsActionsPort';

async function startStagedFullIndexing(
	app: App,
	appContext: AppContext,
	opts: { level?: IndexLevel } = {},
): Promise<void> {
	try {
		const settings = appContext.plugin.settings;
		const level: IndexLevel = opts.level ?? (settings.search.indexLevel ?? 'fast');
		const { IndexInitializer } = await import('@/service/search/index/indexInitializer');
		const initializer = new IndexInitializer(
			app,
			settings.search,
			settings.dataStorageFolder ?? '',
			appContext.progressReporter,
			appContext.runtimeRegistry.getIndexService(),
		);
		await initializer.performStagedFullIndexing(true, level);
	} catch (e) {
		console.error('[settings-actions] startStagedFullIndexing failed', e);
	}
}

export function composeSettingsActions(appContext: AppContext): SettingsActions {
	const app = appContext.app;
	return {
		openSettings: (options) => new SettingsModal(appContext, options?.tab).open(),
		openAssistant: () => openAssistant(),
		setup: {
			openHarnessWizard: () => openHarnessSetupWizard(),
			detectHarnessEnvironment: (opts) => detectEnvironment({ app, ...opts }),
		},
		maintenance: {
			index: {
				updateIndex: () => runSearchFastIndex(),
				runFullPipeline: () => runFullIndexPipeline(),
				cancelIndexing: () => cancelIndexing(),
				refreshHubSummaries: () => refreshHubSummaries(),
				recomputeGapAnalysis: () => recomputeGapAnalysis(),
				analyzeVaultIntuition: () => analyzeVaultIntuition(),
			},
			graph: {
				runVectorEnrichmentPending: () => runVectorEnrichmentPending(),
				runLlmEnrichmentPending: () => runLlmEnrichmentPending(),
				runGlobalMaintenance: () => runGlobalMaintenance(),
			},
			verification: {
				verifyDatabaseHealth: () => verifyDatabaseHealthAction(),
				cleanupUselessData: () => cleanupUselessData(),
				buildUserProfile: () => buildUserProfileAction(),
			},
			danger: {
				clearUserProfileBuildRecord: () => clearUserProfileBuildRecord(),
				deleteIndexData: () => deleteIndexData(),
			},
		},
		knowledgeIndex: {
			startStagedFullIndexing: (opts) => startStagedFullIndexing(app, appContext, opts),
			runVectorEnrichmentPending: () => runVectorEnrichmentPending(),
			runLlmEnrichmentPending: () => runLlmEnrichmentPending(),
			compareSearchResults: () => compareSearchResults(),
		},
	};
}
