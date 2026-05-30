import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface ExplainerEntry {
	term: React.ReactNode;
	description: React.ReactNode;
}

export interface ExplainerPanelProps {
	entries: ExplainerEntry[];
	className?: string;
}

/**
 * Explainer panel — definition list of term/description pairs, applies
 * `.pk-explainer` (scoped to `.peak-design-root.usage-dashboard`). Used to
 * teach metric definitions inline ("MPG = total_cost / useful_messages",
 * funnel stage definitions, outcome event types).
 */
export function ExplainerPanel({ entries, className }: ExplainerPanelProps) {
	return (
		<dl className={cn('pk-explainer', className)}>
			{entries.map((entry, index) => (
				<React.Fragment key={index}>
					<dt>{entry.term}</dt>
					<dd>{entry.description}</dd>
				</React.Fragment>
			))}
		</dl>
	);
}
