/**
 * File Atlas — main panel.
 *
 * Standalone document map. Layout (mock docs/gstack/file-atlas-mock-2026-07-08/
 * index-v4.html): a left rail of open documents + a content column
 * (doc-context / Tree·Graph tabs / search band / atlas bar / tree+inspector /
 * tray). Two subviews only — Atlas Tree and the read-only Graph. Copilot /
 * Ambient moved out to the Composer View, so there is no mode-nav here.
 *
 * The panel is presentational: `FileAtlasHost` owns which document is active and
 * feeds `content`; an app-owned, session-only port restores each document's
 * interaction state. Everything touching the Obsidian runtime goes through the
 * injected host port.
 */

import React, {
	type CSSProperties,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react';
import { Search, Network, ListTree } from 'lucide-react';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import { RawBlockKind } from '@/core/document/atlas/types';
import type { AtlasDocument, DocumentBlock } from '@/core/document/atlas/types';
import {
	DEFAULT_PRESET_ID,
	type FileAtlasConfig,
} from './config/fileAtlasConfig';
import {
	collectGroupIds,
	computeVisibility,
	blockIdAtLine,
	defaultCollapsedIds,
	documentLocationForAtlasBlock,
	firstSelectableId,
	FRONTMATTER_GROUP_ID,
	groupFrontmatter,
	restoreSelectionId,
	selectionSnapshotForBlock,
} from './atlasTreeModel';
import { AtlasBar } from './components/AtlasBar';
import { AtlasTree } from './components/AtlasTree';
import { AtlasInspector } from './components/AtlasInspector';
import { AtlasTray, type TrayItem } from './components/AtlasTray';
import { FileRail } from './components/FileRail';
import { FileAtlasGraph } from './components/FileAtlasGraph';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasHostPort } from './FileAtlasHostPort';
import type { FileRailSections, FileRailSortMode } from './fileRailModel';
import type { FileRailPreference } from './fileRailPreference';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import type { ComposerCapabilityId } from '@/core/composer';
import {
	displayIdentity,
	firstProjectedId,
	isProjectionRow,
} from './atlasDisplayModel';
import { usePeakKeyboardSurface } from '@/ui/keyboard/usePeakKeyboardSurface';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_ZONE_LABELS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import {
	defaultFileAtlasGraphSessionState,
	type FileAtlasDocumentSessionState,
	type FileAtlasGraphSessionState,
	type FileAtlasSessionPort,
	type FileAtlasSubview,
} from './FileAtlasSessionPort';

export interface FileAtlasPanelProps {
	config: FileAtlasConfig;
	session: FileAtlasSessionPort;
	railSections: FileRailSections;
	railPreference: FileRailPreference;
	activePath: string;
	displayPath: string;
	content: string;
	host: FileAtlasHostPort;
	onOpenBlock: (path: string, location: DocumentSourceLocation) => void;
	onRunQuickAction?: (
		path: string,
		location: DocumentSourceLocation,
		capabilityId: ComposerCapabilityId,
	) => void;
	presetHasOverride: (presetId: string) => boolean;
	onSavePreset: (presetId: string, kinds: RawBlockKind[]) => void;
	onResetPreset: (presetId: string) => RawBlockKind[];
	onSelectDoc: (path: string) => void;
	onCloseDoc: (path: string) => void;
	onSortModeChange: (mode: FileRailSortMode) => void;
	onRailWidthChange: (widthPx: number) => void;
	onRailWidthCommit: (widthPx: number) => void;
}

interface AtlasState {
	activePreset: string;
	presetModified: boolean;
	visibleKinds: Set<RawBlockKind>;
	collapsed: Set<string>;
	selectedId: string | null;
	tray: TrayItem[];
}

type AtlasAction =
	| { type: 'applyPreset'; id: string; kinds: RawBlockKind[] }
	| { type: 'markPresetSaved' }
	| { type: 'toggleKind'; kind: RawBlockKind }
	| { type: 'groupSet'; kinds: RawBlockKind[]; on: boolean }
	| { type: 'toggleFold'; id: string }
	| { type: 'setCollapsed'; ids: string[] }
	| { type: 'expandAll' }
	| { type: 'select'; id: string | null }
	| { type: 'addToTray'; item: TrayItem }
	| { type: 'removeFromTray'; id: string };

