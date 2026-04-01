/**
 * Hub discovery orchestrator: snapshot prep, folder recon, document recon, SQL shortlist.
 * Recon memory is surfaced via {@link HubDiscoveryAgent.folderReconMemory} / {@link HubDiscoveryAgent.documentReconMemory}
 * (set by `onComplete` callbacks in hub-helper loops), not async generator return values.
 */

import { AppContext } from '@/app/context/AppContext';
import type { FolderIntuitionRoundOutput } from '@/core/schemas';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { computeHubDiscoverBudgets } from '@/service/search/index/helper/hub/hubDiscover';

/**
 * Soft hints for the LLM, derived from `limitTotal` (same scale as indexer hub budgets).
 * Not enforced by code; explains ambition and iteration breadth.
 */
function buildAgentPipelineBudgetLlmGuidance(limitTotal: number): {
	coverageAmbition: 'low' | 'medium' | 'high';
	recommendedMinConfirmedCandidatesPerIteration: number;
	earlyStopGuidance: string;
	iterationBreadthHint: string;
} {
	const lt = Math.max(1, Math.floor(limitTotal));
	const coverageAmbition: 'low' | 'medium' | 'high' =
		lt < 40 ? 'low' : lt < 100 ? 'medium' : 'high';
	const recommendedMinConfirmedCandidatesPerIteration = Math.max(
		3,
		Math.min(14, Math.floor(3 + lt * 0.1)),
	);
	return {
		coverageAmbition,
		recommendedMinConfirmedCandidatesPerIteration,
		earlyStopGuidance:
			'Prefer should_stop=false while large parts of the folder digest remain neither confirmed nor rejected, unless tool results show no further grounded paths.',
		iterationBreadthHint:
			'Higher limitTotal means the vault supports broader multi-branch coverage in each iteration; avoid collapsing to only a few coarse roots when the tree shows distinct themes.',
	};
}
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import {
	buildDocumentHubShortlist,
	buildHubWorldSnapshot,
	getExploreFolderExcludedPrefixes,
} from './hub-helper/hubDiscoverySnapshot';
import { runDocumentHubReconLoop } from './hub-helper/hubDiscovery.document';
import {
	resolveDocumentReconDebug,
	resolveFolderReconDebug,
	shouldSkipDocumentRecon,
} from './hub-helper/hubDiscoveryDebug';
import { runFolderHubReconLoop } from './hub-helper/hubDiscovery.folderHub';
import { buildSyntheticFolderRound, mergeLeadsFromConfirmedPaths } from './hub-helper/hubDiscovery.memory';
import type {
	DocumentReconMemory,
	FolderReconMemory,
	HubDiscoveryAgentLoopResult,
	HubDiscoveryAgentOptions,
	HubDiscoveryPipelineBudget,
	HubDiscoveryPrepContext,
} from './hub-helper/types';

/**
 * Thrown when `stopAt` skips the rest of the pipeline; {@link HubDiscoveryAgent.streamRun} catches and passes `partialResult` to `onFinish`.
 */
export class HubDiscoveryPipelineAbortError extends Error {
	override readonly name = 'HubDiscoveryPipelineAbortError';
	constructor(
		readonly reason: 'prep_only' | 'skip_document_after_folder',
		readonly partialResult: HubDiscoveryAgentLoopResult,
	) {
		super(
			reason === 'prep_only'
				? 'HubDiscoveryPipelineAbortError: prep_only'
				: 'HubDiscoveryPipelineAbortError: skip_document_after_folder',
		);
	}
}

export { buildHubWorldSnapshot } from './hub-helper/hubDiscoverySnapshot';
export type {
	HubDiscoveryAgentLoopResult,
	HubDiscoveryAgentOptions,
	HubDiscoveryStopAt,
	HubDiscoveryStopAtPhase,
	ReconLoopDebugOptions,
} from './hub-helper/types';

/**
 * Hub discovery agent: streams events during recon; read {@link folderReconMemory} / {@link documentReconMemory} after run.
 */
export class HubDiscoveryAgent {
	/** Last completed folder recon memory (set when folder loop finishes). */
	folderReconMemory: FolderReconMemory | undefined;
	/** Last completed document recon memory (set when document loop finishes). */
	documentReconMemory: DocumentReconMemory | undefined;

	constructor(private readonly aiServiceManager: AIServiceManager) {}

