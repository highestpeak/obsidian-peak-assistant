import type { SearchSettings } from '@/app/settings/types';
import type { LLMUsage } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { computeUsdFromUsage, normalizeUsageTokens } from '@/service/search/support/llm-cost-utils';

export type { LlmIndexingCompleteEvent } from '@/service/search/index/types';

/** Planned LLM cost shape for one pending markdown document. */
export type LlmEnrichmentDocPlan = {
	contentChars: number;
	needsSummaryFull: boolean;
	plannedInputTokens: number;
	plannedOutputTokens: number;
	plannedTotalTokens: number;
	plannedCostUsd: number;
	plannedDurationMs: number;
};

const CHARS_PER_TOKEN = 4;
const TAG_PROMPT_OVERHEAD_TOKENS = 900;
const SHORT_PROMPT_OVERHEAD_TOKENS = 500;
const FULL_PROMPT_OVERHEAD_TOKENS = 700;
const TAG_OUTPUT_AVG_TOKENS = 220;
const BASE_LATENCY_MS = 2500;
const TOKENS_PER_SECOND = 100;

function wordsToApproxOutputTokens(words: number): number {
	return Math.max(1, Math.ceil(words / 0.75));
}

function phaseMs(inputTokens: number, outputTokens: number): number {
	return BASE_LATENCY_MS + ((inputTokens + outputTokens) / TOKENS_PER_SECOND) * 1000;
}

/**
 * Rolling estimator for deferred LLM index enrichment: planned vs actual ratios adjust remaining ETA and token/cost.
 */
export class LlmEnrichmentProgressTracker {
	private completed = 0;
	private sumObservedDurationMs = 0;
	private sumObservedInputTokens = 0;
	private sumObservedOutputTokens = 0;
	private sumObservedCostUsd = 0;
	private sumPlannedDurationMs = 0;
	private sumPlannedTotalTokens = 0;
	private sumPlannedCostUsd = 0;

	constructor(
		private readonly settings: SearchSettings,
		private readonly ai: AIServiceManager,
	) {}

	/**
	 * Builds a per-document plan from content size and current search settings.
	 */
	async planForMarkdownDoc(contentChars: number): Promise<LlmEnrichmentDocPlan> {
		const contentTokens = Math.ceil(contentChars / CHARS_PER_TOKEN);
		const needsSummaryFull = contentChars > this.settings.fullSummaryLength;

		const tagIn = contentTokens + TAG_PROMPT_OVERHEAD_TOKENS;
		const shortIn = contentTokens + SHORT_PROMPT_OVERHEAD_TOKENS;
		const fullIn = contentTokens + FULL_PROMPT_OVERHEAD_TOKENS;

		const shortOut = wordsToApproxOutputTokens(this.settings.shortSummaryLength);
		const fullOut = wordsToApproxOutputTokens(this.settings.fullSummaryLength);
		const tagOut = TAG_OUTPUT_AVG_TOKENS;

		const tagModel = this.ai.getModelForPrompt(PromptId.DocTagGenerateJson);
		const shortModel = this.ai.getModelForPrompt(PromptId.DocSummaryShort);
		const tagInfo = await this.ai.getModelInfo(tagModel.modelId, tagModel.provider);
		const shortInfo = await this.ai.getModelInfo(shortModel.modelId, shortModel.provider);

		let plannedInputTokens = tagIn + shortIn;
		let plannedOutputTokens = tagOut + shortOut;
		let plannedCostUsd =
			computeUsdFromUsage(
				{ inputTokens: tagIn, outputTokens: tagOut, totalTokens: tagIn + tagOut },
				tagInfo,
			) +
			computeUsdFromUsage(
				{ inputTokens: shortIn, outputTokens: shortOut, totalTokens: shortIn + shortOut },
				shortInfo,
			);

		let tagMs = phaseMs(tagIn, tagOut);
		let shortMs = phaseMs(shortIn, shortOut);
		let fullMs = 0;

		if (needsSummaryFull) {
			const fullModel = this.ai.getModelForPrompt(PromptId.DocSummaryFull);
			const fullInfo = await this.ai.getModelInfo(fullModel.modelId, fullModel.provider);
			plannedInputTokens += fullIn;
			plannedOutputTokens += fullOut;
			plannedCostUsd += computeUsdFromUsage(
				{ inputTokens: fullIn, outputTokens: fullOut, totalTokens: fullIn + fullOut },
				fullInfo,
			);
			fullMs = phaseMs(fullIn, fullOut);
		}

		const plannedDurationMs = Math.max(tagMs, shortMs, fullMs);
		const plannedTotalTokens = plannedInputTokens + plannedOutputTokens;

		return {
			contentChars,
			needsSummaryFull,
			plannedInputTokens,
			plannedOutputTokens,
			plannedTotalTokens,
			plannedCostUsd,
			plannedDurationMs,
		};
	}

