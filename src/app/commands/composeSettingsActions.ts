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
import { verifyDatabaseHealth } from '@/core/storage/sqlite/DatabaseHealthVerifier';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { SettingsUpdatedEvent } from '@/core/eventBus';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { IndexLevel, SettingsActions } from '@/core/ports/SettingsActionsPort';

async function startStagedFullIndexing(
	app: App,
	appContext: AppContext,
	opts: { level?: IndexLevel } = {},
): Promise<import('@/core/ports/IndexRunCoordinatorPort').IndexRunResult> {
	void app;
	const settings = appContext.plugin.settings;
	const level: IndexLevel = opts.level ?? (settings.search.indexLevel ?? 'fast');
	const coordinator = appContext.runtimeRegistry.getIndexRunCoordinator();
	const started = await coordinator.startOrAttach({ level });
	return coordinator.waitFor(started.runId);
}

export function composeSettingsActions(appContext: AppContext): SettingsActions {
	const app = appContext.app;
	async function updateSettings(updates: Partial<MyPluginSettings>): Promise<void> {
		const plugin = appContext.plugin;
		const previous = plugin.settings;
		const next = { ...previous, ...updates };
		plugin.settings = next;
		try {
			await applyRuntimeSettings(next, updates);
			await plugin.saveSettings();
			appContext.eventBus.dispatch(new SettingsUpdatedEvent(next));
		} catch (error) {
			plugin.settings = previous;
			try {
				await applyRuntimeSettings(previous, updates);
				await plugin.saveSettings();
			} catch (rollbackError) {
				console.error('[SettingsActions] rollback failed', rollbackError);
			}
			throw error;
		}
	}

	async function applyRuntimeSettings(settings: MyPluginSettings, changed: Partial<MyPluginSettings>): Promise<void> {
		if (changed.ai) {
			appContext.plugin.aiServiceManager?.updateSettings(settings.ai);
			appContext.plugin.aiServiceManager?.refreshDefaultServices();
			await appContext.plugin.aiServiceManager?.init();
		}
		if (changed.search) DocumentLoaderManager.getInstance().updateSettings(settings.search);
	}
	return {
		openSettings: (options) => new SettingsModal(appContext, options?.tab).open(),
		openAssistant: () => openAssistant(),
		settings: {
			current: () => appContext.plugin.settings,
			updateAll: (updates) => updateSettings(updates),
			update: (key, value) => updateSettings({ [key]: value } as Partial<MyPluginSettings>),
			updateSearch: (key, value) => updateSettings({
				search: { ...appContext.plugin.settings.search, [key]: value },
			}),
		},
		launch: {
			openChatStudio: async () => {
				try { await appContext.viewManager.openChatStudio(); return { opened: true }; }
				catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openVaultSearch: async () => {
				try { openQuickSearch(); return { opened: true }; }
				catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openAiSearch: async () => {
				try { openQuickSearch({ aiMode: 'search' }); return { opened: true }; }
				catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openFileAtlas: async () => {
				try { await openFileAtlas(); return { opened: true }; }
				catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openAiGraph: async () => {
				try { openQuickSearch({ aiMode: 'graph' }); return { opened: true }; }
				catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openAgentWizard: async () => {
				try {
					const runtime = appContext.runtimeRegistry.tryGetCommandCenterRuntime();
					if (!runtime) return { opened: false, message: 'Peak Command Center is still loading.' };
					runtime.openLauncher();
					return { opened: true };
				} catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openMediaCreation: async () => {
				try {
					await appContext.viewManager.openChatStudio();
					return { opened: true };
				} catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openComposer: async () => {
				try {
					if (!app.workspace.getActiveFile()) return { opened: false, message: 'Open a Markdown note before starting Composer.' };
					await appContext.viewManager.activateDocumentComposerView();
					return { opened: true };
				} catch (error) { return { opened: false, message: error instanceof Error ? error.message : String(error) }; }
			},
			openRecentNote: async () => {
				const active = app.workspace.getActiveFile();
				const recent = active?.extension.toLowerCase() === 'md'
					? active
					: app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
				if (!recent) return { opened: false, message: 'This Vault does not contain a Markdown note yet.' };
				const leaf = app.workspace.getLeaf('tab');
				await leaf.openFile(recent);
				app.workspace.revealLeaf(leaf);
				return { opened: true };
			},
		},
		setup: {
			openHarnessWizard: () => openHarnessSetupWizard(),
			verifyPeakHermes: async () => {
				const runtime = appContext.runtimeRegistry.tryGetCommandCenterRuntime();
				return runtime
					? { ready: true, message: 'Peak Hermes runtime, tool registry and recovery surfaces are available.' }
					: { ready: false, message: 'Peak Hermes is still starting. Wait a moment and run this check again.' };
			},
			verifyPeakStorage: async () => {
				const dataRoot = normalizePath(appContext.plugin.settings.dataStorageFolder ?? '');
				if (!dataRoot) return { ready: false, message: 'Peak data storage is not configured.' };
				const probePath = normalizePath(`${dataRoot}/.peak-onboarding-storage-probe-${Date.now()}.tmp`);
				try {
					if (!await app.vault.adapter.exists(dataRoot)) await app.vault.adapter.mkdir(dataRoot);
					await app.vault.adapter.write(probePath, 'Peak storage readiness probe');
					const value = await app.vault.adapter.read(probePath);
					if (value !== 'Peak storage readiness probe') throw new Error('Storage readback did not match the probe.');
					return { ready: true, message: 'Peak-managed data storage is readable and writable.' };
				} catch (error) {
					return { ready: false, message: error instanceof Error ? error.message : String(error) };
				} finally {
					try { if (await app.vault.adapter.exists(probePath)) await app.vault.adapter.remove(probePath); } catch { /* best effort cleanup */ }
				}
			},
			repairBetterSqlite: async () => {
				const manager = NativeModuleManager.getInstance();
				await manager.ensureCompatible();
				const binary = manager.getReadiness();
				if (!binary.ready) return { ...binary, checks: [binary.message] };
				await appContext.plugin.initSqlite();
				const health = verifyDatabaseHealth();
				if (!health.initialized || !health.ok) {
					return { ready: false, message: 'SQLite opened but its integrity probe failed.', checks: health.lines };
				}
				const database = (await import('@/core/storage/sqlite/SqliteStoreManager')).sqliteStoreManager.getSearchStore();
				if (!database) return { ready: false, message: 'Search database is not initialized.', checks: health.lines };
				database.exec('CREATE VIRTUAL TABLE temp.peak_onboarding_fts_probe USING fts5(content)');
				try {
					database.exec('BEGIN');
					database.prepare('DELETE FROM peak_onboarding_fts_probe').run();
					database.prepare('INSERT INTO peak_onboarding_fts_probe(content) VALUES (?)').run('peak readiness');
					const row = database.prepare("SELECT COUNT(*) AS count FROM peak_onboarding_fts_probe WHERE peak_onboarding_fts_probe MATCH 'readiness'").get() as { count?: number };
					if (row.count !== 1) throw new Error('FTS read/write probe returned no result.');
					database.exec('ROLLBACK');
				} catch (error) {
					try { database.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
					throw error;
				} finally {
					database.exec('DROP TABLE IF EXISTS temp.peak_onboarding_fts_probe');
				}
				return { ready: true, message: 'Better SQLite, database integrity and full-text search are ready.', checks: [binary.message, ...health.lines, 'FTS read/write: ok'] };
			},
			detectHarnessEnvironment: (opts) => detectEnvironment({
				app,
				...opts,
				modelCatalog: appContext.runtimeRegistry.getModelCatalogRuntime(),
			}),
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
			getReadiness: () => appContext.runtimeRegistry.getIndexRunCoordinator().getReadiness(),
			prepareFastIndex: async () => {
				const coordinator = appContext.runtimeRegistry.getIndexRunCoordinator();
				const before = await coordinator.getReadiness();
				if (before.fullText === 'ready') return { disposition: 'reused', runId: null, readiness: before };
				const start = await coordinator.startOrAttach({ level: 'fast' });
				return { disposition: start.disposition, runId: start.runId, readiness: await coordinator.getReadiness() };
			},
			runVectorEnrichmentPending: () => runVectorEnrichmentPending(),
			runLlmEnrichmentPending: () => runLlmEnrichmentPending(),
			compareSearchResults: () => compareSearchResults(),
		},
	};
}
