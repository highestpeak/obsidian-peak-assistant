import { useState, useEffect } from 'react';
import type { TimeRange, UsageKPIs } from '@/service/usage/types';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';

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
		let cancelled = false;

		async function fetchAll() {
			setData((prev) => ({ ...prev, loading: true }));

			try {
				const svc = UsageTrackingService.getInstance();
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
	}, [range]);

	return data;
}
