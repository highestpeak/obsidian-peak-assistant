import * as React from 'react';
import { X } from 'lucide-react';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ComposerRelatedMaterialSnapshot } from '@/service/composer';
import {
	ResultBrowserViewToggle,
	ResultBrowserDensityToggle,
	ResultBrowserGraphControls,
	ResultBrowserListRow,
	ResultBrowserTree,
	ResultBrowserGraph,
} from '@/ui/component/result-browser';
import { cn } from '@/ui/react/lib/utils';
import { useSidecar } from './SidecarContext';
import {
	applyComposerProjectionChange,
	initialComposerBrowserState,
	localFilterItems,
	mapRelatedSnapshotToBrowserSnapshot,
	resolveComposerOpenDisposition,
	type ComposerBrowserState,
} from './ComposerResultBrowserAdapter';

/**
 * Peak Composer — related-material wide modal (WP9, handoff §12.4 / CMP-REL-02 +
 * CMP-RB-03 Composer half). `打开完整视图` opens THIS Composer-owned modal, which
 * hosts the shared controlled Result Browser over the SAME frozen snapshot. It
 * does not navigate to Quick Search and never re-queries — a filter box only
 * filters the frozen snapshot locally. Narrow viewport ⇒ near-fullscreen with the
 * inspector moved below the content; Escape closes and restores opener focus.
 */
export function RelatedMaterialsModal({
	snapshot,
	onClose,
}: {
	snapshot: ComposerRelatedMaterialSnapshot;
	onClose: () => void;
}): React.ReactElement {
	const { config, onOpenSource } = useSidecar();
	const s = config.strings;
	const [state, setState] = React.useState<ComposerBrowserState>(initialComposerBrowserState);
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const openerRef = React.useRef<Element | null>(null);

	// Capture opener focus, trap Escape, restore focus on close (§12.4 keyboard).
	React.useEffect(() => {
		const doc = rootRef.current?.ownerDocument ?? document;
		openerRef.current = doc.activeElement;
		rootRef.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
			}
		};
		doc.addEventListener('keydown', onKey, true);
		return () => {
			doc.removeEventListener('keydown', onKey, true);
			(openerRef.current as HTMLElement | null)?.focus?.();
		};
	}, [onClose]);

	const browserSnapshot = React.useMemo(() => mapRelatedSnapshotToBrowserSnapshot(snapshot), [snapshot]);
	const items = React.useMemo(
		() => localFilterItems(browserSnapshot.items, state.filterText),
		[browserSnapshot.items, state.filterText],
	);

	const dispatch = (change: Parameters<typeof applyComposerProjectionChange>[1]) => {
		setState((prev) => applyComposerProjectionChange(prev, change).state);
	};

	const openItem = (item: SearchResultItem, opts: { newTab: boolean }) => {
		// `keep-browser` (default) reveals/locates without leaving the document;
		// `tab` requests a Vault tab. Both route through the host source opener —
		// the modal never navigates to Quick Search or re-queries.
		resolveComposerOpenDisposition(opts);
		onOpenSource?.(item.path);
	};

	return (
		<div className="pk-related-modal-scrim" data-testid="pk-related-modal" onMouseDown={onClose}>
			<div
				ref={rootRef}
				className="pk-related-modal"
				role="dialog"
				aria-modal="true"
				aria-label={s.sectionRelated}
				tabIndex={-1}
				onMouseDown={(e) => e.stopPropagation()}
			>
				<div className="pk-related-modal-head">
					<span className="pk-related-modal-title">{s.sectionRelated}</span>
					<input
						className="pk-related-filter"
						placeholder={s.sectionRelated}
						value={state.filterText}
						onChange={(e) => setState((p) => ({ ...p, filterText: e.target.value }))}
					/>
					<button type="button" className="pk-icon-btn" aria-label={s.close} onClick={onClose}>
						<X size={15} />
					</button>
				</div>

				<div className="pk-related-toolbar">
					<ResultBrowserViewToggle view={state.view} onViewChange={(view) => dispatch({ kind: 'view', view })} />
					{state.view !== 'graph' && (
						<ResultBrowserDensityToggle
							density={state.density}
							onDensityChange={(density) => dispatch({ kind: 'density', density })}
						/>
					)}
					{state.view === 'graph' && (
						<ResultBrowserGraphControls
							preset={state.graphPreset}
							onPresetChange={(preset) => dispatch({ kind: 'graphPreset', preset })}
							semantic={state.graphShowSemantic}
							onSemanticChange={(on) => dispatch({ kind: 'graphSemantic', on })}
						/>
					)}
				</div>

				<div className={cn('pk-related-content', state.inspectorOpen && 'pk-related-content--inspector')}>
					<div className="pk-related-projection">
						{state.view === 'list' && (
							<div className="pk-related-list">
								{items.map((item, index) => (
									<ResultBrowserListRow
										key={item.id}
										result={item}
										index={index}
										isSelected={state.selectedId === item.id}
										density={state.density}
										highlightQuery={state.filterText}
										itemRef={() => undefined}
										onSelect={() => dispatch({ kind: 'select', id: item.id })}
										onOpen={(res, opts) => openItem(res, opts)}
									/>
								))}
							</div>
						)}
						{state.view === 'tree' && (
							<ResultBrowserTree
								results={items}
								density={state.density}
								collapsedFolders={state.collapsedFolders}
								cursor={state.cursorId}
								onCursorChange={(id) => dispatch({ kind: 'cursor', id })}
								onToggleCollapse={(folderPath) => dispatch({ kind: 'toggleCollapse', folderPath })}
								onOpenFile={() => undefined}
								onRevealFolder={() => undefined}
								inspectorOpen={state.inspectorOpen}
								onInspectorOpenChange={(open) => dispatch({ kind: 'inspector', open })}
							/>
						)}
						{state.view === 'graph' && (
							<ResultBrowserGraph
								subgraph={browserSnapshot.subgraph}
								preset={state.graphPreset}
								semantic={state.graphShowSemantic}
								nodeCap={config.graphNodeCap}
								onNodeTap={(node) => dispatch({ kind: 'select', id: node.id })}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
