import * as React from 'react';
import { Notice } from 'obsidian';
import type { TimeRange } from '@/service/usage/types';
import {
	PaceBar,
	RecommendationBlock,
	ScenarioRadio,
	SavingsDial,
} from '../components/charts';
import { useOptimization } from '../hooks/useOptimization';
import type { OptimizationStrings } from '../UsageDashboard';
import type {
	OptimizationResult,
	Recommendation,
	Scenario,
} from '@/service/usage/optimization';

export interface OptimizationScreenProps {
	range: TimeRange;
	strings: OptimizationStrings;
}

/**
 * 06 · Usage Optimization (mock 6-optimization.html).
 *
 * Two-column row:
 *  - Left: ranked Recommendation blocks; bottom strip carries a savings dial
 *    pairing "how much have I applied" with "how much is still available".
 *  - Right: Projected spend card + Scenario chooser (Conservative / Balanced /
 *    Aggressive).
 *
 * Apply / Preview / Open traces all currently surface a `Notice` — wiring
 * them into HarnessSettings / trace navigation is left to a future PR so the
 * recommendation engine and the dashboard render path can land together.
 */
export function OptimizationScreen({ strings }: OptimizationScreenProps) {
	const optimization = useOptimization();
	const [scenario, setScenario] = React.useState<Scenario>('balanced');
	const [applied, setApplied] = React.useState<Set<string>>(() => new Set());

	const result = optimization.result;
	const summary = buildSummary(result, strings.summary.templateCanCut);

	return (
		<div className="pk-dash-screen">
			<header className="pk-dash-section__head">
				<span className="pk-dash-section__title">{summary.headline}</span>
				<button
					type="button"
					className="pk-btn pk-btn--ghost pk-btn--sm"
					onClick={optimization.refresh}
				>
					{optimization.loading ? strings.summary.refreshing : strings.summary.refresh}
				</button>
			</header>

			<div className="pk-row-opt">
				<RecommendationsColumn
					strings={strings.recommendations}
					savingsStrings={strings.savingsDial}
					result={result}
					applied={applied}
					loading={optimization.loading}
					onApply={(rec) => {
						setApplied((prev) => new Set(prev).add(rec.id));
						new Notice(`Applied: ${rec.title}`);
					}}
					onPreview={(rec) => new Notice(`Preview: ${rec.title}`)}
				/>
				<div className="pk-stack">
					<ProjectionCard strings={strings.projection} result={result} />
					<ScenarioCard strings={strings.scenarios} result={result} value={scenario} onChange={setScenario} />
				</div>
			</div>
		</div>
	);
}

function buildSummary(result: OptimizationResult | null, template: string): { headline: string } {
	if (!result || result.recommendations.length === 0) {
		return { headline: 'No optimization opportunities detected yet.' };
	}
	const count = result.recommendations.length;
	const savings = result.projection.savingsUsd;
	const pct = result.projection.savingsPct;
	const pctLabel = pct !== null && Number.isFinite(pct) ? `${Math.round(pct * 100)}%` : '—';
	return {
		headline: template
			.replace('{count}', String(count))
			.replace('{pct}', pctLabel)
			.replace('{savings}', savings.toFixed(2)),
	};
}

// ── Recommendations column ──────────────────────────────────────────────────

function RecommendationsColumn({
	strings,
	savingsStrings,
	result,
	applied,
	loading,
	onApply,
	onPreview,
}: {
	strings: OptimizationStrings['recommendations'];
	savingsStrings: OptimizationStrings['savingsDial'];
	result: OptimizationResult | null;
	applied: Set<string>;
	loading: boolean;
	onApply: (rec: Recommendation) => void;
	onPreview: (rec: Recommendation) => void;
}) {
	const recs = result?.recommendations ?? [];
	const totalPotential = recs.reduce((s, r) => s + r.estMonthlySavingUsd, 0);
	const appliedSum = recs
		.filter((r) => applied.has(r.id))
		.reduce((s, r) => s + r.estMonthlySavingUsd, 0);
	const appliedRatio = totalPotential > 0 ? appliedSum / totalPotential : 0;

	return (
		<section className="pk-dash-card pk-dash-card--flush">
			<header className="pk-dash-card__head">
				<span className="pk-dash-card__title">{strings.title}</span>
				<span className="pk-dash-card__sub">{strings.sub}</span>
			</header>
			{loading ? (
				<div className="pk-dash-empty">Running curator…</div>
			) : recs.length === 0 ? (
				<div className="pk-dash-empty">No recommendations yet.</div>
			) : (
				<>
					<div className="pk-rec-list">
						{recs.map((rec, idx) => (
							<RecommendationBlock
								key={rec.id}
								num={idx + 1}
								rec={rec}
								onApply={onApply}
								onPreview={onPreview}
								strings={{
									apply: strings.apply,
									preview: strings.preview,
									openTraces: strings.openTraces,
									estMonthlySaving: strings.estMonthlySaving,
									evidenceColumns: strings.evidenceColumns,
								}}
							/>
						))}
					</div>
					<footer className="pk-savings-dial-row">
						<SavingsDial
							percent={Math.round(appliedRatio * 100)}
							strong={
								appliedSum === 0
									? savingsStrings.appliedNone
									: `$${appliedSum.toFixed(2)} applied`
							}
							sub={savingsStrings.appliedSummary
								.replace('{applied}', appliedSum.toFixed(2))
								.replace('{potential}', totalPotential.toFixed(2))}
						/>
						<span className="pk-link">{savingsStrings.openBudget}</span>
					</footer>
				</>
			)}
			{result?.source ? (
				<div className="pk-dash-card__head" style={{ borderTop: '1px solid var(--pk-border-soft)', borderBottom: 0 }}>
					<span className="pk-subtle pktw-text-pk-sm">
						{result.source === 'llm' ? strings.sourceLlm : strings.sourceRules}
					</span>
					<span />
				</div>
			) : null}
		</section>
	);
}

