import React from 'react';
import { Check } from 'lucide-react';

/** Small square checkbox used by selectable suggestion lists. */
export const SuggestionCheckbox: React.FC<{ checked: boolean }> = ({ checked }) => (
	<div className={`pktw-w-4 pktw-h-4 pktw-rounded pktw-border-2 pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 pktw-transition-all ${
		checked
			? 'pktw-bg-accent pktw-border-accent pktw-text-white pktw-text-pk-xs'
			: 'pktw-border-border'
	}`}>
		{checked && <Check className="pktw-w-2.5 pktw-h-2.5" />}
	</div>
);

/** Clickable row in a selectable suggestion list (checkbox + body). */
export const SelectableRow: React.FC<{
	checked: boolean;
	onClick: () => void;
	children: React.ReactNode;
}> = ({ checked, onClick, children }) => (
	<div
		className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
		onClick={onClick}
	>
		<SuggestionCheckbox checked={checked} />
		<div className="pktw-flex-1 pktw-min-w-0">{children}</div>
	</div>
);

/** Direction pill (Out / In) used by link-suggestion panels. */
export const DirectionBadge: React.FC<{ direction: 'outgoing' | 'incoming'; label?: { out: string; in: string } }> = ({
	direction,
	label = { out: '→ Out', in: '← In' },
}) => (
	<span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${
		direction === 'outgoing'
			? 'pktw-bg-accent/10 pktw-text-accent'
			: 'pktw-bg-pk-success/10 pktw-text-pk-success'
	}`}>
		{direction === 'outgoing' ? label.out : label.in}
	</span>
);

/** Small numeric stats summary block. */
export const SuggestionSummaryBox: React.FC<{
	count: number;
	children: React.ReactNode;
}> = ({ count, children }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-3 pktw-text-pk-sm pktw-text-muted-foreground">
		<span className="pktw-text-lg pktw-font-bold pktw-text-accent">{count}</span>
		<span>{children}</span>
	</div>
);
