import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import { motion } from 'framer-motion';
import { Check, Copy, Database, FileText, Loader2, Network, Pencil } from 'lucide-react';
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
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { Button } from '@/ui/component/shared-ui/button';
import { isMobile } from '@/core/platform';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useOwnerWindowListener } from '@/ui/hooks/useOwnerWindow';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { InspectorSidePanel } from './inspector/InspectorSidePanel';
import { useGraphAgent } from '../hooks/useGraphAgent';
import { useQuickSearchHost } from '../hooks/useQuickSearchHost';
import { useSearchSessionStore } from '../store/searchSessionStore';
import type { V2Source } from '../types/search-steps';
import {
	isSourcesDensityVisible,
	resolveSourcesKeyboardIntent,
} from './v2SourcesInteraction';
import { sourcesToResultItems } from './sourceEvidenceAdapter';

export { sourcesToResultItems } from './sourceEvidenceAdapter';

type GraphKind = 'vault' | 'ai';
type VaultGraphScope = 'evidence' | 'one-hop' | 'two-hop';

interface V2SourcesViewProps {
	onClose?: () => void;
}

const SegmentedButton: React.FC<{
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
	title?: string;
}> = ({ active, onClick, children, title }) => (
	<Button
		variant={active ? 'default' : 'ghost'}
		size="sm"
		geometry="toolbar"
		title={title}
		onClick={onClick}
		className={cn(
			'pktw-rounded-full pktw-text-sm',
			active ? '' : 'pktw-text-pk-foreground-muted',
		)}
	>
		{children}
	</Button>
);

const GraphKindToggle: React.FC<{
	value: GraphKind;
	onChange: (value: GraphKind) => void;
}> = ({ value, onChange }) => (
	<div className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-rounded-full pktw-border pktw-border-pk-border pktw-bg-pk-surface-sunken pktw-p-0.5">
		<SegmentedButton active={value === 'vault'} onClick={() => onChange('vault')}>
			Vault graph
		</SegmentedButton>
		<SegmentedButton active={value === 'ai'} onClick={() => onChange('ai')}>
			AI relationship map
		</SegmentedButton>
	</div>
);

const ScopeToggle: React.FC<{
	value: VaultGraphScope;
	onChange: (value: VaultGraphScope) => void;
}> = ({ value, onChange }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-1.5">
		<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted">
			Scope
		</span>
		<div className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-rounded-full pktw-border pktw-border-pk-border pktw-bg-pk-surface-sunken pktw-p-0.5">
			<SegmentedButton active={value === 'evidence'} onClick={() => onChange('evidence')}>
				Evidence set
			</SegmentedButton>
			<SegmentedButton active={value === 'one-hop'} onClick={() => onChange('one-hop')}>
				1-hop
			</SegmentedButton>
			<SegmentedButton active={value === 'two-hop'} onClick={() => onChange('two-hop')}>
				2-hop
			</SegmentedButton>
		</div>
	</div>
);

