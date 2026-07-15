/**
 * File Atlas — main panel (Phase 1).
 *
 * Layout per docs/gstack/file-atlas-mock-2026-07-08/index-v3.html:
 *   doc-context / mode-nav / search band / atlas bar / 60-40 tree+inspector / tray.
 * Only Atlas·Tree is live this slice; Copilot / Ambient mode tabs and the Graph
 * subview render but are disabled (later phases). The panel takes plain props
 * (no ServiceProvider) — the only runtime touch point is the injected host port.
 */

import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Search, Map as AtlasIcon, Network, ListTree } from 'lucide-react';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import type { AtlasDocument, DocumentBlock, RawBlockKind } from '@/core/document/atlas/types';
import {
	DEFAULT_FILE_ATLAS_CONFIG,
	loadFileAtlasConfig,
	type FileAtlasConfig,
} from './config/fileAtlasConfig';
import { collectHeadingIds, computeVisibility } from './atlasTreeModel';
import { AtlasBar } from './components/AtlasBar';
import { AtlasTree } from './components/AtlasTree';
import { AtlasInspector } from './components/AtlasInspector';
import { AtlasTray, type TrayItem } from './components/AtlasTray';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasHostPort } from './FileAtlasHostPort';

export type AtlasMode = 'atlas' | 'copilot' | 'ambient';

