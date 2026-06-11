/**
 * Shared types for the Usage Optimization curator. The dashboard's
 * Optimization screen and Overview "Recommended actions" card both consume
 * `Recommendation[]`.
 *
 * Shape mirrors the mock at
 * `docs/gstack/usage-dashboard-mockups-2026-05-29/6-optimization.html` —
 * num + title + sub + detail dl + side panel + Apply/Preview verbs.
 */

export type RecommendationImpact = 'high' | 'medium' | 'low' | 'investigate';

export type RecommendationActionKind =
	| 'route_to_cheaper_model'    // bind a tier (capability) to a cheaper model
	| 'lower_compact_threshold'   // change context-compact rule threshold
	| 'review_no_outcome'         // open traces for high-cost no-outcome runs
	| 'silence_low_cost_pip'      // toggle the corresponding alert rule
	| 'set_budget';                // open the budget settings

export interface RecommendationAction {
	kind: RecommendationActionKind;
	/** Free-form params; consumer interprets per kind. */
	params?: Record<string, unknown>;
}

export interface RecommendationEvidenceRow {
	startedIso: string;
	goal: string;
	model: string;
	costUsd: number;
	usageLogId?: number;
}

export interface RecommendationDetail {
	label: string;
	value: string;
}

export interface Recommendation {
	id: string;
	title: string;
	sub: string;
	impact: RecommendationImpact;
	estMonthlySavingUsd: number;
	/** Optional structured key-value pairs rendered as a <dl> grid. */
	detail?: RecommendationDetail[];
	/** Optional evidence rows shown as a thin inline table (rec #3 pattern). */
	evidence?: RecommendationEvidenceRow[];
	action: RecommendationAction;
}

/**
 * Forward projection summary shown in the right rail of the Optimization
 * surface. `withoutChanges` is the linear projection ignoring all
 * recommendations; `withApplied` subtracts the sum of every Recommendation's
 * `estMonthlySavingUsd` from the projection.
 */
export interface ProjectionSnapshot {
	withoutChangesUsd: number;
	withAppliedUsd: number;
	savingsUsd: number;
	savingsPct: number | null;
	budgetUsd: number;
	cycleStartIso: string;
	cycleEndIso: string;
}

export type Scenario = 'conservative' | 'balanced' | 'aggressive';

export interface ScenarioSummary {
	id: Scenario;
	label: string;
	description: string;
	projectionUsd: number;
	includedRecommendationIds: string[];
}

/**
 * Aggregate signals the rule engine + LLM both consume. Computed by
 * `UsageOptimizationService.collectSignals` so the two paths see the same
 * inputs.
 */
export interface OptimizationSignals {
	/** Last 30 days of usage_log aggregates per feature × model. */
	featureModelStats: Array<{
		feature: string;
		provider: string;
		model: string;
		callCount: number;
		avgInputTokens: number;
		avgOutputTokens: number;
		totalCostUsd: number;
		shortChatRate: number; // 0..1 — fraction with <= 3 turns + no tool calls
	}>;
	/** Top N high-cost calls in last 30 days without any usage_outcome event. */
	noOutcomeHighCost: Array<{
		usageLogId: number;
		createdAt: number;
		feature: string;
		provider: string;
		model: string;
		costUsd: number;
		promptPreview: string;
	}>;
	/** Sessions whose token usage exceeded the compact threshold without a compact event. */
	longSessionsWithoutCompact: Array<{
		sessionId: string;
		totalTokens: number;
		totalCostUsd: number;
		peakRatio: number; // observed peak context utilization 0..1
	}>;
	/** Monthly projected spend without any optimization. */
	projectedMonthlyUsd: number;
	/** Current monthly budget (0 = no budget set). */
	monthlyBudgetUsd: number;
	/** Total per-feature share of monthly spend, for rate-base context in prompts. */
	totalMonthlyCostUsd: number;
}

export interface OptimizationResult {
	recommendations: Recommendation[];
	projection: ProjectionSnapshot;
	scenarios: ScenarioSummary[];
	source: 'llm' | 'rules';
	signals: OptimizationSignals;
}
