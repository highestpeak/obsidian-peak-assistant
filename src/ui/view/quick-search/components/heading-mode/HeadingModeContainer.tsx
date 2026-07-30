/**
 * T5 (2026-07-07 heading-mode UI): container that stitches together the
 * heading-mode two-zone surface — left `HeadingTree`, right
 * `SectionDetailPane`, and optional `LinkPositionsFooter`.
 *
 * Responsibility split:
 *  - Fetches the heading tree via the app-composed `headingMode` port.
 *  - Owns active-heading + active-snippet state locally (no store
 *    field: the state is transient per open-of-modal and only two
 *    components need it).
 *  - Owns focus zone ('tree' | 'detail') and installs
 *    `useHeadingModeKeyboard` while heading mode is active.
 *  - Opens the active heading / snippet via the `vaultNavigation` port
 *    at the requested line.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useVaultSearchStore } from '../../store';
import type { HeadingTreeNode } from '@/service/search/heading/headingTree';
import type { SectionSnippet } from '@/service/search/heading/sectionSnippets';
import { HeadingTree, headingRowKey, type HeadingTreeHandle } from './HeadingTree';
import { SectionDetailPane, type ActiveSection } from './SectionDetailPane';
import { LinkPositionsFooter } from './LinkPositionsFooter';
import {
	useHeadingModeKeyboard,
	type HeadingFocusZone,
	type HeadingKeyboardHandlers,
} from '../../hooks/useHeadingModeKeyboard';
import { HEADING_MODE_STRINGS } from './strings';

interface HeadingModeContainerProps {
	filePath: string;
	queryText: string;
	onClose?: () => void;
}

function nodeToActiveSection(node: HeadingTreeNode | null): ActiveSection | null {
	if (!node) return null;
	return {
		title: node.title,
		level: node.level,
		lineStart: node.lineStart,
		lineEnd: node.lineEnd,
		matchCount: node.matchCount,
	};
}

function totalMatches(tree: HeadingTreeNode[]): number {
	// Root-level matchCount already includes propagated descendant hits
	// (T2b propagates upward), so summing roots gives the doc total.
	let sum = 0;
	for (const root of tree) sum += root.matchCount;
	return sum;
}

const FooterTotalMatches: React.FC<{ tree: HeadingTreeNode[]; queryText: string }> = ({ tree, queryText }) => {
	if (!queryText) return null;
	const total = totalMatches(tree);
	return (
		<span className="pktw-px-4 pktw-py-1 pktw-text-pk-sm pktw-text-pk-text-tertiary pktw-border-t pktw-border-pk-border/40">
			{HEADING_MODE_STRINGS.totalMatchesLabel(total)}
		</span>
	);
};

export const HeadingModeContainer: React.FC<HeadingModeContainerProps> = ({ filePath, queryText, onClose }) => {
	const { headingMode, vaultNavigation } = useServiceContext();
	const isActive = useVaultSearchStore((s) => s.quickSearchMode === 'heading');

	const [tree, setTree] = useState<HeadingTreeNode[]>([]);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [activeSnippetIndex, setActiveSnippetIndex] = useState<number>(-1);
	const [focus, setFocus] = useState<HeadingFocusZone>('tree');
	const [snippets, setSnippets] = useState<SectionSnippet[]>([]);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const treeHandleRef = useRef<HeadingTreeHandle>({ rows: [], activeIndex: -1 });

	// Fetch the heading tree whenever file or query text changes.
	useEffect(() => {
		if (!headingMode) {
			setTree([]);
			return;
		}
		let cancelled = false;
		headingMode
			.extractHeadingTree({ filePath, queryText })
			.then((next) => {
				if (cancelled) return;
				setTree(next);
			})
			.catch((err) => {
				console.warn('[HeadingModeContainer] extractHeadingTree failed', err);
				if (!cancelled) setTree([]);
			});
		return () => {
			cancelled = true;
		};
	}, [headingMode, filePath, queryText]);

	// Auto-activate: when the tree loads and nothing is active, activate
	// the first row (spec §Empty State: "right pane shows the currently
	// active section's snippets"). Also re-anchor when the active row
	// disappears after a query change.
	useEffect(() => {
		if (tree.length === 0) {
			setActiveKey(null);
			return;
		}
		const firstRoot = tree[0];
		const firstKey = headingRowKey(firstRoot);
		if (!activeKey) {
			setActiveKey(firstKey);
			return;
		}
		// Verify the previously-active key still exists in the current
		// flattened list; if not, snap to the first row.
		const found = treeHandleRef.current.rows.find((r) => r.key === activeKey);
		if (!found) setActiveKey(firstKey);
	}, [tree]);

	const activeNode = useMemo<HeadingTreeNode | null>(() => {
		if (!activeKey) return null;
		return treeHandleRef.current.rows.find((r) => r.key === activeKey)?.node ?? null;
	}, [activeKey, tree]);

	const activeSection = useMemo(() => nodeToActiveSection(activeNode), [activeNode]);

	// Reset snippet index when the active section changes.
	useEffect(() => {
		setActiveSnippetIndex(-1);
	}, [activeSection?.lineStart, activeSection?.lineEnd]);

	const openAtLine = useCallback(async (line: number) => {
		if (!vaultNavigation) return;
		try {
			// Convert 1-based UI line to 0-based editor line.
			await vaultNavigation.openVaultPathAtLocation(filePath, {
				location: { line: Math.max(0, line - 1) },
				newLeaf: false,
			});
			onClose?.();
		} catch (err) {
			console.warn('[HeadingModeContainer] location reveal failed', err);
		}
	}, [vaultNavigation, filePath, onClose]);

	const onActivateRow = useCallback((node: HeadingTreeNode) => {
		setActiveKey(headingRowKey(node));
		setFocus('tree');
	}, []);

	const openActiveHeading = useCallback(() => {
		if (!activeSection) return;
		void openAtLine(activeSection.lineStart);
	}, [activeSection, openAtLine]);

	const openActiveSnippet = useCallback(() => {
		if (activeSnippetIndex < 0 || activeSnippetIndex >= snippets.length) return;
		void openAtLine(snippets[activeSnippetIndex].line);
	}, [activeSnippetIndex, snippets, openAtLine]);

	const moveActiveRow = useCallback((delta: 1 | -1) => {
		const rows = treeHandleRef.current.rows;
		if (rows.length === 0) return;
		const currentIdx = treeHandleRef.current.activeIndex;
		let nextIdx: number;
		if (currentIdx < 0) {
			nextIdx = delta > 0 ? 0 : rows.length - 1;
		} else {
			nextIdx = currentIdx + delta;
			if (nextIdx < 0) nextIdx = rows.length - 1;
			if (nextIdx >= rows.length) nextIdx = 0;
		}
		setActiveKey(rows[nextIdx].key);
	}, []);

	const setCollapsedFor = useCallback((key: string, op?: 'collapse' | 'expand') => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			const isCollapsed = next.has(key);
			if (op === 'collapse') {
				if (!isCollapsed) next.add(key);
			} else if (op === 'expand') {
				if (isCollapsed) next.delete(key);
			} else if (isCollapsed) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const toggleActiveRow = useCallback((op: 'collapse' | 'expand') => {
		if (!activeKey) return;
		setCollapsedFor(activeKey, op);
	}, [activeKey, setCollapsedFor]);

	const onSnippetsChange = useCallback((next: SectionSnippet[]) => {
		setSnippets(next);
	}, []);

	const onOpenSnippet = useCallback((snippet: SectionSnippet) => {
		void openAtLine(snippet.line);
	}, [openAtLine]);

	const moveActiveSnippet = useCallback((delta: 1 | -1) => {
		if (snippets.length === 0) return;
		setActiveSnippetIndex((prev) => {
			if (prev < 0) return delta > 0 ? 0 : snippets.length - 1;
			let next = prev + delta;
			if (next < 0) next = snippets.length - 1;
			if (next >= snippets.length) next = 0;
			return next;
		});
	}, [snippets.length]);

	const kbHandlers: HeadingKeyboardHandlers = useMemo(() => ({
		activeRowIndex: treeHandleRef.current.activeIndex,
		rowCount: treeHandleRef.current.rows.length,
		snippetCount: snippets.length,
		activeSnippetIndex,
		focus,
		setFocus,
		moveActiveRow,
		toggleActiveRow,
		openActiveHeading,
		moveActiveSnippet,
		openActiveSnippet,
	}), [
		focus,
		snippets.length,
		activeSnippetIndex,
		moveActiveRow,
		toggleActiveRow,
		openActiveHeading,
		moveActiveSnippet,
		openActiveSnippet,
	]);

	useHeadingModeKeyboard({ enabled: isActive, handlers: kbHandlers });

	const onRowsChange = useCallback((handle: HeadingTreeHandle) => {
		treeHandleRef.current = handle;
	}, []);

	return (
		<span className="pktw-flex pktw-flex-col pktw-flex-1 pktw-min-h-0">
			<span className="pktw-flex pktw-flex-1 pktw-min-h-0 pktw-min-w-0">
				<span
					className="pktw-flex pktw-flex-col pktw-w-2/5 pktw-min-w-0 pktw-border-r pktw-border-pk-border/40 pktw-overflow-y-auto"
					data-focus-zone="tree"
					data-active={focus === 'tree' ? 'true' : undefined}
					onClick={() => setFocus('tree')}
				>
					<HeadingTree
						tree={tree}
						activeKey={activeKey}
						queryHasText={queryText.length > 0}
						collapsed={collapsed}
						onToggleCollapsed={setCollapsedFor}
						onActivate={onActivateRow}
						onRowsChange={onRowsChange}
					/>
				</span>
				<span
					className="pktw-flex pktw-flex-col pktw-flex-1 pktw-min-w-0 pktw-min-h-0"
					data-focus-zone="detail"
					data-active={focus === 'detail' ? 'true' : undefined}
					onClick={() => setFocus('detail')}
				>
					<SectionDetailPane
						filePath={filePath}
						queryText={queryText}
						section={activeSection}
						activeSnippetIndex={activeSnippetIndex}
						onSnippetsChange={onSnippetsChange}
						onOpenSnippet={onOpenSnippet}
					/>
				</span>
			</span>
			<FooterTotalMatches tree={tree} queryText={queryText} />
			<LinkPositionsFooter filePath={filePath} tree={tree} onOpenLine={(line) => void openAtLine(line)} />
		</span>
	);
};
