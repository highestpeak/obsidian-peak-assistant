/**
 * Controlled Tree projection for the shared Result Browser. Renders results in
 * vault folder hierarchy (Obsidian file-explorer-native) with a Compact /
 * Detailed density. Pure presentation + scoped keyboard: it owns no store, no
 * service context, no telemetry and no open policy — the host adapter passes
 * state in (results, density, collapsedFolders, cursor, inspectorOpen) and
 * receives intents out (open file, reveal folder, move cursor, toggle
 * collapse, toggle inspector, file focus/hover).
 *
 * Keyboard is bound to the tree's own container via `ownerDocument`
 * (detached-window safe) instead of the global `window` — plan §B "Move
 * keyboard handling from `window` listeners to the focused `ResultBrowser`
 * root" + WP0 owner-window finding.
 *
 * Extracted from `src/ui/view/quick-search/components/result-tree/ResultTreeView.tsx`.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, File as FileIcon, Folder as FolderIcon, Hash } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { SearchResultItem } from '@/core/search/searchTypes';
import { intensityTier } from '../model/intensityTier';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import {
	ancestorFolderPaths,
	buildResultTree,
	flattenVisibleFiles,
	type TreeFile,
	type TreeFolder,
	type TreeNode,
} from '../model/buildTree';
import type { ResultBrowserDensity } from '../model/types';

export interface ResultBrowserTreeProps {
	results: readonly SearchResultItem[];
	density: ResultBrowserDensity;
	collapsedFolders: readonly string[];
	/** Focused file path (keyboard cursor). `null` = none yet. */
	cursor: string | null;
	onCursorChange: (path: string | null) => void;
	onToggleCollapse: (folderPath: string) => void;
	onOpenFile: (file: TreeFile, opts: { newTab: boolean; keepOpen: boolean }) => void;
	onRevealFolder: (folder: TreeFolder, opts: { keepOpen: boolean }) => void;
	/** Inspector open state + setter (host-owned) — drives ←/→ keyboard. */
	inspectorOpen: boolean;
	onInspectorOpenChange: (open: boolean) => void;
	/** Scoped keyboard active only while the tree is the focused projection. */
	keyboardEnabled?: boolean;
	onFileHoverStart?: (path: string) => void;
	onFileHoverEnd?: (path: string) => void;
}

