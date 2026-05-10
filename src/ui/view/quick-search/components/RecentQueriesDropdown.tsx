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
		<div className="pktw-px-4 pktw-py-2">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1.5">
				<span className="pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-pk-foreground-muted">
					Recent searches
				</span>
				<Button
					variant="ghost"
					size="sm"
					onClick={(e) => {
						e.stopPropagation();
						onClear();
					}}
					style={{ cursor: 'pointer' }}
					className="pktw-shadow-none pktw-h-5 pktw-px-1.5 pktw-text-[10px] pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground"
				>
					<X className="pktw-w-3 pktw-h-3 pktw-mr-0.5" />
					Clear
				</Button>
			</div>
			<div className="pktw-flex pktw-flex-col">
				{queries.map((query) => (
					<div
						key={query}
						onClick={() => onSelect(query)}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1.5',
							'pktw-rounded-md pktw-cursor-pointer pktw-transition-colors',
							'hover:pktw-bg-[#f5f3ff]',
						)}
					>
						<Clock className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />
						<span className="pktw-text-sm pktw-text-pk-foreground pktw-truncate">
							{query}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
