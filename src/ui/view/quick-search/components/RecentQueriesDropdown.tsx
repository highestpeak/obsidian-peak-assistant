import React from 'react';
import { Clock, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';

interface RecentQueriesDropdownProps {
	queries: string[];
	onSelect: (query: string) => void;
	onClear: () => void;
}

export const RecentQueriesDropdown: React.FC<RecentQueriesDropdownProps> = ({
	queries,
	onSelect,
	onClear,
}) => {
	if (queries.length === 0) return null;

	return (
		<div className="pktw-px-4 pktw-py-2 pktw-mb-1">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1.5">
				<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted">
					Recent searches
				</span>
				<Button
					variant="ghost"
					size="icon"
					onClick={(e) => {
						e.stopPropagation();
						onClear();
					}}
					className="!pktw-h-7 !pktw-min-h-7 !pktw-max-h-7 !pktw-w-7 !pktw-min-w-7 !pktw-max-w-7 !pktw-p-0 pktw-shadow-none pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground pktw-cursor-pointer"
					aria-label="Clear recent searches"
					title="Clear recent searches"
				>
					<X className="pktw-w-3.5 pktw-h-3.5" />
				</Button>
			</div>
			<div className="pktw-flex pktw-flex-col">
				{queries.map((query) => (
					<Button
						key={query}
						variant="unstyled"
						onClick={() => onSelect(query)}
						className={cn(
							'!pktw-h-auto !pktw-min-h-8 !pktw-max-h-none pktw-w-full pktw-justify-start pktw-gap-2 !pktw-px-2 !pktw-py-1.5',
							'pktw-rounded-md pktw-text-left pktw-cursor-pointer pktw-transition-colors',
							'hover:pktw-bg-pk-accent-tint',
						)}
					>
						<Clock className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />
						<span className="pktw-min-w-0 pktw-flex-1 pktw-text-sm pktw-font-normal pktw-text-pk-foreground pktw-truncate">
							{query}
						</span>
					</Button>
				))}
			</div>
		</div>
	);
};
