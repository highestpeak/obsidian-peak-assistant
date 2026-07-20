import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, File as FileIcon, Folder as FolderIcon, Hash } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useVaultSearchStore } from '../../store';
import type { SearchResultItem } from '@/core/search/searchTypes';
import { intensityTier } from './intensityTier';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import {
	ancestorFolderPaths,
	buildResultTree,
	flattenVisibleFiles,
	type TreeFile,
	type TreeFolder,
	type TreeNode,
} from './buildTree';

/**
 * Tree view for Vault Search results. Renders results in vault folder
 * hierarchy (Obsidian file-explorer-native), with a Compact / Detailed
 * density toggle. See design mockup at
 * `docs/research/2026-07-08-tree-view-mockup/index.html`.
 *
 * Interactions (v1):
 * - Click file row  → open the file. Cmd/Ctrl+click for new tab. Alt keeps
 *   modal open.
 * - Click folder    → reveal the folder in Obsidian's left File Explorer.
 * - Click chevron   → toggle folder collapse without opening anything.
 * - Keyboard nav    → ↑/↓ move cursor between files only (folders are
 *   skipped). ←/→ collapse/expand the folder containing the cursor.
 *   Enter opens; Cmd+Enter new tab; Alt+Enter keeps modal open.
 */

interface ResultTreeViewProps {
	onClose?: () => void;
	onSelectForInspector?: (path: string) => void;
}

