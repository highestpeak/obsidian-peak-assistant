import { PromptId } from '@/core/prompt/PromptId';
import { TemplateManager } from '@/core/template/TemplateManager';
import type { OptimizationSignals } from './types';

/**
 * T11Y-6: OPTIMIZATION_SYSTEM_PROMPT body moved to
 * templates/prompts/usage-optimization-system.md (PromptId.UsageOptimizationSystem).
 */
export async function getOptimizationSystemPrompt(): Promise<string> {
	const tm = TemplateManager.getInstance();
	if (!tm) throw new Error('TemplateManager not bound — cannot render usage optimization system prompt.');
	return tm.render(PromptId.UsageOptimizationSystem, {});
}

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
