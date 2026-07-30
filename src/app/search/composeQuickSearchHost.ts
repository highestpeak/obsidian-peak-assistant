// T11P (Track D): Compose the Quick-Search host bundle in the app layer
// so `useQuickSearchHost()` becomes a thin context read instead of a hook
// that closes over raw `app` / `plugin`. Mirrors the same surface
// (file/path ops, settings flags, agent factories, markdown helpers,
// chat interop) but builds it once at mount time from `AppContext`.

import { TFile } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
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
import { getAIAnalysisFolder } from '@/core/config/folderPaths';
import { composeFileAtlasHost } from '@/app/file-atlas/composeFileAtlasHost';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import {
	buildAIGraphChangeSet,
	generatedLensGraphToCreateRequest,
} from '@/service/ai-graph';
import { createAIInstructionSubmission } from '@/core/instruction-composer';
import { hashSHA256 } from '@/core/utils/hash-utils';

export function composeQuickSearchHost(
	appContext: AppContext,
	reportSessionPort: ReportSessionPort,
): QuickSearchHost {
	const { app, manager, plugin, searchClient, aiAnalysisHistoryService, isMockEnv } = appContext;
	const settings = appContext.settings;
	const enableDevTools = settings.enableDevTools === true;
	const search = settings.search;

	// Closure-owned handle to the most recent ReportOrchestrator so
	// saveAnalysisToVault can attach an artifact.write span to a still-open
	// debug run. The report flow owns final sealing after generation and
	// milestone persistence; an export must never commit a partial trace.
	let lastOrchestrator: ReportOrchestrator | null = null;
	const fileAtlasHost = composeFileAtlasHost(appContext);

	return {
		openVaultPath: async (path, opts) => {
			const leaf = opts?.newLeaf ?? 'tab';
			if (await appContext.vaultNavigation.openVaultPath(path, { newLeaf: leaf as any })) return;
			const sourcePath = app.workspace.getActiveFile()?.path ?? '';
			await app.workspace.openLinkText(path, sourcePath, leaf as any);
		},
		readVaultFileText: async (path) => {
			const f = app.vault.getAbstractFileByPath(path);
			if (!(f instanceof TFile)) return null;
			return app.vault.read(f);
		},
		findFileByPath: (path) => {
			const f = app.vault.getAbstractFileByPath(path);
			return f instanceof TFile ? f : null;
		},
		getActiveFilePath: () => app.workspace.getActiveFile()?.path ?? null,

		enableDevTools,
		isMockEnv,
		autoSaveEnabled: search.aiAnalysisAutoSaveEnabled ?? true,
		autoSaveFolder: search.aiAnalysisAutoSaveFolder?.trim() || getAIAnalysisFolder(settings.ai.rootFolder),
		analysisHistoryPageSize: search.aiAnalysisHistoryLimit ?? 20,
		indexLevel: search.indexLevel,
		searchUpgradePromptDismissedAt: search.searchUpgradePromptDismissedAt ?? undefined,

		setSearchUpgradePromptDismissed: async () => {
			search.searchUpgradePromptDismissedAt = Date.now();
			await plugin.saveSettings();
		},
		openObsidianSettings: () => {
			(app as any).setting?.open?.();
		},

		aiAnalysisHistory: aiAnalysisHistoryService,
		quickSearchRuntime: appContext.runtimeRegistry.tryGetQuickSearchBackgroundRuntime(),
		aiGraphArtifacts: appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime(),

		createSynthesizeAgent: () => new SynthesizeAgent(manager),
		createAIGraphAgent: () => new AIGraphAgent(app, searchClient!, manager),
		createVaultSearchAgent: () => new VaultSearchAgent(app, plugin.manifest.id, searchClient!, manager, {}, AppContext.tryGetDebugTracePort()),
		createContinueAnalysisAgent: (_rounds) => new ContinueAnalysisAgent({
			app,
			pluginId: plugin.manifest.id,
			searchClient: searchClient!,
			aiServiceManager: manager,
		}),
		createGraphAgent: () => new GraphAgent(app, plugin.manifest.id),
		createContextProvider: () => new ContextProvider(app),
		// Debug trace plumbing: remember the most recently constructed
		// orchestrator so explicit Markdown export can attach an artifact span.
		// Final sealing remains with useSearchSession.handleApprovePlan.
		createReportOrchestrator: () => {
			const orch = new ReportOrchestrator(
				manager,
				reportSessionPort,
				app,
				plugin.manifest.id,
				AppContext.tryGetDebugTracePort(),
			);
			lastOrchestrator = orch;
			return orch;
		},
		buildSourceVaultGraph: async (paths, scope) => {
			const uniquePaths = [...new Set(paths.filter(Boolean))];
			if (uniquePaths.length === 0 || !fileAtlasHost.loadNeighborhood) {
				return { resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0 };
			}
			const hops = scope === 'two-hop' ? 2 : 1;
			const neighborhoods = await Promise.all(
				uniquePaths.map((path) => fileAtlasHost.loadNeighborhood!(path, { hops, semantic: true })),
			);
			const sourceSet = new Set(uniquePaths);
			const nodes = new Map<string, {
				id: string;
				path: string;
				title: string;
				score: number;
				communityId: null;
				folder: string;
			}>();
			const edges = new Map<string, {
				from: string;
				to: string;
				kind: 'reference' | 'semantic';
			}>();

			for (const graph of neighborhoods) {
				for (const node of graph.nodes) {
					const path = node.path ?? node.id;
					if (scope === 'evidence' && !sourceSet.has(path)) continue;
					const score = sourceSet.has(path) ? 1 : node.hop === 1 ? 0.6 : 0.3;
					nodes.set(node.id, {
						id: node.id,
						path,
						title: node.label,
						score,
						communityId: null,
						folder: path.split('/')[0] ?? '',
					});
				}
				for (const edge of graph.edges) {
					if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
					const key = `${edge.from}|${edge.to}|${edge.kind}`;
					edges.set(key, { from: edge.from, to: edge.to, kind: edge.kind });
				}
			}

			const connected = new Set<string>();
			for (const edge of edges.values()) {
				connected.add(edge.from);
				connected.add(edge.to);
			}
			return {
				resultNodes: [...nodes.values()],
				hubAnchors: [],
				edges: [...edges.values()],
				isolatedDocIds: [...nodes.keys()].filter((id) => !connected.has(id)),
				overflowCount: 0,
			} satisfies ResultSubgraphOutput;
		},
		persistGeneratedAIGraph: async (request) => {
			const runtime = appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime();
			if (!runtime) return null;
			const sources = await Promise.all(request.sources.map(async (source) => {
				if (source.kind !== 'vault-file') return source;
				const file = app.vault.getAbstractFileByPath(source.locator);
				if (!(file instanceof TFile)) {
					return { ...source, freshness: 'unavailable' as const };
				}
				const content = await app.vault.cachedRead(file);
				return {
					...source,
					contentHash: hashSHA256(content),
					freshness: 'current' as const,
				};
			}));
			const view = await runtime.create({ ...request, sources });
			return {
				graphId: view.manifest.graphId,
				versionId: view.version.versionId,
			};
		},
		listAIGraphArtifacts: async () => {
			return appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime()?.list() ?? [];
		},
		openAIGraphArtifact: async (graphId, versionId) => {
			return appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime()?.open(graphId, versionId) ?? null;
		},
		listAIGraphVersions: async (graphId) => {
			return appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime()?.listVersions(graphId) ?? [];
		},
		addActiveFileToAIGraphSources: async (graphId) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const current = await runtime.open(graphId);
			if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
			const file = app.workspace.getActiveFile();
			if (!file) throw new Error('Open a Vault file before adding it as a source.');
			if (current.sources.some((source) =>
				source.kind === 'vault-file' && source.locator === file.path)) return current;
			const content = await app.vault.cachedRead(file);
			return runtime.replaceSources(graphId, [
				...current.sources,
				{
					sourceId: `source-${hashSHA256(`vault:${file.path}`).slice(0, 20)}`,
					kind: 'vault-file',
					title: file.basename,
					locator: file.path,
					contentHash: hashSHA256(content),
					capturedAt: Date.now(),
					freshness: 'current',
				},
			]);
		},
		removeAIGraphSource: async (graphId, sourceId) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const current = await runtime.open(graphId);
			if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
			return runtime.replaceSources(
				graphId,
				current.sources.filter((source) => source.sourceId !== sourceId),
			);
		},
		proposeAIGraphUpdate: async (graphId, baseVersionId, instruction, selection) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const current = await runtime.open(graphId, baseVersionId);
			if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
			const agent = new AIGraphAgent(app, searchClient!, manager);
			let generated = null;
			const contextualInstruction = [
				`Update the existing AI Graph "${current.manifest.title}".`,
				instruction,
				'Return the complete revised graph while preserving valid existing concepts and relations.',
			].join('\n');
			for await (const event of agent.startSession(contextualInstruction)) {
				if (event.type === 'ui-signal' && (event as any).channel === 'ai-graph-data') {
					generated = (event as any).data.graphData;
				}
			}
			if (!generated) throw new Error('AI Graph update generation returned no graph data.');
			const proposed = generatedLensGraphToCreateRequest({
				title: current.manifest.title,
				query: instruction,
				graphData: generated,
				selectedPaths: current.sources
					.filter((source) => source.kind === 'vault-file')
					.map((source) => source.locator),
			});
			return runtime.proposeUpdate({
				surface: 'ai-graph',
				capabilityId: 'ai-graph.update',
				submission: createAIInstructionSubmission(instruction),
				surfaceContext: {
					graphId,
					baseVersionId,
					...(selection ? { selection } : {}),
					sourceIds: current.version.sourceIds,
					lens: current.manifest.defaultLens,
					reviewContext: [
						`${current.version.stats.needsReviewCount} items need review`,
						`${current.sources.filter((source) => source.freshness === 'changed').length} sources changed`,
					],
				},
			}, buildAIGraphChangeSet(current.version, {
				nodes: proposed.nodes,
				relations: proposed.relations,
				evidence: proposed.evidence,
				sourceIds: current.version.sourceIds,
			}));
		},
		acceptAIGraphUpdate: async (diff) => {
			return appContext.runtimeRegistry.getAIGraphArtifactRuntime().acceptUpdate(diff);
		},

		saveAnalysisToVault: async (params) => {
			const result = await saveAiAnalyzeResultToMarkdown(params, { app, enableDevTools });
			const debugRun = lastOrchestrator?.getActiveDebugRun();
			if (debugRun) {
				// Import lazily so a debug-trace-off boot doesn't pay for the
				// helper module.
				const { recordAnalysisArtifact } = await import(
					'@/service/agents/report/debugTraceAdapter'
				);
				recordAnalysisArtifact(debugRun, {
					path: result.path,
					kind: 'report',
				});
			}
			return result;
		},
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
