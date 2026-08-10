import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import { motion } from 'framer-motion';
import { Copy, FileText, Loader2, Network } from 'lucide-react';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import {
	ResultBrowserDensityToggle,
	ResultBrowserGraph,
	ResultBrowserGraphControls,
	ResultBrowserListRow,
	ResultBrowserTree,
	ResultBrowserViewToggle,
	type ResultBrowserDensity,
	type ResultBrowserGraphPreset,
	type ResultBrowserView,
} from '@/ui/component/result-browser';
import { Button } from '@/ui/component/shared-ui/button';
import { isMobile } from '@/core/platform';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useOwnerWindowListener } from '@/ui/hooks/useOwnerWindow';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { InspectorSidePanel } from './inspector/InspectorSidePanel';
import { useQuickSearchHost } from '../hooks/useQuickSearchHost';
import { useSearchSessionStore } from '../store/searchSessionStore';
import {
	isSourcesDensityVisible,
	resolveSourcesKeyboardIntent,
} from './v2SourcesInteraction';
import { sourcesToResultItems } from './sourceEvidenceAdapter';
import { ContextualAIGraphView } from '@/ui/component/ai-graph';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

export { sourcesToResultItems } from './sourceEvidenceAdapter';

type GraphMode = 'one-hop' | 'two-hop' | 'ai';

const SOURCE_KEY_TIPS = PEAK_CONTROL_KEY_TIP_KEYS.aiSearch.sources;
const SOURCE_GRAPH_PRESET_KEY_TIPS: Readonly<Record<ResultBrowserGraphPreset, string>> = {
	constellation: SOURCE_KEY_TIPS.graphPreset.constellation,
	community: SOURCE_KEY_TIPS.graphPreset.community,
	'flow-tb': SOURCE_KEY_TIPS.graphPreset.flowTb,
	'flow-lr': SOURCE_KEY_TIPS.graphPreset.flowLr,
	folder: SOURCE_KEY_TIPS.graphPreset.folder,
	orbit: SOURCE_KEY_TIPS.graphPreset.orbit,
};

interface V2SourcesViewProps {
	onClose?: () => void;
}

const SegmentedButton: React.FC<{
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
	title?: string;
	keyTipKey: string;
	keyTipLabel: string;
}> = ({ active, onClick, children, title, keyTipKey, keyTipLabel }) => (
	<Button
		variant={active ? 'default' : 'ghost'}
		size="sm"
		geometry="toolbar"
		title={title}
		data-peak-keytip-key={keyTipKey}
		data-peak-keytip-label={keyTipLabel}
		onClick={onClick}
		className={cn(
			'pktw-rounded-full pktw-text-sm',
			active ? '' : 'pktw-text-pk-foreground-muted',
		)}
	>
		{children}
	</Button>
);

const ScopeToggle: React.FC<{
	value: GraphMode;
	onChange: (value: GraphMode) => void;
}> = ({ value, onChange }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-1.5">
		<div className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-rounded-full pktw-border pktw-border-pk-border pktw-bg-pk-surface-sunken pktw-p-0.5">
			<SegmentedButton
				active={value === 'one-hop'}
				onClick={() => onChange('one-hop')}
				keyTipKey={SOURCE_KEY_TIPS.graphScope.oneHop}
				keyTipLabel="One-hop source graph"
			>
				One hop
			</SegmentedButton>
			<SegmentedButton
				active={value === 'two-hop'}
				onClick={() => onChange('two-hop')}
				keyTipKey={SOURCE_KEY_TIPS.graphScope.twoHop}
				keyTipLabel="Two-hop source graph"
			>
				Two hop
			</SegmentedButton>
			<SegmentedButton
				active={value === 'ai'}
				onClick={() => onChange('ai')}
				keyTipKey={SOURCE_KEY_TIPS.graphScope.ai}
				keyTipLabel="AI Graph"
			>
				AI Graph
			</SegmentedButton>
		</div>
	</div>
);

