import * as React from 'react';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ComposerRelatedMaterialSnapshot } from '@/service/composer';
import {
	ResultBrowserDensityToggle,
	ResultBrowserFooterHints,
	ResultBrowserGraph,
	ResultBrowserListRow,
	ResultBrowserSearchInput,
	ResultBrowserTree,
} from '@/ui/component/result-browser';
import {
	GraphWorkspaceControl,
	resolveGraphWorkspaceManifest,
	type GraphWorkspaceScope,
} from '@/ui/component/graph-workspace';
import { ContextualAIGraphView } from '@/ui/component/ai-graph';
import type { LensType } from '@/core/types/lens-graph';
import { Button, Modal } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { usePortalContainer } from '@/ui/react/PortalContainerContext';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { InspectorSidePanel } from '@/ui/view/quick-search/components/inspector/InspectorSidePanel';
import { useSidecar } from './SidecarContext';
import {
	applyComposerProjectionChange,
	initialComposerBrowserState,
	localFilterItems,
	mapRelatedSnapshotToBrowserSnapshot,
	resolveComposerOpenDisposition,
	type ComposerBrowserState,
} from './ComposerResultBrowserAdapter';
import { usePeakKeyboardSurface } from '@/ui/keyboard/usePeakKeyboardSurface';
import type { PeakKeyboardSurfaceAdapter } from '@/ui/keyboard/KeyboardNavigationPort';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

/**
 * Peak Composer — related-material wide modal (WP9, handoff §12.4 / CMP-REL-02 +
 * CMP-RB-03 Composer half). `打开完整视图` opens THIS Composer-owned modal, which
 * hosts the shared Result Browser over the SAME frozen snapshot. It never
 * re-queries: the top query field only filters locally. The Search-style
 * inspector stays closed until → is pressed, then opens at the canonical 340px.
 */
