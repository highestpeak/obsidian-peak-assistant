import { useCallback, useEffect, useState } from 'react';
import { UsageOptimizationService } from '@/service/usage/optimization';
import type {
	OptimizationResult,
} from '@/service/usage/optimization';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import { AppContext } from '@/app/context/AppContext';

export interface UseOptimizationState {
	result: OptimizationResult | null;
	loading: boolean;
	refresh: () => void;
}

/**
 * Wraps `UsageOptimizationService.run`. Resolves the LLM profile from the
 * active agent profile (curator falls back to rule engine when none is
 * configured). Cycles auto-refresh on mount.
 */
export function useOptimization(): UseOptimizationState {
	const [result, setResult] = useState<OptimizationResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [nonce, setNonce] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const controller = new AbortController();
		setLoading(true);
		(async () => {
			try {
				const svc = UsageOptimizationService.getInstance();
				const budget = readBudget();
				const pace = budget.monthlyUsd > 0
					? await UsageTrackingService.getInstance().getMonthlyPace(
						budget.monthlyUsd,
						budget.resetDayOfMonth,
					)
					: null;
				const llm = resolveLlm();
				const res = await svc.run({
					llm,
					monthlyBudgetUsd: budget.monthlyUsd,
					projectedMonthlyUsd: pace?.projected ?? 0,
					cycle: {
						from: pace?.cycleStartMs ?? Date.now(),
						to: pace?.cycleEndMs ?? Date.now(),
					},
					signal: controller.signal,
				});
				if (cancelled) return;
				setResult(res);
				setLoading(false);
			} catch (e) {
				console.error('[useOptimization] Failed to run', e);
				if (!cancelled) {
					setResult(null);
					setLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [nonce]);

	const refresh = useCallback(() => setNonce((n) => n + 1), []);
	return { result, loading, refresh };
}

function readBudget(): { monthlyUsd: number; resetDayOfMonth: number } {
	try {
		const b = AppContext.getInstance().settings.harnessSettings?.budget;
		if (b) {
			return {
				monthlyUsd: Number(b.monthlyUsd) || 0,
				resetDayOfMonth: Number(b.resetDayOfMonth) || 1,
			};
		}
	} catch { /* fall through */ }
	return { monthlyUsd: 0, resetDayOfMonth: 1 };
}

function resolveLlm(): { profile: Profile; modelId: string } | null {
	try {
		const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
		if (!profile) return null;
		const modelId = profile.primaryModel?.trim();
		if (!modelId) return null;
		return { profile, modelId };
	} catch {
		return null;
	}
}
