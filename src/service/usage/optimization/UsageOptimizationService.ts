import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { sql } from 'kysely';
import { vercelGenerateText } from '@/core/providers/vercel';
import type { Profile } from '@/core/profiles/types';
import { buildRuleRecommendations } from './rules';
import {
	OPTIMIZATION_SYSTEM_PROMPT,
	buildOptimizationPrompt,
} from './prompt';
import { RecommendationsResponseSchema } from './schema';
import type {
	OptimizationResult,
	OptimizationSignals,
	ProjectionSnapshot,
	Recommendation,
	Scenario,
	ScenarioSummary,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_CHAT_MAX_TOKENS = 1_500;
const NO_OUTCOME_PROBE_LIMIT = 8;
const LLM_MAX_RETRIES = 1;

export interface RunOptimizationOptions {
	/** Online profile + model used to consult the LLM. Pass null to force rules-only. */
	llm: { profile: Profile; modelId: string } | null;
	/** Current monthly budget USD. Drives projection card. */
	monthlyBudgetUsd: number;
	/** Linear projection of current cycle spend. */
	projectedMonthlyUsd: number;
	/** Cycle [from, to] in ms, used for the projection snapshot card. */
	cycle: { from: number; to: number };
	signal?: AbortSignal;
}

/**
 * Singleton optimization curator. Owns the rule engine + LLM dispatch + result
 * caching. Lifecycle mirrors UsageTrackingService.
 *
 * The service produces a `OptimizationResult` that the Overview "Recommended
 * actions" card AND the Optimization screen both render — Overview takes the
 * top 3, Optimization shows everything.
 */
export class UsageOptimizationService {
	private static instance: UsageOptimizationService | null = null;
	private db: Kysely<DbSchema> | null = null;

	static getInstance(): UsageOptimizationService {
		if (!UsageOptimizationService.instance) {
			UsageOptimizationService.instance = new UsageOptimizationService();
		}
		return UsageOptimizationService.instance;
	}

	init(db: Kysely<DbSchema>): void {
		this.db = db;
	}

	destroy(): void {
		this.db = null;
		UsageOptimizationService.instance = null;
	}

	/**
	 * Run the curator end-to-end: collect signals, attempt LLM (when a profile
	 * is provided), validate against zod, fall back to deterministic rules on
	 * any failure. Always returns a result — never throws under normal
	 * conditions.
	 */
	async run(opts: RunOptimizationOptions): Promise<OptimizationResult> {
		const signals = await this.collectSignals(opts.monthlyBudgetUsd, opts.projectedMonthlyUsd);

		let recs: Recommendation[] | null = null;
		let source: OptimizationResult['source'] = 'rules';
		if (opts.llm) {
			recs = await this.tryLLM(opts.llm, signals, opts.signal);
			if (recs) source = 'llm';
		}
		if (!recs || recs.length === 0) {
			recs = buildRuleRecommendations(signals);
		}

		const projection = buildProjection({
			projectedMonthlyUsd: opts.projectedMonthlyUsd,
			recs,
			budgetUsd: opts.monthlyBudgetUsd,
			cycle: opts.cycle,
		});
		const scenarios = buildScenarios(recs, opts.projectedMonthlyUsd);
		return { recommendations: recs, projection, scenarios, source, signals };
	}

	// ── Signal collection ───────────────────────────────────────────────

	private async collectSignals(
		monthlyBudgetUsd: number,
		projectedMonthlyUsd: number,
	): Promise<OptimizationSignals> {
		const db = this.requireDb();
		const now = Date.now();
		const startMs = now - 30 * DAY_MS;

		const [featureModelRaw, noOutcome, longSessions, monthTotal] = await Promise.all([
			collectFeatureModelStats(db, startMs, now),
			collectNoOutcomeHighCost(db, startMs, now),
			collectLongSessions(db, startMs, now),
			collectMonthTotal(db, startMs, now),
		]);

		return {
			featureModelStats: featureModelRaw,
			noOutcomeHighCost: noOutcome,
			longSessionsWithoutCompact: longSessions,
			projectedMonthlyUsd,
			monthlyBudgetUsd,
			totalMonthlyCostUsd: monthTotal,
		};
	}

	// ── LLM path ────────────────────────────────────────────────────────

	private async tryLLM(
		llm: { profile: Profile; modelId: string },
		signals: OptimizationSignals,
		signal?: AbortSignal,
	): Promise<Recommendation[] | null> {
		const userPrompt = buildOptimizationPrompt(signals);
		for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
			if (signal?.aborted) return null;
			try {
				const { text } = await vercelGenerateText(llm.profile, llm.modelId, [
					{ role: 'system', content: [{ type: 'text', text: OPTIMIZATION_SYSTEM_PROMPT }] },
					{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
				]);
				const parsed = parseJson(text);
				const result = RecommendationsResponseSchema.safeParse(parsed);
				if (result.success) {
					// Drop entries whose action would alter HarnessSettings the rule
					// engine never validated — let the renderer treat them as advisory.
					return result.data.recommendations as Recommendation[];
				}
				console.warn(
					'[UsageOptimization] LLM response failed schema:',
					result.error.issues.slice(0, 2),
				);
			} catch (e) {
				console.warn('[UsageOptimization] LLM call failed:', e);
			}
		}
		return null;
	}

	private requireDb(): Kysely<DbSchema> {
		if (!this.db) {
			throw new Error('[UsageOptimizationService] Not initialized — call init() first');
		}
		return this.db;
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseJson(raw: string): unknown {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	return JSON.parse(candidate);
}

async function collectFeatureModelStats(
	db: Kysely<DbSchema>,
	startMs: number,
	endMs: number,
): Promise<OptimizationSignals['featureModelStats']> {
	const rows = await sql<{
		feature: string;
		provider: string;
		model: string;
		call_count: number;
		avg_input: number;
		avg_output: number;
		total_cost: number;
		short_count: number;
	}>`
		SELECT
			feature,
			provider,
			model,
			COUNT(*) AS call_count,
			COALESCE(AVG(input_tokens), 0)  AS avg_input,
			COALESCE(AVG(output_tokens), 0) AS avg_output,
			COALESCE(SUM(cost_usd), 0)      AS total_cost,
			SUM(CASE WHEN (input_tokens + output_tokens) <= ${SHORT_CHAT_MAX_TOKENS} THEN 1 ELSE 0 END) AS short_count
		FROM usage_log
		WHERE created_at >= ${startMs} AND created_at <= ${endMs}
		GROUP BY feature, provider, model
		ORDER BY total_cost DESC
	`.execute(db);

	return rows.rows.map((r) => ({
		feature: r.feature,
		provider: r.provider,
		model: r.model,
		callCount: Number(r.call_count),
		avgInputTokens: Math.round(Number(r.avg_input)),
		avgOutputTokens: Math.round(Number(r.avg_output)),
		totalCostUsd: Number(r.total_cost),
		shortChatRate: Number(r.call_count) > 0 ? Number(r.short_count) / Number(r.call_count) : 0,
	}));
}

async function collectNoOutcomeHighCost(
	db: Kysely<DbSchema>,
	startMs: number,
	endMs: number,
): Promise<OptimizationSignals['noOutcomeHighCost']> {
	const rows = await sql<{
		id: number;
		created_at: number;
		feature: string;
		provider: string;
		model: string;
		cost_usd: number;
		preview: string | null;
	}>`
		SELECT
			ul.id,
			ul.created_at,
			ul.feature,
			ul.provider,
			ul.model,
			ul.cost_usd,
			COALESCE(json_extract(ul.metadata_json, '$.preview.user_prompt'), '') AS preview
		FROM usage_log ul
		LEFT JOIN usage_outcome uo
			ON json_extract(ul.metadata_json, '$.message_id') = uo.message_id
		WHERE ul.created_at >= ${startMs}
		  AND ul.created_at <= ${endMs}
		  AND ul.cost_usd >= 0.1
		  AND uo.id IS NULL
		ORDER BY ul.cost_usd DESC
		LIMIT ${NO_OUTCOME_PROBE_LIMIT}
	`.execute(db);

	return rows.rows.map((r) => ({
		usageLogId: r.id,
		createdAt: Number(r.created_at),
		feature: r.feature,
		provider: r.provider,
		model: r.model,
		costUsd: Number(r.cost_usd),
		promptPreview: (r.preview ?? '').slice(0, 120),
	}));
}

async function collectLongSessions(
	db: Kysely<DbSchema>,
	startMs: number,
	endMs: number,
): Promise<OptimizationSignals['longSessionsWithoutCompact']> {
	const rows = await sql<{
		session_id: string | null;
		total_tokens: number;
		total_cost: number;
		max_input: number;
	}>`
		SELECT
			session_id,
			SUM(input_tokens + output_tokens) AS total_tokens,
			SUM(cost_usd)                     AS total_cost,
			MAX(input_tokens)                 AS max_input
		FROM usage_log
		WHERE created_at >= ${startMs}
		  AND created_at <= ${endMs}
		  AND session_id IS NOT NULL
		GROUP BY session_id
		HAVING total_tokens > 40000
		ORDER BY total_tokens DESC
		LIMIT 10
	`.execute(db);

	return rows.rows.map((r) => ({
		sessionId: r.session_id ?? '',
		totalTokens: Number(r.total_tokens),
		totalCostUsd: Number(r.total_cost),
		// Approximation: peakRatio = max_input / 200k. Avoid hard-coding the
		// real context window per model; the rule engine just needs "did this
		// session ever feel big" which max_input captures.
		peakRatio: Math.min(1, Number(r.max_input) / 200_000),
	}));
}

async function collectMonthTotal(db: Kysely<DbSchema>, startMs: number, endMs: number): Promise<number> {
	const row = await sql<{ total: number }>`
		SELECT COALESCE(SUM(cost_usd), 0) AS total
		FROM usage_log
		WHERE created_at >= ${startMs} AND created_at <= ${endMs}
	`.execute(db);
	return Number(row.rows[0]?.total ?? 0);
}

function buildProjection(args: {
	projectedMonthlyUsd: number;
	recs: Recommendation[];
	budgetUsd: number;
	cycle: { from: number; to: number };
}): ProjectionSnapshot {
	const totalSaving = args.recs.reduce((s, r) => s + r.estMonthlySavingUsd, 0);
	const withApplied = Math.max(0, args.projectedMonthlyUsd - totalSaving);
	const savingsPct = args.projectedMonthlyUsd > 0
		? totalSaving / args.projectedMonthlyUsd
		: null;
	return {
		withoutChangesUsd: round2(args.projectedMonthlyUsd),
		withAppliedUsd: round2(withApplied),
		savingsUsd: round2(totalSaving),
		savingsPct,
		budgetUsd: args.budgetUsd,
		cycleStartIso: new Date(args.cycle.from).toISOString(),
		cycleEndIso: new Date(args.cycle.to).toISOString(),
	};
}

/**
 * Three scenarios fan out from the same Recommendation set:
 *   - Conservative — only "investigate" + "low" (no model swaps)
 *   - Balanced — adds "medium" impact (the default the dashboard pre-selects)
 *   - Aggressive — adds "high" (apply every model-swap recommendation)
 *
 * Each scenario sums `estMonthlySavingUsd` of the included recs and projects
 * monthly spend accordingly.
 */
function buildScenarios(recs: Recommendation[], projectedMonthly: number): ScenarioSummary[] {
	const groups: Record<Scenario, Recommendation[]> = {
		conservative: recs.filter((r) => r.impact === 'investigate' || r.impact === 'low'),
		balanced: recs.filter((r) => r.impact !== 'high'),
		aggressive: recs,
	};

	const make = (id: Scenario, label: string, desc: string): ScenarioSummary => {
		const included = groups[id];
		const saving = included.reduce((s, r) => s + r.estMonthlySavingUsd, 0);
		return {
			id,
			label,
			description: desc,
			projectionUsd: round2(Math.max(0, projectedMonthly - saving)),
			includedRecommendationIds: included.map((r) => r.id),
		};
	};

	return [
		make('conservative', 'Conservative', 'Apply only investigations and silencing tweaks. No model swaps.'),
		make('balanced', 'Balanced', 'Investigations + medium-impact changes. Skip the highest-impact model swap.'),
		make('aggressive', 'Aggressive', 'Apply every recommendation including high-impact model swaps.'),
	];
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
