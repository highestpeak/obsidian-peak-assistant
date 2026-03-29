import type { PendingLlmEnrichmentProgress } from '@/service/search/support/llm-enrichment-progress-tracker';

/** Human-readable duration for progress notices (English labels). */
export function formatDurationEstimateMs(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '0s';
	const sec = Math.ceil(ms / 1000);
	if (sec < 60) return `~${sec}s`;
	const min = Math.floor(sec / 60);
	const r = sec % 60;
	return r > 0 ? `~${min}m ${r}s` : `~${min}m`;
}

export function formatTokenCount(n: number): string {
	if (!Number.isFinite(n)) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(Math.round(n));
}

export function formatUsdEstimate(n: number): string {
	if (!Number.isFinite(n)) return '$0';
	if (n < 0.01) return `$${n.toFixed(4)}`;
	return `$${n.toFixed(2)}`;
}

/** Second line for LLM pending enrichment progress (English). */
export function formatLlmEnrichmentProgressLine(ev: PendingLlmEnrichmentProgress): string {
	return `${formatDurationEstimateMs(ev.estimatedRemainingMs)} left · ~${formatTokenCount(ev.estimatedFinalTotalTokens)} tok · ${formatUsdEstimate(ev.estimatedFinalCostUsd)} est`;
}
