import React from 'react';
import type { TimeRange } from '@/service/usage/types';

export interface OverviewScreenProps {
	range: TimeRange;
}

/**
 * 01 · Usage Intelligence — default surface (spec §6.1).
 *
 * Carrier mix replaces the old KPI wall: Budget pace · Context risk ·
 * Cost / saved artifact · Calls this week, each carrying a verb.
 * Bottom row: Recommended actions (from Curator) + This-week sparklines.
 *
 * Data wiring lands in PR-Dash-2 (MPG + funnel + outcome queries via
 * UsageOutcomeService.getInstance()).
 */
export function OverviewScreen(_props: OverviewScreenProps) {
	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Key metrics</span>
					<span className="pk-dash-section__sub">Budget pace · Context risk · Cost / saved artifact · Calls this week</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — 4 KPI cards with action verbs, sourced from UsageOutcomeService.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Recommended actions</span>
					<span className="pk-dash-section__sub">From Curator · ranked by impact</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — Curator-generated recommendations with Apply / Preview verbs.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">This week</span>
					<span className="pk-dash-section__sub">Spend · Tokens · Cost / saved artifact</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — sparkline trio sourced from UsageTrackingService trend rollups.
				</div>
			</section>
		</div>
	);
}
