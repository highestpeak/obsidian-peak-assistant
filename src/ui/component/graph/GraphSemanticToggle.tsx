import React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface GraphSemanticToggleProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	keyTipKey?: string;
	label?: string;
	className?: string;
}

/** Controlled graph-layer switch shared by graph hosts and canvas overlays. */
export const GraphSemanticToggle: React.FC<GraphSemanticToggleProps> = ({
	checked,
	onCheckedChange,
	keyTipKey,
	label = 'Semantic',
	className,
}) => (
	<label
		className={cn(
			'pktw-inline-flex pktw-min-h-8 pktw-items-center pktw-gap-1.5 pktw-cursor-pointer pktw-select-none pktw-whitespace-nowrap pktw-text-sm pktw-text-pk-foreground-muted',
			className,
		)}
		title="Layer semantic-similarity edges on top of the current preset. Uses pre-indexed embeddings — instant, no AI credits, no network."
	>
		<input
			type="checkbox"
			checked={checked}
			data-peak-keytip-key={keyTipKey}
			data-peak-keytip-label="Toggle semantic edges"
			onChange={(event) => onCheckedChange(event.target.checked)}
			className="pktw-sr-only peer"
			aria-label="Toggle semantic edges"
		/>
		<span
			aria-hidden="true"
			className={cn(
				'pktw-relative pktw-inline-block pktw-h-4 pktw-w-[30px] pktw-rounded-full pktw-transition-colors peer-focus-visible:pktw-ring-2 peer-focus-visible:pktw-ring-pk-accent peer-focus-visible:pktw-ring-offset-2',
				checked ? 'pktw-bg-pk-accent' : 'pktw-bg-pk-border',
			)}
		>
			<span
				className={cn(
					'pktw-absolute pktw-left-0.5 pktw-top-0.5 pktw-h-3 pktw-w-3 pktw-rounded-full pktw-bg-white pktw-shadow-pk-card pktw-transition-transform',
					checked ? 'pktw-translate-x-[14px]' : 'pktw-translate-x-0',
				)}
			/>
		</span>
		<span>{label}</span>
	</label>
);
