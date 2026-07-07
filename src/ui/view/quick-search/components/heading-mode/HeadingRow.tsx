/**
 * T5 (2026-07-07 heading-mode UI): a single row inside the outline tree.
 *
 * Row anatomy (spec §Empty State / §Filtered State):
 *  - Chevron affordance (only when the row has children) for expand /
 *    collapse. Non-interactive spacer otherwise, so titles stay
 *    horizontally aligned within a level.
 *  - Level icon marker (`Heading1`…`Heading6`) that also encodes depth.
 *  - Title text (dimmed when `dim` is true — i.e. no matches in the
 *    subtree and the row is not an ancestor of a matching leaf).
 *  - Line range like `12-34` (no `L` prefix, per spec AC).
 *  - Match count badge (hidden when zero — the `dim` styling already
 *    communicates "no hits here", and a `0` badge would be noise).
 *
 * Level → visible indent step: rendered by the caller so this row keeps
 * a single flat DOM shape and can be measured for keyboard scroll.
 */
import React from 'react';
import { ChevronDown, ChevronRight, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { HeadingTreeNode } from '@/service/search/heading/headingTree';

const LEVEL_ICONS = {
	1: Heading1,
	2: Heading2,
	3: Heading3,
	4: Heading4,
	5: Heading5,
	6: Heading6,
} as const;

interface HeadingRowProps {
	node: HeadingTreeNode;
	depth: number;
	isActive: boolean;
	isExpanded: boolean;
	hasChildren: boolean;
	/** Row is dim (subtree has no matches AND not an ancestor of a match). */
	dim: boolean;
	onSelect: () => void;
	onToggle: () => void;
}

const IndentSpacer: React.FC<{ depth: number }> = ({ depth }) => (
	<span aria-hidden className="pktw-inline-block" style={{ width: `${depth * 12}px` }} />
);

const ChevronCell: React.FC<{ hasChildren: boolean; isExpanded: boolean; onToggle: () => void }> = ({ hasChildren, isExpanded, onToggle }) => {
	if (!hasChildren) {
		return <span aria-hidden className="pktw-inline-block pktw-w-4 pktw-h-4 pktw-shrink-0" />;
	}
	const Icon = isExpanded ? ChevronDown : ChevronRight;
	return (
		<span
			role="button"
			tabIndex={-1}
			aria-label={isExpanded ? 'Collapse' : 'Expand'}
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			className="pktw-inline-flex pktw-w-4 pktw-h-4 pktw-items-center pktw-justify-center pktw-shrink-0 pktw-text-pk-text-tertiary hover:pktw-text-pk-text-secondary pktw-cursor-pointer"
		>
			<Icon className="pktw-w-3 pktw-h-3" />
		</span>
	);
};

const RangeBadge: React.FC<{ lineStart: number; lineEnd: number }> = ({ lineStart, lineEnd }) => (
	<span className="pktw-text-[10px] pktw-font-mono pktw-text-pk-text-tertiary pktw-shrink-0 pktw-tabular-nums">
		{lineStart}-{lineEnd}
	</span>
);

const MatchBadge: React.FC<{ count: number; isActive: boolean }> = ({ count, isActive }) => {
	if (count <= 0) return null;
	return (
		<span
			className={cn(
				'pktw-text-[10px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-whitespace-nowrap pktw-shrink-0',
				isActive
					? 'pktw-bg-pk-accent-tint pktw-text-pk-accent'
					: 'pktw-bg-pk-surface-2 pktw-text-pk-text-secondary',
			)}
		>
			{count}
		</span>
	);
};

export const HeadingRow: React.FC<HeadingRowProps> = ({
	node,
	depth,
	isActive,
	isExpanded,
	hasChildren,
	dim,
	onSelect,
	onToggle,
}) => {
	const Icon = LEVEL_ICONS[node.level];
	return (
		<span
			role="treeitem"
			aria-selected={isActive}
			aria-expanded={hasChildren ? isExpanded : undefined}
			onClick={onSelect}
			className={cn(
				'pktw-relative pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1 pktw-text-sm pktw-cursor-pointer pktw-select-none pktw-min-w-0',
				isActive ? 'pktw-bg-pk-accent-tint' : 'hover:pktw-bg-pk-surface-2',
				dim && !isActive ? 'pktw-opacity-50' : undefined,
			)}
		>
			{isActive && (
				<span
					aria-hidden
					className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-0.5 pktw-bg-pk-accent"
				/>
			)}
			<IndentSpacer depth={depth} />
			<ChevronCell hasChildren={hasChildren} isExpanded={isExpanded} onToggle={onToggle} />
			<Icon
				className={cn(
					'pktw-w-3.5 pktw-h-3.5 pktw-shrink-0',
					isActive ? 'pktw-text-pk-accent' : 'pktw-text-pk-text-tertiary',
				)}
			/>
			<span
				className={cn(
					'pktw-truncate pktw-min-w-0 pktw-flex-1',
					isActive ? 'pktw-text-pk-accent pktw-font-medium' : 'pktw-text-pk-text-primary',
				)}
				title={node.title}
			>
				{node.title || '(untitled)'}
			</span>
			<RangeBadge lineStart={node.lineStart} lineEnd={node.lineEnd} />
			<MatchBadge count={node.matchCount} isActive={isActive} />
		</span>
	);
};
