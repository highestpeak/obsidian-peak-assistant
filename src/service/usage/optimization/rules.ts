import type {
	OptimizationSignals,
	Recommendation,
	RecommendationImpact,
} from './types';

/**
 * Deterministic rule engine. Used directly when there is no online profile
 * configured AND as the fallback when the LLM curator fails validation. Same
 * output shape so the dashboard renders identically in either case.
 *
 * Rules ordered by leverage:
 *   R1 · Route quick asks to a cheaper model when expensive models handle
 *        short chats (the mock's #1 pattern).
 *   R2 · Lower compact threshold when long sessions have shipped without one.
 *   R3 · Review high-cost calls that produced no outcome.
 *   R4 · Silence low-cost receipts when most receipts are < $0.001.
 *
 * Each rule may add a single Recommendation. Tunable thresholds live up top
 * so a future Settings surface can expose them without re-plumbing call sites.
 */

const SHORT_CHAT_RATE_TRIGGER = 0.6;
const SHORT_CHAT_COST_TRIGGER_USD = 1.5;
const LONG_SESSION_TOKEN_TRIGGER = 50_000;
const NO_OUTCOME_COST_TRIGGER_USD = 0.3;
const NO_OUTCOME_MIN_ROWS = 3;
const LOW_COST_PIP_PCT_TRIGGER = 0.6;

export function buildRuleRecommendations(signals: OptimizationSignals): Recommendation[] {
	const recs: Recommendation[] = [];

	// ── R1 · Route quick chats to a fast model ───────────────────────────
	// Heuristic: feature='chat' rows where ≥60% of calls are short, dominant
	// model isn't already a "fast" model, and 30d cost on this combo > $1.5.
	const chatStats = signals.featureModelStats
		.filter((s) => s.feature === 'chat')
		.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
	const dominant = chatStats[0];
	if (
		dominant &&
		dominant.shortChatRate >= SHORT_CHAT_RATE_TRIGGER &&
		dominant.totalCostUsd >= SHORT_CHAT_COST_TRIGGER_USD &&
		!isLikelyFastModel(dominant.model)
	) {
		const fastModel = suggestFastSibling(dominant.provider, dominant.model);
		const savingRatio = 0.65; // typical Haiku-vs-Sonnet swing for short asks
		const estSaving = dominant.totalCostUsd * savingRatio;
		recs.push({
			id: 'r1-route-quick-chats',
			title: `Route quick asks to ${fastModel}`,
			sub: `${Math.round(dominant.shortChatRate * 100)}% of chats are short, no tools. ${fastModel} can answer these accurately in a fraction of the cost.`,
			impact: impactFromSaving(estSaving, signals.totalMonthlyCostUsd),
			estMonthlySavingUsd: round2(estSaving),
			detail: [
				{ label: 'Affected feature', value: 'chat · quick' },
				{ label: 'Before', value: `${dominant.provider} · ${dominant.model}` },
				{ label: 'After', value: `${dominant.provider} · ${fastModel}` },
				{ label: 'Quality est.', value: '−2% win rate' },
			],
			action: {
				kind: 'route_to_cheaper_model',
				params: { capability: 'quick', provider: dominant.provider, model: fastModel },
			},
		});
	}

	// ── R2 · Lower compact threshold ─────────────────────────────────────
	// Heuristic: any long session crossed the compact trigger token count.
	const longSessions = signals.longSessionsWithoutCompact
		.filter((s) => s.totalTokens >= LONG_SESSION_TOKEN_TRIGGER);
	if (longSessions.length > 0) {
		const projSaving = Math.min(longSessions.length * 0.6, 8);
		recs.push({
			id: 'r2-compact-earlier',
			title: 'Compact long research sessions earlier',
			sub: `Lowering compact threshold from 80% → 70% reduces token bloat without hurting recall quality. ${longSessions.length} session${longSessions.length === 1 ? '' : 's'} this period crossed the limit.`,
			impact: 'medium',
			estMonthlySavingUsd: round2(projSaving),
			detail: [
				{ label: 'Affected feature', value: 'agent · research' },
				{ label: 'Quality est.', value: 'no change' },
				{ label: 'New threshold', value: '70%' },
			],
			action: {
				kind: 'lower_compact_threshold',
				params: { threshold: 0.7 },
			},
		});
	}

	// ── R3 · Review no-outcome high-cost runs ────────────────────────────
	const noOutcome = signals.noOutcomeHighCost
		.filter((r) => r.costUsd >= NO_OUTCOME_COST_TRIGGER_USD)
		.slice(0, 5);
	if (noOutcome.length >= NO_OUTCOME_MIN_ROWS) {
		const totalCost = noOutcome.reduce((s, r) => s + r.costUsd, 0);
		recs.push({
			id: 'r3-review-no-outcome',
			title: 'Review no-outcome deep tasks',
			sub: 'These tasks did not lead to a usable outcome. Consider tightening exit criteria or splitting goals.',
			impact: 'investigate',
			estMonthlySavingUsd: round2(totalCost * 0.5),
			evidence: noOutcome.map((r) => ({
				startedIso: new Date(r.createdAt).toISOString(),
				goal: r.promptPreview || `${r.feature} run`,
				model: `${r.provider} · ${r.model}`,
				costUsd: round4(r.costUsd),
				usageLogId: r.usageLogId,
			})),
			action: {
				kind: 'review_no_outcome',
				params: { ids: noOutcome.map((r) => r.usageLogId) },
			},
		});
	}

	// ── R4 · Silence low-cost pip ────────────────────────────────────────
	// Trigger when ≥60% of recorded calls are under $0.0005 — receipt noise
	// outweighs trust gain.
	const tinyCallShare = computeTinyCallShare(signals);
	if (tinyCallShare >= LOW_COST_PIP_PCT_TRIGGER) {
		recs.push({
			id: 'r4-silence-low-cost-pip',
			title: 'Silence low-cost receipts',
			sub: `${Math.round(tinyCallShare * 100)}% of calls this month cost less than $0.0005. Hiding per-message pips reduces visual noise without losing the audit trail.`,
			impact: 'low',
			estMonthlySavingUsd: 0,
			action: {
				kind: 'silence_low_cost_pip',
				params: { threshold: 0.0005 },
			},
		});
	}

	return recs;
}

