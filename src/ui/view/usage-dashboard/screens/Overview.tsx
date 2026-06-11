import * as React from 'react';
import type { TimeRange } from '@/service/usage/types';
import type {
	CostPerSavedArtifact,
	MonthlyPaceSnapshot,
	ThisWeekTrio,
} from '@/service/usage/UsageTrackingService';
import { useCurrentContextUtilization } from '../integration/useCurrentContextUtilization';
import { useOverviewSnapshot } from '../hooks/useOverviewSnapshot';
import { useDashboardMetrics } from '../hooks/useUsageData';
import { useOptimization } from '../hooks/useOptimization';
import {
	KpiActionCard,
	HelpAffordance,
	PaceBar,
	Sparkline,
} from '../components/charts';
import type {
	BudgetPaceKpiStrings,
	CallsKpiStrings,
	ContextRiskKpiStrings,
	CostPerSavedKpiStrings,
	OverviewStrings,
	RecommendedActionsStrings,
	ThisWeekStrings,
} from '../UsageDashboard';
import type {
	Recommendation,
	RecommendationImpact,
} from '@/service/usage/optimization';

export interface OverviewScreenProps {
	range: TimeRange;
	strings: OverviewStrings;
}

const IMPACT_TONE: Record<RecommendationImpact, string> = {
	high: 'pk-rec--high',
	medium: 'pk-rec--medium',
	low: 'pk-rec--low',
	investigate: 'pk-rec--investigate',
};

/**
 * 01 · Usage Intelligence (spec §6.1, mock 1-overview.html).
 *
 * Two rows:
 *  - KPI strip: Budget pace · Context risk ring · Cost / saved artifact · Calls
 *  - Bottom split (1.6:1): Recommended actions feed + This week sparkline trio
 *
 * The funnel/outcome-breakdown sections from PR-Dash-2 are intentionally
 * absent here — they live on the Outcome Value screen now (mock 3). Keeping
 * Overview lean lines up with spec §6.1 (default surface = "what should I do
 * next?", not "what did I do?").
 */
export function OverviewScreen({ range, strings }: OverviewScreenProps) {
	const snapshot = useOverviewSnapshot(range);
	const metrics = useDashboardMetrics(range);
	const optimization = useOptimization();
	const context = useCurrentContextUtilization();

	return (
		<div className="pk-dash-screen">
			<KpiRow
				strings={strings}
				pace={snapshot.pace}
				costPerSaved={snapshot.costPerSaved}
				thisWeek={snapshot.thisWeek}
				totalCalls={metrics.totalCalls}
				context={context}
				loading={snapshot.loading || metrics.loading}
			/>
			<div className="pk-overview-grid">
				<RecommendedActionsCard
					strings={strings.recommendedActions}
					recommendations={optimization.result?.recommendations ?? []}
					loading={optimization.loading}
				/>
				<ThisWeekCard strings={strings.thisWeek} trio={snapshot.thisWeek} />
			</div>
		</div>
	);
}

// ── KPI strip ──────────────────────────────────────────────────────────────

interface KpiRowProps {
	strings: OverviewStrings;
	pace: MonthlyPaceSnapshot | null;
	costPerSaved: CostPerSavedArtifact | null;
	thisWeek: ThisWeekTrio | null;
	totalCalls: number;
	context: { used: number; max: number; ratio: number };
	loading: boolean;
}

function KpiRow({ strings, pace, costPerSaved, thisWeek, totalCalls, context, loading }: KpiRowProps) {
	return (
		<div className="pk-dash-kpi-row">
			<BudgetPaceKpi strings={strings.kpi.budgetPace} pace={pace} loading={loading} />
			<ContextRiskKpi strings={strings.kpi.contextRisk} context={context} />
			<CostPerSavedKpi strings={strings.kpi.costPerSaved} data={costPerSaved} loading={loading} />
			<CallsKpi
				strings={strings.kpi.calls}
				count={totalCalls}
				tokens={thisWeek?.tokens.total ?? null}
				deltaPct={thisWeek?.tokens.deltaPct ?? null}
				points={thisWeek?.tokens.points ?? []}
			/>
		</div>
	);
}