function VaultRelationshipEmptyState({
	sourceCount,
	scope,
	onExpand,
	onOpenAIMap,
}: {
	sourceCount: number;
	scope: Exclude<GraphMode, 'ai'>;
	onExpand(): void;
	onOpenAIMap(): void;
}): React.ReactElement {
	const canExpand = scope !== 'two-hop';
	return (
		<div className="pk-ai-sources-empty-graph">
			<div className="pk-ai-sources-empty-graph-icon" aria-hidden>
				<Network />
			</div>
			<span className="pk-ai-sources-empty-graph-title">
				{sourceCount} sources · 0 Vault relationships
			</span>
			<span className="pk-ai-sources-empty-graph-copy">
				No links were found in the current scope. Expand the Vault neighborhood or open AI Graph.
			</span>
			<div className="pk-ai-sources-empty-graph-actions">
				{canExpand && (
					<Button
						variant="outline"
						geometry="action"
						onClick={onExpand}
						data-peak-keytip-key={SOURCE_KEY_TIPS.empty.twoHop}
						data-peak-keytip-label="Explore two hop"
					>
						Explore two hop
					</Button>
				)}
				<Button
					variant="outline"
					geometry="action"
					onClick={onOpenAIMap}
					data-peak-keytip-key={SOURCE_KEY_TIPS.empty.ai}
					data-peak-keytip-label="Open AI Graph"
				>
					AI Graph
				</Button>
			</div>
		</div>
	);
}

