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
// T11P (Track D): the host bundle is now composed in the app layer
// (`src/app/search/composeQuickSearchHost.ts`) and published on
// `ServiceContext.quickSearchHost`. UI calls this hook to read the bundle;
// the hook itself no longer captures `app`/`plugin` or builds the host.

import type { TFile } from 'obsidian';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { ContextProvider } from '@/service/context/ContextProvider';
import type { AIGraphAgent } from '@/service/agents/AIGraphAgent';
import type { VaultSearchAgent } from '@/service/agents/VaultSearchAgent';
import type { SynthesizeAgent } from '@/service/agents/SynthesizeAgent';
import type { ContinueAnalysisAgent } from '@/service/agents/ContinueAnalysisAgent';
import type { GraphAgent } from '@/service/agents/ai-graph/GraphAgent';
import type { ReportOrchestrator } from '@/service/agents/report/ReportOrchestrator';
import type { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import type { SaveAnalysisResultParams } from '../callbacks/save-ai-analyze-to-md';
import type { CompletedAnalysisSnapshot } from '../store/aiAnalysisStore';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import type {
	AIGraphArtifactRuntime,
	AIGraphArtifactView,
	AIGraphHistoryRow,
	AIGraphOriginContextRef,
	AIGraphSemanticDiff,
	AIGraphSource,
	AIGraphVersion,
	AIGraphVersionComparison,
	CreateAIGraphRequest,
} from '@/service/ai-graph';

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
	aiGraphArtifacts: AIGraphArtifactRuntime | null;

	// Agent factories — UI never `new`s an agent with raw {app, manager}
	createSynthesizeAgent(): SynthesizeAgent;
	createAIGraphAgent(): AIGraphAgent;
	createVaultSearchAgent(): VaultSearchAgent;
	createContinueAnalysisAgent(rounds: unknown[]): ContinueAnalysisAgent;
	/** T11P review-fix: SDK-style GraphAgent factory, replacing the dynamic AppContext import previously used in `useGraphAgent`. */
	createGraphAgent(): GraphAgent;
	createContextProvider(): ContextProvider;
	/** T11P: report orchestrator factory, replacing inline `new ReportOrchestrator(plugin.aiServiceManager, _, app, _)` in `useSearchSession`. */
	createReportOrchestrator(): ReportOrchestrator;
	/** Deterministic Vault relation graph for the cited evidence set and optional neighborhood expansion. */
	buildSourceVaultGraph(
		paths: string[],
		scope: 'evidence' | 'one-hop' | 'two-hop',
	): Promise<ResultSubgraphOutput>;
	resolveAIGraphSourceContents(
		sources: readonly AIGraphSource[],
	): Promise<Array<{ locator: string; content: string }>>;
	persistGeneratedAIGraph(request: CreateAIGraphRequest): Promise<{ graphId: string; versionId: string } | null>;
	listAIGraphArtifacts(): Promise<AIGraphHistoryRow[]>;
	openAIGraphArtifact(graphId: string, versionId?: string): Promise<AIGraphArtifactView | null>;
	peekAIGraphArtifact(graphId: string, versionId?: string): Promise<AIGraphArtifactView | null>;
	listAIGraphVersions(graphId: string): Promise<AIGraphVersion[]>;
	addActiveFileToAIGraphSources(graphId: string): Promise<AIGraphArtifactView>;
	addAIGraphSource(
		graphId: string,
		input:
			| { kind: 'web-page'; title: string; url: string }
			| { kind: 'manual-text'; title: string; text: string }
			| { kind: 'ai-graph-version'; title: string; graphId: string; versionId: string },
	): Promise<AIGraphArtifactView>;
	removeAIGraphSource(graphId: string, sourceId: string): Promise<AIGraphArtifactView>;
	recheckAIGraphSource(graphId: string, sourceId: string): Promise<AIGraphArtifactView>;
	openAIGraphEvidence(graphId: string, versionId: string, evidenceId: string): Promise<void>;
	openAIGraphOrigin(contextRef: AIGraphOriginContextRef): Promise<void>;
	proposeAIGraphUpdate(
		graphId: string,
		baseVersionId: string,
		instruction: string,
		selection?: { kind: 'node' | 'relation'; id: string },
	): Promise<AIGraphSemanticDiff>;
	acceptAIGraphUpdate(diff: AIGraphSemanticDiff): Promise<AIGraphArtifactView>;
	compareAIGraphVersions(
		graphId: string,
		fromVersionId: string,
		toVersionId: string,
	): Promise<AIGraphVersionComparison>;
	restoreAIGraphVersion(graphId: string, versionId: string): Promise<AIGraphArtifactView>;
	duplicateAIGraphVersion(graphId: string, versionId: string): Promise<AIGraphArtifactView>;
	reviewAIGraphRelation(
		graphId: string,
		baseVersionId: string,
		relationId: string,
		review: {
			status: 'accepted' | 'edited' | 'rejected';
			predicate?: string;
			label?: string;
			confidence?: number | null;
			directed?: boolean;
		},
	): Promise<AIGraphArtifactView>;
	exportAIGraphMarkdown(graphId: string, versionId: string): Promise<string>;
	rebuildAIGraphProjection(): Promise<AIGraphHistoryRow[]>;

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
	createConvFromAnalysis(payload: Parameters<AIServiceManager['createConvFromSearchAIAnalysis']>[0]): Promise<unknown>;

	// History replay duck-type accessor
	getAnalysisMarkdownForReplay(path: string): Promise<string | null>;
}

export function useQuickSearchHost(): QuickSearchHost {
	return useServiceContext().quickSearchHost;
}
