import { useState, useEffect } from 'react';
import type {
	TimeRange,
	UsageKPIs,
	UsageOutcomeEventType,
} from '@/service/usage/types';
import { USAGE_OUTCOME_EVENT_TYPES } from '@/service/usage/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert a TimeRange to absolute ms boundaries. Mirrors the conversion in
 * `UsageTrackingService.rangeToMs` but is duplicated here (and intentionally
 * kept simple) because the outcome service queries hit `usage_outcome`
 * directly — they don't go through tracking-service helpers.
 */
function timeRangeToMs(range: TimeRange): { from: number; to: number } {
	const to = Date.now();
	let from: number;
	switch (range) {
		case 'today': {
			const d = new Date();
			d.setHours(0, 0, 0, 0);
			from = d.getTime();
			break;
		}
		case '7d':
			from = to - 7 * DAY_MS;
			break;
		case '30d':
			from = to - 30 * DAY_MS;
			break;
		case 'all':
			from = 0;
			break;
	}
	return { from, to };
}

export interface TokenTrendPoint {
	date: string;
	inputTokens: number;
	outputTokens: number;
}

export interface CostTrendPoint {
	date: string;
	provider: string;
	cost: number;
}

export interface FeatureDistItem {
	feature: string;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	callCount: number;
}

export interface ModelDistItem {
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	callCount: number;
}

export interface CostBreakdownItem {
	provider: string;
	cost: number;
	callCount: number;
}

export interface DailyBreakdownItem {
	date: string;
	feature: string;
	inputTokens: number;
	outputTokens: number;
}

export interface UsageData {
	kpis: UsageKPIs | null;
	tokenTrend: TokenTrendPoint[];
	costTrend: CostTrendPoint[];
	featureDist: FeatureDistItem[];
	modelDist: ModelDistItem[];
	costBreakdown: CostBreakdownItem[];
	dailyBreakdown: DailyBreakdownItem[];
	recentCalls: UsageLogRow[];
	loading: boolean;
}

export function useUsageData(range: TimeRange): UsageData {
	const { usageServices } = useServiceContext();
	const [data, setData] = useState<UsageData>({
		kpis: null,
		tokenTrend: [],
		costTrend: [],
		featureDist: [],
		modelDist: [],
		costBreakdown: [],
		dailyBreakdown: [],
		recentCalls: [],
		loading: true,
	});

	useEffect(() => {
		if (!usageServices) return;
		let cancelled = false;

		async function fetchAll() {
			setData((prev) => ({ ...prev, loading: true }));

			try {
				const svc = usageServices!.tracking;
				const [kpis, tokenTrend, costTrend, featureDist, modelDist, costBreakdown, dailyBreakdown, recentCalls] =
					await Promise.all([
						svc.getKPIs(range),
						svc.getTokenTrend(range),
						svc.getCostTrend(range),
						svc.getFeatureDistribution(range),
						svc.getModelDistribution(range),
						svc.getCostBreakdown(range),
						svc.getDailyBreakdown(range),
						svc.getRecentCalls(range),
					]);

				if (!cancelled) {
					setData({
						kpis,
						tokenTrend,
						costTrend,
						featureDist,
						modelDist,
						costBreakdown,
						dailyBreakdown,
						recentCalls,
						loading: false,
					});
				}
			} catch (err) {
				console.error('[useUsageData] Failed to fetch usage data:', err);
				if (!cancelled) {
					setData((prev) => ({ ...prev, loading: false }));
				}
			}
		}

		void fetchAll();
		return () => {
			cancelled = true;
		};
	}, [range, usageServices]);

	return data;
}

// ── Overview-screen metrics (PR-Dash-2) ─────────────────────────────────────

/**
 * Three funnel stages (spec §11.3).
 *
 * - **invoked**: each AI call that produced a `usage_log` row.
 * - **inspected**: any message that produced ≥1 outcome of any kind. Spec asks
 *   for "user looked at it" (dwell ≥3s or scrolled to bottom), but
 *   `view_dwell` isn't in the closed `UsageOutcomeEventType` enum yet, so we
 *   conservatively treat the union of all outcomes as "inspected". Documented
 *   as a known gap to fix in a later spec PR.
 * - **adopted**: distinct message_ids with a "strong" outcome (vault_save,
 *   copilot_accept, agent_file_emit). Excludes search_click + continuation.
 *
 * Counts are not strictly nested (inspected can in theory exceed invoked if a
 * stale outcome's message_id isn't in usage_log within range) but the
 * dashboard renders them as a funnel because, in normal traffic, the strong
 * outcomes are always a subset of "user looked at it" which is a subset of
 * "AI was invoked".
 */