export const ResultTreeView: React.FC<ResultTreeViewProps> = ({ onClose, onSelectForInspector }) => {
	const results = useVaultSearchStore((s) => s.lastSearchResults);
	const density = useVaultSearchStore((s) => s.resultDensity);
	const collapsedFoldersArr = useVaultSearchStore((s) => s.treeCollapsedFolders);
	const toggleTreeFolderCollapsed = useVaultSearchStore((s) => s.toggleTreeFolderCollapsed);
	const cursor = useVaultSearchStore((s) => s.treeCursor);
	const setCursor = useVaultSearchStore((s) => s.setTreeCursor);
	const { vaultNavigation } = useServiceContext();

	const collapsedSet = useMemo(() => new Set(collapsedFoldersArr), [collapsedFoldersArr]);
	const tree = useMemo(() => buildResultTree(results), [results]);
	const flatFileList = useMemo(() => flattenVisibleFiles(tree, collapsedSet), [tree, collapsedSet]);
	const containerRef = useRef<HTMLDivElement>(null);
	const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

	// Auto-cursor to the first visible file when results arrive or when the
	// previously-focused file is no longer visible.
	useEffect(() => {
		if (flatFileList.length === 0) return;
		if (cursor && flatFileList.some((f) => f.path === cursor)) return;
		setCursor(flatFileList[0].path);
	}, [flatFileList, cursor, setCursor]);

	// Push inspector selection when the tree cursor moves — unconditional
	// (unlike list view's `inspectorOpen`-gated push) because we WANT the
	// inspector to be preloaded with the right file even while collapsed,
	// so opening it via → shows the snippet + metadata immediately instead
	// of an empty "Select a note" prompt.
	useEffect(() => {
		if (!cursor) return;
		const t = setTimeout(() => onSelectForInspector?.(cursor), 150);
		return () => clearTimeout(t);
	}, [cursor, onSelectForInspector]);

	const openFile = useCallback(
		async (file: TreeFile, opts: { newLeaf: boolean; keepOpen: boolean }) => {
			behaviorRecorder.push('openedFile', { path: file.path });
			try {
				await vaultNavigation.openSearchResult(file.result, { newLeaf: opts.newLeaf });
			} catch (err) {
				console.warn('[ResultTreeView] openSearchResult failed:', err);
			}
			if (!opts.keepOpen) onClose?.();
		},
		[vaultNavigation, onClose],
	);

	const revealFolder = useCallback(
		(folder: TreeFolder, opts: { keepOpen: boolean }) => {
			try {
				vaultNavigation.revealFolderInFileExplorer(folder.path);
			} catch (err) {
				console.warn('[ResultTreeView] revealFolderInFileExplorer failed:', err);
			}
			if (!opts.keepOpen) onClose?.();
		},
		[vaultNavigation, onClose],
	);

	const handleFileClick = useCallback(
		(file: TreeFile, e: React.MouseEvent) => {
			setCursor(file.path);
			void openFile(file, {
				newLeaf: e.metaKey || e.ctrlKey,
				keepOpen: e.altKey,
			});
		},
		[openFile, setCursor],
	);

	const handleFolderClick = useCallback(
		(folder: TreeFolder, e: React.MouseEvent) => {
			revealFolder(folder, { keepOpen: e.altKey });
		},
		[revealFolder],
	);

	const handleChevronClick = useCallback(
		(folder: TreeFolder, e: React.MouseEvent) => {
			e.stopPropagation();
			toggleTreeFolderCollapsed(folder.path);
		},
		[toggleTreeFolderCollapsed],
	);

	// Keyboard navigation — file-only. See spec at
	// `docs/research/2026-07-08-tree-view-mockup/` § Keyboard Navigation.
	useEffect(() => {
		function moveCursor(delta: 1 | -1): void {
			if (flatFileList.length === 0) return;
			const idx = cursor ? flatFileList.findIndex((f) => f.path === cursor) : -1;
			const nextIdx = idx < 0
				? (delta === 1 ? 0 : flatFileList.length - 1)
				: (idx + delta + flatFileList.length) % flatFileList.length;
			setCursor(flatFileList[nextIdx].path);
		}

		function toggleAncestorFolder(): void {
			if (!cursor) return;
			const ancestors = ancestorFolderPaths(cursor);
			// Collapse the deepest ancestor that is currently expanded, or expand
			// the shallowest that is currently collapsed. This makes ← / → feel
			// natural relative to the visible tree.
			const deepestExpanded = [...ancestors].reverse().find((p) => !collapsedSet.has(p));
			if (deepestExpanded) toggleTreeFolderCollapsed(deepestExpanded);
		}

		function handle(e: KeyboardEvent): void {
			const active = document.activeElement;
			const inInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
			if (inInput && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter'
				&& e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Escape') {
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				moveCursor(1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				moveCursor(-1);
				return;
			}
			if (e.key === 'ArrowLeft') {
				// Left = close inspector if open, else collapse the ancestor
				// folder. Mirrors list-view precedence.
				if (useVaultSearchStore.getState().inspectorOpen) {
					e.preventDefault();
					useVaultSearchStore.getState().setInspectorOpen(false);
					return;
				}
				e.preventDefault();
				toggleAncestorFolder();
				return;
			}
			if (e.key === 'ArrowRight') {
				// Right = expand nearest collapsed ancestor if any, otherwise
				// open the inspector (mirrors list-view behavior since the
				// tab-level handler bails out for tree mode).
				if (cursor) {
					const ancestors = ancestorFolderPaths(cursor);
					const collapsedAncestor = ancestors.find((p) => collapsedSet.has(p));
					if (collapsedAncestor) {
						e.preventDefault();
						toggleTreeFolderCollapsed(collapsedAncestor);
						return;
					}
				}
				e.preventDefault();
				useVaultSearchStore.getState().setInspectorOpen(true);
				return;
			}
			if (e.key === 'Enter') {
				if (!cursor) return;
				const file = flatFileList.find((f) => f.path === cursor);
				if (!file) return;
				e.preventDefault();
				void openFile(file, {
					newLeaf: e.metaKey || e.ctrlKey,
					keepOpen: e.altKey,
				});
			}
		}

		window.addEventListener('keydown', handle);
		return () => window.removeEventListener('keydown', handle);
	}, [flatFileList, cursor, collapsedSet, setCursor, toggleTreeFolderCollapsed, openFile]);

	// Scroll cursor row into view when it moves.
	useEffect(() => {
		if (!cursor) return;
		const el = rowRefs.current.get(cursor);
		const container = containerRef.current;
		if (!el || !container) return;
		const elTop = el.offsetTop;
		const elBottom = elTop + el.offsetHeight;
		const cTop = container.scrollTop;
		const cBottom = cTop + container.clientHeight;
		if (elTop < cTop) container.scrollTo({ top: elTop, behavior: 'smooth' });
		else if (elBottom > cBottom) container.scrollTo({ top: elBottom - container.clientHeight, behavior: 'smooth' });
	}, [cursor]);

	if (results.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-py-16 pktw-text-pk-foreground-faint pktw-text-sm">
				No results — try a different query.
			</div>
		);
	}

	const rowRefSetter = (path: string) => (el: HTMLDivElement | null): void => {
		if (el) rowRefs.current.set(path, el);
		else rowRefs.current.delete(path);
	};

	return (
		<div ref={containerRef} className="pktw-h-full pktw-overflow-y-auto pktw-py-2">
			{tree.map((node) => (
				<TreeNodeRenderer
					key={node.path}
					node={node}
					depth={0}
					density={density}
					collapsedSet={collapsedSet}
					cursor={cursor}
					onFileClick={handleFileClick}
					onFolderClick={handleFolderClick}
					onChevronClick={handleChevronClick}
					rowRefSetter={rowRefSetter}
				/>
			))}
		</div>
	);
};

