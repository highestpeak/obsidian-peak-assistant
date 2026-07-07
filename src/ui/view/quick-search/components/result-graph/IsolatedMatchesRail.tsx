import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

/**
 * Result Graph View · isolated matches rail (spec 2026-07-07 §Isolated
 * Result Nodes). Result docs that connect to neither another result doc
 * nor any hub anchor go here instead of floating on the canvas.
 *
 * Narrow-modal safeguard (plan §Risks · Isolated Matches rail invisible
 * on narrow modal widths): when `narrow === true` the rail collapses to
 * a single "N isolated" badge that expands on click.
 */
export interface IsolatedMatchItem {
	id: string;
	title: string;
	path: string;
}

interface IsolatedMatchesRailProps {
	items: IsolatedMatchItem[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onOpen: (id: string) => void;
	narrow: boolean;
	/**
	 * When the graph canvas would render zero connected nodes, callers
	 * render the rail inline as the primary content instead of a right-
	 * side rail — no absolute positioning, no border, no width cap.
	 */
	fullWidth?: boolean;
}

const IsolatedList: React.FC<{
	items: IsolatedMatchItem[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onOpen: (id: string) => void;
}> = ({ items, selectedId, onSelect, onOpen }) => (
	<span className="pktw-flex pktw-flex-col pktw-gap-1">
		{items.map((it) => {
			const selected = it.id === selectedId;
			return (
				<span
					key={it.id}
					role="button"
					tabIndex={0}
					onClick={() => onSelect(it.id)}
					onDoubleClick={() => onOpen(it.id)}
					className={cn(
						'pktw-block pktw-truncate pktw-rounded pktw-px-2 pktw-py-1 pktw-text-[12px] pktw-cursor-pointer',
						selected
							? 'pktw-bg-pk-accent-tint pktw-text-pk-accent-text'
							: 'pktw-text-pk-text-secondary hover:pktw-bg-pk-surface-raised',
					)}
					title={it.path}
				>
					{it.title || it.path}
				</span>
			);
		})}
	</span>
);

export const IsolatedMatchesRail: React.FC<IsolatedMatchesRailProps> = ({
	items,
	selectedId,
	onSelect,
	onOpen,
	narrow,
	fullWidth,
}) => {
	const [expanded, setExpanded] = useState(false);
	if (!items.length) return null;

	if (fullWidth) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-px-3 pktw-py-2">
				<IsolatedList items={items} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} />
			</div>
		);
	}

	if (narrow) {
		return (
			<span className="pktw-absolute pktw-right-2 pktw-top-2 pktw-z-10 pktw-flex pktw-flex-col pktw-items-end pktw-gap-1">
				<span
					role="button"
					tabIndex={0}
					onClick={() => setExpanded((v) => !v)}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded-full pktw-bg-pk-surface-raised pktw-px-2 pktw-py-0.5 pktw-text-[11px] pktw-text-pk-text-secondary pktw-cursor-pointer pktw-border pktw-border-pk-border"
					aria-label={`${items.length} isolated matches`}
				>
					<span>{items.length} isolated</span>
					{expanded ? <ChevronUp className="pktw-h-3 pktw-w-3" /> : <ChevronDown className="pktw-h-3 pktw-w-3" />}
				</span>
				{expanded && (
					<span className="pktw-max-w-[200px] pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-2 pktw-shadow-md">
						<IsolatedList items={items} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} />
					</span>
				)}
			</span>
		);
	}

	return (
		<span className="pktw-absolute pktw-right-0 pktw-top-0 pktw-z-10 pktw-flex pktw-h-full pktw-w-[180px] pktw-flex-col pktw-gap-2 pktw-border-l pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-pk-text-tertiary">
				Isolated matches
			</span>
			<span className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
				<IsolatedList items={items} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} />
			</span>
		</span>
	);
};
