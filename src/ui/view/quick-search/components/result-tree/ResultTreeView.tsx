/**
 * Quick Search host adapter for the shared Result Browser Tree.
 *
 * Presentation + scoped keyboard live in
 * `@/ui/component/result-browser/tree/ResultBrowserTree`. This adapter binds
 * the Quick-Search-only concerns: `vaultSearchStore` (results / density /
 * collapsed folders / cursor / inspector), the vault open + folder-reveal
 * policy, the AI-Suggest behavior recorder, and the inspector-preload push.
 *
 * The pre-extraction `window` keydown listener moved into the controlled tree
 * (bound to its `ownerDocument`, detached-window safe).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useVaultSearchStore } from '../../store';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { ResultBrowserTree } from '@/ui/component/result-browser/tree/ResultBrowserTree';
import type { TreeFile, TreeFolder } from '@/ui/component/result-browser/model/buildTree';

interface ResultTreeViewProps {
	onClose?: () => void;
	onSelectForInspector?: (path: string) => void;
}

export const ResultTreeView: React.FC<ResultTreeViewProps> = ({ onClose, onSelectForInspector }) => {
	const results = useVaultSearchStore((s) => s.lastSearchResults);
	const density = useVaultSearchStore((s) => s.resultDensity);
	const collapsedFolders = useVaultSearchStore((s) => s.treeCollapsedFolders);
	const toggleTreeFolderCollapsed = useVaultSearchStore((s) => s.toggleTreeFolderCollapsed);
	const cursor = useVaultSearchStore((s) => s.treeCursor);
	const setCursor = useVaultSearchStore((s) => s.setTreeCursor);
	const inspectorOpen = useVaultSearchStore((s) => s.inspectorOpen);
	const setInspectorOpen = useVaultSearchStore((s) => s.setInspectorOpen);
	const { vaultNavigation } = useServiceContext();

	// Push inspector selection when the tree cursor moves — unconditional (unlike
	// list view's `inspectorOpen`-gated push) so opening the inspector via → shows
	// the snippet + metadata immediately instead of an empty "Select a note".
	useEffect(() => {
		if (!cursor) return;
		const t = setTimeout(() => onSelectForInspector?.(cursor), 150);
		return () => clearTimeout(t);
	}, [cursor, onSelectForInspector]);

	const onOpenFile = useCallback(
		async (file: TreeFile, opts: { newTab: boolean; keepOpen: boolean }) => {
			behaviorRecorder.push('openedFile', { path: file.path });
			try {
				await vaultNavigation.openSearchResult(file.result, { newLeaf: opts.newTab });
			} catch (err) {
				console.warn('[ResultTreeView] openSearchResult failed:', err);
			}
			if (!opts.keepOpen) onClose?.();
		},
		[vaultNavigation, onClose],
	);

	const onRevealFolder = useCallback(
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

	// 800ms hover → behavior recorder (matches the `hoveredFile` threshold).
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const onFileHoverStart = useCallback((path: string) => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = setTimeout(() => {
			behaviorRecorder.push('focusedFile', { path, durationMs: 800 });
		}, 800);
	}, []);
	const onFileHoverEnd = useCallback(() => {
		if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
	}, []);
	useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

	return (
		<ResultBrowserTree
			results={results}
			density={density}
			collapsedFolders={collapsedFolders}
			cursor={cursor}
			onCursorChange={setCursor}
			onToggleCollapse={toggleTreeFolderCollapsed}
			onOpenFile={onOpenFile}
			onRevealFolder={onRevealFolder}
			inspectorOpen={inspectorOpen}
			onInspectorOpenChange={setInspectorOpen}
			onFileHoverStart={onFileHoverStart}
			onFileHoverEnd={onFileHoverEnd}
		/>
	);
};