// ---------------------------------------------------------------------------
// Row renderer (recursive)
// ---------------------------------------------------------------------------

interface RowProps {
	node: TreeNode;
	depth: number;
	density: 'compact' | 'detailed';
	collapsedSet: Set<string>;
	cursor: string | null;
	onFileClick: (file: TreeFile, e: React.MouseEvent) => void;
	onFolderClick: (folder: TreeFolder, e: React.MouseEvent) => void;
	onChevronClick: (folder: TreeFolder, e: React.MouseEvent) => void;
	rowRefSetter: (path: string) => (el: HTMLDivElement | null) => void;
}

const TreeNodeRenderer: React.FC<RowProps> = (props) => {
	const { node, depth, collapsedSet } = props;
	if (node.kind === 'folder') {
		const collapsed = collapsedSet.has(node.path);
		return (
			<>
				<FolderRow {...props} folder={node} depth={depth} collapsed={collapsed} />
				{!collapsed && node.children.map((c) => (
					<TreeNodeRenderer {...props} node={c} depth={depth + 1} key={c.path} />
				))}
			</>
		);
	}
	return <FileRow {...props} file={node} depth={depth} />;
};

// ---------------------------------------------------------------------------
// Folder row
// ---------------------------------------------------------------------------

// Depth-based indentation constants. Each depth adds INDENT_STEP so the
// visual hierarchy is obvious at a glance. File rows include an empty
// chevron-sized slot so a child file's icon aligns to the right of its
// parent folder's chevron+text — the "child hangs under parent" effect
// that Obsidian's own file tree uses.
const INDENT_BASE = 4;
const INDENT_STEP = 18;
const CHEVRON_SLOT_PX = 16; // chevron width (12px) + right margin (4px)

