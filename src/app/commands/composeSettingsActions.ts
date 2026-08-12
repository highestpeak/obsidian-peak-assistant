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
	openChatStudio,
	openDocumentComposer,
	openFileAtlas,
	openHarnessSetupWizard,
	openQuickSearch,
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
import { NativeModuleManager } from '@/core/storage/sqlite/NativeModuleManager';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { SettingsUpdatedEvent } from '@/core/eventBus';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
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
	async function updateSettings(updates: Partial<MyPluginSettings>): Promise<void> {
		const plugin = appContext.plugin;
		plugin.settings = { ...plugin.settings, ...updates };
		if (updates.ai) {
			plugin.aiServiceManager?.updateSettings(plugin.settings.ai);
			plugin.aiServiceManager?.refreshDefaultServices();
			await plugin.aiServiceManager?.init();
		}
		if (updates.search) DocumentLoaderManager.getInstance().updateSettings(plugin.settings.search);
		await plugin.saveSettings();
		appContext.eventBus.dispatch(new SettingsUpdatedEvent(plugin.settings));
	}
	return {
		openSettings: (options) => new SettingsModal(appContext, options?.tab).open(),
		openAssistant: () => openAssistant(),
		settings: {
			current: () => appContext.plugin.settings,
			update: (key, value) => updateSettings({ [key]: value } as Partial<MyPluginSettings>),
			updateSearch: (key, value) => updateSettings({
				search: { ...appContext.plugin.settings.search, [key]: value },
			}),
		},
		launch: {
			openChatStudio: () => openChatStudio(),
			openVaultSearch: () => openQuickSearch(),
			openFileAtlas: () => openFileAtlas(),
			openComposer: () => openDocumentComposer(),
			openRecentNote: async () => {
				const active = app.workspace.getActiveFile();
				const recent = active?.extension.toLowerCase() === 'md'
					? active
					: app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
				if (!recent) return;
				const leaf = app.workspace.getLeaf('tab');
				await leaf.openFile(recent);
				app.workspace.revealLeaf(leaf);
			},
		},
		setup: {
			openHarnessWizard: () => openHarnessSetupWizard(),
			repairBetterSqlite: async () => {
				const manager = NativeModuleManager.getInstance();
				await manager.ensureCompatible();
				return manager.getReadiness();
			},
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
