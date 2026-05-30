import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface KpiActionCardProps {
	/** KPI label, e.g. "Budget pace". */
	label: React.ReactNode;
	/** Optional verb button rendered in the top-right slot. */
	action?: {
		label: React.ReactNode;
		onClick?: () => void;
		'aria-label'?: string;
	};
	/** Optional help affordance (ⓘ with tooltip) next to the label. */
	help?: React.ReactNode;
	children?: React.ReactNode;
	className?: string;
}

/**
 * KPI card with a top-right action slot — applies `.pk-kpi-action` on the
 * verb button. The body content is freeform (value row, sparkline, dial)
 * because each KPI surfaces a different shape.
 *
 * Mock anti-pattern guard: KPI cards must carry a verb (link or button).
 * Numbers without agency are the loudest failure mode in spec §11.9.
 */
export function KpiActionCard({
	label,
	action,
	help,
	children,
	className,
}: KpiActionCardProps) {
	return (
		<div className={cn('pk-dash-section', className)}>
			<div className="pk-dash-section__head">
				<span className="pk-dash-section__title">
					{label}
					{help ? <> {help}</> : null}
				</span>
				{action ? (
					<button
						type="button"
						className="pk-kpi-action"
						onClick={action.onClick}
						aria-label={action['aria-label']}
					>
						{action.label}
					</button>
				) : null}
			</div>
			{children}
		</div>
	);
}
