/**
 * Knowledge intuition agent: deterministic prep (backbone + folder digest) → manual recon loop → rendered skeleton.
 */

import { AppContext } from '@/app/context/AppContext';
import type { LLMStreamEvent } from '@/core/providers/types';
import { IndexingTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { buildInitialIntuitionMemory } from '@/service/agents/intuition-helper/intuition.memory';
import { renderIntuitionSkeletonJson, renderIntuitionSkeletonMarkdown } from '@/service/agents/intuition-helper/intuition.render';
import { runKnowledgeIntuitionLoop } from '@/service/agents/intuition-helper/intuition.recon';
import { prepareIntuitionContext } from '@/service/agents/intuition-helper/intuitionPrep';
import type {
	IntuitionMemory,
	IntuitionPrepContext,
	KnowledgeIntuitionAgentOptions,
	KnowledgeIntuitionAgentResult,
} from '@/service/agents/intuition-helper/types';
import type { ReconLoopDebugOptions } from '@/service/agents/intuition-helper/intuition.recon';

/**
 * Thrown when `stopAt: 'prep'` skips the LLM loop; {@link KnowledgeIntuitionAgent.streamRun} passes `partialResult` to `onFinish`.
 */
export class KnowledgeIntuitionPrepAbortError extends Error {
	override readonly name = 'KnowledgeIntuitionPrepAbortError';
	constructor(readonly partialResult: KnowledgeIntuitionAgentResult) {
		super('KnowledgeIntuitionPrepAbortError: prep_only');
	}
}

export type { KnowledgeIntuitionAgentOptions, KnowledgeIntuitionAgentResult };

/**
 * Orchestrates prep, tool-assisted recon, and fixed-layout markdown + JSON output.
 */
export class KnowledgeIntuitionAgent {
	/** Last merged intuition memory after a full or partial recon run. */
	intuitionMemory: IntuitionMemory | undefined;

	constructor(private readonly aiServiceManager: AIServiceManager) {}

	private resetSession(): void {
		this.intuitionMemory = undefined;
	}

	private async buildPrepOnlyResult(ctx: IntuitionPrepContext): Promise<KnowledgeIntuitionAgentResult> {
		const memory = buildInitialIntuitionMemory();
		const markdown = (
			await ctx.tm.render(IndexingTemplateId.KnowledgeIntuitionPrepOnlyMarkdown, {
				vaultName: ctx.vaultName,
				dateLabel: ctx.currentDateLabel,
				backboneExcerpt: ctx.backboneMarkdownExcerpt.slice(0, 6000),
			})
		).trim();
		const json = renderIntuitionSkeletonJson(memory, {
			vaultName: ctx.vaultName,
			dateLabel: ctx.currentDateLabel,
		});
		return { prep: ctx, memory, markdown, json };
	}

	private resolveDebug(options: KnowledgeIntuitionAgentOptions): ReconLoopDebugOptions | undefined {
		if (options.maxIterations == null) return undefined;
		return { maxIterations: Math.max(1, Math.min(6, Math.floor(options.maxIterations))) };
	}

	private async prepareContext(options: KnowledgeIntuitionAgentOptions): Promise<IntuitionPrepContext> {
		const tm = this.aiServiceManager.getTemplateManager?.() as TemplateManager | undefined;
		if (!tm) {
			throw new Error('KnowledgeIntuitionAgent requires TemplateManager (plugin templates not loaded).');
		}
		const trimmedGoal = options.userGoal?.trim();
		const userGoal =
			trimmedGoal || (await tm.render(IndexingTemplateId.KnowledgeIntuitionDefaultUserGoal, {})).trim();
		if (!userGoal) {
			throw new Error(
				'KnowledgeIntuitionAgent: userGoal is empty and default user-goal template rendered empty.',
			);
		}
		const vaultName = options.vaultName?.trim() || 'Vault';
		const currentDateLabel = options.currentDateLabel?.trim() || new Date().toISOString().slice(0, 10);
		return prepareIntuitionContext({
			userGoal,
			vaultName,
			currentDateLabel,
			tm,
		});
	}

	private async finalizeResult(
		ctx: IntuitionPrepContext,
		memory: IntuitionMemory,
	): Promise<KnowledgeIntuitionAgentResult> {
		const markdown = await renderIntuitionSkeletonMarkdown(ctx.tm, memory, {
			vaultName: ctx.vaultName,
			dateLabel: ctx.currentDateLabel,
		});
		const json = renderIntuitionSkeletonJson(memory, {
			vaultName: ctx.vaultName,
			dateLabel: ctx.currentDateLabel,
		});
		return { prep: ctx, memory, markdown, json };
	}

	private async *runPipeline(
		options: KnowledgeIntuitionAgentOptions,
	): AsyncGenerator<LLMStreamEvent, KnowledgeIntuitionAgentResult> {
		this.resetSession();
		const ctx = await this.prepareContext(options);
		const stepId = generateUuidWithoutHyphens();

		if (options.stopAt === 'prep') {
			yield {
				type: 'pk-debug',
				debugName: 'KnowledgeIntuitionAgent prep snapshot (raw)',
				extra: {
					stopAt: 'prep' as const,
					userGoal: ctx.userGoal,
					metrics: ctx.world.metrics,
					backboneMetrics: ctx.backbone.metrics,
					folderTreeNodeCount: ctx.world.nodes.length,
				},
			};
			const partial = await this.buildPrepOnlyResult(ctx);
			throw new KnowledgeIntuitionPrepAbortError(partial);
		}

		let memory: IntuitionMemory | undefined;
		yield* runKnowledgeIntuitionLoop({
			ctx,
			stepId,
			aiServiceManager: this.aiServiceManager,
			debug: this.resolveDebug(options),
			onComplete: (m) => {
				memory = m;
				this.intuitionMemory = m;
			},
		});
		if (!memory) {
			throw new Error('KnowledgeIntuitionAgent: recon finished without memory (onComplete not invoked).');
		}
		return await this.finalizeResult(ctx, memory);
	}

	async *streamRun(
		options: KnowledgeIntuitionAgentOptions = {},
		onFinish?: (result: KnowledgeIntuitionAgentResult) => void,
	): AsyncGenerator<LLMStreamEvent> {
		const ctx = AppContext.getInstance();
		if (ctx.isMockEnv) {
			yield {
				type: 'pk-debug',
				debugName: 'KnowledgeIntuitionAgent skipped (mock env)',
				extra: {},
			};
			const emptyMemory = buildInitialIntuitionMemory();
			const mockResult: KnowledgeIntuitionAgentResult = {
				prep: {} as IntuitionPrepContext,
				memory: emptyMemory,
				markdown: '_KnowledgeIntuitionAgent skipped (mock env)_\n',
				json: {
					version: '2026.05',
					theme: '',
					partitions: [],
					core_entities: [],
					topology: [],
					evolution: '',
					entry_points: [],
				},
			};
			onFinish?.(mockResult);
			return;
		}

		yield {
			type: 'pk-debug',
			debugName: 'KnowledgeIntuitionAgent start',
			extra: {
				hasUserGoal: Boolean(options.userGoal?.trim()),
				stopAt: options.stopAt ?? 'full',
				maxIterations: options.maxIterations,
			},
		};

		let result: KnowledgeIntuitionAgentResult;
		try {
			result = yield* this.runPipeline(options);
		} catch (err) {
			if (err instanceof KnowledgeIntuitionPrepAbortError) {
				yield {
					type: 'pk-debug',
					debugName: 'KnowledgeIntuitionAgent pipeline abort (prep)',
					extra: { partialResult: err.partialResult },
				};
				this.intuitionMemory = err.partialResult.memory;
				onFinish?.(err.partialResult);
				return;
			}
			throw err;
		}

		yield {
			type: 'pk-debug',
			debugName: 'KnowledgeIntuitionAgent complete',
			extra: {
				partitionCount: result.memory.partitions.length,
				entityCount: result.memory.coreEntities.length,
				topologyCount: result.memory.topology.length,
				markdownChars: result.markdown.length,
			},
		};
		onFinish?.(result);
	}
}