	private resetReconSession(): void {
		this.folderReconMemory = undefined;
		this.documentReconMemory = undefined;
	}

	private async prepareHubDiscoveryContext(options: HubDiscoveryAgentOptions): Promise<HubDiscoveryPrepContext> {
		const tm = this.aiServiceManager.getTemplateManager?.() as TemplateManager | undefined;
		if (!tm) {
			throw new Error('HubDiscoveryAgent requires TemplateManager (plugin templates not loaded).');
		}

		const trimmedGoal = options.userGoal?.trim();
		const userGoal =
			trimmedGoal || (await tm.render(IndexingTemplateId.HubDiscoveryDefaultUserGoal, {})).trim();
		if (!userGoal) {
			throw new Error('HubDiscoveryAgent: userGoal is empty and default user-goal template rendered empty.');
		}

		const pipelineBudgetNote = (await tm.render(IndexingTemplateId.HubDiscoveryPipelineBudgetNote, {})).trim();
		if (!pipelineBudgetNote) {
			throw new Error('HubDiscoveryAgent: agentPipelineBudget note template rendered empty.');
		}

		const documentNodeCount = sqliteStoreManager.isInitialized()
			? await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows()
			: 0;
		const indexBudgetRaw = computeHubDiscoverBudgets(documentNodeCount);
		const { limitTotal, documentFetchLimit, folderFetchLimit } = indexBudgetRaw;

		const globalTreeMaxDepth = Math.min(10, Math.max(6, 6 + Math.floor(limitTotal / 100)));
		const maxFoldersInSnapshot = Math.min(8000, Math.max(400, Math.floor(folderFetchLimit * 28)));
		const maxNodesPerPage = Math.min(2000, Math.max(320, Math.floor(limitTotal * 7)));
		const estimatedFolderPages = Math.max(1, Math.ceil(maxFoldersInSnapshot / maxNodesPerPage));
		const maxFolderPages = Math.min(20, Math.max(1, Math.min(estimatedFolderPages, Math.ceil(limitTotal * 0.4))));
		const maxExploresPerPage = Math.min(32, Math.max(8, Math.ceil(limitTotal * 0.22)));
		const docShortlistLimit = Math.min(500, Math.max(50, Math.floor(documentFetchLimit * 2)));

		const suggestBudget: HubDiscoveryPipelineBudget = {
			maxFolderPages,
			maxExploresPerPage,
			docShortlistLimit,
			globalTreeMaxDepth,
			maxFoldersInSnapshot,
			maxNodesPerPage,
			runDeepenRound: true,
			indexBudgetRaw,
		};

		const world = await buildHubWorldSnapshot(
			{
				maxDepth: suggestBudget.globalTreeMaxDepth,
				maxFolders: suggestBudget.maxFoldersInSnapshot,
				maxNodesPerPage: suggestBudget.maxNodesPerPage,
				extraExcludePathPrefixes: [],
			},
			tm,
		);

		const worldMetricsForPrompt: Record<string, unknown> = {
			...world.metrics,
			agentPipelineBudget: {
				documentNodeCount,
				indexBudgetRaw: suggestBudget.indexBudgetRaw,
				maxFolderPages: suggestBudget.maxFolderPages,
				maxExploresPerPage: suggestBudget.maxExploresPerPage,
				docShortlistLimit: suggestBudget.docShortlistLimit,
				snapshot: {
					globalTreeMaxDepth: suggestBudget.globalTreeMaxDepth,
					maxFoldersInSnapshot: suggestBudget.maxFoldersInSnapshot,
					maxNodesPerPage: suggestBudget.maxNodesPerPage,
				},
				note: pipelineBudgetNote,
				llmGuidance: buildAgentPipelineBudgetLlmGuidance(suggestBudget.indexBudgetRaw.limitTotal),
			},
		};

		const baselineExcludedPrefixes = getExploreFolderExcludedPrefixes();
		const initialDocumentShortlist = await buildDocumentHubShortlist(suggestBudget.docShortlistLimit);

		return {
			tm,
			userGoal,
			suggestBudget,
			world,
			worldMetricsForPrompt,
			documentNodeCount,
			initialDocumentShortlist,
			baselineExcludedPrefixes,
		};
	}

