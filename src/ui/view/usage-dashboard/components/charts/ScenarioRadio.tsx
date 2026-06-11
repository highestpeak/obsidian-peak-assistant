import * as React from 'react';
import type { Scenario, ScenarioSummary } from '@/service/usage/optimization';

export interface ScenarioRadioProps {
	scenarios: ScenarioSummary[];
	value: Scenario;
	onChange: (next: Scenario) => void;
	'aria-label'?: string;
}

/**
 * Vertical radio list for Conservative / Balanced / Aggressive scenarios.
 * Mirrors the mock's `.scenario` row pattern — name + sub stacked left, radio
 * dot right. Active row outlined in accent.
 */
export function ScenarioRadio({ scenarios, value, onChange, ...aria }: ScenarioRadioProps) {
	return (
		<div role="radiogroup" aria-label={aria['aria-label']} className="pk-scenario-list">
			{scenarios.map((s) => {
				const active = s.id === value;
				return (
					<button
						type="button"
						role="radio"
						aria-checked={active}
						key={s.id}
						className={`pk-scenario${active ? ' pk-scenario--active' : ''}`}
						onClick={() => onChange(s.id)}
					>
						<span className="pk-scenario__text">
							<span className="pk-scenario__name">{s.label}</span>
							<span className="pk-scenario__sub">
								{s.description} · projected ${s.projectionUsd.toFixed(2)}
							</span>
						</span>
						<span className="pk-scenario__radio" aria-hidden="true" />
					</button>
				);
			})}
		</div>
	);
}