export interface FunnelStages {
	invoked: number;
	inspected: number;
	adopted: number;
}

export interface OutcomeBreakdownEntry {
	event_type: UsageOutcomeEventType;
	count: number;
}

/**
 * Overview-screen metric bundle (spec §11.2 MPG + §11.3 funnel + outcome mix).
 *
 * - `mpg`: cost-per-useful-message — `totalCost / usefulCount`. `null` when
 *   the denominator is 0 (no useful messages in range → UI shows "—").
 * - `funnel`: 3-stage funnel counts (see {@link FunnelStages}).
 * - `outcomeBreakdown`: count by event_type for the full enum, in declared
 *   order. Missing event_types are returned with `count: 0` so the UI can
 *   render a stable row order without flicker.
 * - `usefulCount` / `totalCost` / `totalCalls`: raw inputs surfaced for the
 *   KPI cards (also used to compute MPG locally).
 */
export interface DashboardMetrics {
	mpg: number | null;
	funnel: FunnelStages;
	outcomeBreakdown: OutcomeBreakdownEntry[];
	usefulCount: number;
	totalCost: number;
	totalCalls: number;
	loading: boolean;
}

const EMPTY_METRICS: DashboardMetrics = {
	mpg: null,
	funnel: { invoked: 0, inspected: 0, adopted: 0 },
	outcomeBreakdown: USAGE_OUTCOME_EVENT_TYPES.map((event_type) => ({
		event_type,
		count: 0,
	})),
	usefulCount: 0,
	totalCost: 0,
	totalCalls: 0,
	loading: true,
};

/**
 * Hook for the Overview screen. Aggregates MPG, funnel, outcome breakdown,
 * and basic totals from the two usage services.
 *
 * Resilient by design: any one service failure leaves the screen with zero
 * metrics + `loading: false`, never an exception bubbling into React.
 */
export function useDashboardMetrics(range: TimeRange): DashboardMetrics {
	const { usageServices } = useServiceContext();
	const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);

	useEffect(() => {
		if (!usageServices) return;
		let cancelled = false;

		async function fetchAll() {
			setMetrics((prev) => ({ ...prev, loading: true }));

			try {
				const tracking = usageServices!.tracking;
				const outcome = usageServices!.outcome;
				const ms = timeRangeToMs(range);

				const [kpis, usefulCount, adoptedCount, counts] = await Promise.all([
					tracking.getKPIs(range),
					outcome.countUsefulMessages(ms),
					outcome.countAdoptedMessages(ms),
					outcome.countByType(ms),
				]);

				if (cancelled) return;

				// Backfill missing event_types with 0 so the UI's row count is stable.
				const countsByType = new Map(
					counts.map((c) => [c.event_type, c.count] as const),
				);
				const outcomeBreakdown: OutcomeBreakdownEntry[] =
					USAGE_OUTCOME_EVENT_TYPES.map((event_type) => ({
						event_type,
						count: countsByType.get(event_type) ?? 0,
					}));

				const totalCost = kpis.totalCostUsd;
				const totalCalls = kpis.callCount;
				const mpg = usefulCount > 0 ? totalCost / usefulCount : null;

				setMetrics({
					mpg,
					funnel: {
						invoked: totalCalls,
						inspected: usefulCount,
						adopted: adoptedCount,
					},
					outcomeBreakdown,
					usefulCount,
					totalCost,
					totalCalls,
					loading: false,
				});
			} catch (err) {
				console.error('[useDashboardMetrics] Failed to fetch metrics:', err);
				if (!cancelled) {
					setMetrics({ ...EMPTY_METRICS, loading: false });
				}
			}
		}

		void fetchAll();
		return () => {
			cancelled = true;
		};
	}, [range, usageServices]);

	return metrics;
}
