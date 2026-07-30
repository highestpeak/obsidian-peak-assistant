// T11P (Track D): Compose the Quick-Search host bundle in the app layer
// so `useQuickSearchHost()` becomes a thin context read instead of a hook
// that closes over raw `app` / `plugin`. Mirrors the same surface
// (file/path ops, settings flags, agent factories, markdown helpers,
// chat interop) but builds it once at mount time from `AppContext`.

import { Notice, TFile } from 'obsidian';
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
	isActiveAIGraphSource,
	requestsSelectedAIGraphRemoval,
	stableAIGraphId,
	type AIGraphArtifactView,
	type AIGraphEvidenceRef,
	type AIGraphNode,
	type AIGraphRelation,
} from '@/service/ai-graph';
import { createAIInstructionSubmission } from '@/core/instruction-composer';
import { hashSHA256 } from '@/core/utils/hash-utils';
import { obsidianFetch } from '@/app/platform/ObsidianFetchAdapter';
import { openAssistant, openQuickSearch } from '@/app/commands/PeakCommandActions';

function mergeCandidateNodes(
	current: readonly AIGraphNode[],
	candidate: readonly AIGraphNode[],
	removeNodeId?: string,
): AIGraphNode[] {
	const currentById = new Map(current.map((node) => [node.nodeId, node]));
	const merged = candidate.map((node) => {
		const previous = currentById.get(node.nodeId);
		if (!previous) return node;
		const next = {
			...previous,
			...node,
			evidenceIds: [...new Set([...previous.evidenceIds, ...node.evidenceIds])],
		};
		const semantic = (value: AIGraphNode) => ({
			kind: value.kind,
			label: value.label,
			aliases: value.aliases,
			description: value.description,
			canonicalRef: value.canonicalRef,
			properties: value.properties,
			evidenceIds: value.evidenceIds,
		});
		return JSON.stringify(semantic(previous)) === JSON.stringify(semantic(next))
			? previous
			: { ...next, reviewStatus: 'suggested' as const };
	});
	const candidateIds = new Set(candidate.map((node) => node.nodeId));
	return [
		...merged,
		...current.filter((node) =>
			!candidateIds.has(node.nodeId) && node.nodeId !== removeNodeId),
	];
}

function mergeCandidateRelations(
	current: readonly AIGraphRelation[],
	candidate: readonly AIGraphRelation[],
	removeRelationId?: string,
): AIGraphRelation[] {
	const currentById = new Map(current.map((relation) => [relation.relationId, relation]));
	const merged = candidate.map((relation) => {
		const previous = currentById.get(relation.relationId);
		if (!previous) return relation;
		const next = {
			...previous,
			...relation,
			evidenceIds: [...new Set([...previous.evidenceIds, ...relation.evidenceIds])],
			qualifiers: relation.qualifiers.length > 0
				? relation.qualifiers
				: previous.qualifiers,
		};
		const semantic = (value: AIGraphRelation) => ({
			sourceNodeId: value.sourceNodeId,
			targetNodeId: value.targetNodeId,
			family: value.family,
			predicate: value.predicate,
			label: value.label,
			directed: value.directed,
			qualifiers: value.qualifiers,
			evidenceIds: value.evidenceIds,
			confidence: value.confidence,
			explanation: value.explanation,
		});
		return JSON.stringify(semantic(previous)) === JSON.stringify(semantic(next))
			? previous
			: { ...next, reviewStatus: 'suggested' as const };
	});
	const candidateIds = new Set(candidate.map((relation) => relation.relationId));
	return [
		...merged,
		...current.filter((relation) =>
			!candidateIds.has(relation.relationId)
			&& relation.relationId !== removeRelationId),
	];
}

function mergeCandidateEvidence(
	current: readonly AIGraphEvidenceRef[],
	candidate: readonly AIGraphEvidenceRef[],
): AIGraphEvidenceRef[] {
	return [...new Map(
		[...current, ...candidate].map((evidence) => [evidence.evidenceId, evidence]),
	).values()];
}