function reducer(state: AtlasState, action: AtlasAction): AtlasState {
	switch (action.type) {
		case 'applyPreset':
			return {
				...state,
				activePreset: action.id,
				presetModified: false,
				visibleKinds: new Set(action.kinds),
				// A preset is a request to inspect matching nodes. Do not leave
				// those matches hidden behind stale structural folds.
				collapsed: action.id === 'overview'
					? new Set([FRONTMATTER_GROUP_ID])
					: new Set(),
			};
		case 'markPresetSaved':
			return { ...state, presetModified: false };
		case 'toggleKind': {
			const next = new Set(state.visibleKinds);
			if (next.has(action.kind)) next.delete(action.kind);
			else next.add(action.kind);
			return { ...state, visibleKinds: next, presetModified: true, collapsed: new Set() };
		}
		case 'groupSet': {
			const next = new Set(state.visibleKinds);
			action.kinds.forEach((k) => (action.on ? next.add(k) : next.delete(k)));
			return { ...state, visibleKinds: next, presetModified: true, collapsed: new Set() };
		}
		case 'toggleFold': {
			const next = new Set(state.collapsed);
			if (next.has(action.id)) next.delete(action.id);
			else next.add(action.id);
			return { ...state, collapsed: next };
		}
		case 'setCollapsed':
			return { ...state, collapsed: new Set(action.ids) };
		case 'expandAll':
			return { ...state, collapsed: new Set() };
		case 'select':
			return { ...state, selectedId: action.id };
		case 'addToTray':
			if (state.tray.some((t) => t.id === action.item.id)) return state;
			return { ...state, tray: [...state.tray, action.item] };
		case 'removeFromTray':
			return { ...state, tray: state.tray.filter((t) => t.id !== action.id) };
		default:
			return state;
	}
}

