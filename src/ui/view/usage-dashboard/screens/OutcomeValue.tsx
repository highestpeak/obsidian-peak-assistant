import React from 'react';
import type { TimeRange } from '@/service/usage/types';

export interface OutcomeValueScreenProps {
	range: TimeRange;
}

/**
 * 03 · Outcome Value (spec §4.3 MPG metric · §7 usage_outcome).
 *
 * MPG = total_cost / count_useful_messages, where useful_message has ≥1
 * usage_outcome event (vault_save / copilot_accept / agent_file_emit /
 * search_click / continuation). Surfaces high-spend-no-outcome sessions
 * with verbs.
 *
 * Data wiring lands in PR-Dash-2 (UsageOutcomeService.countUsefulMessages
 * + countByType joined with UsageLogRepo cost rollups).
 */
export function OutcomeValueScreen(_props: OutcomeValueScreenProps) {
	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Outcomes</span>
					<span className="pk-dash-section__sub">Every call grouped by whether it produced value</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — funnel: invoked → inspected → adopted (spec §11.3, 3-stage).
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">MPG · cost per useful message</span>
					<span className="pk-dash-section__sub">Outcome signals captured at message · search-click · vault-save · agent-finish events</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — MPG headline value + ExplainerPanel defining the formula and outcome event types.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">High spend · no outcome</span>
					<span className="pk-dash-section__sub">Try a cheaper model for exploratory sessions</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — list of sessions whose cost exceeds threshold and produced zero outcome events.
				</div>
			</section>
		</div>
	);
}