	/** Partial result when `stopAt: 'prep'` (no recon memory). */
	private buildResultAfterPrep(ctx: HubDiscoveryPrepContext): HubDiscoveryAgentLoopResult {
		return {
			world: ctx.world,
			folderRounds: [],
			deepen: undefined,
			explores: [],
			mergedFolderHubCandidates: [],
			mergedDocumentHubLeads: [],
			// documentShortlist: ctx.initialDocumentShortlist,
			folderCoverageAssessments: [],
			lastCoverage: undefined,
			highwayFolderLeads: [],
		};
	}

	/** Partial result when skipping document recon (`folder_hub`, `after_folder_recon`, or folder plan/submit hooks). */
	private async buildResultAfterFolderHub(
		ctx: HubDiscoveryPrepContext,
		folderMemory: FolderReconMemory,
	): Promise<HubDiscoveryAgentLoopResult> {
		const documentShortlist = await buildDocumentHubShortlist(ctx.suggestBudget.docShortlistLimit);
		const findingsSummary = [
			`Folder hubs: ${folderMemory.confirmedFolderHubs.length}; highway leads: ${folderMemory.highwayFolderLeads.length}.`,
			`(Document recon skipped: debug stop before document phase.)`,
		].join(' ');
		const syntheticRound: FolderIntuitionRoundOutput = buildSyntheticFolderRound(folderMemory, findingsSummary);
		return {
			// world: ctx.world,
			folderRounds: [syntheticRound],
			deepen: undefined,
			explores: [],
			mergedFolderHubCandidates: folderMemory.confirmedFolderHubs,
			mergedDocumentHubLeads: [],
			// documentShortlist,
			folderCoverageAssessments: [folderMemory.coverage],
			lastCoverage: folderMemory.coverage,
			highwayFolderLeads: folderMemory.highwayFolderLeads,
		};
	}

	private async *runHubDiscoveryPipeline(
		options: HubDiscoveryAgentOptions,
	): AsyncGenerator<LLMStreamEvent, HubDiscoveryAgentLoopResult> {
		this.resetReconSession();
		const ctx = await this.prepareHubDiscoveryContext(options);
		const stepId = generateUuidWithoutHyphens();
		const stopAt = options.stopAt;

		if (stopAt === 'prep') {
			yield {
				type: 'pk-debug',
				debugName: 'HubDiscoveryAgent prep snapshot (raw)',
				extra: {
					stopAt: 'prep' as const,
					userGoal: ctx.userGoal,
					worldMetrics: ctx.world.metrics,
					folderTreeNodeCount: ctx.world.nodes.length,
					initialDocumentShortlist: ctx.initialDocumentShortlist,
				},
			};
			throw new HubDiscoveryPipelineAbortError('prep_only', this.buildResultAfterPrep(ctx));
		}

		const folderReconDebug = resolveFolderReconDebug(options);
		yield* runFolderHubReconLoop({
			ctx,
			stepId,
			aiServiceManager: this.aiServiceManager,
			debug: folderReconDebug,
			onComplete: (m) => {
				this.folderReconMemory = m;
			},
		});

		const folderMemory = this.folderReconMemory;
		if (!folderMemory) {
			throw new Error('HubDiscoveryAgent: folder recon finished without memory (onComplete not invoked).');
		}

		yield {
			type: 'pk-debug',
			debugName: 'HubDiscoveryAgent folder recon memory (raw)',
			extra: {
				stopAt: stopAt ?? null,
				folderReconMemory: folderMemory,
				confirmedFolderHubs: folderMemory.confirmedFolderHubs,
				highwayFolderLeads: folderMemory.highwayFolderLeads,
				coverage: folderMemory.coverage,
			},
		};

		if (shouldSkipDocumentRecon(stopAt)) {
			throw new HubDiscoveryPipelineAbortError(
				'skip_document_after_folder',
				await this.buildResultAfterFolderHub(ctx, folderMemory),
			);
		}

		yield {
			type: 'pk-debug',
			debugName: 'HubDiscoveryAgent document phase input (raw)',
			extra: {
				folderMemory,
				initialDocumentShortlist: ctx.initialDocumentShortlist,
				topOutgoingFolders: ctx.world.metrics.topOutgoingFolders,
			},
		};

		const documentReconDebug = resolveDocumentReconDebug(options);
		yield* runDocumentHubReconLoop({
			ctx,
			folderMemory,
			stepId,
			aiServiceManager: this.aiServiceManager,
			debug: documentReconDebug,
			onComplete: (m) => {
				this.documentReconMemory = m;
			},
		});

		const docMemory = this.documentReconMemory;
		if (!docMemory) {
			throw new Error('HubDiscoveryAgent: document recon finished without memory (onComplete not invoked).');
		}

		const documentShortlist = await buildDocumentHubShortlist(ctx.suggestBudget.docShortlistLimit);
		const mergedDocumentHubLeads = mergeLeadsFromConfirmedPaths(folderMemory, docMemory);

		const findingsSummary = [
			`Folder hubs: ${folderMemory.confirmedFolderHubs.length}; highway leads: ${folderMemory.highwayFolderLeads.length}.`,
			`Document leads: ${docMemory.refinedDocumentHubLeads.length}; confirmed note paths: ${docMemory.confirmedDocumentHubPaths.length}.`,
		].join(' ');

		const syntheticRound: FolderIntuitionRoundOutput = buildSyntheticFolderRound(folderMemory, findingsSummary);

		yield {
			type: 'pk-debug',
			debugName: 'HubDiscoveryAgent document recon memory (raw)',
			extra: {
				documentReconMemory: docMemory,
				mergedDocumentHubLeads,
			},
		};

		return {
			world: ctx.world,
			folderRounds: [syntheticRound],
			deepen: undefined,
			explores: [],
			mergedFolderHubCandidates: folderMemory.confirmedFolderHubs,
			mergedDocumentHubLeads,
			documentShortlist,
			folderCoverageAssessments: [folderMemory.coverage],
			lastCoverage: folderMemory.coverage,
			highwayFolderLeads: folderMemory.highwayFolderLeads,
		};
	}