// ── Projection card ─────────────────────────────────────────────────────────

function ProjectionCard({
	strings,
	result,
}: {
	strings: OptimizationStrings['projection'];
	result: OptimizationResult | null;
}) {
	if (!result) {
		return (
			<section className="pk-dash-card pk-dash-card--pad">
				<div className="pk-dash-card__head pktw-p-0 pktw-border-0">
					<span className="pk-dash-card__title">{strings.title}</span>
				</div>
				<div className="pk-dash-empty">—</div>
			</section>
		);
	}
	const { projection } = result;
	const cycleLabel = strings.cycle
		.replace('{start}', formatDateShort(projection.cycleStartIso))
		.replace('{end}', formatDateShort(projection.cycleEndIso));
	const pct = projection.savingsPct !== null && Number.isFinite(projection.savingsPct)
		? `${Math.round(projection.savingsPct * 100)}%`
		: '—';
	const savingsLine = strings.savingsTemplate
		.replace('{saving}', projection.savingsUsd.toFixed(2))
		.replace('{pct}', pct);
	const budgetUsd = projection.budgetUsd > 0 ? `$${projection.budgetUsd.toFixed(2)}` : '$—';
	return (
		<section className="pk-dash-card pk-dash-card--pad">
			<div className="pk-dash-card__head pktw-p-0 pktw-border-0">
				<span className="pk-dash-card__title">{strings.title}</span>
				<span className="pk-dash-card__sub">{cycleLabel}</span>
			</div>
			<div className="pktw-mt-3.5">
				<div className="pk-trio__label">{strings.withoutChanges}</div>
				<div className="pk-strong pk-mono pktw-text-[24px]">
					${projection.withoutChangesUsd.toFixed(2)}
				</div>
			</div>
			<div className="pktw-mt-2.5">
				<div className="pk-trio__label">{strings.withApplied}</div>
				<div className="pktw-flex pktw-items-baseline pktw-gap-2">
					<div className="pk-strong pk-mono pktw-text-[24px] pktw-text-pk-success">
						${projection.withAppliedUsd.toFixed(2)}
					</div>
					<span className="pk-kpi-delta pk-kpi-delta--up pk-mono">{savingsLine}</span>
				</div>
			</div>
			{projection.budgetUsd > 0 ? (
				<>
					<div className="pktw-mt-3">
						<PaceBar
							usedPct={projection.withAppliedUsd / projection.budgetUsd}
							projectedPct={projection.withoutChangesUsd / projection.budgetUsd}
							tone={projection.withoutChangesUsd > projection.budgetUsd ? 'bad' : 'ok'}
							legend={[
								`$${projection.withAppliedUsd.toFixed(2)}`,
								`$${projection.withoutChangesUsd.toFixed(2)}`,
								strings.budget.replace('{budget}', budgetUsd),
							]}
							aria-label="Projection vs budget"
						/>
					</div>
				</>
			) : null}
		</section>
	);
}

// ── Scenario chooser ───────────────────────────────────────────────────────

function ScenarioCard({
	strings,
	result,
	value,
	onChange,
}: {
	strings: OptimizationStrings['scenarios'];
	result: OptimizationResult | null;
	value: Scenario;
	onChange: (next: Scenario) => void;
}) {
	const scenarios = result?.scenarios ?? [];
	if (scenarios.length === 0) {
		return (
			<section className="pk-dash-card pk-dash-card--pad">
				<div className="pk-dash-card__head pktw-p-0 pktw-border-0">
					<span className="pk-dash-card__title">{strings.title}</span>
					<span className="pk-dash-card__sub">{strings.sub}</span>
				</div>
				<div className="pk-dash-empty">—</div>
			</section>
		);
	}
	return (
		<section className="pk-dash-card pk-dash-card--pad">
			<div className="pk-dash-card__head pktw-p-0 pktw-border-0">
				<span className="pk-dash-card__title">{strings.title}</span>
				<span className="pk-dash-card__sub">{strings.sub}</span>
			</div>
			<div className="pktw-mt-3.5">
				<ScenarioRadio
					scenarios={scenarios}
					value={value}
					onChange={onChange}
					aria-label={strings.title}
				/>
			</div>
		</section>
	);
}

function formatDateShort(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