function BudgetPaceKpi({
	strings,
	pace,
	loading,
}: {
	strings: BudgetPaceKpiStrings;
	pace: MonthlyPaceSnapshot | null;
	loading: boolean;
}) {
	if (!pace || pace.monthlyUsd <= 0) {
		return (
			<KpiActionCard label={strings.label}>
				<div className="pk-kpi-card">
					<div className="pk-kpi-value pk-kpi-value--muted">{strings.empty}</div>
					<div className="pk-kpi-sub">{strings.noBudgetCta}</div>
				</div>
			</KpiActionCard>
		);
	}
	const tone = pace.percentProjected > 1.05
		? 'bad'
		: pace.percentProjected > 0.9
			? 'warn'
			: 'ok';
	const badge = pace.percentProjected > 0.9 ? strings.offTrack : strings.onTrack;
	return (
		<KpiActionCard label={strings.label}>
			<div className="pk-kpi-card">
				<div className="pk-kpi-value-row">
					<span className="pk-kpi-value">{formatUsd(pace.used)}</span>
					<span className="pk-kpi-value-sub">/ {formatUsd(pace.monthlyUsd)}</span>
					<span className={`pk-badge pk-badge--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'}`}>
						{badge}
					</span>
				</div>
				<PaceBar
					usedPct={pace.percentUsed}
					projectedPct={pace.percentProjected}
					tone={tone}
					legend={[
						`${Math.round(pace.percentUsed * 100)}% used`,
						loading ? '…' : `${strings.projectionLabel} ${formatUsd(pace.projected)}`,
					]}
					aria-label={`Budget pace ${Math.round(pace.percentUsed * 100)} percent`}
				/>
			</div>
		</KpiActionCard>
	);
}

function ContextRiskKpi({
	strings,
	context,
}: {
	strings: ContextRiskKpiStrings;
	context: { used: number; max: number; ratio: number };
}) {
	if (context.max <= 0) {
		return (
			<KpiActionCard label={strings.label}>
				<div className="pk-kpi-card">
					<div className="pk-kpi-value pk-kpi-value--muted">—</div>
					<div className="pk-kpi-sub">{strings.empty}</div>
				</div>
			</KpiActionCard>
		);
	}
	const clamped = Math.max(0, Math.min(1, context.ratio));
	const band = clamped > 0.9 ? 'bad' : clamped > 0.7 ? 'warn' : 'ok';
	const badgeLabel = band === 'ok'
		? strings.healthy
		: band === 'warn'
			? strings.warn
			: strings.bad;
	const compactAt = strings.autoCompactAt.replace('{threshold}', '80');
	const RADIUS = 22;
	const CIRC = 2 * Math.PI * RADIUS;
	const dash = clamped * CIRC;
	return (
		<KpiActionCard label={strings.label}>
			<div className="pk-kpi-card">
				<div className="pk-kpi-card__ring-row">
					<span className={`pk-ring-large pk-ring-large--${band}`}>
						<svg viewBox="0 0 64 64" aria-hidden="true">
							<circle className="pk-ring-large__track" cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="6" />
							<circle
								className="pk-ring-large__fill"
								cx="32"
								cy="32"
								r={RADIUS}
								fill="none"
								strokeWidth="6"
								strokeDasharray={`${dash} ${CIRC - dash}`}
							/>
						</svg>
						<span className="pk-ring-large__label">{Math.round(clamped * 100)}%</span>
					</span>
					<div className="pk-ring-meta">
						<span className={`pk-badge pk-badge--${band === 'ok' ? 'ok' : band === 'warn' ? 'warn' : 'bad'}`}>
							{badgeLabel}
						</span>
						<span>{compactAt}</span>
					</div>
				</div>
			</div>
		</KpiActionCard>
	);
}