/**
 * Heuristic: known "fast" tier keywords appearing in the model id. Avoids
 * round-tripping the model catalog for what's essentially a string test.
 */
function isLikelyFastModel(modelId: string): boolean {
	const lower = modelId.toLowerCase();
	return (
		lower.includes('haiku') ||
		lower.includes('mini') ||
		lower.includes('flash') ||
		lower.includes('nano') ||
		lower.includes('1b') ||
		lower.includes('3b') ||
		lower.includes('7b')
	);
}

/**
 * Suggest a cheaper sibling for the dominant provider. Pure heuristic — the
 * LLM path overrides this when available.
 */
function suggestFastSibling(provider: string, modelId: string): string {
	const p = provider.toLowerCase();
	const lower = modelId.toLowerCase();
	if (p === 'anthropic') return 'Claude Haiku 3.5';
	if (p === 'openai') {
		if (lower.includes('4.1') || lower.includes('4o')) return 'GPT-4o mini';
		return 'GPT-4o mini';
	}
	if (p === 'google') return 'Gemini 2.0 Flash';
	if (p === 'openrouter') return 'Claude Haiku 3.5';
	if (p === 'perplexity') return 'sonar-small';
	if (p === 'ollama') return 'qwen2.5-3b';
	return 'a fast-tier model';
}

function impactFromSaving(saving: number, monthlyTotal: number): RecommendationImpact {
	if (monthlyTotal <= 0) return 'medium';
	const share = saving / monthlyTotal;
	if (share >= 0.2) return 'high';
	if (share >= 0.07) return 'medium';
	return 'low';
}

function computeTinyCallShare(signals: OptimizationSignals): number {
	// Reuse featureModelStats — `callCount` * (avgInput+avgOutput) approximates
	// total tokens; without per-row cost histograms, fall back to per-feature
	// cost/call avg. Threshold $0.0005 = 0.05¢.
	let total = 0;
	let tiny = 0;
	for (const row of signals.featureModelStats) {
		total += row.callCount;
		const perCall = row.callCount > 0 ? row.totalCostUsd / row.callCount : 0;
		if (perCall < 0.0005) tiny += row.callCount;
	}
	return total > 0 ? tiny / total : 0;
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function round4(n: number): number {
	return Math.round(n * 10_000) / 10_000;
}