export const V2SourcesView: React.FC<V2SourcesViewProps> = ({ onClose }) => {
	const { vaultNavigation } = useServiceContext();
	const host = useQuickSearchHost();
	const sources = useSearchSessionStore((state) => state.v2Sources);
	const query = useSearchSessionStore((state) => state.query);
	const view = useSearchSessionStore((state) => state.sourcesViewMode) as ResultBrowserView;
	const setView = useSearchSessionStore((state) => state.setSourcesViewMode);
	const [density, setDensity] = useState<ResultBrowserDensity>('detailed');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [cursor, setCursor] = useState<string | null>(null);
	const [graphSelectedPath, setGraphSelectedPath] = useState<string | null>(null);
	const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [inspectorPath, setInspectorPath] = useState<string | null>(null);
	const [graphMode, setGraphMode] = useState<GraphMode>('one-hop');
	const [graphPreset, setGraphPreset] = useState<ResultBrowserGraphPreset>('constellation');
	const [semantic, setSemantic] = useState(false);
	const [subgraph, setSubgraph] = useState<ResultSubgraphOutput | null>(null);
	const [graphLoading, setGraphLoading] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const projectionRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
	const lastModifiedByPath = useMemo(() => new Map(
		sources.map((source) => [
			source.path,
			host.findFileByPath(source.path)?.stat.mtime ?? 0,
		]),
	), [host, sources]);
	const results = useMemo(
		() => sourcesToResultItems(sources, lastModifiedByPath),
		[lastModifiedByPath, sources],
	);
	const pathsKey = sources.map((source) => source.path).join('|');
	const selectedPath = view === 'tree'
		? cursor ?? results[0]?.path ?? null
		: view === 'graph'
			? graphSelectedPath ?? results[0]?.path ?? null
			: results[selectedIndex]?.path ?? results[0]?.path ?? null;
	const hasVaultRelationships = (subgraph?.edges.length ?? 0) > 0;

	const focusSourcesProjection = useCallback((): void => {
		projectionRef.current?.focus({ preventScroll: true });
	}, []);

	const handleOpen = useCallback((pathOrResult: string, newTab = true) => {
		createOpenSourceCallback(onClose, newTab, vaultNavigation)(pathOrResult);
	}, [onClose, vaultNavigation]);

	const selectPath = useCallback((path: string): void => {
		const nextIndex = results.findIndex((result) => result.path === path);
		if (nextIndex >= 0) setSelectedIndex(nextIndex);
		setCursor(path);
		setGraphSelectedPath(path);
		if (inspectorOpen) setInspectorPath(path);
	}, [inspectorOpen, results]);

	const openInspectorForPath = useCallback((path: string): void => {
		if (isMobile()) {
			handleOpen(path, true);
			return;
		}
		setInspectorPath(path);
		setInspectorOpen(true);
	}, [handleOpen]);

	const setInspectorVisible = useCallback((open: boolean): void => {
		if (!open) {
			setInspectorOpen(false);
			focusSourcesProjection();
			return;
		}
		if (!selectedPath) return;
		openInspectorForPath(selectedPath);
	}, [focusSourcesProjection, openInspectorForPath, selectedPath]);

	const handleProjectionKey = useCallback((event: KeyboardEvent): void => {
		const target = event.target as Element | null;
		if (event.key === 'ArrowRight' && target?.closest?.('[data-result-browser-row]')) return;
		const intent = resolveSourcesKeyboardIntent({
			view,
			key: event.key,
			insideWorkspace: Boolean(target && rootRef.current?.contains(target)),
			editableTarget: Boolean(target?.closest?.('input, textarea, [contenteditable="true"]')),
			inspectorOpen,
			hasSelection: Boolean(selectedPath),
			resultCount: results.length,
		});
		if (!intent) return;
		event.preventDefault();
		if (intent.type === 'open-inspector') {
			setInspectorVisible(true);
			return;
		}
		if (intent.type === 'close-inspector') {
			setInspectorVisible(false);
			return;
		}
		if (intent.type === 'open-selected') {
			if (!selectedPath) return;
			handleOpen(selectedPath, event.metaKey || event.ctrlKey);
			return;
		}
		const nextIndex = (selectedIndex + intent.direction + results.length) % results.length;
		setSelectedIndex(nextIndex);
		const nextPath = results[nextIndex].path;
		setCursor(nextPath);
		if (inspectorOpen) setInspectorPath(nextPath);
		itemRefs.current.get(nextIndex)?.focus();
	}, [
		handleOpen,
		inspectorOpen,
		results,
		selectedIndex,
		selectedPath,
		setInspectorVisible,
		view,
	]);

	// Capture before Obsidian can stop the event when the query editor still
	// owns focus. List rows handle ArrowRight directly with their own path.
	useOwnerWindowListener(rootRef, 'keydown', handleProjectionKey, true);

	useEffect(() => {
		focusSourcesProjection();
	}, [focusSourcesProjection, view]);

	useEffect(() => {
		if (results.length === 0) return;
		const selectedStillExists = selectedPath && results.some((result) => result.path === selectedPath);
		if (selectedStillExists) return;
		const firstPath = results[0].path;
		setSelectedIndex(0);
		setCursor(firstPath);
		setGraphSelectedPath(firstPath);
		if (inspectorOpen) setInspectorPath(firstPath);
	}, [inspectorOpen, results, selectedPath]);

	useEffect(() => {
		if (view !== 'graph' || graphMode === 'ai') return;
		let cancelled = false;
		setGraphLoading(true);
		host.buildSourceVaultGraph(sources.map((source) => source.path), graphMode)
			.then((result) => {
				if (!cancelled) setSubgraph(result);
			})
			.catch((error) => {
				if (cancelled) return;
				setSubgraph(null);
				new Notice(`Could not build Vault graph: ${error instanceof Error ? error.message : String(error)}`);
			})
			.finally(() => {
				if (!cancelled) setGraphLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [graphMode, host, pathsKey, sources, view]);

	const toggleFolder = (folderPath: string): void => {
		setCollapsedFolders((current) => (
			current.includes(folderPath)
				? current.filter((path) => path !== folderPath)
				: [...current, folderPath]
		));
	};

	const copySourcePaths = async (): Promise<void> => {
		await navigator.clipboard.writeText(sources.map((source) => `[[${source.path}]]`).join('\n'));
		new Notice(`Copied ${sources.length} source paths`);
	};

	if (sources.length === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2 pktw-py-20 pktw-text-center">
				<FileText className="pktw-h-7 pktw-w-7 pktw-text-pk-foreground-faint" />
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground">No cited files yet</span>
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">Sources appear here after the agent reads evidence.</span>
			</div>
		);
	}

	return (
		<motion.div
			ref={rootRef}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="pktw-flex pktw-min-h-0 pktw-flex-1 pktw-flex-col pktw-gap-2 pktw-px-1 pktw-py-1"
		>
			<div className="pk-ai-sources-toolbar">
				<div className="pk-ai-sources-summary">
					<FileText aria-hidden />
					<div>
						<span>{sources.length} cited files</span>
						<small>Evidence used by this analysis</small>
					</div>
				</div>
				<div className="pk-ai-sources-toolbar-controls">
					<ResultBrowserViewToggle
						view={view}
						onViewChange={setView}
						keyTipKeys={SOURCE_KEY_TIPS.view}
					/>
					{view === 'graph' && <ScopeToggle value={graphMode} onChange={setGraphMode} />}
					{isSourcesDensityVisible(view) && (
						<ResultBrowserDensityToggle
							density={density}
							onDensityChange={setDensity}
							keyTipKeys={SOURCE_KEY_TIPS.density}
						/>
					)}
					<Button
						variant="ghost"
						geometry="toolbar-icon"
						onClick={() => void copySourcePaths()}
						title="Copy source links"
						aria-label="Copy source links"
						data-peak-keytip-key={SOURCE_KEY_TIPS.copyLinks}
						data-peak-keytip-label="Copy source links"
					>
						<Copy />
					</Button>
				</div>
			</div>

			{view === 'graph' && graphMode !== 'ai' && (
				<div className="pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-background pktw-p-2">
					<span className="pktw-text-xs pktw-text-pk-foreground-muted">Vault links around the cited sources</span>
					<div className="pktw-flex-1" />
					{hasVaultRelationships && (
						<ResultBrowserGraphControls
							preset={graphPreset}
							onPresetChange={setGraphPreset}
							semantic={semantic}
							onSemanticChange={setSemantic}
							keyTipKeys={{
								preset: SOURCE_GRAPH_PRESET_KEY_TIPS,
								semantic: SOURCE_KEY_TIPS.graphSemantic,
							}}
						/>
					)}
				</div>
			)}

			<div
				ref={projectionRef}
				data-v2-sources-projection
				data-view={view}
				tabIndex={0}
				className={cn(
					'pk-ai-sources-projection pktw-flex pktw-min-h-0 pktw-overflow-hidden pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-background focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-pk-accent/30',
					view === 'graph'
						? 'pk-ai-sources-projection--graph'
						: 'pk-ai-sources-projection--content',
				)}
			>
				<div className="pktw-min-w-0 pktw-flex-1 pktw-overflow-hidden">
					{view === 'list' && (
						<div className="pk-ai-sources-list pktw-overflow-y-auto pktw-py-2">
							{results.map((result, index) => (
								<ResultBrowserListRow
									key={result.path}
									result={result}
									index={index}
									isSelected={selectedIndex === index}
									density={density}
									highlightQuery={query}
									itemRef={(element) => itemRefs.current.set(index, element)}
									onSelect={(nextIndex) => selectPath(results[nextIndex].path)}
									onOpen={(item, options) => handleOpen(item.path, options.newTab)}
									onInspect={(item) => openInspectorForPath(item.path)}
									snippetText={sources[index]?.reasoning ?? null}
									openOnSelect={false}
								/>
							))}
						</div>
					)}

					{view === 'tree' && (
						<ResultBrowserTree
							results={results}
							density={density}
							collapsedFolders={collapsedFolders}
							cursor={cursor}
							onCursorChange={(path) => {
								setCursor(path);
								if (path && inspectorOpen) setInspectorPath(path);
							}}
							onToggleCollapse={toggleFolder}
							onOpenFile={(file, options) => handleOpen(file.path, options.newTab)}
							onRevealFolder={(folder) => toggleFolder(folder.path)}
							inspectorOpen={inspectorOpen}
							onInspectorOpenChange={setInspectorVisible}
						/>
					)}

					{view === 'graph' && graphMode !== 'ai' && (
						<div className="pktw-relative pktw-h-full pktw-overflow-hidden">
							{graphLoading && (
								<div className="pktw-absolute pktw-inset-0 pktw-z-10 pktw-flex pktw-items-center pktw-justify-center pktw-gap-2 pktw-bg-pk-background/80">
									<Loader2 className="pktw-h-4 pktw-w-4 pktw-animate-spin pktw-text-pk-accent" />
									<span className="pktw-text-xs pktw-text-pk-foreground-muted">Resolving Vault relations…</span>
								</div>
							)}
							{!graphLoading && subgraph && !hasVaultRelationships ? (
								<VaultRelationshipEmptyState
									sourceCount={sources.length}
									scope={graphMode}
									onExpand={() => setGraphMode('two-hop')}
									onOpenAIMap={() => setGraphMode('ai')}
								/>
							) : (
								<ResultBrowserGraph
									subgraph={subgraph}
									preset={graphPreset}
									semantic={semantic}
									keyTipKeys={SOURCE_KEY_TIPS.graphCanvas}
									onNodeTap={(node) => {
										selectPath(node.path);
										projectionRef.current?.focus();
									}}
									onNodeDblTap={(node) => handleOpen(node.path)}
								/>
							)}
						</div>
					)}

					{view === 'graph' && graphMode === 'ai' && (
						<ContextualAIGraphView
							contextRefs={[query, ...sources.map((source) => source.path)]}
							selectedVaultPaths={sources.map((source) => source.path)}
							createOrigin={{
								surface: 'ai-search',
								contextRef: {
									kind: 'search-query',
									ref: query,
									label: query || 'AI Search sources',
								},
							}}
						/>
					)}
				</div>

				{inspectorOpen && !isMobile() && (
					<aside className="pktw-w-[340px] pktw-flex-shrink-0 pktw-overflow-hidden pktw-border-l pktw-border-pk-border">
						<InspectorSidePanel
							currentPath={inspectorPath}
							searchQuery={query}
							showSearchSnippet={false}
							onClose={() => setInspectorVisible(false)}
							onOpenDocument={(path) => handleOpen(path, true)}
							onOpenFileAtlas={(path) => void host.openFileAtlas(path)}
							onInspectInPanel={(path) => {
								setInspectorPath(path);
								selectPath(path);
							}}
						/>
					</aside>
				)}
			</div>
		</motion.div>
	);
};