function CostPerSavedKpi({
	strings,
	data,
	loading,
}: {
	strings: CostPerSavedKpiStrings;
	data: CostPerSavedArtifact | null;
	loading: boolean;
}) {
	const value = data?.value;
	const delta = data?.deltaPct ?? null;
	return (
		<KpiActionCard
			label={strings.label}
			help={<HelpAffordance tooltip={strings.help} />}
		>
			<div className="pk-kpi-card">
				<div className="pk-kpi-value-row">
					<span className={`pk-kpi-value${value === null || value === undefined ? ' pk-kpi-value--muted' : ''}`}>
						{value === null || value === undefined ? strings.empty : formatUsd(value)}
					</span>
					{delta !== null ? (
						<span className={`pk-kpi-delta pk-kpi-delta--${delta < 0 ? 'up' : 'down'}`}>
							{delta < 0 ? '−' : '+'}{Math.round(Math.abs(delta) * 100)}% vs prior
						</span>
					) : null}
				</div>
				<div className="pk-kpi-sub">
					{loading
						? '…'
						: strings.sub
							.replace('{cost}', formatUsd(data?.totalCost ?? 0))
							.replace('{count}', String(data?.savedCount ?? 0))}
				</div>
			</div>
		</KpiActionCard>
	);
}

function CallsKpi({
	strings,
	count,
	tokens,
	deltaPct,
	points,
}: {
	strings: CallsKpiStrings;
	count: number;
	tokens: number | null;
	deltaPct: number | null;
	points: Array<{ value: number }>;
}) {
	return (
		<KpiActionCard label={strings.label}>
			<div className="pk-kpi-card">
				<div className="pk-kpi-value-row">
					<span className="pk-kpi-value">{count.toLocaleString()}</span>
					{tokens !== null ? (
						<span className="pk-kpi-value-sub">
							{strings.tokensSub.replace('{tokens}', formatK(tokens))}
						</span>
					) : null}
					{deltaPct !== null ? (
						<span className={`pk-kpi-delta pk-kpi-delta--${deltaPct <= 0 ? 'up' : 'down'}`}>
							{deltaPct >= 0 ? '+' : '−'}{Math.round(Math.abs(deltaPct) * 100)}% wow
						</span>
					) : null}
				</div>
				<Sparkline points={points} area={true} height={28} aria-label="Calls trend" />
			</div>
		</KpiActionCard>
	);
}

// ── Recommended actions ────────────────────────────────────────────────────

function RecommendedActionsCard({
	strings,
	recommendations,
	loading,
}: {
	strings: RecommendedActionsStrings;
	recommendations: Recommendation[];
	loading: boolean;
}) {
	const top = recommendations.slice(0, 3);
	return (
		<section className="pk-dash-card pk-dash-card--flush">
			<header className="pk-dash-card__head">
				<span className="pk-dash-card__title">{strings.title}</span>
				<span className="pk-dash-card__sub">{strings.subtitle}</span>
			</header>
			{loading ? (
				<div className="pk-dash-empty">{strings.loading}</div>
			) : top.length === 0 ? (
				<div className="pk-dash-empty">{strings.empty}</div>
			) : (
				<>
					<div className="pk-rec-list">
						{top.map((rec) => (
							<div key={rec.id} className={`pk-rec ${IMPACT_TONE[rec.impact]}`}>
								<span
									className="pk-rec__dot"
									style={{ color: impactColor(rec.impact) }}
								/>
								<div className="pk-rec__body">
									<div className="pk-rec__title">{rec.title}</div>
									<div className="pk-rec__meta">
										<span>{rec.sub}</span>
									</div>
								</div>
								<span className={`pk-badge pk-badge--${impactBadgeTone(rec.impact)}`}>
									{strings.impactLabels[rec.impact]}
								</span>
								<span className="pk-rec__saving pk-mono">
									{rec.estMonthlySavingUsd > 0 ? `+$${rec.estMonthlySavingUsd.toFixed(2)}` : ''}
								</span>
							</div>
						))}
					</div>
					{recommendations.length > top.length ? (
						<footer className="pk-savings-dial-row">
							<span className="pk-link">
								{strings.viewAll.replace('{count}', String(recommendations.length))}
							</span>
						</footer>
					) : null}
				</>
			)}
		</section>
	);
}