export interface FileAtlasPanelProps {
	filePath: string;
	displayPath: string;
	content: string;
	host: FileAtlasHostPort;
	/**
	 * Fill the parent's height instead of the panel's own fixed modal height.
	 * Set when mounted inside the CopilotPicker modal body.
	 */
	fill?: boolean;
	/**
	 * Which mode-nav tab is active. The panel acts as the shared shell for all
	 * three CopilotPicker tabs: the top (path + Atlas/Copilot/Ambient mode-nav)
	 * stays identical across tabs, only the body swaps. Defaults to 'atlas'.
	 */
	activeMode?: AtlasMode;
	/** Switch the active tab (drives the host picker). Buttons disable if absent. */
	onSwitchMode?: (mode: AtlasMode) => void;
	/**
	 * When provided (Copilot / Ambient modes), render this in place of the Atlas
	 * body (search + atlas-bar + tree/inspector + tray). Keeps the shared top.
	 */
	bodySlot?: React.ReactNode;
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
		case 'applyPreset':
			return {
				...state,
				activePreset: action.id,
				presetModified: false,
				visibleKinds: new Set(action.kinds),
			};
		case 'toggleKind': {
			const next = new Set(state.visibleKinds);
			if (next.has(action.kind)) next.delete(action.kind);
			else next.add(action.kind);
			return { ...state, visibleKinds: next, presetModified: true };
		}
		case 'groupSet': {
			const next = new Set(state.visibleKinds);
			action.kinds.forEach((k) => (action.on ? next.add(k) : next.delete(k)));
			return { ...state, visibleKinds: next, presetModified: true };
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
	filePath,
	displayPath,
	content,
	host,
	fill = false,
	activeMode = 'atlas',
	onSwitchMode,
	bodySlot,
}) => {
	const [config, setConfig] = useState<FileAtlasConfig>(DEFAULT_FILE_ATLAS_CONFIG);
	const [searchTerm, setSearchTerm] = useState('');

	useEffect(() => {
		let alive = true;
		loadFileAtlasConfig().then((c) => {
			if (alive) setConfig(c);
		});
		return () => {
			alive = false;
		};
	}, []);

	const doc: AtlasDocument = useMemo(
		() => parseDocumentBlocks(content, filePath),
		[content, filePath]
	);

	const overviewKinds = useMemo(
		() => config.presets.find((p) => p.id === 'overview')?.kinds ?? [],
		[config]
	);

	const [state, dispatch] = useReducer(reducer, undefined, () => ({
		activePreset: 'overview',
		presetModified: false,
		visibleKinds: new Set<RawBlockKind>(overviewKinds),
		collapsed: new Set<string>(),
		selectedId: null,
		tray: [],
	}));

	// Re-seed visible kinds when the config (and thus preset kinds) loads.
	useEffect(() => {
		dispatch({ type: 'applyPreset', id: 'overview', kinds: overviewKinds });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [overviewKinds]);

	const { visible, hits } = useMemo(
		() => computeVisibility(doc.blocks, state.visibleKinds, searchTerm),
		[doc.blocks, state.visibleKinds, searchTerm]
	);

	const blockById = useMemo(() => {
		const map = new Map<string, DocumentBlock>();
		const walk = (list: DocumentBlock[]): void => {
			for (const b of list) {
				map.set(b.id, b);
				if (b.children) walk(b.children);
			}
		};
		walk(doc.blocks);
		return map;
	}, [doc.blocks]);

	const selectedBlock = state.selectedId ? blockById.get(state.selectedId) ?? null : null;
	const trayIds = useMemo(() => new Set(state.tray.map((t) => t.id)), [state.tray]);

	// Expand all headings when a search term is entered so hits are reachable.
	useEffect(() => {
		if (searchTerm) dispatch({ type: 'expandAll' });
	}, [searchTerm]);

	const addToTray = (block: DocumentBlock): void => {
		dispatch({ type: 'addToTray', item: { id: block.id, title: block.title, kind: block.kind } });
	};

	const reveal = (block: DocumentBlock): void => {
		// Editor lines are 0-based; anchor lines are 1-based.
		void host.revealLine(Math.max(0, block.anchor.lineStart - 1));
	};

	const copyLink = (block: DocumentBlock): void => {
		const frag = block.detail?.linkFragment ?? '';
		const base = displayPath.replace(/\.md$/i, '');
		void host.copyToClipboard(`[[${base}${frag}]]`);
		host.notify('Link copied');
	};

	const groupKinds = (groupId: string): RawBlockKind[] =>
		Object.entries(config.kinds)
			.filter(([, cfg]) => cfg.group === groupId)
			.map(([kind]) => kind as RawBlockKind);

	const s = config.strings;

	return (
		<div className={`peak-file-atlas-modal pkfa-root peak-design-root${fill ? ' pkfa-fill' : ''}${bodySlot ? ' pkfa-slot-mode' : ''}`}>
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

			{/* mode nav — shared across Atlas/Copilot/Ambient; only the body swaps.
			    The Atlas item carries the Tree/Graph subview while it is active. */}
			<nav className="pkfa-mode-nav" aria-label="Document workspace modes">
				<div
					role="button"
					tabIndex={0}
					className={`pkfa-mode${activeMode === 'atlas' ? ' is-active' : ''}`}
					onClick={() => onSwitchMode?.('atlas')}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onSwitchMode?.('atlas');
						}
					}}
				>
					<AtlasIcon size={16} />
					<span>{s.modeAtlas}</span>
					{activeMode === 'atlas' && (
						<span className="pkfa-subview-switch" aria-label="Atlas view">
							<Button variant="unstyled" type="button" className="pkfa-view-tab is-active" onClick={(e) => e.stopPropagation()}>
								<ListTree />
								{s.viewTree}
							</Button>
							<Button
								variant="unstyled"
								type="button"
								className="pkfa-view-tab"
								disabled
								title={s.graphDisabledHint}
								onClick={(e) => e.stopPropagation()}
							>
								<Network />
								{s.viewGraph}
							</Button>
						</span>
					)}
				</div>
				<Button
					variant="unstyled"
					type="button"
					className={`pkfa-mode${activeMode === 'copilot' ? ' is-active' : ''}`}
					disabled={!onSwitchMode}
					title={onSwitchMode ? undefined : s.modeDisabledHint}
					onClick={() => onSwitchMode?.('copilot')}
				>
					{s.modeCopilot}
				</Button>
				<Button
					variant="unstyled"
					type="button"
					className={`pkfa-mode${activeMode === 'ambient' ? ' is-active' : ''}`}
					disabled={!onSwitchMode}
					title={onSwitchMode ? undefined : s.modeDisabledHint}
					onClick={() => onSwitchMode?.('ambient')}
				>
					{s.modeAmbient}
				</Button>
			</nav>

			{bodySlot ? (
				<div className="pkfa-body-slot">{bodySlot}</div>
			) : (
				<>
					{/* atlas body: search + atlas-bar + tree/inspector + tray */}

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
				onCollapseAll={() => dispatch({ type: 'setCollapsed', ids: collectHeadingIds(doc.blocks) })}
			/>

			{/* main split */}
			<section className="pkfa-main">
				<div className="pkfa-tree-pane">
					<div className="pkfa-tree-scroll">
						<AtlasTree
							blocks={doc.blocks}
							config={config}
							visible={visible}
							collapsed={state.collapsed}
							selectedId={state.selectedId}
							trayIds={trayIds}
							onSelect={(b) => dispatch({ type: 'select', id: b.id })}
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
	);
};
