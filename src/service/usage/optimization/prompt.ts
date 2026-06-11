import type { OptimizationSignals } from './types';

export const OPTIMIZATION_SYSTEM_PROMPT = `You are an AI usage optimization curator. You read aggregated usage data for the user's last 30 days and produce a small set of ranked, actionable recommendations.

Hard rules:
- Output ONLY a JSON object: { "recommendations": [...] }. No markdown, no commentary.
- At most 6 recommendations. Order by impact (high first).
- Each recommendation MUST include an "action" with one of these kinds:
  - route_to_cheaper_model
  - lower_compact_threshold
  - review_no_outcome
  - silence_low_cost_pip
  - set_budget
- "estMonthlySavingUsd" must be a non-negative number. Use 0 when the recommendation is qualitative (impact = "investigate").
- "impact" is one of "high", "medium", "low", "investigate".

Style:
- "title" is short (≤80 chars), reads like a command — e.g. "Route quick asks to Haiku".
- "sub" explains WHY in 1–2 sentences with concrete numbers from the data.
- Add "detail" entries (label/value pairs) when the recommendation is a model swap (Affected feature / Before / After / Quality est.).
- Add "evidence" entries (≤4 rows) for review_no_outcome — pick the real usage_log rows surfaced.

Never invent metrics. Only reference numbers present in the signals you receive.`;

export function buildOptimizationPrompt(signals: OptimizationSignals): string {
	const lines: string[] = [];
	lines.push(`Monthly budget: $${signals.monthlyBudgetUsd.toFixed(2)}`);
	lines.push(`Projected monthly spend (linear): $${signals.projectedMonthlyUsd.toFixed(2)}`);
	lines.push(`Total monthly cost so far: $${signals.totalMonthlyCostUsd.toFixed(2)}`);
	lines.push('');
	lines.push('FEATURE × MODEL stats (last 30d, top by cost):');
	for (const row of signals.featureModelStats.slice(0, 10)) {
		lines.push(
			`- feature=${row.feature} provider=${row.provider} model=${row.model} calls=${row.callCount} cost=$${row.totalCostUsd.toFixed(2)} avgIn=${row.avgInputTokens} avgOut=${row.avgOutputTokens} shortChat=${(row.shortChatRate * 100).toFixed(0)}%`,
		);
	}
	lines.push('');
	lines.push(`No-outcome high-cost calls (last 30d, $${signals.noOutcomeHighCost[0]?.costUsd?.toFixed(2) ?? 'n/a'}+ at top):`);
	for (const row of signals.noOutcomeHighCost.slice(0, 5)) {
		lines.push(
			`- id=${row.usageLogId} feature=${row.feature} provider=${row.provider} model=${row.model} cost=$${row.costUsd.toFixed(2)} preview="${row.promptPreview}"`,
		);
	}
	lines.push('');
	lines.push('Long sessions without compact:');
	for (const row of signals.longSessionsWithoutCompact.slice(0, 5)) {
		lines.push(
			`- session=${row.sessionId} tokens=${row.totalTokens} cost=$${row.totalCostUsd.toFixed(2)} peakRatio=${row.peakRatio.toFixed(2)}`,
		);
	}
	lines.push('');
	lines.push('Return ranked recommendations as JSON.');
	return lines.join('\n');
}
