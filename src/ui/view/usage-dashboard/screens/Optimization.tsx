import React from 'react';
import type { TimeRange } from '@/service/usage/types';

export interface OptimizationScreenProps {
	range: TimeRange;
}

/**
 * 06 · Usage Optimization (spec §6.2 Curator runtime · §5 anti-pattern #5
 * transparency + agency).
 *
 * Recommendation cards with Apply / Preview verbs. Projected spend swing
 * with Conservative / Balanced / Aggressive scenarios. The highest-leverage
 * screen — pairs every observation with an action.
 *
 * Data wiring lands in PR-Dash-2 (Curator runtime recommendations + sim).
 */
export function OptimizationScreen(_props: OptimizationScreenProps) {
	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Recommended changes</span>
					<span className="pk-dash-section__sub">Ranked by impact · evaluated against last 30 days</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — recommendation cards with Apply / Preview verbs from Curator runtime.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Projected spend</span>
					<span className="pk-dash-section__sub">Current vs scenario</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — SavingsDial trio per scenario.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Choose a scenario</span>
					<span className="pk-dash-section__sub">Conservative · Balanced · Aggressive</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — scenario radio group; on apply writes through HarnessSettings.
				</div>
			</section>
		</div>
	);
}