export const ResultBrowserTree: React.FC<ResultBrowserTreeProps> = ({
	results, density, collapsedFolders, cursor, onCursorChange, onToggleCollapse,
	onOpenFile, onRevealFolder, inspectorOpen, onInspectorOpenChange,
	keyboardEnabled = true, onFileHoverStart, onFileHoverEnd,
}) => {
	const collapsedSet = useMemo(() => new Set(collapsedFolders), [collapsedFolders]);
	const tree = useMemo(() => buildResultTree(results), [results]);
	const flatFileList = useMemo(() => flattenVisibleFiles(tree, collapsedSet), [tree, collapsedSet]);
	const containerRef = useRef<HTMLDivElement>(null);
	const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

	// Auto-cursor to the first visible file when results arrive or when the
	// previously-focused file is no longer visible.
	useEffect(() => {
		if (flatFileList.length === 0) return;
		if (cursor && flatFileList.some((f) => f.path === cursor)) return;
		onCursorChange(flatFileList[0].path);
	}, [flatFileList, cursor, onCursorChange]);

	const handleFileClick = useCallback(
		(file: TreeFile, e: React.MouseEvent) => {
			onCursorChange(file.path);
			onOpenFile(file, { newTab: e.metaKey || e.ctrlKey, keepOpen: e.altKey });
		},
		[onOpenFile, onCursorChange],
	);

	const handleFolderClick = useCallback(
		(folder: TreeFolder, e: React.MouseEvent) => onRevealFolder(folder, { keepOpen: e.altKey }),
		[onRevealFolder],
	);

	const handleChevronClick = useCallback(
		(folder: TreeFolder, e: React.MouseEvent) => {
			e.stopPropagation();
			onToggleCollapse(folder.path);
		},
		[onToggleCollapse],
	);

	// Keyboard navigation — file-only. Bound to the container's ownerDocument
	// so it survives detached (popout) windows. See spec at
	// `docs/research/2026-07-08-tree-view-mockup/` § Keyboard Navigation.
	const handleKey = useCallback((e: KeyboardEvent): void => {
		if (!keyboardEnabled) return;
		const doc = containerRef.current?.ownerDocument;
		const active = doc?.activeElement ?? null;
		const inInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
		if (inInput && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter'
			&& e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Escape') {
			return;
		}

		function moveCursor(delta: 1 | -1): void {
			if (flatFileList.length === 0) return;
			const idx = cursor ? flatFileList.findIndex((f) => f.path === cursor) : -1;
			const nextIdx = idx < 0
				? (delta === 1 ? 0 : flatFileList.length - 1)
				: (idx + delta + flatFileList.length) % flatFileList.length;
			onCursorChange(flatFileList[nextIdx].path);
		}

		if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
		if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
		if (e.key === 'ArrowLeft') {
			// Left = close inspector if open, else collapse the deepest expanded
			// ancestor folder. Mirrors list-view precedence.
			if (inspectorOpen) { e.preventDefault(); onInspectorOpenChange(false); return; }
			if (!cursor) { e.preventDefault(); return; }
			const ancestors = ancestorFolderPaths(cursor);
			const deepestExpanded = [...ancestors].reverse().find((p) => !collapsedSet.has(p));
			e.preventDefault();
			if (deepestExpanded) onToggleCollapse(deepestExpanded);
			return;
		}
		if (e.key === 'ArrowRight') {
			// Right = expand nearest collapsed ancestor if any, otherwise open the
			// inspector (the tab-level handler bails out for tree mode).
			if (cursor) {
				const ancestors = ancestorFolderPaths(cursor);
				const collapsedAncestor = ancestors.find((p) => collapsedSet.has(p));
				if (collapsedAncestor) { e.preventDefault(); onToggleCollapse(collapsedAncestor); return; }
			}
			e.preventDefault();
			onInspectorOpenChange(true);
			return;
		}
		if (e.key === 'Enter') {
			if (!cursor) return;
			const file = flatFileList.find((f) => f.path === cursor);
			if (!file) return;
			e.preventDefault();
			onOpenFile(file, { newTab: e.metaKey || e.ctrlKey, keepOpen: e.altKey });
		}
	}, [keyboardEnabled, flatFileList, cursor, collapsedSet, inspectorOpen, onCursorChange, onToggleCollapse, onInspectorOpenChange, onOpenFile]);

	useOwnerDocumentListener(containerRef, 'keydown', handleKey);

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
					onFileHoverStart={onFileHoverStart}
					onFileHoverEnd={onFileHoverEnd}
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
	density: ResultBrowserDensity;
	collapsedSet: Set<string>;
	cursor: string | null;
	onFileClick: (file: TreeFile, e: React.MouseEvent) => void;
	onFolderClick: (folder: TreeFolder, e: React.MouseEvent) => void;
	onChevronClick: (folder: TreeFolder, e: React.MouseEvent) => void;
	rowRefSetter: (path: string) => (el: HTMLDivElement | null) => void;
	onFileHoverStart?: (path: string) => void;
	onFileHoverEnd?: (path: string) => void;
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

// Depth-based indentation constants (files hang under their parent folder,
// matching Obsidian's own File Explorer).
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
					className={cn('pktw-w-3 pktw-h-3 pktw-transition-transform', collapsed ? '' : 'pktw-rotate-90')}
				/>
			</button>
			<FolderIcon className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 pktw-flex-none pktw-text-pk-accent" />
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

const FileRow: React.FC<RowProps & { file: TreeFile }> = ({
	file, depth, density, cursor, onFileClick, rowRefSetter, onFileHoverStart, onFileHoverEnd,
}) => {
	const isActive = cursor === file.path;
	const indent = INDENT_BASE + depth * INDENT_STEP;
	const isCompact = density === 'compact';
	const displayName = displayFilename(file.name);

	const onEnter = () => onFileHoverStart?.(file.path);
	const onLeave = () => onFileHoverEnd?.(file.path);

	if (isCompact) {
		return (
			<div
				ref={rowRefSetter(file.path)}
				className={cn(
					'pktw-flex pktw-items-center pktw-h-[24px] pktw-pr-2 pktw-cursor-pointer pktw-text-[12.5px]',
					isActive ? 'pktw-bg-pk-accent-tint' : 'hover:pktw-bg-pk-surface-sunken',
				)}
				style={{ paddingLeft: indent, boxShadow: isActive ? 'inset 3px 0 0 var(--pk-accent, #a78bfa)' : undefined }}
				onClick={(e) => onFileClick(file, e)}
				onMouseEnter={onEnter}
				onMouseLeave={onLeave}
				role="treeitem"
				aria-selected={isActive}
				title={file.path}
			>
				<span className="pktw-flex-none pktw-w-4" aria-hidden="true" />
				<IntensityDot result={file.result} />
				<FileIcon className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 pktw-text-pk-foreground-muted pktw-flex-none" />
				<span className="pktw-flex-1 pktw-truncate">{displayName}</span>
				<HitBadge count={file.hitCount} />
			</div>
		);
	}

	const anchor = extractHeadingAnchor(file.result);
	const snippetText = file.result.highlight?.text ?? '';
	const modifiedLabel = formatRelativeDate(file.result.lastModified);

	return (
		<div
			ref={rowRefSetter(file.path)}
			className={cn(
				'pktw-flex pktw-items-start pktw-py-1.5 pktw-pr-2 pktw-cursor-pointer pktw-text-[12.5px]',
				isActive ? 'pktw-bg-pk-accent-tint' : 'hover:pktw-bg-pk-surface-sunken',
			)}
			style={{ paddingLeft: indent, boxShadow: isActive ? 'inset 3px 0 0 var(--pk-accent, #a78bfa)' : undefined }}
			onClick={(e) => onFileClick(file, e)}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
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
	if (count <= 1) return null;
	return (
		<span className="pktw-inline-flex pktw-items-center pktw-justify-center pktw-h-4 pktw-min-w-[16px] pktw-px-1.5 pktw-rounded-full pktw-text-pk-xs pktw-font-semibold pktw-tabular-nums pktw-bg-pk-accent-tint pktw-text-pk-accent">
			{count}
		</span>
	);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayFilename(name: string): string {
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

function extractHeadingAnchor(result: SearchResultItem): string | null {
	const snippet = result.highlight?.text ?? '';
	const inSnippet = snippet.match(/(^|\n)\s{0,3}(#{1,6})\s+([^\n#][^\n]*)/);
	if (inSnippet) return trimHeading(inSnippet[3]);

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