	async *streamRun(
		options: HubDiscoveryAgentOptions = {},
		onFinish?: (result: HubDiscoveryAgentLoopResult) => void,
	): AsyncGenerator<LLMStreamEvent> {
		const ctx = AppContext.getInstance();
		if (ctx.isMockEnv) {
			yield {
				type: 'pk-debug',
				debugName: 'HubDiscoveryAgent skipped (mock env)',
				extra: {},
			};
			onFinish?.({
				world: {
					pages: [],
					metrics: {
						totalIndexedDocuments: 0,
						totalFoldersScanned: 0,
						topLevelBranchCount: 0,
						orphanHardSampleCount: 0,
						orphanRiskHint: 'low',
						topOutgoingFolders: [],
					},
					nodes: [],
				},
				folderRounds: [],
				explores: [],
				mergedFolderHubCandidates: [],
				mergedDocumentHubLeads: [],
				documentShortlist: [],
				folderCoverageAssessments: [],
				lastCoverage: undefined,
				highwayFolderLeads: [],
			});
			return;
		}

		yield {
			type: 'pk-debug',
			debugName: 'HubDiscoveryAgent start',
			extra: {
				hasUserGoal: Boolean(options.userGoal?.trim()),
				stopAt: options.stopAt ?? 'full',
				folderReconMaxIterations: options.folderReconMaxIterations,
				documentReconMaxIterations: options.documentReconMaxIterations,
			},
		};

		let result: HubDiscoveryAgentLoopResult;
		try {
			result = yield* this.runHubDiscoveryPipeline(options);
		} catch (err) {
			if (err instanceof HubDiscoveryPipelineAbortError) {
				yield {
					type: 'pk-debug',
					debugName: 'HubDiscoveryAgent pipeline abort',
					extra: {
						reason: err.reason,
						partialResult: err.partialResult,
					},
				};
				onFinish?.(err.partialResult);
				return;
			}
			throw err;
		}
		const debugTuning =
			options.folderReconMaxIterations != null || options.documentReconMaxIterations != null;
		yield {
			type: 'pk-debug',
			debugName: 'HubDiscoveryAgent complete',
			extra: {
				stopAt: options.stopAt ?? 'full',
				stoppedEarly: options.stopAt !== undefined || debugTuning,
				folderRoundCount: result.folderRounds.length,
				exploreCount: result.explores.length,
				mergedFolderHubs: result.mergedFolderHubCandidates.length,
				highwayFolderLeads: result.highwayFolderLeads.length,
				// documentShortlist: result.documentShortlist.length,
				docLeads: result.mergedDocumentHubLeads.length,
			},
		};
		onFinish?.(result);
	}
}
