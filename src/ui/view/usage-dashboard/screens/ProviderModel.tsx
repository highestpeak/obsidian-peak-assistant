import React from 'react';
import type { TimeRange } from '@/service/usage/types';

export interface ProviderModelScreenProps {
	range: TimeRange;
}

/**
 * 02 · Provider & Model breakdown (spec §1.4 truncation fix · §6.2 Curator
 * inputs).
 *
 * Table-first: provider + model names never truncated. Stacked bar by
 * provider. Footer insight ends with a verb (Set routing rule / View
 * traces).
 *
 * Data wiring lands in PR-Dash-2 (per-model rollups grouped by provider).
 */
export function ProviderModelScreen(_props: ProviderModelScreenProps) {
	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">By provider · model</span>
					<span className="pk-dash-section__sub">Grouped, sortable, no truncation</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — table using BrandAvatar + InlineTableBar; sourced from UsageTrackingService model rollups.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Cost by provider</span>
					<span className="pk-dash-section__sub">Stacked bar</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — stacked horizontal bar using HorizontalBar primitive.
				</div>
			</section>

			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Model share (by tokens)</span>
					<span className="pk-dash-section__sub">% of period total</span>
				</div>
				<div className="pk-dash-placeholder">
					Coming in PR-Dash-2 — hbar list per model with per-provider colour.
				</div>
			</section>
		</div>
	);
}
