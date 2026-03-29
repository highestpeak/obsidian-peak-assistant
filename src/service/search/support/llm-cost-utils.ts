import type { LLMUsage } from '@/core/providers/types';
import type { ModelInfoForSwitch } from '@/core/providers/types';

/**
 * Normalizes AI SDK / provider usage fields into input/output/total token counts.
 */
export function normalizeUsageTokens(usage: LLMUsage | undefined | null): {
	input: number;
	output: number;
	total: number;
} {
	if (!usage) {
		return { input: 0, output: 0, total: 0 };
	}
	const u = usage as Record<string, unknown>;
	const input = Number(u.inputTokens ?? u.promptTokens ?? 0) || 0;
	const output = Number(u.outputTokens ?? u.completionTokens ?? 0) || 0;
	const total = Number(u.totalTokens ?? input + output) || 0;
	return { input, output, total };
}

/**
 * Estimates USD cost from model list prices (per 1M tokens) and usage.
 */
export function computeUsdFromUsage(
	usage: LLMUsage | undefined,
	modelInfo: ModelInfoForSwitch | undefined,
): number {
	if (!modelInfo) return 0;
	const { input, output } = normalizeUsageTokens(usage);
	const inPrice = parseFloat(String(modelInfo.costInput ?? '0')) || 0;
	const outPrice = parseFloat(String(modelInfo.costOutput ?? '0')) || 0;
	return (input / 1_000_000) * inPrice + (output / 1_000_000) * outPrice;
}