const FolderRow: React.FC<RowProps & { folder: TreeFolder; collapsed: boolean }> = ({
	folder, depth, collapsed, onFolderClick, onChevronClick,
}) => {
	const indent = INDENT_BASE + depth * INDENT_STEP;
	return (
		<div
			className="pktw-group pktw-flex pktw-items-center pktw-h-[24px] pktw-pr-2 pktw-cursor-pointer hover:pktw-bg-pk-surface-sunken pktw-text-[12.5px] pktw-font-medium pktw-text-pk-foreground"
			style={{ paddingLeft: indent }}
			onClick={(e) => onFolderClick(folder, e)}
			role="treeitem"
			aria-expanded={!collapsed}
			title={`${folder.path} — click to reveal in File Explorer, chevron to collapse`}
		>
			<button
				type="button"
				className="pktw-inline-flex pktw-items-center pktw-justify-center pktw-w-3 pktw-h-3 pktw-mr-1 pktw-text-pk-foreground-faint hover:pktw-text-pk-foreground pktw-flex-none"
				onClick={(e) => onChevronClick(folder, e)}
				aria-label={collapsed ? 'Expand folder' : 'Collapse folder'}
			>
				<ChevronRight
					className={cn(
						'pktw-w-3 pktw-h-3 pktw-transition-transform',
						collapsed ? '' : 'pktw-rotate-90',
					)}
				/>
			</button>
			<FolderIcon className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 pktw-flex-none pktw-text-pk-accent" />
			{/* Wrap name+count in a min-w-0 flex row so the badge stays right
			    next to the name (not pushed to the row's far edge). Long names
			    still truncate before the badge; short names see the count
			    immediately after — no long eye saccade at full modal width. */}
			<div className="pktw-flex-1 pktw-min-w-0 pktw-flex pktw-items-center pktw-gap-1.5">
				<span className="pktw-truncate pktw-min-w-0">{folder.name}</span>
				<span
					className="pktw-flex-none pktw-inline-flex pktw-items-center pktw-justify-center pktw-h-4 pktw-min-w-[18px] pktw-px-1.5 pktw-rounded-full pktw-text-pk-xs pktw-font-semibold pktw-tabular-nums pktw-bg-pk-accent-tint pktw-text-pk-accent"
					title={`${folder.fileCount} matching file${folder.fileCount === 1 ? '' : 's'} in this folder`}
				>
					{folder.fileCount}
				</span>
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// File row — density-aware
// ---------------------------------------------------------------------------

const FileRow: React.FC<RowProps & { file: TreeFile }> = ({
	file, depth, density, cursor, onFileClick, rowRefSetter,
}) => {
	const isActive = cursor === file.path;
	const indent = INDENT_BASE + depth * INDENT_STEP;
	const isCompact = density === 'compact';
	const displayName = displayFilename(file.name);
	// Hover tracking feeds the AI-Suggest behavior recorder. Emits only after
	// 800ms of continuous hover — matches the spec's `hoveredFile` threshold.
	const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const hoverStartRef = React.useRef<number>(0);
	const handleMouseEnter = React.useCallback(() => {
		hoverStartRef.current = Date.now();
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = setTimeout(() => {
			behaviorRecorder.push('focusedFile', { path: file.path, durationMs: 800 });
		}, 800);
	}, [file.path]);
	const handleMouseLeave = React.useCallback(() => {
		if (hoverTimerRef.current) {
			clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
	}, []);
	React.useEffect(() => () => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
	}, []);

	if (isCompact) {
		return (
			<div
				ref={rowRefSetter(file.path)}
				className={cn(
					'pktw-flex pktw-items-center pktw-h-[24px] pktw-pr-2 pktw-cursor-pointer pktw-text-[12.5px]',
					isActive
						? 'pktw-bg-pk-accent-tint'
						: 'hover:pktw-bg-pk-surface-sunken',
				)}
				style={{
					paddingLeft: indent,
					boxShadow: isActive ? 'inset 3px 0 0 var(--pk-accent, #a78bfa)' : undefined,
				}}
				onClick={(e) => onFileClick(file, e)}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				role="treeitem"
				aria-selected={isActive}
				title={file.path}
			>
				{/* Empty chevron slot keeps files aligned with the icon column
				    of their sibling folders; otherwise child files would render
				    to the LEFT of their parent folder's text — reads as wrong
				    hierarchy. Matches Obsidian's File Explorer treatment. */}
				<span className="pktw-flex-none pktw-w-4" aria-hidden="true" />
				<IntensityDot result={file.result} />
				<FileIcon className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 pktw-text-pk-foreground-muted pktw-flex-none" />
				<span className="pktw-flex-1 pktw-truncate">{displayName}</span>
				<HitBadge count={file.hitCount} />
			</div>
		);
	}

	// Detailed row: 3-line stack — name + badge + date · heading anchor · snippet
	const anchor = extractHeadingAnchor(file.result);
	const snippetText = file.result.highlight?.text ?? '';
	const modifiedLabel = formatRelativeDate(file.result.lastModified);

	return (
		<div
			ref={rowRefSetter(file.path)}
			className={cn(
				'pktw-flex pktw-items-start pktw-py-1.5 pktw-pr-2 pktw-cursor-pointer pktw-text-[12.5px]',
				isActive
					? 'pktw-bg-pk-accent-tint'
					: 'hover:pktw-bg-pk-surface-sunken',
			)}
			style={{
				paddingLeft: indent,
				boxShadow: isActive ? 'inset 3px 0 0 var(--pk-accent, #a78bfa)' : undefined,
			}}
			onClick={(e) => onFileClick(file, e)}
			role="treeitem"
			aria-selected={isActive}
			title={file.path}
		>
			<span className="pktw-flex-none" style={{ width: CHEVRON_SLOT_PX }} aria-hidden="true" />
			<span className="pktw-mt-1"><IntensityDot result={file.result} /></span>
			<FileIcon className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 pktw-mt-0.5 pktw-text-pk-foreground-muted pktw-flex-none" />
			<div className="pktw-flex-1 pktw-min-w-0 pktw-flex pktw-flex-col pktw-gap-0.5">
				<div className="pktw-flex pktw-items-center pktw-gap-1.5">
					<span className="pktw-flex-1 pktw-truncate pktw-font-medium">{displayName}</span>
					<HitBadge count={file.hitCount} />
					{modifiedLabel && (
						<span className="pktw-flex-none pktw-text-[10.5px] pktw-text-pk-foreground-faint">{modifiedLabel}</span>
					)}
				</div>
				<div
					className={cn(
						'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm',
						anchor ? 'pktw-text-pk-accent' : 'pktw-text-pk-foreground-faint',
					)}
				>
					<Hash className="pktw-w-2.5 pktw-h-2.5" />
					<span className="pktw-truncate">{anchor ?? 'body only'}</span>
				</div>
				{snippetText && (
					<div className="pktw-text-pk-sm pktw-text-pk-foreground-muted pktw-truncate">
						{snippetText}
					</div>
				)}
			</div>
		</div>
	);
};

/**
 * Three-tier relative strength indicator for a file row. Reads
 * `displayScorePercent` (set by `assignDisplayScorePercent` in the search
 * pipeline) — the value is already normalized so the top match is 100 and
 * everything else scales below. Renders a fixed 8px slot so file names
 * still align across rows of different tiers.
 *
 * Tiers use the same threshold constants as any other consumer of the
 * relative score — see `SEARCH_RESULT_INTENSITY_*_THRESHOLD` in
 * `constant.ts`.
 */
const IntensityDot: React.FC<{ result: SearchResultItem }> = ({ result }) => {
	const tier = intensityTier(result);
	const styleByTier: Record<'high' | 'mid' | 'low', React.CSSProperties> = {
		high: { background: 'var(--pk-accent, #7c3aed)', opacity: 1 },
		mid: { background: 'var(--pk-accent, #7c3aed)', opacity: 0.5 },
		low: { background: 'transparent' },
	};
	return (
		<span
			className="pktw-flex-none pktw-inline-block pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-mr-1"
			style={styleByTier[tier]}
			aria-hidden="true"
		/>
	);
};

const HitBadge: React.FC<{ count: number }> = ({ count }) => {
	// A count of 1 is the default — showing it just clutters the row without
	// telling the user anything they can't already assume (a result exists →
	// at least one hit). Only render when the count is worth calling out.
	if (count <= 1) return null;
	return (
		<span
			className="pktw-inline-flex pktw-items-center pktw-justify-center pktw-h-4 pktw-min-w-[16px] pktw-px-1.5 pktw-rounded-full pktw-text-pk-xs pktw-font-semibold pktw-tabular-nums pktw-bg-pk-accent-tint pktw-text-pk-accent"
		>
			{count}
		</span>
	);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayFilename(name: string): string {
	// Markdown extension is the noise the user doesn't need to see.
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

/**
 * Best-effort heading anchor extractor. Detailed mode shows the nearest
 * preceding heading (`# ... ######`) for the match position. We look at
 * `contentRaw` / `content` if available and walk backward from the first
 * match span. If no heading is found, callers render "body only".
 */
function extractHeadingAnchor(result: SearchResultItem): string | null {
	const snippet = result.highlight?.text ?? '';
	// Case 1: the snippet itself starts with a heading marker — very common
	// for hits inside a section title.
	const inSnippet = snippet.match(/(^|\n)\s{0,3}(#{1,6})\s+([^\n#][^\n]*)/);
	if (inSnippet) return trimHeading(inSnippet[3]);

	// Case 2: walk backward through the raw content until a heading is found.
	const content = result.contentRaw ?? result.content ?? '';
	if (!content) return null;
	const firstSpan = result.highlight?.highlights?.[0];
	if (!firstSpan) return null;
	const markerText = snippet.slice(firstSpan.start, firstSpan.end);
	if (!markerText) return null;
	const markerPos = content.indexOf(markerText);
	if (markerPos === -1) return null;
	const prefix = content.slice(0, markerPos);
	const lines = prefix.split('\n');
	for (let i = lines.length - 1; i >= 0; i--) {
		const m = lines[i].match(/^\s{0,3}(#{1,6})\s+(.+)$/);
		if (m) return trimHeading(m[2]);
	}
	return null;
}

function trimHeading(raw: string): string {
	return raw.replace(/#+\s*$/, '').trim();
}

function formatRelativeDate(ts: number | undefined): string | null {
	if (!ts) return null;
	const now = Date.now();
	const diffMs = now - ts;
	const day = 24 * 60 * 60 * 1000;
	if (diffMs < 0) return null;
	if (diffMs < day) return 'today';
	if (diffMs < 2 * day) return '1 day ago';
	if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;
	const d = new Date(ts);
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

