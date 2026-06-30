// T11P (Track D): Compose the Quick-Search host bundle in the app layer
// so `useQuickSearchHost()` becomes a thin context read instead of a hook
// that closes over raw `app` / `plugin`. Mirrors the same surface
// (file/path ops, settings flags, agent factories, markdown helpers,
// chat interop) but builds it once at mount time from `AppContext`.

import type { TFile } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';
import { ContextProvider } from '@/service/context/ContextProvider';
import { AIGraphAgent } from '@/service/agents/AIGraphAgent';
import { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import { SynthesizeAgent } from '@/service/agents/SynthesizeAgent';
import { ContinueAnalysisAgent } from '@/service/agents/ContinueAnalysisAgent';
import { GraphAgent } from '@/service/agents/ai-graph/GraphAgent';
import { ReportOrchestrator } from '@/service/agents/report/ReportOrchestrator';
import type { ReportSessionPort } from '@/core/ports/ReportSessionPort';
import type { QuickSearchHost } from '@/ui/view/quick-search/hooks/useQuickSearchHost';
import {
	saveAiAnalyzeResultToMarkdown,
	persistAnalysisDocToPath,
	saveAiGraphToMarkdown,
	buildAiAnalyzeMarkdownFromSnapshot,
} from '@/ui/view/quick-search/callbacks/save-ai-analyze-to-md';

export function composeQuickSearchHost(
	appContext: AppContext,
	reportSessionPort: ReportSessionPort,
): QuickSearchHost {
	const { app, manager, plugin, searchClient, aiAnalysisHistoryService, isMockEnv } = appContext;
	const settings = appContext.settings;
	const enableDevTools = settings.enableDevTools === true;
	const search = settings.search;

	return {
		openVaultPath: async (path, opts) => {
			const leaf = opts?.newLeaf ?? 'tab';
			const f = app.vault.getAbstractFileByPath(path);
			if (f && 'extension' in (f as Record<string, unknown>)) {
				await app.workspace.getLeaf(leaf as any).openFile(f as TFile);
				return;
			}
			const sourcePath = app.workspace.getActiveFile()?.path ?? '';
			await app.workspace.openLinkText(path, sourcePath, leaf as any);
		},
		readVaultFileText: async (path) => {
			const f = app.vault.getAbstractFileByPath(path);
			if (!f || !('extension' in (f as Record<string, unknown>))) return null;
			return app.vault.read(f as TFile);
		},
		findFileByPath: (path) => {
			const f = app.vault.getAbstractFileByPath(path);
			return f && 'extension' in (f as Record<string, unknown>) ? (f as TFile) : null;
		},
		getActiveFilePath: () => app.workspace.getActiveFile()?.path ?? null,

		enableDevTools,
		isMockEnv,
		autoSaveEnabled: search.aiAnalysisAutoSaveEnabled ?? true,
		autoSaveFolder: search.aiAnalysisAutoSaveFolder?.trim() || 'ChatFolder/AI-Analysis',
		analysisHistoryPageSize: search.aiAnalysisHistoryLimit ?? 20,
		indexLevel: search.indexLevel,
		searchUpgradePromptDismissedAt: search.searchUpgradePromptDismissedAt,

		setSearchUpgradePromptDismissed: async () => {
			search.searchUpgradePromptDismissedAt = Date.now();
			await plugin.saveSettings();
		},
		openObsidianSettings: () => {
			(app as any).setting?.open?.();
		},

		aiAnalysisHistory: aiAnalysisHistoryService,
		quickSearchRuntime: appContext.runtimeRegistry.tryGetQuickSearchBackgroundRuntime(),

		createSynthesizeAgent: () => new SynthesizeAgent(manager),
		createAIGraphAgent: () => new AIGraphAgent(app, searchClient!, manager),
		createVaultSearchAgent: () => new VaultSearchAgent(app, plugin.manifest.id, searchClient!, manager),
		createContinueAnalysisAgent: (rounds) => new ContinueAnalysisAgent({
			app,
			pluginId: plugin.manifest.id,
			searchClient: searchClient!,
			aiServiceManager: manager,
			rounds: rounds as never,
		}),
		createGraphAgent: () => new GraphAgent(app, plugin.manifest.id),
		createContextProvider: () => new ContextProvider(app),
		createReportOrchestrator: () => new ReportOrchestrator(
			manager,
			reportSessionPort,
			app,
			plugin.manifest.id,
		),

		saveAnalysisToVault: (params) => saveAiAnalyzeResultToMarkdown(params, { app, enableDevTools }),
		persistAnalysisDoc: (path, content) => persistAnalysisDocToPath(path, content, { app }),
		saveGraphToVault: (params) => saveAiGraphToMarkdown(params, { app }),
		buildAnalysisMarkdownFromSnapshot: (snapshot, query, webEnabled) =>
			buildAiAnalyzeMarkdownFromSnapshot(snapshot, query, webEnabled, { enableDevTools }),

		createConvFromAnalysis: (payload) => manager.createConvFromSearchAIAnalysis(payload),

		getAnalysisMarkdownForReplay: async (path) => {
			const svc = aiAnalysisHistoryService as unknown as {
				getMarkdownForReplay?: (p: string) => Promise<string | null>;
			};
			if (typeof svc.getMarkdownForReplay === 'function') {
				return svc.getMarkdownForReplay(path);
			}
			return null;
		},
	};
}