	/** Zero plan for paths that skip markdown LLM (no estimator). */
	emptyPlan(): LlmEnrichmentDocPlan {
		return {
			contentChars: 0,
			needsSummaryFull: false,
			plannedInputTokens: 0,
			plannedOutputTokens: 0,
			plannedTotalTokens: 0,
			plannedCostUsd: 0,
			plannedDurationMs: 0,
		};
	}

	recordDocComplete(plan: LlmEnrichmentDocPlan, actual: { durationMs: number; usage: LLMUsage; costUsd: number }): void {
		this.completed++;
		this.sumObservedDurationMs += actual.durationMs;
		const n = normalizeUsageTokens(actual.usage);
		this.sumObservedInputTokens += n.input;
		this.sumObservedOutputTokens += n.output;
		this.sumObservedCostUsd += actual.costUsd;
		this.sumPlannedDurationMs += plan.plannedDurationMs;
		this.sumPlannedTotalTokens += plan.plannedTotalTokens;
		this.sumPlannedCostUsd += plan.plannedCostUsd;
	}

	/**
	 * Snapshot after the document at `path` has completed (`processed` is count finished).
	 */
	snapshot(params: {
		path: string;
		processed: number;
		total: number;
		batchStartMs: number;
		lastPlan: LlmEnrichmentDocPlan;
		lastActual: { durationMs: number; usage: LLMUsage; costUsd: number };
	}): PendingLlmEnrichmentProgress {
		const { path, processed, total, batchStartMs, lastPlan, lastActual } = params;
		const elapsedMs = Date.now() - batchStartMs;
		const lastTok = normalizeUsageTokens(lastActual.usage);

		const timeRatio =
			this.sumPlannedDurationMs > 0 ? this.sumObservedDurationMs / this.sumPlannedDurationMs : 1;
		const tokenRatio =
			this.sumPlannedTotalTokens > 0
				? (this.sumObservedInputTokens + this.sumObservedOutputTokens) / this.sumPlannedTotalTokens
				: 1;
		const costRatio =
			this.sumPlannedCostUsd > 0 ? this.sumObservedCostUsd / this.sumPlannedCostUsd : tokenRatio;

		const remainingDocs = Math.max(0, total - processed);
		const avgPlannedDuration =
			this.completed > 0 ? this.sumPlannedDurationMs / this.completed : lastPlan.plannedDurationMs;
		const avgPlannedTokens =
			this.completed > 0 ? this.sumPlannedTotalTokens / this.completed : lastPlan.plannedTotalTokens;
		const avgPlannedCost =
			this.completed > 0 ? this.sumPlannedCostUsd / this.completed : lastPlan.plannedCostUsd;

		const estimatedRemainingMs = remainingDocs * avgPlannedDuration * timeRatio;
		const estimatedRemainingTotalTokens = remainingDocs * avgPlannedTokens * tokenRatio;
		const estimatedRemainingCostUsd = remainingDocs * avgPlannedCost * costRatio;

		const sumTotalTokens = this.sumObservedInputTokens + this.sumObservedOutputTokens;

		return {
			processed,
			total,
			path,
			elapsedMs,
			estimatedRemainingMs,
			estimatedTotalMs: elapsedMs + estimatedRemainingMs,

			lastDocInputTokens: lastTok.input,
			lastDocOutputTokens: lastTok.output,
			lastDocTotalTokens: lastTok.total,
			lastDocCostUsd: lastActual.costUsd,

			sumInputTokens: this.sumObservedInputTokens,
			sumOutputTokens: this.sumObservedOutputTokens,
			sumTotalTokens,
			sumCostUsd: this.sumObservedCostUsd,

			estimatedRemainingTotalTokens,
			estimatedRemainingCostUsd,

			estimatedFinalTotalTokens: sumTotalTokens + estimatedRemainingTotalTokens,
			estimatedFinalCostUsd: this.sumObservedCostUsd + estimatedRemainingCostUsd,
		};
	}
}

/** Rich progress for LLM deferred enrichment command UI. */
export type PendingLlmEnrichmentProgress = {
	processed: number;
	total: number;
	path: string;

	elapsedMs: number;
	estimatedRemainingMs: number;
	estimatedTotalMs: number;

	lastDocInputTokens: number;
	lastDocOutputTokens: number;
	lastDocTotalTokens: number;
	lastDocCostUsd: number;

	sumInputTokens: number;
	sumOutputTokens: number;
	sumTotalTokens: number;
	sumCostUsd: number;

	estimatedRemainingTotalTokens: number;
	estimatedRemainingCostUsd: number;

	estimatedFinalTotalTokens: number;
	estimatedFinalCostUsd: number;
};