export const FileAtlasPanel: React.FC<FileAtlasPanelProps> = ({
	config,
	session,
	railSections,
	railPreference,
	activePath,
	displayPath,
	content,
	host,
	onOpenBlock,
	onRunQuickAction,
	presetHasOverride,
	onSavePreset,
	onResetPreset,
	onSelectDoc,
	onCloseDoc,
	onSortModeChange,
	onRailWidthChange,
	onRailWidthCommit,
}) => {
	const [initialSession] = useState(() => session.readDocument(activePath));
	const [searchTerm, setSearchTerm] = useState(initialSession?.searchTerm ?? '');
	const [subview, setSubview] = useState<FileAtlasSubview>(initialSession?.subview ?? 'tree');
	const [flattened, setFlattened] = useState(initialSession?.flattened ?? false);
	const [graphState, setGraphState] = useState<FileAtlasGraphSessionState>(
		() => initialSession?.graph ?? defaultFileAtlasGraphSessionState(),
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchRestoreFocusRef = useRef<HTMLElement | null>(null);
	const viewTabsRef = useRef<HTMLDivElement>(null);
	const treeScrollRef = useRef<HTMLDivElement>(null);
	const inspectorScrollRef = useRef<HTMLDivElement>(null);
	const treeScrollTopRef = useRef(initialSession?.treeScrollTop ?? 0);
	const inspectorScrollTopRef = useRef(initialSession?.inspectorScrollTop ?? 0);
	usePeakKeyboardSurface('file-atlas', rootRef);
	useRovingComposite(viewTabsRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => {
			if (item.dataset.peakFocusId === 'file-atlas-tree-view') setSubview('tree');
			if (item.dataset.peakFocusId === 'file-atlas-graph-view') setSubview('graph');
		},
	});
	useEffect(() => {
		const root = rootRef.current;
		const ownerWindow = root?.ownerDocument.defaultView;
		if (!root || !ownerWindow) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			const active = root.ownerDocument.activeElement;
			const target = event.target;
			if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLocaleLowerCase() === 'f') {
				event.preventDefault();
				event.stopPropagation();
				searchRestoreFocusRef.current = active instanceof ownerWindow.HTMLElement ? active : null;
				setSubview('tree');
				ownerWindow.requestAnimationFrame(() => {
					ownerWindow.requestAnimationFrame(() => {
						searchInputRef.current?.focus();
						searchInputRef.current?.select();
					});
				});
				return;
			}
			const ownsEvent = root.contains(active)
				|| (target instanceof ownerWindow.Node && root.contains(target));
			if (!ownsEvent) return;
			if (event.key !== 'Escape' || root.ownerDocument.activeElement !== searchInputRef.current) return;
			if (searchTerm) {
				event.preventDefault();
				event.stopPropagation();
				setSearchTerm('');
				return;
			}
			const restore = searchRestoreFocusRef.current;
			searchRestoreFocusRef.current = null;
			if (!restore?.isConnected) return;
			event.preventDefault();
			event.stopPropagation();
			restore.focus({ preventScroll: true });
		};
		ownerWindow.addEventListener('keydown', onKeyDown, true);
		return () => ownerWindow.removeEventListener('keydown', onKeyDown, true);
	}, [searchTerm]);

	const doc: AtlasDocument = useMemo(
		() => parseDocumentBlocks(content, activePath),
		[content, activePath]
	);

	const blocks = useMemo(
		() => groupFrontmatter(doc.blocks, config.strings.frontmatterTitle),
		[doc.blocks, config.strings.frontmatterTitle]
	);

	const defaultKinds = useMemo(
		() => config.presets.find((p) => p.id === DEFAULT_PRESET_ID)?.kinds ?? [],
		[config]
	);

	const [state, dispatch] = useReducer(reducer, undefined, () => {
		const cursorLine = host.getCursorLine?.(activePath);
		const defaultSelectionId = cursorLine == null
			? firstSelectableId(blocks)
			: blockIdAtLine(blocks, cursorLine);
		const groupIds = new Set(collectGroupIds(blocks));
		return {
			activePreset: initialSession?.activePreset ?? DEFAULT_PRESET_ID,
			presetModified: initialSession?.presetModified ?? false,
			visibleKinds: new Set<RawBlockKind>(initialSession?.visibleKinds ?? defaultKinds),
			collapsed: new Set<string>(initialSession
				? initialSession.collapsedIds.filter((id) => groupIds.has(id))
				: defaultCollapsedIds(blocks, defaultSelectionId)),
			selectedId: restoreSelectionId(blocks, initialSession?.selection ?? null)
				?? defaultSelectionId,
			tray: session.readTray(),
		};
	});

	const showFrontmatterSummary =
		state.activePreset === 'overview'
		|| state.visibleKinds.has(RawBlockKind.Property)
		|| state.visibleKinds.has(RawBlockKind.Tag);

	const { visible, hits } = useMemo(
		() => computeVisibility(
			blocks,
			state.visibleKinds,
			searchTerm,
			config,
				{ showFrontmatterSummary },
			),
			[blocks, state.visibleKinds, searchTerm, config, showFrontmatterSummary]
	);

	const blockById = useMemo(() => {
		const map = new Map<string, DocumentBlock>();
		const walk = (list: DocumentBlock[]): void => {
			for (const b of list) {
				map.set(b.id, b);
				if (b.children) walk(b.children);
			}
		};
		walk(blocks);
		return map;
	}, [blocks]);

	const selectedBlock = state.selectedId ? blockById.get(state.selectedId) ?? null : null;
	const liveSessionRef = useRef<FileAtlasDocumentSessionState | null>(null);
	liveSessionRef.current = {
		subview,
		searchTerm,
		flattened,
		activePreset: state.activePreset,
		presetModified: state.presetModified,
		visibleKinds: [...state.visibleKinds],
		collapsedIds: [...state.collapsed],
		selection: selectedBlock ? selectionSnapshotForBlock(selectedBlock) : null,
		treeScrollTop: treeScrollTopRef.current,
		inspectorScrollTop: inspectorScrollTopRef.current,
		graph: graphState,
	};
	useEffect(() => () => {
		const snapshot = liveSessionRef.current;
		if (snapshot) session.writeDocument(activePath, {
			...snapshot,
			treeScrollTop: treeScrollTopRef.current,
			inspectorScrollTop: inspectorScrollTopRef.current,
		});
	}, [activePath, session]);
	useEffect(() => {
		session.writeTray(state.tray);
	}, [session, state.tray]);
	useLayoutEffect(() => {
		if (subview !== 'tree') return;
		if (treeScrollRef.current) treeScrollRef.current.scrollTop = treeScrollTopRef.current;
		if (inspectorScrollRef.current) inspectorScrollRef.current.scrollTop = inspectorScrollTopRef.current;
	}, [subview]);
	const trayIds = useMemo(() => new Set(state.tray.map((t) => t.id)), [state.tray]);
	const projectedSelectedBlock = selectedBlock
		&& visible.has(selectedBlock.id)
		&& isProjectionRow(selectedBlock, state.visibleKinds, showFrontmatterSummary)
		? selectedBlock
		: null;
	const firstVisibleId = useMemo(
		() => firstProjectedId(
			blocks,
			visible,
			state.visibleKinds,
			showFrontmatterSummary,
		),
		[blocks, showFrontmatterSummary, state.visibleKinds, visible],
	);

	useEffect(() => {
		if (projectedSelectedBlock) return;
		if (state.selectedId === firstVisibleId) return;
		dispatch({ type: 'select', id: firstVisibleId });
	}, [
		firstVisibleId,
		projectedSelectedBlock,
		state.selectedId,
	]);

	// Expand every group when a search term is entered so hits stay reachable.
	useEffect(() => {
		if (searchTerm) dispatch({ type: 'expandAll' });
	}, [searchTerm]);

	const addToTray = (block: DocumentBlock): void => {
		dispatch({
			type: 'addToTray',
			item: {
				id: block.id,
				title: displayIdentity(block, config).primary,
				kind: block.kind,
				path: block.anchor.filePath,
			},
		});
	};

	const reveal = (block: DocumentBlock): void => {
		onOpenBlock(activePath, documentLocationForAtlasBlock(block));
	};

	const copyLink = (block: DocumentBlock): void => {
		const frag = block.detail?.linkFragment ?? '';
		const base = displayPath.replace(/\.md$/i, '');
		void host.copyToClipboard(`[[${base}${frag}]]`);
		host.notify('Link copied');
	};

	const priorSelectionRef = useRef(state.selectedId);
	useEffect(() => {
		if (priorSelectionRef.current === state.selectedId) return;
		priorSelectionRef.current = state.selectedId;
		inspectorScrollTopRef.current = 0;
		if (inspectorScrollRef.current) inspectorScrollRef.current.scrollTop = 0;
	}, [state.selectedId]);
	const updateGraphState = useCallback((next: FileAtlasGraphSessionState): void => {
		setGraphState(next);
	}, []);

	const groupKinds = (groupId: string): RawBlockKind[] =>
		Object.entries(config.kinds)
			.filter(([, cfg]) => cfg.group === groupId && cfg.filterable !== false)
			.map(([kind]) => kind as RawBlockKind);

	const s = config.strings;
	const rootStyle = {
		'--pkfa-rail-width': `${railPreference.widthPx}px`,
	} as CSSProperties;

	return (
		<div
			ref={rootRef}
			className="peak-file-atlas-modal pkfa-root pkfa-standalone peak-design-root"
			data-subview={subview}
			style={rootStyle}
		>
			<FileRail
				title={s.railTitle}
				openTitle={s.railOpenTitle}
				recentTitle={s.railRecentTitle}
				sortLabel={s.railSortLabel}
					sortLabels={{
						frequent: s.railSortFrequent,
						name: s.railSortName,
					}}
				resizeLabel={s.railResizeLabel}
				sections={railSections}
				sortMode={railPreference.sortMode}
				widthPx={railPreference.widthPx}
				widthLimits={config.rail}
				activePath={activePath}
				onSelect={onSelectDoc}
				onClose={onCloseDoc}
				onSortModeChange={onSortModeChange}
				onWidthChange={onRailWidthChange}
				onWidthCommit={onRailWidthCommit}
			/>

			<div className="pkfa-content">
				{/* doc context */}
				<div className="pkfa-doc-context">
					<span className="pkfa-doc-path" title={displayPath}>
						{displayPath}
					</span>
					<span className="pkfa-reliability" title={s.reliabilityBasicHint}>
						<span className="pkfa-dot" />
						{s.reliabilityBasic}
					</span>
					<span className="pkfa-doc-stats">
						<span>{doc.stats.words.toLocaleString()} words</span>
						<span>{doc.stats.blocks} blocks</span>
						<span>{doc.stats.resources} resources</span>
					</span>
				</div>

				{/* Tree / Graph subview tabs */}
				<div
					className="pkfa-tab-row"
					data-peak-keyboard-zone="fa-view-filters"
					data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['fa-view-filters']}
					data-peak-keyboard-order="2"
				>
					<div ref={viewTabsRef} className="pkfa-atlas-tabs" role="tablist" aria-label="Atlas view">
						<Button
							variant="unstyled"
							type="button"
							role="tab"
							aria-selected={subview === 'tree'}
							tabIndex={subview === 'tree' ? 0 : -1}
							data-peak-focus-id="file-atlas-tree-view"
							className={`pkfa-atlas-tab${subview === 'tree' ? ' is-active' : ''}`}
							onClick={() => setSubview('tree')}
						>
							<ListTree />
							{s.viewTree}
						</Button>
						<Button
							variant="unstyled"
							type="button"
							role="tab"
							aria-selected={subview === 'graph'}
							tabIndex={subview === 'graph' ? 0 : -1}
							data-peak-focus-id="file-atlas-graph-view"
							className={`pkfa-atlas-tab${subview === 'graph' ? ' is-active' : ''}`}
							onClick={() => setSubview('graph')}
						>
							<Network />
							{s.viewGraph}
						</Button>
					</div>
					<span className="pkfa-tab-hint">{subview === 'graph' ? s.graphReadonlyHint : s.treeHint}</span>
				</div>

				{subview === 'graph' ? (
					<FileAtlasGraph
						path={activePath}
						host={host}
						config={config}
						onAddToTray={addToTray}
						initialState={graphState}
						onStateChange={updateGraphState}
					/>
				) : (
					<>
						{/* search band */}
						<section className="pkfa-search-band">
							<label className="pkfa-search-box">
								<Search />
								<input
									ref={searchInputRef}
									type="text"
									placeholder={s.searchPlaceholder}
									autoComplete="off"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
								/>
								<span className="pkfa-search-hits">{searchTerm ? `${hits} hits` : ''}</span>
								<span className="pkfa-scope-pill">{s.searchScope}</span>
							</label>
						</section>

						{/* atlas bar */}
						<AtlasBar
							config={config}
							activePreset={state.activePreset}
							presetModified={state.presetModified}
							presetHasOverride={presetHasOverride(state.activePreset)}
							presetCustomizable={state.activePreset !== 'all'}
							visibleKinds={state.visibleKinds}
							onApplyPreset={(id) => {
								const preset = config.presets.find((p) => p.id === id);
								if (preset) dispatch({ type: 'applyPreset', id, kinds: preset.kinds });
							}}
							onToggleKind={(kind) => dispatch({ type: 'toggleKind', kind })}
							onGroupSet={(groupId, on) => dispatch({ type: 'groupSet', kinds: groupKinds(groupId), on })}
							onSavePreset={() => {
								onSavePreset(state.activePreset, [...state.visibleKinds]);
								dispatch({ type: 'markPresetSaved' });
							}}
							onResetPreset={() => {
								const kinds = onResetPreset(state.activePreset);
								dispatch({ type: 'applyPreset', id: state.activePreset, kinds });
							}}
							onExpandAll={() => dispatch({ type: 'expandAll' })}
							onCollapseAll={() => dispatch({ type: 'setCollapsed', ids: collectGroupIds(blocks) })}
							flattened={flattened}
							onFlattenChange={setFlattened}
						/>

						{/* main split */}
						<section className="pkfa-main">
							<div
								className="pkfa-tree-pane"
								data-peak-keyboard-zone="fa-atlas"
								data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['fa-atlas-tree']}
								data-peak-keyboard-order="3"
							>
								<div
									ref={treeScrollRef}
									className="pkfa-tree-scroll"
									onScroll={(event) => {
										treeScrollTopRef.current = event.currentTarget.scrollTop;
									}}
								>
									{firstVisibleId ? (
										<AtlasTree
											blocks={blocks}
											config={config}
											visible={visible}
											visibleKinds={state.visibleKinds}
											showFrontmatterSummary={showFrontmatterSummary}
											collapsed={state.collapsed}
											selectedId={state.selectedId}
											trayIds={trayIds}
											onSelect={(b) => dispatch({ type: 'select', id: b.id })}
											onOpenInEditor={reveal}
											onToggleFold={(id) => dispatch({ type: 'toggleFold', id })}
											onAddToTray={addToTray}
											flattened={flattened}
										/>
									) : (
										<div className="pkfa-empty-state">{s.treeEmpty}</div>
									)}
								</div>
							</div>
							<aside
								className="pkfa-inspector"
								data-peak-keyboard-zone="fa-inspector"
								data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['fa-inspector']}
								data-peak-keyboard-order="4"
							>
								<div
									ref={inspectorScrollRef}
									className="pkfa-inspector-scroll"
									onScroll={(event) => {
										inspectorScrollTopRef.current = event.currentTarget.scrollTop;
									}}
								>
									<AtlasInspector
										block={projectedSelectedBlock}
										blocks={blocks}
										config={config}
										host={host}
										sourcePath={activePath}
										inTray={projectedSelectedBlock ? trayIds.has(projectedSelectedBlock.id) : false}
										onAddToTray={addToTray}
										onCopyLink={copyLink}
										onRunQuickAction={(block, capabilityId) => {
											const location = documentLocationForAtlasBlock(block);
											if (onRunQuickAction) {
												onRunQuickAction(activePath, location, capabilityId);
												return;
											}
											void host.runQuickAction?.(activePath, location, capabilityId);
										}}
									/>
								</div>
							</aside>
						</section>

						{/* tray */}
						<AtlasTray
							items={state.tray}
							config={config}
							onRemove={(id) => dispatch({ type: 'removeFromTray', id })}
							onReveal={(item) => {
								const block = blockById.get(item.id);
								if (block) {
									reveal(block);
									return;
								}
								if (item.path) void host.activateDoc(item.path);
							}}
						/>
					</>
				)}
			</div>
		</div>
	);
};
