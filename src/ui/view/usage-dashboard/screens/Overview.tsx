import React from 'react';
import type { TimeRange, UsageOutcomeEventType } from '@/service/usage/types';
import { useDashboardMetrics } from '../hooks/useUsageData';
import type {
	DashboardMetrics,
	OutcomeBreakdownEntry,
	FunnelStages,
} from '../hooks/useUsageData';
import {
	KpiActionCard,
	HelpAffordance,
	HorizontalBar,
} from '../components/charts';
import type { OverviewStrings } from '../UsageDashboard';

export interface OverviewScreenProps {
	range: TimeRange;
	strings: OverviewStrings;
}

/**
 * Format a USD amount. Uses 4 decimal places for values < $1 (so per-message
 * cost stays readable) and 2 decimal places otherwise.
 */
function formatUsd(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const decimals = value < 1 ? 4 : 2;
	return `$${value.toFixed(decimals)}`;
}

function formatInteger(value: number): string {
	return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * 01 · Usage Intelligence — default surface (spec §6.1).
 *
 * PR-Dash-2: wires MPG + 3-stage funnel + outcome breakdown from
 * UsageOutcomeService + UsageTrackingService. Spec §11.2 / §11.3 / §11.4
 * govern the metric definitions.
 *
 * Out of scope (later PRs):
 *  - Curator-driven recommendations (PR-Dash-3+)
 *  - "What was this about" detail panel (PR-Dash-3)
 *  - Sparkline trio (PR-Dash-3+)
 */
export function OverviewScreen({ range, strings }: OverviewScreenProps) {
	const metrics = useDashboardMetrics(range);

	return (
		<div className="pk-dash-screen">
			<KpiRow metrics={metrics} strings={strings} />
			<FunnelSection funnel={metrics.funnel} strings={strings.funnel} loading={metrics.loading} />
			<OutcomeBreakdownSection
				breakdown={metrics.outcomeBreakdown}
				strings={strings.outcomeBreakdown}
				loading={metrics.loading}
			/>
		</div>
	);
}

// ── KPI row ─────────────────────────────────────────────────────────────────

interface KpiRowProps {
	metrics: DashboardMetrics;
	strings: OverviewStrings;
}

function KpiRow({ metrics, strings }: KpiRowProps) {
	const mpgEmpty = strings.kpi.mpg.empty ?? '—';
	const mpgValue =
		metrics.mpg === null || !Number.isFinite(metrics.mpg)
			? mpgEmpty
			: formatUsd(metrics.mpg);
	const mpgMuted = metrics.mpg === null;

	return (
		<div className="pk-dash-kpi-row">
			<KpiActionCard
				label={strings.kpi.mpg.label}
				help={
					strings.kpi.mpg.help ? (
						<HelpAffordance tooltip={strings.kpi.mpg.help} />
					) : undefined
				}
			>
				<div className={`pk-kpi-value${mpgMuted ? ' pk-kpi-value--muted' : ''}`}>
					{mpgValue}
				</div>
				<div className="pk-kpi-sub">
					{formatInteger(metrics.usefulCount)} useful · {formatUsd(metrics.totalCost)} total
				</div>
			</KpiActionCard>
			<KpiActionCard label={strings.kpi.totalCost.label}>
				<div className="pk-kpi-value">{formatUsd(metrics.totalCost)}</div>
			</KpiActionCard>
			<KpiActionCard
				label={strings.kpi.usefulMessages.label}
				help={
					strings.kpi.usefulMessages.help ? (
						<HelpAffordance tooltip={strings.kpi.usefulMessages.help} />
					) : undefined
				}
			>
				<div className="pk-kpi-value">{formatInteger(metrics.usefulCount)}</div>
			</KpiActionCard>
			<KpiActionCard label={strings.kpi.totalCalls.label}>
				<div className="pk-kpi-value">{formatInteger(metrics.totalCalls)}</div>
			</KpiActionCard>
		</div>
	);
}

// ── Funnel section ──────────────────────────────────────────────────────────

interface FunnelSectionProps {
	funnel: FunnelStages;
	strings: OverviewStrings['funnel'];
	loading: boolean;
}

function FunnelSection({ funnel, strings, loading }: FunnelSectionProps) {
	const max = Math.max(funnel.invoked, funnel.inspected, funnel.adopted, 1);
	const isEmpty = !loading && funnel.invoked === 0 && funnel.inspected === 0;

	return (
		<section className="pk-dash-section">
			<div className="pk-dash-section__head">
				<span className="pk-dash-section__title">{strings.title}</span>
				<span className="pk-dash-section__sub">{strings.subtitle}</span>
			</div>
			{isEmpty ? (
				<div className="pk-dash-empty">{strings.empty}</div>
			) : (
				<div className="pk-funnel">
					<FunnelRow
						label={strings.stages.invoked}
						count={funnel.invoked}
						denominator={funnel.invoked}
						widthPct={(funnel.invoked / max) * 100}
						variant="invoked"
					/>
					<FunnelRow
						label={strings.stages.inspected}
						count={funnel.inspected}
						denominator={funnel.invoked}
						widthPct={(funnel.inspected / max) * 100}
						variant="inspected"
					/>
					<FunnelRow
						label={strings.stages.adopted}
						count={funnel.adopted}
						denominator={funnel.invoked}
						widthPct={(funnel.adopted / max) * 100}
						variant="adopted"
					/>
				</div>
			)}
		</section>
	);
}

interface FunnelRowProps {
	label: string;
	count: number;
	denominator: number;
	widthPct: number;
	variant: 'invoked' | 'inspected' | 'adopted';
}

function FunnelRow({ label, count, denominator, widthPct, variant }: FunnelRowProps) {
	const clamped = Math.max(0, Math.min(100, widthPct));
	const pct =
		denominator > 0 ? `${((count / denominator) * 100).toFixed(0)}%` : null;
	return (
		<div className="pk-funnel__row">
			<span className="pk-funnel__label">{label}</span>
			<span className="pk-funnel__bar">
				<span
					className={`pk-funnel__bar-fill pk-funnel__bar-fill--${variant}`}
					style={{ width: `${clamped}%` }}
				/>
			</span>
			<span className="pk-funnel__count">
				{formatInteger(count)}
				{pct ? <span className="pk-funnel__pct">{pct}</span> : null}
			</span>
		</div>
	);
}

// ── Outcome breakdown ───────────────────────────────────────────────────────

interface OutcomeBreakdownSectionProps {
	breakdown: OutcomeBreakdownEntry[];
	strings: OverviewStrings['outcomeBreakdown'];
	loading: boolean;
}

function OutcomeBreakdownSection({ breakdown, strings, loading }: OutcomeBreakdownSectionProps) {
	const total = breakdown.reduce((sum, b) => sum + b.count, 0);
	const isEmpty = !loading && total === 0;
	const max = Math.max(total, 1);

	return (
		<section className="pk-dash-section">
			<div className="pk-dash-section__head">
				<span className="pk-dash-section__title">{strings.title}</span>
				<span className="pk-dash-section__sub">{strings.subtitle}</span>
			</div>
			{isEmpty ? (
				<div className="pk-dash-empty">{strings.empty}</div>
			) : (
				<div>
					{breakdown.map((entry) => (
						<HorizontalBar
							key={entry.event_type}
							label={labelForEvent(entry.event_type, strings.events)}
							percent={(entry.count / max) * 100}
							cost={formatInteger(entry.count)}
							percentLabel={total > 0 ? `${((entry.count / total) * 100).toFixed(0)}%` : '0%'}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function labelForEvent(
	event_type: UsageOutcomeEventType,
	labels: Record<string, string>,
): string {
	return labels[event_type] ?? event_type;
}