export function RelatedMaterialsModal({
	snapshot,
	onClose,
}: {
	snapshot: ComposerRelatedMaterialSnapshot;
	onClose: () => void;
}): React.ReactElement {
	const { runtime, config, onOpenSource } = useSidecar();
	const portalContainer = usePortalContainer();
	const s = config.strings;
	const graphKeyTips = PEAK_CONTROL_KEY_TIP_KEYS.composer.relatedGraph;
	const [state, setState] = React.useState<ComposerBrowserState>(() => ({
		...initialComposerBrowserState(),
		selectedId: snapshot.items[0]?.id ?? null,
	}));
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);
	const [inspectorPath, setInspectorPath] = React.useState<string | null>(
		snapshot.items[0]?.path ?? null,
	);
	const [graphScope, setGraphScope] = React.useState<GraphWorkspaceScope>('one-hop');
	const [aiLens, setAILens] = React.useState<LensType>('topology');
	const openerRef = React.useRef<HTMLElement | null>(
		(portalContainer?.ownerDocument.activeElement as HTMLElement | null) ?? null,
	);
	const keyboardAdapter = React.useMemo<PeakKeyboardSurfaceAdapter>(
		() => {
			const anchors: Readonly<Record<string, () => HTMLElement | null>> = {
				document: () => rootRef.current?.querySelector<HTMLElement>(
					'.cm-content[tabindex], input:not([disabled]), [role="textbox"]',
				) ?? null,
			};
			return {
				getKeyTipAnchor: (actionId) => anchors[actionId]?.() ?? null,
			};
		},
		[],
	);
	usePeakKeyboardSurface('composer', rootRef, keyboardAdapter);

	// Radix owns Escape + focus trapping. Preserve the exact Composer opener
	// because this modal is conditionally mounted by BriefView.
	React.useEffect(() => {
		return () => {
			openerRef.current?.focus?.();
		};
	}, []);

	const items = React.useMemo(
		() => localFilterItems(snapshot.items, state.filterText),
		[snapshot.items, state.filterText],
	);
	const browserSnapshot = React.useMemo(
		() => mapRelatedSnapshotToBrowserSnapshot(snapshot),
		[snapshot],
	);
	const physicalSubgraph = graphScope === 'two-hop'
		? snapshot.graphByScope?.twoHop ?? browserSnapshot.subgraph
		: snapshot.graphByScope?.oneHop ?? browserSnapshot.subgraph;
	const contextPaths = React.useMemo(
		() => [...new Set([snapshot.focus.rootNodeId, ...snapshot.items.map((item) => item.path)].filter(Boolean))],
		[snapshot],
	);
	const selectedItem = items.find((item) => item.id === state.selectedId)
		?? items[0]
		?? null;

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

	const selectItem = (item: SearchResultItem): void => {
		dispatch({ kind: 'select', id: item.id });
		if (state.inspectorOpen) setInspectorPath(item.path);
	};

	const selectIndex = (index: number): void => {
		const item = items[index];
		if (!item) return;
		selectItem(item);
		itemRefs.current[index]?.scrollIntoView({ block: 'nearest' });
	};

	const handleNavigationKey = (event: KeyboardEvent): void => {
		const target = event.target as Element | null;
		const fromQueryField = Boolean(target?.closest?.('.pk-related-search-row'));
		const fromResultRow = Boolean(target?.closest?.("[data-result-browser-variant='related-material']"));
		if (event.defaultPrevented && !fromQueryField) return;
		if (event.key === 'Enter' && !fromResultRow && target?.closest?.('button')) return;
		if (event.key === 'Escape' && state.view !== 'list') {
			event.preventDefault();
			event.stopPropagation();
			dispatch({ kind: 'view', view: 'list' });
			return;
		}
		if (state.view === 'graph' && event.key === 'ArrowRight' && selectedItem) {
			event.preventDefault();
			setInspectorPath(selectedItem.path);
			dispatch({ kind: 'inspector', open: true });
			return;
		}
		if (state.view === 'graph' && event.key === 'ArrowLeft' && state.inspectorOpen) {
			event.preventDefault();
			dispatch({ kind: 'inspector', open: false });
			return;
		}
		if (state.view !== 'list' && !fromQueryField) return;
		const currentIndex = Math.max(0, items.findIndex((item) => item.id === selectedItem?.id));
		if (event.key === 'ArrowRight' && selectedItem) {
			event.preventDefault();
			setInspectorPath(selectedItem.path);
			dispatch({ kind: 'inspector', open: true });
			return;
		}
		if (event.key === 'ArrowLeft' && state.inspectorOpen) {
			event.preventDefault();
			dispatch({ kind: 'inspector', open: false });
			return;
		}
		if (event.key === 'ArrowDown' && items.length > 0) {
			event.preventDefault();
			selectIndex((currentIndex + 1) % items.length);
			return;
		}
		if (event.key === 'ArrowUp' && items.length > 0) {
			event.preventDefault();
			selectIndex((currentIndex - 1 + items.length) % items.length);
			return;
		}
		if (event.key === 'Enter' && selectedItem) {
			event.preventDefault();
			openItem(selectedItem, { newTab: event.metaKey || event.ctrlKey });
		}
	};

	useOwnerDocumentListener(rootRef, 'keydown', handleNavigationKey);

	return (
		<Modal open onOpenChange={(open) => { if (!open) onClose(); }}>
			<Modal.Content
				ref={rootRef}
				className="pk-related-modal peak-result-browser-modal-frame"
				container={portalContainer}
				overlayClassName="pk-related-modal-overlay"
				data-testid="pk-related-modal"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					openerRef.current?.focus?.();
				}}
			>
				<Modal.Header className="pk-related-modal-head">
					<span className="pk-related-modal-copy">
						<Modal.Title asChild>
							<strong className="pk-related-modal-title">{s.sectionRelated}</strong>
						</Modal.Title>
						<Modal.Subtitle asChild>
							<span className="pk-related-modal-subtitle">{s.relatedModalSubtitle}</span>
						</Modal.Subtitle>
					</span>
					<Modal.Close
						className="pk-icon-btn"
						label={s.close}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.modal.close}
						data-peak-keytip-label={s.close}
					/>
				</Modal.Header>

				<div className="pk-related-search-row">
					<ResultBrowserSearchInput
						className="pk-related-filter"
						placeholder={s.relatedFilterPlaceholder}
						ariaLabel={s.relatedFilterPlaceholder}
						value={state.filterText}
						onChange={(filterText) => setState((p) => ({ ...p, filterText }))}
					/>
				</div>

				<div className="pk-related-toolbar">
					<GraphWorkspaceControl
						manifest={resolveGraphWorkspaceManifest('composer')}
						view={state.view}
						onViewChange={(view) => dispatch({ kind: 'view', view })}
						scope={graphScope}
						onScopeChange={setGraphScope}
						physicalProjection={state.graphPreset}
						onPhysicalProjectionChange={(preset) => dispatch({ kind: 'graphPreset', preset })}
						aiLens={aiLens}
						onAILensChange={setAILens}
						keyTipKeys={{
							view: graphKeyTips.view,
							scope: {
								'one-hop': graphKeyTips.graphScope.oneHop,
								'two-hop': graphKeyTips.graphScope.twoHop,
								ai: graphKeyTips.graphScope.ai,
							},
							physicalProjection: {
								constellation: graphKeyTips.graphLayout.constellation,
								community: graphKeyTips.graphLayout.community,
								'flow-tb': graphKeyTips.graphLayout.flowTb,
								'flow-lr': graphKeyTips.graphLayout.flowLr,
								folder: graphKeyTips.graphLayout.folder,
								orbit: graphKeyTips.graphLayout.orbit,
							},
						}}
						className="pktw-w-full"
						nonGraphTrailingSlot={(
						<div className="pk-related-toolbar-end">
							<ResultBrowserDensityToggle
								density={state.density}
								onDensityChange={(density) => dispatch({ kind: 'density', density })}
							/>
						</div>
						)}
					/>
				</div>

				<div className={cn('pk-related-content', state.inspectorOpen && 'pk-related-content--inspector')}>
					<div className="pk-related-projection">
						{items.length === 0 && (
							<div className="pk-related-empty">{s.sectionRelatedEmpty}</div>
						)}
						{state.view === 'list' && (
							<div className="pk-related-list">
								{items.map((item, index) => (
									<ResultBrowserListRow
										key={item.id}
										result={item}
										index={index}
										isSelected={selectedItem?.id === item.id}
										density={state.density}
										highlightQuery={state.filterText}
										snippetText={snapshot.reasonBySourceId[item.id] || undefined}
										itemRef={(element) => { itemRefs.current[index] = element; }}
										onSelect={(nextIndex) => selectIndex(nextIndex)}
										onOpen={(res, opts) => openItem(res, opts)}
										openOnSelect={false}
										variant="related-material"
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
								onCursorChange={(id) => {
									dispatch({ kind: 'cursor', id });
									const item = items.find((candidate) => candidate.path === id);
									if (item) selectItem(item);
								}}
								onToggleCollapse={(folderPath) => dispatch({ kind: 'toggleCollapse', folderPath })}
								onOpenFile={(file, opts) => openItem(file.result, { newTab: opts.newTab })}
								onRevealFolder={() => undefined}
								inspectorOpen={state.inspectorOpen}
								onInspectorOpenChange={(open) => {
									if (open && selectedItem) setInspectorPath(selectedItem.path);
									dispatch({ kind: 'inspector', open });
								}}
							/>
						)}
						{state.view === 'graph' && (
							graphScope === 'ai' ? (
								<ContextualAIGraphView
									contextRefs={[snapshot.focus.rootNodeId, snapshot.focus.anchorId]}
									selectedVaultPaths={contextPaths}
									createOrigin={{
										surface: 'composer',
										contextRef: {
											kind: 'vault-file',
											ref: snapshot.focus.rootNodeId,
											label: snapshot.focus.rootNodeId.split('/').pop()?.replace(/\.md$/i, '') ?? snapshot.focus.rootNodeId,
											locator: snapshot.focus.rootNodeId,
										},
									}}
									lens={aiLens}
									onLensChange={setAILens}
									showWorkspaceControl={false}
								/>
							) : (
								<ResultBrowserGraph
									subgraph={physicalSubgraph}
									preset={state.graphPreset}
									semantic={state.graphShowSemantic}
									onSemanticChange={(on) => dispatch({ kind: 'graphSemantic', on })}
									semanticKeyTipKey={graphKeyTips.semantic}
									keyTipKeys={graphKeyTips.graphCanvas}
									nodeCap={config.graphNodeCap}
									onNodeTap={(node) => {
										const item = items.find((candidate) =>
											candidate.id === node.id || candidate.path === node.path
										);
										if (item) selectItem(item);
									}}
								/>
							)
						)}
					</div>
					{state.inspectorOpen && (
						<aside className="pk-related-inspector" aria-label={s.materialPreview}>
							<InspectorSidePanel
								currentPath={selectedItem ? (inspectorPath ?? selectedItem.path) : null}
								searchQuery={state.filterText}
								showSearchSnippet={false}
								onClose={() => dispatch({ kind: 'inspector', open: false })}
								onOpenDocument={(path) => onOpenSource?.(path)}
								onInspectInPanel={setInspectorPath}
							/>
						</aside>
					)}
				</div>

				<div className="pk-related-footer">
					<ResultBrowserFooterHints showNewTab={false} />
					{selectedItem && (
						<Button
							onClick={() => {
								runtime.session.openSession(
									`${s.bringIntoSession} · ${selectedItem.title}`,
									[selectedItem.id],
								);
								onClose();
							}}
						>
							{s.bringIntoSession}
						</Button>
					)}
				</div>
			</Modal.Content>
		</Modal>
	);
}
