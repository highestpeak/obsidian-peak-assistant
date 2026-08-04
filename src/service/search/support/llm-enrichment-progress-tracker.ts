import type { SearchSettings } from '@/core/config/settingsTypes';
import type { LLMUsage } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { computeUsdFromUsage, normalizeUsageTokens } from '@/service/search/support/llm-cost-utils';

export type { LlmIndexingCompleteEvent } from '@/core/search/indexTypes';

export type LlmEnrichmentDocPlan = {
	contentChars: number;
	needsSummaryFull: boolean;
	plannedInputTokens: number;
	plannedOutputTokens: number;
	plannedTotalTokens: number;
	plannedCostUsd: number;
	plannedDurationMs: number;
};

const CHARS_PER_TOKEN = 4, TAG_OVERHEAD = 900, SHORT_OVERHEAD = 500, FULL_OVERHEAD = 700;
const TAG_OUTPUT_AVG = 220, BASE_LATENCY_MS = 2500, TOKENS_PER_SEC = 100;

const wordsToTokens = (w: number) => Math.max(1, Math.ceil(w / 0.75));
const phaseMs = (inTok: number, outTok: number) => BASE_LATENCY_MS + ((inTok + outTok) / TOKENS_PER_SEC) * 1000;

/** Rolling estimator: planned vs actual ratios adjust remaining ETA and cost. */
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

	async planForMarkdownDoc(contentChars: number): Promise<LlmEnrichmentDocPlan> {
		const contentTokens = Math.ceil(contentChars / CHARS_PER_TOKEN);
		const needsSummaryFull = contentChars > this.settings.fullSummaryLength;

		const tagIn = contentTokens + TAG_OVERHEAD, shortIn = contentTokens + SHORT_OVERHEAD, fullIn = contentTokens + FULL_OVERHEAD;
		const shortOut = wordsToTokens(this.settings.shortSummaryLength), fullOut = wordsToTokens(this.settings.fullSummaryLength), tagOut = TAG_OUTPUT_AVG;

		const costFor = async (inT: number, outT: number) => {
			const m = this.ai.getActiveAgentModel();
			const info = await this.ai.getModelInfo(m.modelId, m.provider);
			return computeUsdFromUsage({ inputTokens: inT, outputTokens: outT, totalTokens: inT + outT }, info);
		};

		let plannedIn = tagIn + shortIn, plannedOut = tagOut + shortOut;
		let plannedCost = await costFor(tagIn, tagOut) + await costFor(shortIn, shortOut);
		let maxPhaseMs = Math.max(phaseMs(tagIn, tagOut), phaseMs(shortIn, shortOut));

		if (needsSummaryFull) {
			plannedIn += fullIn; plannedOut += fullOut;
			plannedCost += await costFor(fullIn, fullOut);
			maxPhaseMs = Math.max(maxPhaseMs, phaseMs(fullIn, fullOut));
		}

		return { contentChars, needsSummaryFull, plannedInputTokens: plannedIn, plannedOutputTokens: plannedOut, plannedTotalTokens: plannedIn + plannedOut, plannedCostUsd: plannedCost, plannedDurationMs: maxPhaseMs };
	}

	emptyPlan(): LlmEnrichmentDocPlan {
		return { contentChars: 0, needsSummaryFull: false, plannedInputTokens: 0, plannedOutputTokens: 0, plannedTotalTokens: 0, plannedCostUsd: 0, plannedDurationMs: 0 };
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

export type PendingLlmEnrichmentProgress = {
	processed: number; total: number; path: string;
	elapsedMs: number; estimatedRemainingMs: number; estimatedTotalMs: number;
	lastDocInputTokens: number; lastDocOutputTokens: number; lastDocTotalTokens: number; lastDocCostUsd: number;
	sumInputTokens: number; sumOutputTokens: number; sumTotalTokens: number; sumCostUsd: number;
	estimatedRemainingTotalTokens: number; estimatedRemainingCostUsd: number;
	estimatedFinalTotalTokens: number; estimatedFinalCostUsd: number;
};
