// T11M: Composed host hook for the Quick Search modal. Wraps
// `useServiceContext()` and exposes a quick-search-specific surface so the
// 15 hooks/components/callbacks under `src/ui/view/quick-search/` never
// reach for `AppContext.getInstance()`.
//
// Codex correction: the host exposes **named operations**
// (`readVaultFileText`, `openVaultPath`, `saveAnalysisToVault`,
// `createSearchAgent`, ...), not raw `obsidianApp` / `vault` / `workspace`.
// That keeps the dependency reduction real instead of cosmetic — UI never
// sees Obsidian primitives, the adapter does.
//
// Quick-search-specific accessors live HERE, not on `useServiceContext()`,
// so the shared context does not bloat into a god-bag.

import { useMemo } from 'react';
import type { TFile } from 'obsidian';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';
import { ContextProvider } from '@/service/context/ContextProvider';
import { DocSimpleAgent } from '@/service/agents/DocSimpleAgent';
import { AIGraphAgent } from '@/service/agents/AIGraphAgent';
import { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import { SynthesizeAgent } from '@/service/agents/SynthesizeAgent';
import { ContinueAnalysisAgent } from '@/service/agents/ContinueAnalysisAgent';
import { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import {
	saveAiAnalyzeResultToMarkdown,
	persistAnalysisDocToPath,
	saveAiGraphToMarkdown,
	buildAiAnalyzeMarkdownFromSnapshot,
	type SaveAnalysisResultParams,
} from '../callbacks/save-ai-analyze-to-md';
import type { CompletedAnalysisSnapshot } from '../store/aiAnalysisStore';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

export interface QuickSearchHost {
	// File / path operations
	openVaultPath(path: string, opts?: { newLeaf?: boolean | 'tab' | 'window' }): Promise<void>;
	readVaultFileText(path: string): Promise<string | null>;
	findFileByPath(path: string): TFile | null;
	getActiveFilePath(): string | null;

	// Settings-derived flags (computed at hook call time, NOT raw settings tree)
	enableDevTools: boolean;
	isMockEnv: boolean;
	autoSaveEnabled: boolean;
	autoSaveFolder: string;
	analysisHistoryPageSize: number;
	indexLevel: string | undefined;
	searchUpgradePromptDismissedAt: number | undefined;

	// Settings persistence (Quick-Search only mutates two keys today)
	setSearchUpgradePromptDismissed(): Promise<void>;
	openObsidianSettings(): void;

	// Services
	aiAnalysisHistory: AIAnalysisHistoryService;
	quickSearchRuntime: QuickSearchBackgroundRuntime | null;

	// Agent factories — UI never `new`s an agent with raw {app, manager}
	createSynthesizeAgent(): SynthesizeAgent;
	createAIGraphAgent(): AIGraphAgent;
	createVaultSearchAgent(): VaultSearchAgent;
	createDocSimpleAgent(): DocSimpleAgent;
	createContinueAnalysisAgent(rounds: unknown[]): ContinueAnalysisAgent;
	createContextProvider(): ContextProvider;

	// Markdown save / persist
	saveAnalysisToVault(params: SaveAnalysisResultParams): Promise<{ path: string }>;
	persistAnalysisDoc(path: string, content: string): Promise<void>;
	saveGraphToVault(params: {
		folderPath: string;
		fileName: string;
		query: string;
		summary: string;
		graphData: LensGraphData;
		lensHint?: string;
	}): Promise<{ path: string }>;
	buildAnalysisMarkdownFromSnapshot(snapshot: CompletedAnalysisSnapshot, query: string, webEnabled: boolean): string;

	// Chat <-> Analysis interop
	createConvFromAnalysis(payload: Parameters<ReturnType<typeof AppContext.getManager>['createConvFromSearchAIAnalysis']>[0]): Promise<unknown>;

	// History replay duck-type accessor
	getAnalysisMarkdownForReplay(path: string): Promise<string | null>;
}

export function useQuickSearchHost(): QuickSearchHost {
	const { app, manager, plugin, settings, searchClient } = useServiceContext();

	return useMemo<QuickSearchHost>(() => {
		const enableDevTools = settings.enableDevTools === true;
		const search = settings.search;
		const aiAnalysisHistory = AppContext.getAIAnalysisHistoryService();
		const quickSearchRuntime = AppContext.tryGetQuickSearchBackgroundRuntime();

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
			isMockEnv: AppContext.getInstance().isMockEnv,
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

			aiAnalysisHistory,
			quickSearchRuntime,

			createSynthesizeAgent: () => new SynthesizeAgent(manager),
			createAIGraphAgent: () => new AIGraphAgent(app, searchClient!, manager),
			createVaultSearchAgent: () => new VaultSearchAgent(app, plugin.manifest.id, searchClient!, manager),
			createDocSimpleAgent: () => AppContext.searchAgent(),
			createContinueAnalysisAgent: (rounds) => new ContinueAnalysisAgent({
				app,
				pluginId: plugin.manifest.id,
				searchClient: searchClient!,
				aiServiceManager: manager,
				rounds: rounds as never,
			}),
			createContextProvider: () => new ContextProvider(app),

			saveAnalysisToVault: (params) => saveAiAnalyzeResultToMarkdown(params, { app, enableDevTools }),
			persistAnalysisDoc: (path, content) => persistAnalysisDocToPath(path, content, { app }),
			saveGraphToVault: (params) => saveAiGraphToMarkdown(params, { app }),
			buildAnalysisMarkdownFromSnapshot: (snapshot, query, webEnabled) =>
				buildAiAnalyzeMarkdownFromSnapshot(snapshot, query, webEnabled, { enableDevTools }),

			createConvFromAnalysis: (payload) => manager.createConvFromSearchAIAnalysis(payload),

			getAnalysisMarkdownForReplay: async (path) => {
				const svc = aiAnalysisHistory as unknown as {
					getMarkdownForReplay?: (p: string) => Promise<string | null>;
				};
				if (typeof svc.getMarkdownForReplay === 'function') {
					return svc.getMarkdownForReplay(path);
				}
				return null;
			},
		};
	}, [app, manager, plugin, settings, searchClient]);
}
