import React, { useEffect, useState } from 'react';
import type { TimeRange } from '@/service/usage/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { HorizontalBar, InlineTableBar, BrandAvatar } from '../components/charts';
import type { ProviderModelStrings } from '../UsageDashboard';
import type { ProviderId } from '@/ui/components/primitives/types';

export interface ProviderModelScreenProps {
	range: TimeRange;
	strings: ProviderModelStrings;
}

interface ProviderRow {
	provider: string;
	cost: number;
	callCount: number;
}
interface ModelRow {
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	callCount: number;
}

interface State {
	providers: ProviderRow[];
	models: ModelRow[];
	loading: boolean;
}

const EMPTY_STATE: State = { providers: [], models: [], loading: true };

/**
 * 02 · Provider & Model breakdown (spec §1.4 truncation fix · §6.2 Curator
 * inputs).
 *
 * Two panels, both keyed off the parent Segmented time-range control:
 *  - Cost by provider — HorizontalBar list (`$` lives OUTSIDE the bar by
 *    spec §11.9 anti-pattern guard).
 *  - By model — table grouped by provider, no truncation; share column uses
 *    InlineTableBar to keep the bar + numeric tightly coupled.
 *
 * Data comes from UsageTrackingService.getCostBreakdown / getModelDistribution
 * (both already existed pre-PR-Dash-3).
 */
export function ProviderModelScreen({ range, strings }: ProviderModelScreenProps) {
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
				const svc = usageServices.tracking;
				const [providers, models] = await Promise.all([
					svc.getCostBreakdown(range),
					svc.getModelDistribution(range),
				]);
				if (cancelled) return;
				setState({ providers, models, loading: false });
			} catch (e) {
				console.error('[ProviderModelScreen] Failed to load data', e);
				if (!cancelled) setState({ ...EMPTY_STATE, loading: false });
			}
		})();
		return () => { cancelled = true; };
	}, [range, usageServices]);

	const totalProviderCost = state.providers.reduce((s, r) => s + r.cost, 0);
	const totalModelTokens = state.models.reduce(
		(s, r) => s + r.inputTokens + r.outputTokens,
		0,
	);

	const noData =
		!state.loading && state.providers.length === 0 && state.models.length === 0;

	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">
						{strings.providerSection.title}
					</span>
					<span className="pk-dash-section__sub">
						{strings.providerSection.subtitle}
					</span>
				</div>
				{state.loading ? (
					<div className="pk-dash-empty">Loading…</div>
				) : state.providers.length === 0 ? (
					<div className="pk-dash-empty">{strings.empty}</div>
				) : (
					<div>
						{state.providers.map((row) => {
							const provId = normalizeProvider(row.provider);
							const pct = totalProviderCost > 0
								? (row.cost / totalProviderCost) * 100
								: 0;
							return (
								<HorizontalBar
									key={row.provider}
									label={
										<>
											<BrandAvatar
												provider={provId}
												size="sm"
											/>
											<span className="pk-hbar__label-text">
												{row.provider}
											</span>
										</>
									}
									percent={pct}
									cost={`$${row.cost.toFixed(2)}`}
									percentLabel={`${pct.toFixed(0)}%`}
									color={provId ? `var(--pk-prov-${provId})` : undefined}
								/>
							);
						})}
					</div>
				)}
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">
						{strings.modelSection.title}
					</span>
					<span className="pk-dash-section__sub">
						{strings.modelSection.subtitle}
					</span>
				</div>
				{state.loading ? (
					<div className="pk-dash-empty">Loading…</div>
				) : state.models.length === 0 ? (
					<div className="pk-dash-empty">
						{noData ? strings.empty : 'No model data.'}
					</div>
				) : (
					<table className="pk-dash-table">
						<thead>
							<tr>
								<th>{strings.columns.provider}</th>
								<th>{strings.columns.model}</th>
								<th className="pk-dash-table__num">{strings.columns.calls}</th>
								<th className="pk-dash-table__num">{strings.columns.tokens}</th>
								<th>{strings.columns.share}</th>
							</tr>
						</thead>
						<tbody>
							{state.models.map((row) => {
								const provId = normalizeProvider(row.provider);
								const tokens = row.inputTokens + row.outputTokens;
								const share = totalModelTokens > 0
									? (tokens / totalModelTokens) * 100
									: 0;
								return (
									<tr key={`${row.provider}::${row.model}`}>
										<td>
											<span className="pk-dash-table__provider">
												<BrandAvatar
													provider={provId}
													size="sm"
												/>
												<span>{row.provider}</span>
											</span>
										</td>
										<td>{row.model}</td>
										<td className="pk-dash-table__num">
											{row.callCount.toLocaleString()}
										</td>
										<td className="pk-dash-table__num">
											{tokens.toLocaleString()}
										</td>
										<td>
											<InlineTableBar
												percent={share}
												value={`${share.toFixed(0)}%`}
												color={provId ? `var(--pk-prov-${provId})` : undefined}
												aria-label={`${share.toFixed(0)} percent share`}
											/>
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

function normalizeProvider(p: string): ProviderId | undefined {
	const normalized = p?.toLowerCase().trim();
	if (
		normalized === 'openai' ||
		normalized === 'anthropic' ||
		normalized === 'google' ||
		normalized === 'openrouter' ||
		normalized === 'perplexity' ||
		normalized === 'ollama'
	) {
		return normalized;
	}
	return undefined;
}
