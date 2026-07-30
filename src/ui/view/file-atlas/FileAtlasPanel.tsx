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
 * feeds `content`; the panel re-seeds its tree state whenever content changes.
 * Everything touching the Obsidian runtime goes through the injected host port.
 */

import React, { type CSSProperties, useEffect, useMemo, useReducer, useState } from 'react';
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
	firstSelectableId,
	FRONTMATTER_GROUP_ID,
	groupFrontmatter,
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
import {
	displayIdentity,
	firstProjectedId,
	isProjectionRow,
} from './atlasDisplayModel';

type Subview = 'tree' | 'graph';

export interface FileAtlasPanelProps {
	config: FileAtlasConfig;
	railSections: FileRailSections;
	railPreference: FileRailPreference;
	activePath: string;
	displayPath: string;
	content: string;
	host: FileAtlasHostPort;
	onOpenBlock: (path: string, line: number) => void;
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
	| { type: 'reseed'; preset: string; kinds: RawBlockKind[]; collapsed: string[]; selectedId: string | null }
	| { type: 'applyPreset'; id: string; kinds: RawBlockKind[] }
	| { type: 'toggleKind'; kind: RawBlockKind }
	| { type: 'groupSet'; kinds: RawBlockKind[]; on: boolean }
	| { type: 'toggleFold'; id: string }
	| { type: 'setCollapsed'; ids: string[] }
	| { type: 'expandAll' }
	| { type: 'select'; id: string }
	| { type: 'addToTray'; item: TrayItem }
	| { type: 'removeFromTray'; id: string };

function reducer(state: AtlasState, action: AtlasAction): AtlasState {
	switch (action.type) {
		case 'reseed':
			return {
				activePreset: action.preset,
				presetModified: false,
				visibleKinds: new Set(action.kinds),
				collapsed: new Set(action.collapsed),
				selectedId: action.selectedId,
				// Preserve the tray across document switches — it's a cross-document
				// context-prep surface, not per-document state.
				tray: state.tray,
			};
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
	railSections,
	railPreference,
	activePath,
	displayPath,
	content,
	host,
	onOpenBlock,
	onSelectDoc,
	onCloseDoc,
	onSortModeChange,
	onRailWidthChange,
	onRailWidthCommit,
}) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [subview, setSubview] = useState<Subview>('tree');

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

	const [state, dispatch] = useReducer(reducer, undefined, () => ({
		activePreset: DEFAULT_PRESET_ID,
		presetModified: false,
		visibleKinds: new Set<RawBlockKind>(defaultKinds),
		collapsed: new Set<string>(),
		selectedId: null,
		tray: [],
	}));

	// Re-seed whenever the active document (or config) changes: reset to the
	// default preset, frame the block at the editor's cursor (falling back to the
	// first heading), and default-fold so only that block's ancestor path is open.
	useEffect(() => {
		const cursorLine = host.getCursorLine?.(activePath);
		const cursorId = cursorLine != null ? blockIdAtLine(blocks, cursorLine) : null;
		const initialId = cursorId ?? firstSelectableId(blocks);
		dispatch({
			type: 'reseed',
			preset: DEFAULT_PRESET_ID,
			kinds: defaultKinds,
			collapsed: [...defaultCollapsedIds(blocks, initialId)],
			selectedId: initialId,
		});
		setSearchTerm('');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [blocks, defaultKinds]);

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
	const trayIds = useMemo(() => new Set(state.tray.map((t) => t.id)), [state.tray]);

	useEffect(() => {
		if (
			selectedBlock
			&& visible.has(selectedBlock.id)
			&& isProjectionRow(selectedBlock, state.visibleKinds, showFrontmatterSummary)
		) {
			return;
		}
		const nextId = firstProjectedId(
			blocks,
			visible,
			state.visibleKinds,
			showFrontmatterSummary,
		);
		if (nextId) dispatch({ type: 'select', id: nextId });
	}, [
		blocks,
		selectedBlock,
		showFrontmatterSummary,
		state.visibleKinds,
		visible,
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
			},
		});
	};

	const reveal = (block: DocumentBlock): void => {
		// Editor lines are 0-based; anchor lines are 1-based.
		onOpenBlock(activePath, Math.max(0, block.anchor.lineStart - 1));
	};

	const copyLink = (block: DocumentBlock): void => {
		const frag = block.detail?.linkFragment ?? '';
		const base = displayPath.replace(/\.md$/i, '');
		void host.copyToClipboard(`[[${base}${frag}]]`);
		host.notify('Link copied');
	};

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
				<div className="pkfa-tab-row">
					<div className="pkfa-atlas-tabs" role="tablist" aria-label="Atlas view">
						<Button
							variant="unstyled"
							type="button"
							role="tab"
							aria-selected={subview === 'tree'}
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
					<FileAtlasGraph path={activePath} host={host} config={config} onAddToTray={addToTray} />
				) : (
					<>
						{/* search band */}
						<section className="pkfa-search-band">
							<label className="pkfa-search-box">
								<Search />
								<input
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
							visibleKinds={state.visibleKinds}
							onApplyPreset={(id) => {
								const preset = config.presets.find((p) => p.id === id);
								if (preset) dispatch({ type: 'applyPreset', id, kinds: preset.kinds });
							}}
							onToggleKind={(kind) => dispatch({ type: 'toggleKind', kind })}
							onGroupSet={(groupId, on) => dispatch({ type: 'groupSet', kinds: groupKinds(groupId), on })}
							onExpandAll={() => dispatch({ type: 'expandAll' })}
							onCollapseAll={() => dispatch({ type: 'setCollapsed', ids: collectGroupIds(blocks) })}
						/>

						{/* main split */}
						<section className="pkfa-main">
							<div className="pkfa-tree-pane">
								<div className="pkfa-tree-scroll">
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
									/>
								</div>
							</div>
							<aside className="pkfa-inspector">
								<div className="pkfa-inspector-scroll">
									<AtlasInspector
										block={selectedBlock}
										config={config}
										host={host}
										sourcePath={activePath}
										inTray={selectedBlock ? trayIds.has(selectedBlock.id) : false}
										onReveal={reveal}
										onAddToTray={addToTray}
										onCopyLink={copyLink}
									/>
								</div>
							</aside>
						</section>

						{/* tray */}
						<AtlasTray items={state.tray} config={config} onRemove={(id) => dispatch({ type: 'removeFromTray', id })} />
					</>
				)}
			</div>
		</div>
	);
};
