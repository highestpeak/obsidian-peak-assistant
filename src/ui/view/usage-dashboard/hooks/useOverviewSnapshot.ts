import { useEffect, useState } from 'react';
import type { TimeRange } from '@/service/usage/types';
import type {
	CostPerSavedArtifact,
	MonthlyPaceSnapshot,
	ThisWeekTrio,
} from '@/service/usage/UsageTrackingService';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface OverviewSnapshot {
	pace: MonthlyPaceSnapshot | null;
	costPerSaved: CostPerSavedArtifact | null;
	thisWeek: ThisWeekTrio | null;
	monthlyBudgetUsd: number;
	loading: boolean;
}

const EMPTY: OverviewSnapshot = {
	pace: null,
	costPerSaved: null,
	thisWeek: null,
	monthlyBudgetUsd: 0,
	loading: true,
};

/**
 * Aggregate every async input the Overview screen needs:
 *   - Monthly pace (budget tracking)
 *   - Cost-per-saved-artifact + period delta
 *   - This-week sparkline trio
 *
 * Recomputes whenever `range` changes; budget settings are read fresh from
 * AppContext on every render so user edits in the Budget tab propagate
 * immediately when the user navigates back to Overview.
 */
export function useOverviewSnapshot(range: TimeRange): OverviewSnapshot {
	const { settings, usageServices } = useServiceContext();
	const budget = readBudget(settings);
	const [snapshot, setSnapshot] = useState<OverviewSnapshot>(EMPTY);

	useEffect(() => {
		if (!usageServices) return;
		let cancelled = false;
		setSnapshot((prev) => ({ ...prev, loading: true }));
		(async () => {
			try {
				const tracking = usageServices.tracking;
				const outcome = usageServices.outcome;

				const [pace, costPerSaved, thisWeek] = await Promise.all([
					budget.monthlyUsd > 0
						? tracking.getMonthlyPace(budget.monthlyUsd, budget.resetDayOfMonth)
						: Promise.resolve(null),
					tracking.getCostPerSavedArtifact(range, {
						adoptedMessageIdsInRange: (r) => outcome.adoptedMessageIds(r),
					}),
					tracking.getThisWeekTrio(range, async (start, end) => {
						const rows = await outcome.adoptedCountByDay(start, end);
						return new Map(rows.map((r) => [r.date, r.count] as const));
					}),
				]);

				if (cancelled) return;
				setSnapshot({
					pace,
					costPerSaved,
					thisWeek,
					monthlyBudgetUsd: budget.monthlyUsd,
					loading: false,
				});
			} catch (err) {
				console.error('[useOverviewSnapshot] Failed to load', err);
				if (!cancelled) {
					setSnapshot({ ...EMPTY, loading: false, monthlyBudgetUsd: budget.monthlyUsd });
				}
			}
		})();
		return () => { cancelled = true; };
	}, [range, budget.monthlyUsd, budget.resetDayOfMonth, usageServices]);

	return snapshot;
}

function readBudget(settings: import('@/core/config/settingsTypes').MyPluginSettings): { monthlyUsd: number; resetDayOfMonth: number } {
	try {
		const b = settings.harnessSettings?.budget;
		if (b) {
			return {
				monthlyUsd: Number(b.monthlyUsd) || 0,
				resetDayOfMonth: Number(b.resetDayOfMonth) || 1,
			};
		}
	} catch {
		/* AppContext not initialised yet — fall through to safe defaults */
	}
	return { monthlyUsd: 0, resetDayOfMonth: 1 };
}
