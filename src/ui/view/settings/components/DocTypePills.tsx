import React from 'react';
import { cn } from '@/ui/react/lib/utils';

interface DocTypePillsProps {
	types: Record<string, boolean>;
	onToggle: (type: string, value: boolean) => void;
}

export function DocTypePills({ types, onToggle }: DocTypePillsProps) {
	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
			{Object.entries(types).map(([type, enabled]) => (
				<span
					key={type}
					className={cn(
						'pktw-rounded-full pktw-px-3 pktw-py-1 pktw-text-xs pktw-cursor-pointer pktw-transition-colors pktw-select-none pktw-border',
						enabled
							? 'pktw-bg-pk-accent-muted pktw-text-pk-accent pktw-border-pk-accent'
							: 'pktw-bg-secondary pktw-text-muted-foreground pktw-border-pk-border hover:pktw-brightness-95',
					)}
					onClick={() => onToggle(type, !enabled)}
				>
					{type.charAt(0).toUpperCase() + type.slice(1)}
				</span>
			))}
		</div>
	);
}
