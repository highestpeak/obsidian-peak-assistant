import React from 'react';
import type { TimeRange } from '@/service/usage/types';

export interface HistoryScreenProps {
	range: TimeRange;
}

/**
 * 05 · Usage History (spec §6.1 G · JTBD 6 debug spend).
 *
 * Old dashboard, descended into an audit / trace drilldown surface. Calls
 * table on the left, right-side "What was this about" detail panel that
 * switches per feature (chat / search / agent / copilot / embed) per spec
 * §11.5.
 *
 * Data wiring lands in PR-Dash-2 (paged UsageLogRepo query). Detail panel
 * lands in PR-Dash-3 (uses Modal primitive + per-feature switch).
 */
export function HistoryScreen(_props: HistoryScreenProps) {
	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Calls</span>
					<span className="pk-dash-section__sub">Click a row to inspect</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — paged call table with NumberedPager; sourced from UsageLogRepo.list({ from, to, limit, offset }).
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">What was this about</span>
					<span className="pk-dash-section__sub">Per-feature detail panel</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-3 — Modal primitive with per-feature switch (chat / search / agent / copilot / embed) per spec §11.5; respects HarnessSettings.usagePreviewEnabled.
				</div>
			</section>
		</div>
	);
}
