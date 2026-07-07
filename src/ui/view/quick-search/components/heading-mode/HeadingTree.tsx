/**
 * T5 (2026-07-07 heading-mode UI): left zone of the heading-mode surface.
 *
 * Renders the full outline in document order, indented per level. Dims
 * non-match subtrees while keeping ancestor rows bright (spec
 * §Filtered State). Collapse/expand state lives locally; expanding /
 * collapsing a subtree does not affect the store because it's transient
 * per-open-of-modal.
 *
 * Selection state is owned by the parent (`SectionDetailPane` needs the
 * currently-active heading) — this component takes `activeKey` +
 * `onActive` as props.
 */
import React, { useMemo, useEffect } from 'react';
import { EmptyState } from '@/ui/component/mine/EmptyState';
import { SearchX } from 'lucide-react';
import type { HeadingTreeNode } from '@/service/search/heading/headingTree';
import { HeadingRow } from './HeadingRow';
import { HEADING_MODE_STRINGS } from './strings';

/**
 * Stable key derived from line offsets — used to identify a row across
 * re-renders (tree structure can change when the query text changes).
 */
export function headingRowKey(node: { lineStart: number; lineEnd: number }): string {
	return `${node.lineStart}:${node.lineEnd}`;
}

interface FlatRow {
	key: string;
	node: HeadingTreeNode;
	depth: number;
	hasChildren: boolean;
	dim: boolean;
}

/**
 * Flatten the tree in visible (document) order, honoring collapsed
 * subtrees. Also pre-computes the `dim` flag: a row is dim when its
 * subtree has zero matches AND it is not an ancestor of a matching leaf.
 * With T2b's ancestor propagation, `matchCount === 0` on a node already
 * means the entire subtree has no matches — so `dim` collapses to a
 * simple predicate.
 */
function flattenTree(
	tree: HeadingTreeNode[],
	collapsed: Set<string>,
	queryHasText: boolean,
): FlatRow[] {
	const rows: FlatRow[] = [];
	const walk = (nodes: HeadingTreeNode[], depth: number): void => {
		for (const node of nodes) {
			const key = headingRowKey(node);
			const hasChildren = node.children.length > 0;
			const dim = queryHasText && node.matchCount === 0;
			rows.push({ key, node, depth, hasChildren, dim });
			if (hasChildren && !collapsed.has(key)) {
				walk(node.children, depth + 1);
			}
		}
	};
	walk(tree, 0);
	return rows;
}

export interface HeadingTreeHandle {
	rows: FlatRow[];
	activeIndex: number;
}

interface HeadingTreeProps {
	tree: HeadingTreeNode[];
	activeKey: string | null;
	queryHasText: boolean;
	/** Container-owned collapsed set so keyboard collapse/expand can reach it. */
	collapsed: Set<string>;
	onToggleCollapsed: (key: string, op?: 'collapse' | 'expand') => void;
	onActivate: (row: HeadingTreeNode) => void;
	/** Bubble the flattened row list so the container's keyboard hook can navigate. */
	onRowsChange?: (handle: HeadingTreeHandle) => void;
}

export const HeadingTree: React.FC<HeadingTreeProps> = ({
	tree,
	activeKey,
	queryHasText,
	collapsed,
	onToggleCollapsed,
	onActivate,
	onRowsChange,
}) => {
	const flat = useMemo(() => flattenTree(tree, collapsed, queryHasText), [tree, collapsed, queryHasText]);
	const activeIndex = useMemo(
		() => (activeKey ? flat.findIndex((r) => r.key === activeKey) : -1),
		[flat, activeKey],
	);

	useEffect(() => {
		onRowsChange?.({ rows: flat, activeIndex });
	}, [flat, activeIndex, onRowsChange]);

	if (tree.length === 0) {
		return (
			<EmptyState
				icon={SearchX}
				title={HEADING_MODE_STRINGS.emptyTreeTitle}
				description={HEADING_MODE_STRINGS.emptyTreeDescription}
			/>
		);
	}

	return (
		<span
			role="tree"
			aria-label="Heading outline"
			className="pktw-flex pktw-flex-col pktw-min-w-0 pktw-py-1"
		>
			{flat.map((row) => (
				<HeadingRow
					key={row.key}
					node={row.node}
					depth={row.depth}
					isActive={row.key === activeKey}
					isExpanded={!collapsed.has(row.key)}
					hasChildren={row.hasChildren}
					dim={row.dim}
					onSelect={() => onActivate(row.node)}
					onToggle={() => onToggleCollapsed(row.key)}
				/>
			))}
		</span>
	);
};
