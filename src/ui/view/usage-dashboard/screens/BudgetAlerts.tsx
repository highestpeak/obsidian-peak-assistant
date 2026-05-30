import React from 'react';
import type { TimeRange } from '@/service/usage/types';

export interface BudgetAlertsScreenProps {
	range: TimeRange;
}

/**
 * 04 · Budget & Alerts (spec §6.2 budget settings + alert rules + model
 * defaults).
 *
 * Monthly budget pacing · alert rules · model defaults (Quick / Deep /
 * Premium). Bottom row previews what users will see in-app — this is the
 * set-and-forget guardrail surface.
 *
 * Data wiring lands in PR-Dash-2 (HarnessSettings.budget + alert config
 * subscriptions). Writes back through SettingsService when the user edits.
 */
export function BudgetAlertsScreen(_props: BudgetAlertsScreenProps) {
	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Monthly budget</span>
					<span className="pk-dash-section__sub">Pace · projected spend</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — budget input + pace bar reading from HarnessSettings.budget.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Alert rules</span>
					<span className="pk-dash-section__sub">Threshold-triggered notifications</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — rules list with add/remove and per-rule toggle.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Model defaults</span>
					<span className="pk-dash-section__sub">Quick · Deep · Premium</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — three model picker rows; writes back via HarnessSettings model tiers.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">What users will see</span>
					<span className="pk-dash-section__sub">In-app alert preview</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — rendered preview of inline receipt + context ring + Curator push.
				</div>
			</section>
		</div>
	);
}