async function serializeAIGraphUpdateContext(
	view: AIGraphArtifactView,
	appContext: AppContext,
): Promise<string> {
	const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
	const { app } = appContext;
	const sources = await Promise.all(
		view.sources.filter(isActiveAIGraphSource).map(async (source) => {
			let content = '';
			if (source.kind === 'manual-text') {
				content = String(source.metadata?.content ?? '');
			} else if (source.kind === 'vault-file') {
				let file = app.vault.getAbstractFileByPath(source.locator);
				if (!(file instanceof TFile)) {
					const ctime = Number(source.metadata?.vaultCtime);
					file = Number.isFinite(ctime)
						? app.vault.getFiles().find((candidate) => candidate.stat.ctime === ctime) ?? null
						: null;
				}
				if (file instanceof TFile) content = await app.vault.cachedRead(file);
			} else if (source.kind === 'web-page') {
				try {
					const response = await obsidianFetch(source.locator, { method: 'GET' });
					if (response.ok) content = await response.text();
				} catch {
					content = '';
				}
			} else if (source.kind === 'ai-graph-version') {
				const graphId = String(source.metadata?.graphId ?? '');
				const versionId = String(source.metadata?.versionId ?? '');
				const referenced = graphId && versionId
					? await runtime.peek(graphId, versionId)
					: null;
				if (referenced) content = JSON.stringify(referenced.version);
			}
			return {
				sourceId: source.sourceId,
				kind: source.kind,
				title: source.title,
				locator: source.locator,
				freshness: source.freshness,
				...(content ? { content: content.slice(0, 6_000) } : {}),
			};
		}),
	);
	return JSON.stringify({
		graph: {
			graphId: view.manifest.graphId,
			graphType: view.manifest.graphType,
			versionId: view.version.versionId,
			nodes: view.version.nodes,
			relations: view.version.relations,
			evidence: view.version.evidence,
		},
		sources,
	});
}

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
		resolveAIGraphSourceContents: async (sources) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const resolved = await Promise.all(sources.map(async (source) => {
				if (source.kind === 'manual-text') {
					return {
						locator: source.locator,
						content: String(source.metadata?.content ?? ''),
					};
				}
				if (source.kind === 'web-page') {
					try {
						const response = await obsidianFetch(source.locator, { method: 'GET' });
						return {
							locator: source.locator,
							content: response.ok ? await response.text() : '',
						};
					} catch {
						return { locator: source.locator, content: '' };
					}
				}
				if (source.kind === 'ai-graph-version') {
					const graphId = String(source.metadata?.graphId ?? '');
					const versionId = String(source.metadata?.versionId ?? '');
					const referenced = graphId && versionId
						? await runtime.peek(graphId, versionId)
						: null;
					return {
						locator: source.locator,
						content: referenced ? JSON.stringify(referenced.version) : '',
					};
				}
				return { locator: source.locator, content: '' };
			}));
			return resolved.filter((source) => source.content);
		},
			persistGeneratedAIGraph: async (request) => {
				const runtime = appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime();
				if (!runtime) return null;
				const remappedSourceIds = new Map<string, string>();
				const sources = await Promise.all(request.sources.map(async (source) => {
					if (source.kind === 'manual-text') {
						const content = String(source.metadata?.content ?? '');
						return {
							...source,
							contentHash: content ? hashSHA256(content) : source.contentHash,
							freshness: content ? 'current' as const : 'unavailable' as const,
						};
					}
					if (source.kind === 'ai-graph-version') {
						const graphId = String(source.metadata?.graphId ?? '');
						const versionId = String(source.metadata?.versionId ?? '');
						const referenced = graphId && versionId
							? await runtime.peek(graphId, versionId)
							: null;
						return {
							...source,
							contentHash: referenced
								? hashSHA256(JSON.stringify(referenced.version))
								: source.contentHash,
							freshness: referenced ? 'current' as const : 'unavailable' as const,
						};
					}
					if (source.kind === 'web-page') {
						try {
							const response = await obsidianFetch(source.locator, { method: 'GET' });
							if (!response.ok) throw new Error(`HTTP ${response.status}`);
							const contentHash = hashSHA256(await response.text());
							return {
								...source,
								contentHash,
								capturedAt: Date.now(),
								freshness: 'current' as const,
								metadata: {
									...source.metadata,
									canonicalUrl: source.locator,
									fetchedAt: Date.now(),
									captureStatus: 'fetched',
								},
							};
						} catch {
							return {
								...source,
								freshness: 'unavailable' as const,
								metadata: {
									...source.metadata,
									canonicalUrl: source.locator,
									captureStatus: 'fetch-failed',
								},
							};
						}
					}
					if (source.kind !== 'vault-file') return source;
					const file = app.vault.getAbstractFileByPath(source.locator);
				if (!(file instanceof TFile)) {
					return { ...source, freshness: 'unavailable' as const };
				}
					const content = await app.vault.cachedRead(file);
					const nextSourceId = stableAIGraphId('source', `vault-file:${file.stat.ctime}`);
					remappedSourceIds.set(source.sourceId, nextSourceId);
					return {
						...source,
						sourceId: nextSourceId,
					contentHash: hashSHA256(content),
					freshness: 'current' as const,
					active: true,
					metadata: {
						...source.metadata,
						vaultCtime: file.stat.ctime,
						capturedPath: file.path,
					},
					};
				}));
				const evidence = request.evidence.map((item) => ({
					...item,
					sourceId: remappedSourceIds.get(item.sourceId) ?? item.sourceId,
					sourceContentHash: sources.find((source) =>
						source.sourceId === (remappedSourceIds.get(item.sourceId) ?? item.sourceId))
						?.contentHash ?? item.sourceContentHash,
				}));
				const view = await runtime.create({ ...request, sources, evidence });
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
			peekAIGraphArtifact: async (graphId, versionId) => {
				return appContext.runtimeRegistry.tryGetAIGraphArtifactRuntime()?.peek(graphId, versionId) ?? null;
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
				isActiveAIGraphSource(source)
				&& source.kind === 'vault-file'
				&& source.locator === file.path)) return current;
			const content = await app.vault.cachedRead(file);
			return runtime.addSources(graphId, [
				{
					sourceId: stableAIGraphId('source', `vault-file:${file.stat.ctime}`),
					kind: 'vault-file',
					title: file.basename,
					locator: file.path,
					contentHash: hashSHA256(content),
					capturedAt: Date.now(),
					freshness: 'current',
					active: true,
					metadata: {
						vaultCtime: file.stat.ctime,
						capturedPath: file.path,
					},
				},
			]);
		},
		addAIGraphSource: async (graphId, input) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const capturedAt = Date.now();
			if (input.kind === 'web-page') {
				const url = new URL(input.url.trim());
				if (url.protocol !== 'http:' && url.protocol !== 'https:') {
					throw new Error('Web sources must use http or https.');
				}
				return runtime.addSources(graphId, [{
					sourceId: stableAIGraphId('source', `web:${url.toString()}`),
					kind: 'web-page',
					title: input.title.trim() || url.hostname,
					locator: url.toString(),
					contentHash: null,
					capturedAt,
					freshness: 'unknown',
					active: true,
					metadata: {
						canonicalUrl: url.toString(),
						captureStatus: 'user-added-unchecked',
					},
				}]);
			}
			if (input.kind === 'manual-text') {
				const text = input.text.trim();
				if (!text) throw new Error('Manual text source cannot be empty.');
				const contentHash = hashSHA256(text);
				return runtime.addSources(graphId, [{
					sourceId: stableAIGraphId('source', `manual:${contentHash}`),
					kind: 'manual-text',
					title: input.title.trim() || 'Pasted text',
					locator: `manual://${contentHash.slice(0, 24)}`,
					contentHash,
					capturedAt,
					freshness: 'current',
					active: true,
					metadata: { content: text },
				}]);
			}
			const referenced = await runtime.open(input.graphId, input.versionId);
			if (!referenced) throw new Error('Referenced AI Graph version does not exist.');
			const locator = `aigraph://${input.graphId}/${input.versionId}`;
			return runtime.addSources(graphId, [{
				sourceId: stableAIGraphId('source', locator),
				kind: 'ai-graph-version',
				title: input.title.trim() || referenced.manifest.title,
				locator,
				contentHash: hashSHA256(JSON.stringify(referenced.version)),
				capturedAt,
				freshness: 'current',
				active: true,
				metadata: {
					graphId: input.graphId,
					versionId: input.versionId,
				},
			}]);
		},
		removeAIGraphSource: async (graphId, sourceId) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			return runtime.deactivateSource(graphId, sourceId);
		},
		recheckAIGraphSource: async (graphId, sourceId) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const current = await runtime.open(graphId);
			if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
			const source = current.sources.find((candidate) => candidate.sourceId === sourceId);
			if (!source) throw new Error('AI Graph source does not exist.');
			let next = source;
			if (source.kind === 'vault-file') {
				let file = app.vault.getAbstractFileByPath(source.locator);
				if (!(file instanceof TFile)) {
					const ctime = Number(source.metadata?.vaultCtime);
					file = Number.isFinite(ctime)
						? app.vault.getFiles().find((candidate) => candidate.stat.ctime === ctime) ?? null
						: null;
				}
				if (file instanceof TFile) {
					const content = await app.vault.cachedRead(file);
					const contentHash = hashSHA256(content);
					next = {
						...source,
						title: file.basename,
						locator: file.path,
						contentHash,
						freshness: source.contentHash === null || source.contentHash === contentHash
							? 'current'
							: 'changed',
						metadata: {
							...source.metadata,
							vaultCtime: file.stat.ctime,
							lastCheckedAt: Date.now(),
						},
					};
				} else {
					next = { ...source, freshness: 'unavailable' };
				}
			} else if (source.kind === 'web-page') {
				try {
					const response = await obsidianFetch(source.locator, { method: 'GET' });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const contentHash = hashSHA256(await response.text());
					next = {
						...source,
						contentHash,
						freshness: source.contentHash === null || source.contentHash === contentHash
							? 'current'
							: 'changed',
						metadata: {
							...source.metadata,
							fetchedAt: Date.now(),
							captureStatus: 'fetched',
						},
					};
				} catch {
					next = { ...source, freshness: 'unavailable' };
				}
			} else if (source.kind === 'ai-graph-version') {
				const referencedGraphId = String(source.metadata?.graphId ?? '');
				const referencedVersionId = String(source.metadata?.versionId ?? '');
				const referenced = await runtime.open(referencedGraphId, referencedVersionId);
				const contentHash = referenced
					? hashSHA256(JSON.stringify(referenced.version))
					: null;
				next = {
					...source,
					...(contentHash ? { contentHash } : {}),
					freshness: !referenced
						? 'unavailable'
						: source.contentHash === null || source.contentHash === contentHash
							? 'current'
							: 'changed',
				};
			}
			return runtime.replaceSources(
				graphId,
				current.sources.map((candidate) => candidate.sourceId === sourceId ? next : candidate),
			);
		},
		openAIGraphEvidence: async (graphId, versionId, evidenceId) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const view = await runtime.open(graphId, versionId);
			const evidence = view?.version.evidence.find((candidate) => candidate.evidenceId === evidenceId);
			const source = view?.sources.find((candidate) => candidate.sourceId === evidence?.sourceId);
			if (!view || !evidence || !source) throw new Error('AI Graph evidence source is unavailable.');
			if (source.kind === 'web-page') {
				appContext.vaultNavigation.openExternalUrl(source.locator);
				return;
			}
			if (source.kind === 'vault-file' || source.kind === 'vault-block') {
				const line = evidence.selector.kind === 'vault-lines'
					? Math.max(0, evidence.selector.from - 1)
					: 0;
				await appContext.vaultNavigation.openVaultPathAtLine(source.locator, { line });
				return;
			}
				if (source.kind === 'ai-graph-version') {
					const linkedGraphId = String(source.metadata?.graphId ?? '');
					const linkedVersionId = String(source.metadata?.versionId ?? '');
					if (linkedGraphId) {
						openQuickSearch({
							aiMode: 'graph',
							graphId: linkedGraphId,
							...(linkedVersionId ? { graphVersionId: linkedVersionId } : {}),
						});
					}
					return;
				}
			const preview = evidence.quote
				?? String(source.metadata?.content ?? source.title);
			new Notice(preview.slice(0, 500), 8000);
		},
		openAIGraphOrigin: async (contextRef) => {
			if (
				contextRef.kind === 'vault-file'
				|| contextRef.kind === 'vault-selection'
				|| contextRef.kind === 'atlas-file'
				) {
					let path = contextRef.locator ?? contextRef.ref;
					const capturedCtime = contextRef.ref.startsWith('vault-file:')
						? Number(contextRef.ref.slice('vault-file:'.length))
						: Number.NaN;
					if (
						!(app.vault.getAbstractFileByPath(path) instanceof TFile)
						&& Number.isFinite(capturedCtime)
					) {
						path = app.vault.getFiles().find((file) =>
							file.stat.ctime === capturedCtime)?.path ?? path;
					}
					await appContext.vaultNavigation.openVaultPath(path, { newLeaf: 'tab' });
					return;
				}
			if (contextRef.kind === 'search-query') {
				openQuickSearch({ aiMode: 'search', initialQuery: contextRef.ref });
				return;
			}
			if (contextRef.kind === 'conversation' || contextRef.kind === 'project') {
				openAssistant();
				return;
			}
			new Notice(`Origin: ${contextRef.label}`);
		},
		proposeAIGraphUpdate: async (graphId, baseVersionId, instruction, selection) => {
			const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
			const current = await runtime.open(graphId, baseVersionId);
			if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
				const agent = new AIGraphAgent(app, searchClient!, manager);
				let generated = null;
				const activeVaultPaths = current.sources
					.filter((source) =>
						isActiveAIGraphSource(source) && source.kind === 'vault-file')
					.map((source) => source.locator);
				for await (const event of agent.startFromResolvedSources(
					instruction,
					activeVaultPaths,
					{
						graphType: current.manifest.graphType,
						currentGraph: await serializeAIGraphUpdateContext(current, appContext),
					},
				)) {
					if (event.type === 'ui-signal' && (event as any).channel === 'ai-graph-data') {
						generated = (event as any).data.graphData;
					}
			}
			if (!generated) throw new Error('AI Graph update generation returned no graph data.');
			const proposed = generatedLensGraphToCreateRequest({
				title: current.manifest.title,
				query: instruction,
					graphData: generated,
					selectedPaths: activeVaultPaths,
					resolvedSources: current.sources.filter(isActiveAIGraphSource),
					graphType: current.manifest.graphType,
				});
				const sourceIdByLocator = new Map(
					current.sources.map((source) => [source.locator, source]),
				);
				const proposedSourceById = new Map(
					proposed.sources.map((source) => [source.sourceId, source]),
				);
				const proposedEvidence = proposed.evidence.map((evidence) => {
					const proposedSource = proposedSourceById.get(evidence.sourceId);
					const canonicalSource = proposedSource
						? sourceIdByLocator.get(proposedSource.locator)
						: null;
					return canonicalSource
						? {
								...evidence,
								sourceId: canonicalSource.sourceId,
								sourceContentHash: canonicalSource.contentHash,
							}
						: evidence;
				});
				const removalRequested = Boolean(selection)
					&& requestsSelectedAIGraphRemoval(instruction);
				const nodes = mergeCandidateNodes(
					current.version.nodes,
					proposed.nodes,
					removalRequested && selection?.kind === 'node' ? selection.id : undefined,
				);
				const relations = mergeCandidateRelations(
					current.version.relations,
					proposed.relations.filter((relation) =>
						nodes.some((node) => node.nodeId === relation.sourceNodeId)
						&& nodes.some((node) => node.nodeId === relation.targetNodeId)),
					removalRequested && selection?.kind === 'relation' ? selection.id : undefined,
				).filter((relation) =>
					nodes.some((node) => node.nodeId === relation.sourceNodeId)
					&& nodes.some((node) => node.nodeId === relation.targetNodeId));
				return runtime.proposeUpdate({
				surface: 'ai-graph',
				capabilityId: 'ai-graph.update',
				submission: createAIInstructionSubmission(instruction),
				surfaceContext: {
					graphId,
					baseVersionId,
					...(selection ? { selection } : {}),
					sourceIds: current.sources
						.filter(isActiveAIGraphSource)
						.map((source) => source.sourceId),
					lens: current.manifest.defaultLens,
					reviewContext: [
						`${current.version.stats.needsReviewCount} items need review`,
						`${current.sources.filter((source) => source.freshness === 'changed').length} sources changed`,
					],
					updateFrom: {
						surface: 'ai-search',
						contextRefs: [{
							kind: 'search-query',
							ref: instruction,
							label: 'AI Graph Update',
						}],
					},
				},
				}, buildAIGraphChangeSet(current.version, {
					nodes,
					relations,
					evidence: mergeCandidateEvidence(current.version.evidence, proposedEvidence),
				sourceIds: current.sources
					.filter(isActiveAIGraphSource)
					.map((source) => source.sourceId),
			}));
		},
		acceptAIGraphUpdate: async (diff) => {
			return appContext.runtimeRegistry.getAIGraphArtifactRuntime().acceptUpdate(diff);
		},
		compareAIGraphVersions: async (graphId, fromVersionId, toVersionId) => {
			return appContext.runtimeRegistry.getAIGraphArtifactRuntime()
				.compareVersions(graphId, fromVersionId, toVersionId);
		},
		restoreAIGraphVersion: async (graphId, versionId) => {
			return appContext.runtimeRegistry.getAIGraphArtifactRuntime().restoreVersion(
				graphId,
				versionId,
				{
					surface: 'ai-search',
					contextRefs: [{
						kind: 'search-query',
						ref: `restore:${graphId}/${versionId}`,
						label: 'AI Graph version history',
					}],
				},
			);
		},
			duplicateAIGraphVersion: async (graphId, versionId) => {
				return appContext.runtimeRegistry.getAIGraphArtifactRuntime().duplicateVersion({
				graphId,
				versionId,
				createdFrom: {
					surface: 'ai-search',
					contextRefs: [{
						kind: 'search-query',
						ref: `duplicate:${graphId}/${versionId}`,
						label: 'AI Graph version history',
					}],
					},
				});
			},
			reviewAIGraphRelation: async (graphId, baseVersionId, relationId, review) => {
				const runtime = appContext.runtimeRegistry.getAIGraphArtifactRuntime();
				const current = await runtime.open(graphId, baseVersionId);
				if (!current) throw new Error(`AI Graph ${graphId} does not exist.`);
				if (current.manifest.headVersionId !== baseVersionId) {
					throw new Error('Relation review must start from the current head version.');
				}
				const relation = current.version.relations.find(
					(candidate) => candidate.relationId === relationId,
				);
				if (!relation) throw new Error('The selected relation no longer exists.');
				const touchesWeb = current.version.nodes.some((node) =>
					(node.nodeId === relation.sourceNodeId || node.nodeId === relation.targetNodeId)
					&& node.kind === 'web-resource');
				const hasCapturedWebEvidence = relation.evidenceIds.some((evidenceId) => {
					const evidence = current.version.evidence.find(
						(candidate) => candidate.evidenceId === evidenceId,
					);
					const source = current.sources.find(
						(candidate) => candidate.sourceId === evidence?.sourceId,
					);
					return source?.kind === 'web-page'
						&& source.freshness === 'current'
						&& source.contentHash !== null;
				});
				if (review.status !== 'rejected' && touchesWeb && !hasCapturedWebEvidence) {
					throw new Error(
						'Web relations require a fetched Web source and captured evidence before acceptance.',
					);
				}
				const after = {
					...relation,
					...(review.predicate?.trim() ? { predicate: review.predicate.trim() } : {}),
					...(review.label?.trim() ? { label: review.label.trim() } : {}),
					...(review.confidence !== undefined ? { confidence: review.confidence } : {}),
					...(review.directed !== undefined ? { directed: review.directed } : {}),
					reviewStatus: review.status,
					provenance: {
						...relation.provenance,
						origin: review.status === 'edited'
							? 'user' as const
							: relation.provenance.origin,
					},
				};
				const diff = await runtime.proposeUpdate({
					surface: 'ai-graph',
					capabilityId: 'ai-graph.relation-review',
					submission: createAIInstructionSubmission(
						`${review.status} relation ${relation.predicate}`,
					),
					surfaceContext: {
						graphId,
						baseVersionId,
						selection: { kind: 'relation', id: relationId },
						sourceIds: current.version.sourceIds,
						reviewContext: [`relation:${relationId}`],
						updateFrom: {
							surface: 'ai-search',
							contextRefs: [{
								kind: 'search-query',
								ref: `relation-review:${relationId}`,
								label: 'AI Graph relation review',
							}],
						},
					},
				}, {
					relations: {
						added: [],
						changed: [{ before: relation, after }],
						removed: [],
					},
				});
				return runtime.acceptUpdate(diff);
			},
			exportAIGraphMarkdown: async (graphId, versionId) => {
			return appContext.runtimeRegistry.getAIGraphArtifactRuntime()
				.exportMarkdown(graphId, versionId);
		},
		rebuildAIGraphProjection: async () => {
			return appContext.runtimeRegistry.getAIGraphArtifactRuntime().rebuildProjection();
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
