import React, { useEffect, useState } from 'react';
import type { TimeRange } from '@/service/usage/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { InlineTableBar, HelpAffordance } from '../components/charts';
import type { OutcomeValueStrings } from '../UsageDashboard';

export interface OutcomeValueScreenProps {
	range: TimeRange;
	strings: OutcomeValueStrings;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
		case '7d': from = to - 7 * DAY_MS; break;
		case '30d': from = to - 30 * DAY_MS; break;
		case 'all': from = 0; break;
	}
	return { from, to };
}

/**
 * Per-feature row in the Outcome Value table. Combines:
 *  - usage_log aggregates (cost + call count) per feature
 *  - intersection of per-feature message_ids with usage_outcome's
 *    useful / adopted message_id sets
 *
 * MPG = totalCost / usefulCount (`null` when usefulCount === 0).
 * Adopt rate = adoptedCount / callCount (or null when callCount === 0).
 */
interface FeatureRow {
	feature: string;
	callCount: number;
	totalCost: number;
	usefulCount: number;
	adoptedCount: number;
}

interface State {
	rows: FeatureRow[];
	loading: boolean;
}

const EMPTY_STATE: State = { rows: [], loading: true };

/**
 * 03 · Outcome Value — per-feature MPG (spec §6.2 + §11.2).
 *
 * Joins cost (UsageTrackingService.getCostByFeature) with outcome counts
 * (UsageOutcomeService.usefulMessageIds + adoptedMessageIds) in JS land via
 * the per-feature message_id sets stored in `usage_log.metadata_json`. We
 * deliberately do the join here, not in SQL — keeps both tables independent
 * and avoids a cross-tenant query (the chat-tenant DB holds both today, but
 * the dashboard shouldn't assume so).
 */
export function OutcomeValueScreen({ range, strings }: OutcomeValueScreenProps) {
	const { usageServices } = useServiceContext();
	const [state, setState] = useState<State>(EMPTY_STATE);

	useEffect(() => {
		if (!usageServices) {
			setState({ ...EMPTY_STATE, loading: false });
			return;
		}
		let cancelled = false;
		setState((p) => ({ ...p, loading: true }));
		(async () => {
			try {
				const tracking = usageServices.tracking;
				const outcome = usageServices.outcome;
				const ms = timeRangeToMs(range);

				const [costs, msgsByFeature, usefulIds, adoptedIds] = await Promise.all([
					tracking.getCostByFeature(range),
					tracking.getMessageIdsByFeature(range),
					outcome.usefulMessageIds(ms),
					outcome.adoptedMessageIds(ms),
				]);

				if (cancelled) return;

				const usefulSet = new Set(usefulIds);
				const adoptedSet = new Set(adoptedIds);

				// Bucket message_ids by feature; then intersect with each set.
				const perFeature = new Map<string, { useful: Set<string>; adopted: Set<string> }>();
				for (const { feature, messageId } of msgsByFeature) {
					if (!perFeature.has(feature)) {
						perFeature.set(feature, { useful: new Set(), adopted: new Set() });
					}
					const bucket = perFeature.get(feature)!;
					if (usefulSet.has(messageId)) bucket.useful.add(messageId);
					if (adoptedSet.has(messageId)) bucket.adopted.add(messageId);
				}

				const rows: FeatureRow[] = costs.map((c) => {
					const bucket = perFeature.get(c.feature);
					return {
						feature: c.feature,
						callCount: c.callCount,
						totalCost: c.totalCost,
						usefulCount: bucket?.useful.size ?? 0,
						adoptedCount: bucket?.adopted.size ?? 0,
					};
				});

				setState({ rows, loading: false });
			} catch (e) {
				console.error('[OutcomeValueScreen] Failed to load', e);
				if (!cancelled) setState({ ...EMPTY_STATE, loading: false });
			}
		})();
		return () => { cancelled = true; };
	}, [range, usageServices]);

	// MPG scaling: invert so SMALLER (=better) MPG renders as LONGER bar
	// per spec's "less cost per outcome = better" framing. Anchor: minimum MPG
	// in the set hits 100%, max MPG hits 0% (rows without MPG render 0%).
	const mpgValues = state.rows
		.map((r) => (r.usefulCount > 0 ? r.totalCost / r.usefulCount : null))
		.filter((v): v is number => v !== null && Number.isFinite(v));
	const minMpg = mpgValues.length > 0 ? Math.min(...mpgValues) : 0;
	const maxMpg = mpgValues.length > 0 ? Math.max(...mpgValues) : 0;
	const mpgSpread = maxMpg - minMpg;

	const isEmpty = !state.loading && state.rows.length === 0;

	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">
						{strings.perFeatureSection.title}
					</span>
					<span className="pk-dash-section__sub">
						{strings.perFeatureSection.subtitle}{' '}
						<HelpAffordance tooltip={strings.unattributedHelp} />
					</span>
				</div>
				{state.loading ? (
					<div className="pk-dash-empty">Loading…</div>
				) : isEmpty ? (
					<div className="pk-dash-empty">{strings.empty}</div>
				) : (
					<table className="pk-dash-table">
						<thead>
							<tr>
								<th>{strings.columns.feature}</th>
								<th className="pk-dash-table__num">{strings.columns.calls}</th>
								<th className="pk-dash-table__num">{strings.columns.useful}</th>
								<th className="pk-dash-table__num">{strings.columns.adopted}</th>
								<th className="pk-dash-table__num">{strings.columns.adoptRate}</th>
								<th className="pk-dash-table__num">{strings.columns.totalCost}</th>
								<th>{strings.columns.mpg}</th>
							</tr>
						</thead>
						<tbody>
							{state.rows.map((row) => {
								const mpg = row.usefulCount > 0
									? row.totalCost / row.usefulCount
									: null;
								// Lower MPG (better) → fuller bar. Single-row tables
								// have spread=0; default to 100% so the lone bar isn't
								// stuck at 0%.
								const mpgPct = mpg === null
									? 0
									: mpgSpread === 0
										? 100
										: ((maxMpg - mpg) / mpgSpread) * 100;
								const adoptRate = row.callCount > 0
									? (row.adoptedCount / row.callCount) * 100
									: null;
								return (
									<tr key={row.feature}>
										<td>{labelForFeature(row.feature, strings.features)}</td>
										<td className="pk-dash-table__num">
											{row.callCount.toLocaleString()}
										</td>
										<td className="pk-dash-table__num">
											{row.usefulCount.toLocaleString()}
										</td>
										<td className="pk-dash-table__num">
											{row.adoptedCount.toLocaleString()}
										</td>
										<td className="pk-dash-table__num">
											{adoptRate === null ? '—' : `${adoptRate.toFixed(0)}%`}
										</td>
										<td className="pk-dash-table__num">
											{formatUsd(row.totalCost)}
										</td>
										<td>
											{mpg === null ? (
												<span className="pk-kpi-value--muted">—</span>
											) : (
												<InlineTableBar
													percent={mpgPct}
													value={formatUsd(mpg)}
													aria-label={`MPG ${formatUsd(mpg)}`}
												/>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}

function labelForFeature(feature: string, labels: Record<string, string>): string {
	return labels[feature] ?? feature;
}

function formatUsd(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const decimals = value < 1 ? 4 : 2;
	return `$${value.toFixed(decimals)}`;
}