const AIRelationshipMap: React.FC<{
	sources: readonly V2Source[];
	onSelect: (path: string) => void;
}> = ({ sources, onSelect }) => {
	const query = useSearchSessionStore((state) => state.query);
	const host = useQuickSearchHost();
	const sourceKey = sources.map((source) => source.path).join('|');
	const [selectedPaths, setSelectedPaths] = useState<string[]>(() => sources.map((source) => source.path));
	const [editingSources, setEditingSources] = useState(false);

	useEffect(() => {
		const nextPaths = sources.map((source) => source.path);
		setSelectedPaths((current) => {
			const retained = current.filter((path) => nextPaths.includes(path));
			return retained.length > 0 ? retained : nextPaths;
		});
	}, [sourceKey]);

	const selectedSources = useMemo(
		() => sources.filter((source) => selectedPaths.includes(source.path)),
		[sources, selectedPaths],
	);
	const sourceItems = useMemo(
		() => selectedSources.map((source) => ({
			path: source.path,
			title: source.title,
		})),
		[selectedSources],
	);
	const { graphData, loading, steps, start } = useGraphAgent(sourceItems, query);

	const toggleSource = (path: string): void => {
		setSelectedPaths((current) => {
			if (!current.includes(path)) return [...current, path];
			if (current.length === 1) return current;
			return current.filter((candidate) => candidate !== path);
		});
	};

	const handleSaveToVault = useCallback(async () => {
		if (!graphData) {
			new Notice('Generate the relationship map before saving it');
			return;
		}
		try {
			const saveFolder = host.autoSaveFolder || 'AI-Analysis';
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const querySlug = (query || 'graph').replace(/[/\\:*?"<>|]/g, '').trim().slice(0, 40);
			const { path } = await host.saveGraphToVault({
				folderPath: saveFolder,
				fileName: `Graph-${querySlug}-${timestamp}`,
				query,
				summary: `${graphData.nodes.length} nodes, ${graphData.edges.length} edges`,
				graphData,
				lensHint: 'topology',
			});
			new Notice(`Graph saved: ${path}`);
		} catch (error) {
			new Notice(`Failed to save graph: ${error instanceof Error ? error.message : String(error)}`);
		}
	}, [graphData, host, query]);

	return (
		<div className="pktw-flex pktw-h-full pktw-min-h-0 pktw-flex-col pktw-overflow-hidden">
			<div className="pktw-flex pktw-min-h-10 pktw-items-center pktw-gap-3 pktw-border-b pktw-border-pk-border pktw-bg-pk-surface-raised pktw-px-3 pktw-py-1">
				<Database className="pktw-h-4 pktw-w-4 pktw-text-pk-accent" />
				<div className="pktw-min-w-0 pktw-flex-1">
					<span className="pktw-block pktw-text-xs pktw-font-semibold pktw-text-pk-foreground">
						Relationship inputs
					</span>
					<span className="pktw-block pktw-truncate pktw-text-xs pktw-text-pk-foreground-muted">
						{selectedSources.length} of {sources.length} cited files selected
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					geometry="toolbar"
					onClick={() => setEditingSources((value) => !value)}
					className="pktw-gap-1.5 pktw-rounded-md"
				>
					<Pencil className="pktw-h-3.5 pktw-w-3.5" />
					{editingSources ? 'Done' : 'Edit sources'}
				</Button>
			</div>

			{editingSources && (
				<div className="pktw-grid pktw-grid-cols-2 pktw-gap-1 pktw-border-b pktw-border-pk-border pktw-bg-pk-background pktw-p-3">
					{sources.map((source) => {
						const selected = selectedPaths.includes(source.path);
						return (
							<Button
								key={source.path}
								variant="ghost"
								size="sm"
								onClick={() => toggleSource(source.path)}
								className="!pktw-h-auto !pktw-min-h-8 !pktw-max-h-none pktw-justify-start pktw-gap-2 pktw-rounded-md !pktw-px-2 !pktw-py-1.5 pktw-text-left"
								title={source.path}
							>
								<span className={cn(
									'pktw-flex pktw-h-4 pktw-w-4 pktw-shrink-0 pktw-items-center pktw-justify-center pktw-rounded pktw-border',
									selected ? 'pktw-border-pk-accent pktw-bg-pk-accent pktw-text-white' : 'pktw-border-pk-border',
								)}>
									{selected && <Check className="pktw-h-3 pktw-w-3" />}
								</span>
								<span className="pktw-truncate pktw-text-xs">{source.title}</span>
							</Button>
						);
					})}
				</div>
			)}

			<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-pk-background">
				<MultiLensGraph
					graphData={graphData}
					defaultLens="topology"
					showControls
					onNodeClick={onSelect}
					className="pktw-h-full"
					loading={loading}
					loadingSteps={steps}
					onRequestGenerate={start}
					generateLabel="Generate relationship map"
					onSaveToVault={handleSaveToVault}
				/>
			</div>
		</div>
	);
};

function VaultRelationshipEmptyState({
	sourceCount,
	scope,
	onExpand,
	onOpenAIMap,
}: {
	sourceCount: number;
	scope: VaultGraphScope;
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
				No links were found in the current scope. Expand the Vault neighborhood or generate an AI relationship map.
			</span>
			<div className="pk-ai-sources-empty-graph-actions">
				{canExpand && (
					<Button variant="outline" geometry="action" onClick={onExpand}>
						Explore {scope === 'evidence' ? '1-hop' : '2-hop'}
					</Button>
				)}
				<Button variant="outline" geometry="action" onClick={onOpenAIMap}>
					AI relationship map
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
	const [graphKind, setGraphKind] = useState<GraphKind>('vault');
	const [graphScope, setGraphScope] = useState<VaultGraphScope>('evidence');
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
		if (view !== 'graph' || graphKind !== 'vault') return;
		let cancelled = false;
		setGraphLoading(true);
		host.buildSourceVaultGraph(sources.map((source) => source.path), graphScope)
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
	}, [graphKind, graphScope, host, pathsKey, sources, view]);

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
					<ResultBrowserViewToggle view={view} onViewChange={setView} />
					{view === 'graph' && <GraphKindToggle value={graphKind} onChange={setGraphKind} />}
					{isSourcesDensityVisible(view) && (
						<ResultBrowserDensityToggle density={density} onDensityChange={setDensity} />
					)}
					<Button
						variant="ghost"
						geometry="toolbar-icon"
						onClick={() => void copySourcePaths()}
						title="Copy source links"
						aria-label="Copy source links"
					>
						<Copy />
					</Button>
				</div>
			</div>

			{view === 'graph' && graphKind === 'vault' && (
				<div className="pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-background pktw-p-2">
					<ScopeToggle value={graphScope} onChange={setGraphScope} />
					<div className="pktw-flex-1" />
					{hasVaultRelationships && (
						<ResultBrowserGraphControls
							preset={graphPreset}
							onPresetChange={setGraphPreset}
							semantic={semantic}
							onSemanticChange={setSemantic}
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

					{view === 'graph' && graphKind === 'vault' && (
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
									scope={graphScope}
									onExpand={() => setGraphScope(
										graphScope === 'evidence' ? 'one-hop' : 'two-hop',
									)}
									onOpenAIMap={() => setGraphKind('ai')}
								/>
							) : (
								<ResultBrowserGraph
									subgraph={subgraph}
									preset={graphPreset}
									semantic={semantic}
									onNodeTap={(node) => {
										selectPath(node.path);
										projectionRef.current?.focus();
									}}
									onNodeDblTap={(node) => handleOpen(node.path)}
								/>
							)}
						</div>
					)}

					{view === 'graph' && graphKind === 'ai' && (
						<AIRelationshipMap
							sources={sources}
							onSelect={(path) => {
								selectPath(path);
								projectionRef.current?.focus();
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