function impactColor(impact: RecommendationImpact): string {
	switch (impact) {
		case 'high':
			return 'var(--pk-error)';
		case 'medium':
			return 'var(--pk-warning)';
		case 'investigate':
			return 'var(--pk-info)';
		default:
			return 'var(--pk-text-secondary)';
	}
}

function impactBadgeTone(impact: RecommendationImpact): 'bad' | 'warn' | 'info' | 'soft' {
	switch (impact) {
		case 'high':
			return 'bad';
		case 'medium':
			return 'warn';
		case 'investigate':
			return 'info';
		default:
			return 'soft';
	}
}

// ── This week trio ─────────────────────────────────────────────────────────

function ThisWeekCard({
	strings,
	trio,
}: {
	strings: ThisWeekStrings;
	trio: ThisWeekTrio | null;
}) {
	if (!trio) {
		return (
			<section className="pk-dash-card pk-dash-card--flush">
				<header className="pk-dash-card__head">
					<span className="pk-dash-card__title">{strings.title}</span>
				</header>
				<div className="pk-dash-empty">—</div>
			</section>
		);
	}
	return (
		<section className="pk-dash-card pk-dash-card--flush">
			<header className="pk-dash-card__head">
				<span className="pk-dash-card__title">{strings.title}</span>
				<span className="pk-link">{strings.linkLabel}</span>
			</header>
			<div className="pk-trio">
				<TrioItem
					label={strings.spendLabel}
					value={formatUsd(trio.spend.total)}
					deltaPct={trio.spend.deltaPct}
					deltaSuffix={strings.deltaSuffix}
					points={trio.spend.points}
					color="var(--pk-warning)"
				/>
				<TrioItem
					label={strings.tokensLabel}
					value={formatK(trio.tokens.total)}
					deltaPct={trio.tokens.deltaPct}
					deltaSuffix={strings.deltaSuffix}
					points={trio.tokens.points}
					color="var(--pk-info)"
				/>
				<TrioItem
					label={strings.costPerSavedLabel}
					value={trio.costPerSaved.value === null ? '—' : formatUsd(trio.costPerSaved.value)}
					deltaPct={trio.costPerSaved.deltaPct}
					deltaSuffix={strings.deltaSuffix}
					points={trio.costPerSaved.points}
					color="var(--pk-success)"
				/>
			</div>
		</section>
	);
}

function TrioItem({
	label,
	value,
	deltaPct,
	deltaSuffix,
	points,
	color,
}: {
	label: string;
	value: string;
	deltaPct: number | null;
	deltaSuffix: string;
	points: Array<{ value: number }>;
	color: string;
}) {
	return (
		<div className="pk-trio__item">
			<div className="pk-trio__row">
				<span className="pk-trio__label">{label}</span>
				<span className="pk-trio__value">
					{value}
					{deltaPct !== null ? (
						<span className={`pk-kpi-delta pk-kpi-delta--${deltaPct <= 0 ? 'up' : 'down'}`}>
							{' '}{deltaPct >= 0 ? '+' : '−'}{Math.round(Math.abs(deltaPct) * 100)}% {deltaSuffix}
						</span>
					) : null}
				</span>
			</div>
			<Sparkline points={points} stroke={color} area={true} height={36} aria-label={`${label} trend`} />
		</div>
	);
}

// ── helpers ────────────────────────────────────────────────────────────────

function formatUsd(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const decimals = value < 1 ? 4 : 2;
	return `$${value.toFixed(decimals)}`;
}

function formatK(value: number): string {
	if (!Number.isFinite(value)) return '0';
	if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
	return String(Math.round(value));
}
