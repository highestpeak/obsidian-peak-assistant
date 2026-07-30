import React, { useEffect, useRef, useState } from 'react';
import { VaultSearchTab, VaultSearchFooterHints } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { CopilotPickerContent } from '@/ui/view/copilot/CopilotPickerContent';
import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { CopilotReviewHistoryRecord } from '@/service/copilot/CopilotReviewHistoryService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { Search, Sparkles, Globe, X, RotateCcw, Library, Network, ChevronDown, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { suggestHistoryStore, type SuggestHistoryEntry } from '@/ui/view/quick-search/rewrite/SuggestHistoryStore';
import { Button } from '@/ui/component/shared-ui/button';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { GlobeOff } from '@/ui/component/icon';
import { useSharedStore, useVaultSearchStore } from './store';
import { loadCompletedAnalysisSnapshot } from './store/aiAnalysisStore';
import { useSearchSessionStore } from './store/searchSessionStore';
import { useAIGraphStore } from './store/aiGraphStore';
import type { AnalysisMode } from './store/aiAnalysisStore';
import type { QuickSearchMode } from './store/vaultSearchStore';
import { useSearchSession } from './hooks/useSearchSession';
import { Notice } from 'obsidian';
import { useQuickSearchHost } from './hooks/useQuickSearchHost';
import { SearchQueryEvent } from '@/core/eventBus';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { formatDuration } from '@/core/utils/format-utils';
import { InspectorSidePanel } from './components/inspector/InspectorSidePanel';
import { isMobile } from '@/core/platform';
import { matchPatterns, type MatchedSuggestion } from '@/service/context/PatternMatcher';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SuggestionGrid } from './components/SuggestionGrid';
import { ActiveSessionsList } from './components/ActiveSessionsList';
import { RecentAnalysisList } from './components/RecentAnalysisList';
import { RecentQueriesDropdown } from './components/RecentQueriesDropdown';
import { resolveAnalysisSnapshotFromVault } from '@/core/storage/vault/search-docs/AiAnalysisJsonStore';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { ResultPaneGraphControls, ResultDensityToggle, ViewModeToggle } from './components/ResultPaneHeader';
import { ResultBrowserSearchInput } from '@/ui/component/result-browser';
import { useOpenHubGraphSubview } from './hooks/useOpenHubGraphSubview';
import { AIInstructionComposer } from '@/ui/component/instruction-composer';
import type { AIWorkspaceMode } from './store/sharedStore';
import type {
	AIGraphArtifactView,
	AIGraphHistoryRow,
	AIGraphSemanticDiff,
	AIGraphSource,
	AIGraphVersion,
	AIGraphVersionComparison,
} from '@/service/ai-graph';
import {
	isActiveAIGraphSource,
	stableAIGraphId,
} from '@/service/ai-graph';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import type { LensGraphData } from '@/core/types/lens-graph';

type TabType = 'vault' | 'ai';

interface TabButtonProps {
	tab: TabType;
	label: string;
	activeTab: TabType;
	onClick: () => void;
	className?: string;
}

/**
 * Tab button component for switching between tabs.
 */
const TabButton: React.FC<TabButtonProps> = ({ tab, label, activeTab, onClick, className }) => {
	const isActive = activeTab === tab;
	return (
		<Button
			variant="ghost"
			onClick={onClick}
			className={cn(
				'pktw-shadow-none pktw-rounded-none pktw-inline-flex pktw-items-center pktw-justify-center pktw-whitespace-nowrap pktw-font-medium focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-offset-0 disabled:pktw-pointer-events-none disabled:pktw-opacity-50 pktw-flex-1 pktw-relative',
				isActive
					? 'pktw-text-pk-accent pktw-bg-pk-background hover:pktw-bg-pk-background hover:pktw-text-pk-accent'
					: 'pktw-text-pk-text-primary pktw-bg-pk-surface-sunken hover:pktw-text-pk-accent hover:pktw-bg-pk-highlight',
				className
			)}
		>
			<span className="pktw-font-medium">{label}</span>
			{isActive && (
				<div className="pktw-absolute pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-0.5 pktw-bg-pk-accent" />
			)}
		</Button>
	);
};

interface AITabContentProps {
	onClose?: () => void;
	mode: Exclude<AIWorkspaceMode, 'vault-intelligence'>;
}

/**
 * AI Analysis tab: input row (mode, web, Clear/Re-analyze/Cancel/Analyze) + AISearchTab content.
 */
export const PRESET_LABELS: Record<AnalysisMode, { short: string; full: string; placeholder: string }> = {
	vaultFull: { short: 'Vault analysis', full: 'Vault analysis · Deep analysis of the whole vault.', placeholder: 'Ask AI anything about your vault...' },
	aiGraph: { short: 'AI graph', full: 'AI graph · Build an interactive knowledge graph.', placeholder: 'Describe the knowledge graph you want to build...' },
};

const AITabContent: React.FC<AITabContentProps> = ({ onClose, mode }) => {
	const { eventBus } = useServiceContext();
	const host = useQuickSearchHost();
	const { searchQuery, setSearchQuery, recentQueries, clearRecentQueries } = useSharedStore();
	const graphType = useSharedStore((state) => state.aiGraphCreateType);
	const setGraphType = useSharedStore((state) => state.setAIGraphCreateType);
	const selectedGraphPaths = useAIGraphStore((state) => state.selectedPaths);
	const initialGraphSources = useAIGraphStore((state) => state.initialSources);
	const addInitialGraphSource = useAIGraphStore((state) => state.addInitialSource);
	const removeInitialGraphSource = useAIGraphStore((state) => state.removeInitialSource);
	const webEnabled = useSearchSessionStore((s) => s.webEnabled);
	const toggleWeb = useSearchSessionStore((s) => s.toggleWeb);
	const sessionStatus = useSearchSessionStore((s) => s.status);
	const isInputFrozen = useSearchSessionStore((s) => s.isInputFrozen);
	const hasAnalyzed = useSearchSessionStore((s) => s.hasAnalyzed);
	const setAiModalOpen = useSearchSessionStore((s) => s.setAiModalOpen);
	const setAnalysisMode = useSearchSessionStore((s) => s.setAnalysisMode);
	const { performAnalysis, cancel, restoreFromBackground } = useSearchSession();

	// Check for pending background session restore on mount.
	// T10: the runtime exposes a single-shot `consumePendingRestore()`
	// in place of the retired `BackgroundSessionManager.pendingRestore`
	// static field; the modal-opener adapter writes the id before the
	// new modal mounts.
	useEffect(() => {
		const pendingId = host.quickSearchRuntime?.consumePendingRestore();
		if (pendingId) restoreFromBackground(pendingId);
	}, [restoreFromBackground, host.quickSearchRuntime]);

	const isAnalyzing = sessionStatus === 'starting' || sessionStatus === 'streaming';
	const analysisCompleted = sessionStatus === 'completed';
	const hasResult = hasAnalyzed || analysisCompleted;
	const handleAnalyze = () => {
		if (!searchQuery.trim()) return;
		useSharedStore.getState().addRecentQuery(searchQuery.trim());
		try {
			eventBus.dispatch(new SearchQueryEvent({ query: searchQuery.trim() }));
		} catch { /* EventBus may not be initialized */ }
		performAnalysis(undefined);
	};

	useEffect(() => {
		setAnalysisMode(mode === 'graph' ? 'aiGraph' : 'vaultFull');
	}, [mode, setAnalysisMode]);

	const openSavedAnalysis = async (record: AIAnalysisHistoryRecord) => {
		const path = String(record.vault_rel_path ?? '').trim();
		if (!path) {
			if (record.query) setSearchQuery(record.query);
			return;
		}

		try {
			let text = await host.readVaultFileText(path);
			if (!text) text = await host.getAnalysisMarkdownForReplay(path);
			if (!text) {
				new Notice('Analysis record not found.');
				return;
			}

			const loaded = resolveAnalysisSnapshotFromVault(
				path,
				text,
				Number.isFinite(record.created_at_ts) ? record.created_at_ts : undefined,
			);
			if (!loaded) {
				new Notice('Failed to load saved analysis.');
				return;
			}

			loadCompletedAnalysisSnapshot(loaded.snapshot, path);
			const restoredQuery = loaded.query || record.query || '';
			if (!restoredQuery) return;
			useSharedStore.getState().setSearchQuery(restoredQuery);
			useSearchSessionStore.setState({ query: restoredQuery });
		} catch (error) {
			console.warn('[SearchModal] Failed to load saved analysis:', error);
			new Notice('Failed to load saved analysis.');
		}
	};

	useEffect(() => {
		setAiModalOpen(true);
		return () => setAiModalOpen(false);
	}, [setAiModalOpen]);

	const [suggestions, setSuggestions] = useState<MatchedSuggestion[]>([]);

	useEffect(() => {
		(async () => {
			try {
				// Try the proper accessor first, fallback to inline construction
				let repo: any = (sqliteStoreManager as any).getQueryPatternRepo?.();
				if (!repo) {
					const { QueryPatternRepo } = await import('@/core/storage/sqlite/repositories/QueryPatternRepo');
					const metaStore = sqliteStoreManager.getMetaStore();
					if (metaStore) repo = new QueryPatternRepo(metaStore.kysely());
				}
				if (!repo) { setSuggestions([]); return; }

				const rows = await repo.listActive();
				// Convert DB rows (JSON strings) → StoredPattern (parsed objects)
				const patterns = rows.map((r: any) => ({
					...r,
					variables: typeof r.variables === 'string' ? JSON.parse(r.variables) : r.variables,
					conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
					discovered_at: typeof r.discovered_at === 'number' ? new Date(r.discovered_at).toISOString() : r.discovered_at,
				}));
				const ctxProvider = host.createContextProvider();
				const ctx = ctxProvider.collect();
				setSuggestions(matchPatterns(patterns, ctx, 6));
			} catch { setSuggestions([]); }
		})();

	}, []);

	return (
			<>
				<div className="pktw-flex-shrink-0 pktw-p-2 pktw-bg-pk-background pktw-border-b pktw-border-pk-border">
					<div className="pktw-flex pktw-gap-2 pktw-items-center">
						<div className="pktw-relative pktw-flex-1 pktw-min-w-0">
							<AIInstructionComposer
								surface={mode === 'graph' ? 'ai-graph' : 'ai-search'}
								capabilityId={mode === 'graph' ? 'ai-graph.create' : 'ai-search.run'}
								value={searchQuery}
								onValueChange={setSearchQuery}
								onSubmit={() => handleAnalyze()}
								onStop={cancel}
								status={isAnalyzing ? 'streaming' : isInputFrozen ? 'submitting' : 'idle'}
								placeholder={mode === 'graph'
									? PRESET_LABELS.aiGraph.placeholder
									: 'Ask AI anything about your vault...'}
								compact
								autoFocus
								trailingControls={!isMobile() ? (
									<>
										{mode === 'graph' && (
											<label className="pk-ai-graph-type-field">
												<span className="sr-only">Graph type</span>
												<select
													aria-label="Graph type"
													value={graphType}
													onChange={(event) => setGraphType(
														event.target.value as typeof graphType,
													)}
												>
													<option value="free">Free</option>
													<option value="concept">Concept</option>
													<option value="entity">Entity</option>
													<option value="evidence">Evidence</option>
													<option value="causal">Causal</option>
													<option value="timeline">Timeline</option>
												</select>
											</label>
										)}
										<Button
											variant="ghost"
											geometry="action-icon"
											type="button"
											onClick={() => {
												if (!webEnabled && !ProfileRegistry.getInstance().getActiveWebSearchProfile()) {
													new Notice('No Web Search profile configured. Go to Settings → Profiles and assign a profile as "Web Search".', 5000);
													return;
												}
												setSearchQuery(toggleWeb(searchQuery));
											}}
											title={webEnabled ? 'Web: ON' : 'Web: OFF'}
											aria-label={webEnabled ? 'Disable Web search' : 'Enable Web search'}
										>
											{webEnabled ? <Globe className="pktw-w-5 pktw-h-5" /> : <GlobeOff className="pktw-w-5 pktw-h-5" />}
										</Button>
									</>
								) : undefined}
							/>
							</div>
							<div className="pktw-flex pktw-items-center pktw-gap-2">
						{!isAnalyzing && hasResult && (
							<Button
								onClick={() => { useSearchSessionStore.getState().resetAll(); useSharedStore.getState().setSearchQuery(''); }}
								variant="outline"
								className="pktw-shadow-none pktw-px-4 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-border-pk-border pktw-bg-pk-background pktw-text-pk-text-secondary pktw-cursor-pointer"
								title="Clear current AI analysis result (in-memory)"
							>
								Clear
							</Button>
						)}
						{!isAnalyzing && hasResult && (
							<Button
								onClick={handleAnalyze}
								disabled={!searchQuery.trim()}
								variant="outline"
								className="pktw-shadow-none pktw-px-3 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-border-pk-accent/25 pktw-bg-pk-background pktw-text-pk-accent pktw-cursor-pointer"
								title="Re-run AI analysis"
							>
								<RotateCcw className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Re-analyze</span>
							</Button>
						)}
						{isAnalyzing && (
							<Button
								onClick={cancel}
								className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-pk-background pktw-text-pk-accent pktw-border pktw-border-pk-accent/30 hover:pktw-bg-pk-highlight pktw-cursor-pointer"
								title="Cancel analysis"
							>
								<X className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Cancel</span>
							</Button>
						)}
						{!isAnalyzing && !hasResult && searchQuery.trim() && (
							<Button
								onClick={handleAnalyze}
								geometry="prominent"
								className="pktw-shadow-none !pktw-rounded-full pktw-whitespace-nowrap pktw-bg-pk-accent pktw-text-pk-text-inverted hover:pktw-bg-pk-accent-hover pktw-cursor-pointer"
								title="Start AI analysis"
							>
								<Sparkles className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Analyze</span>
							</Button>
						)}
						</div>
					</div>
					{mode === 'graph' && (
						<div className="pk-ai-graph-create-policy" role="status">
							<span>
								{selectedGraphPaths.length + initialGraphSources.length > 0
									? `${selectedGraphPaths.length + initialGraphSources.length} explicit source${selectedGraphPaths.length + initialGraphSources.length === 1 ? '' : 's'}`
									: 'Vault discovery: up to 30 candidate sources'}
							</span>
							<span>
								{webEnabled
									? 'Web access enabled · external source cost: higher'
									: 'Web access off · external source cost: none'}
							</span>
							<span>Successful validation saves one immutable version automatically.</span>
						</div>
					)}
					{mode === 'graph' && (
						<AIGraphInitialSourceTray
							selectedVaultPaths={selectedGraphPaths}
							sources={initialGraphSources}
							onAdd={addInitialGraphSource}
							onRemove={removeInitialGraphSource}
						/>
					)}
				</div>
				{sessionStatus === 'idle' && (
					<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-py-3">
						{mode === 'graph' ? (
							<AIGraphHistoryPanel />
						) : (
							<>
								<ActiveSessionsList onRestore={restoreFromBackground} />
								{!searchQuery.trim() && (
									<RecentQueriesDropdown
										queries={recentQueries.slice(0, 5)}
										onSelect={(query) => {
											setSearchQuery(query);
											useSearchSessionStore.getState().resetAll();
											useSearchSessionStore.getState().incrementTriggerAnalysis();
										}}
										onClear={clearRecentQueries}
									/>
								)}
								<SuggestionGrid
									suggestions={suggestions}
									onSelect={(s) => {
										useSharedStore.getState().setSearchQuery(s.filledTemplate);
										useSearchSessionStore.getState().resetAll();
										useSearchSessionStore.getState().incrementTriggerAnalysis();
										void (async () => {
											try {
												let repo: any = (sqliteStoreManager as any).getQueryPatternRepo?.();
												if (!repo) {
													const { QueryPatternRepo } = await import('@/core/storage/sqlite/repositories/QueryPatternRepo');
													const metaStore = sqliteStoreManager.getMetaStore();
													if (metaStore) repo = new QueryPatternRepo(metaStore.kysely());
												}
												if (repo) await repo.incrementUsage(s.patternId);
											} catch {}
										})();
									}}
								/>
								<RecentAnalysisList
									filterQuery={searchQuery}
									limit={6}
									onSelectQuery={(query) => {
										setSearchQuery(query);
										useSearchSessionStore.getState().resetAll();
										useSearchSessionStore.getState().incrementTriggerAnalysis();
									}}
									onSelectRecord={openSavedAnalysis}
								/>
							</>
						)}
					</div>
				)}
			{/* Only render AISearchTab when NOT showing the idle landing — avoids competing scroll zones */}
			{sessionStatus !== 'idle' && (
				<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-pk-background pktw-overflow-visible pktw-flex pktw-flex-col">
					<AISearchTab onClose={onClose} />
				</div>
			)}
			{sessionStatus === 'idle' && (
				<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2 pktw-bg-pk-surface-raised pktw-border-t pktw-border-pk-border pktw-flex pktw-items-center pktw-justify-between">
					<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-pk-text-tertiary">
						<span>↑↓ Navigate</span>
						<span>↵ Run</span>
							<span>Tab Navigate</span>
					</div>
					<span className="pktw-text-xs pktw-text-pk-foreground-muted">
						Current context stays visible before the run
					</span>
				</div>
			)}
		</>
	);
};

const AI_WORKSPACE_OPTIONS: Array<{
	mode: AIWorkspaceMode;
	label: string;
	description: string;
}> = [
	{ mode: 'search', label: 'AI Search', description: 'Ask and analyze your Vault' },
	{ mode: 'graph', label: 'AI Graph', description: 'Create, browse, and update graphs' },
	{ mode: 'vault-intelligence', label: 'Vault Intelligence', description: 'Health summary and recent reviews' },
];

function AIWorkspaceSelector({
	mode,
	active,
	onActivate,
	onModeChange,
}: {
	mode: AIWorkspaceMode;
	active: boolean;
	onActivate(): void;
	onModeChange(mode: AIWorkspaceMode): void;
}): React.ReactElement {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(() =>
		Math.max(0, AI_WORKSPACE_OPTIONS.findIndex((item) => item.mode === mode)));
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const selected = AI_WORKSPACE_OPTIONS.find((item) => item.mode === mode) ?? AI_WORKSPACE_OPTIONS[0];

	useEffect(() => {
		setActiveIndex(Math.max(0, AI_WORKSPACE_OPTIONS.findIndex((item) => item.mode === mode)));
	}, [mode]);

	useEffect(() => {
		if (open) optionRefs.current[activeIndex]?.focus();
	}, [activeIndex, open]);

	const closeAndRestore = (): void => {
		setOpen(false);
		requestAnimationFrame(() => triggerRef.current?.focus());
	};
	const select = (nextMode: AIWorkspaceMode): void => {
		onModeChange(nextMode);
		closeAndRestore();
	};
	return (
		<div className="pk-ai-workspace-selector">
			<Button
				ref={triggerRef}
				variant="ghost"
				type="button"
				className={cn('pk-ai-workspace-trigger', active && 'is-active')}
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => {
					onActivate();
					setOpen((current) => !current);
				}}
				onKeyDown={(event) => {
					if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					onActivate();
					setOpen(true);
				}}
			>
				{mode === 'graph' ? <Network /> : mode === 'vault-intelligence' ? <Sparkles /> : <Library />}
				<span>{selected.label}</span>
				<ChevronDown aria-hidden />
			</Button>
			{open && (
				<div
					className="pk-ai-workspace-menu"
					role="listbox"
					aria-label="AI workspace"
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							closeAndRestore();
							return;
						}
						if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
							event.preventDefault();
							const delta = event.key === 'ArrowDown' ? 1 : -1;
							setActiveIndex((index) =>
								(index + delta + AI_WORKSPACE_OPTIONS.length) % AI_WORKSPACE_OPTIONS.length);
							return;
						}
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							select(AI_WORKSPACE_OPTIONS[activeIndex].mode);
						}
					}}
				>
					{AI_WORKSPACE_OPTIONS.map((item, index) => (
						<Button
							key={item.mode}
							ref={(element) => {
								optionRefs.current[index] = element;
							}}
							variant="ghost"
							type="button"
							role="option"
							aria-selected={item.mode === mode}
							className="pk-ai-workspace-option"
							onFocus={() => setActiveIndex(index)}
							onClick={() => select(item.mode)}
						>
							<span>{item.label}</span>
							<small>{item.description}</small>
						</Button>
					))}
				</div>
			)}
		</div>
	);
}

function AIGraphInitialSourceTray({
	selectedVaultPaths,
	sources,
	onAdd,
	onRemove,
}: {
	selectedVaultPaths: readonly string[];
	sources: readonly AIGraphSource[];
	onAdd(source: AIGraphSource): void;
	onRemove(sourceId: string): void;
}): React.ReactElement {
	const [kind, setKind] = useState<'web-page' | 'manual-text' | 'ai-graph-version'>('manual-text');
	const [title, setTitle] = useState('');
	const [value, setValue] = useState('');
	const [versionId, setVersionId] = useState('');
	const stage = (): void => {
		const capturedAt = Date.now();
		const trimmed = value.trim();
		if (!trimmed) return;
		try {
			if (kind === 'web-page') {
				const url = new URL(trimmed);
				if (url.protocol !== 'http:' && url.protocol !== 'https:') {
					throw new Error('Web sources must use http or https.');
				}
				onAdd({
					sourceId: stableAIGraphId('source', `web:${url.toString()}`),
					kind,
					title: title.trim() || url.hostname,
					locator: url.toString(),
					contentHash: null,
					capturedAt,
					freshness: 'unknown',
					active: true,
					metadata: {
						canonicalUrl: url.toString(),
						captureStatus: 'create-staged',
					},
				});
			} else if (kind === 'manual-text') {
				onAdd({
					sourceId: stableAIGraphId('source', `manual:${trimmed}`),
					kind,
					title: title.trim() || 'Pasted text',
					locator: `manual://${stableAIGraphId('text', trimmed)}`,
					contentHash: null,
					capturedAt,
					freshness: 'current',
					active: true,
					metadata: { content: trimmed },
				});
			} else {
				if (!versionId.trim()) throw new Error('Enter an immutable graph version id.');
				const locator = `aigraph://${trimmed}/${versionId.trim()}`;
				onAdd({
					sourceId: stableAIGraphId('source', locator),
					kind,
					title: title.trim() || `${trimmed} · ${versionId.trim()}`,
					locator,
					contentHash: null,
					capturedAt,
					freshness: 'unknown',
					active: true,
					metadata: {
						graphId: trimmed,
						versionId: versionId.trim(),
					},
				});
			}
			setTitle('');
			setValue('');
			setVersionId('');
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	};
	return (
		<details className="pk-ai-graph-create-sources">
			<summary>
				Initial sources · {selectedVaultPaths.length + sources.length}
			</summary>
			{selectedVaultPaths.map((path) => (
				<span key={path}>
					<strong>{path}</strong>
					<small>Vault file · supplied by the opening surface</small>
				</span>
			))}
			{sources.map((source) => (
				<span key={source.sourceId}>
					<span>
						<strong>{source.title}</strong>
						<small>{source.kind}</small>
					</span>
					<Button
						variant="ghost"
						geometry="action-icon"
						type="button"
						aria-label={`Remove staged source ${source.title}`}
						title={`Remove staged source ${source.title}`}
						onClick={() => onRemove(source.sourceId)}
					>
						<X aria-hidden />
					</Button>
				</span>
			))}
			<div className="pk-ai-graph-create-source-form">
				<select
					aria-label="Initial source kind"
					value={kind}
					onChange={(event) => setKind(event.target.value as typeof kind)}
				>
					<option value="manual-text">Pasted text</option>
					<option value="web-page">Web URL</option>
					<option value="ai-graph-version">Existing graph version</option>
				</select>
				<input
					aria-label="Initial source title"
					placeholder="Optional source title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
				/>
				{kind === 'manual-text' ? (
					<textarea
						aria-label="Initial pasted text"
						placeholder="Paste source text"
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
				) : (
					<input
						aria-label={kind === 'web-page' ? 'Initial source URL' : 'Initial graph id'}
						placeholder={kind === 'web-page' ? 'https://…' : 'Graph id'}
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
				)}
				{kind === 'ai-graph-version' && (
					<input
						aria-label="Initial graph version id"
						placeholder="Version id"
						value={versionId}
						onChange={(event) => setVersionId(event.target.value)}
					/>
				)}
				<Button
					variant="ghost"
					type="button"
					disabled={!value.trim() || (kind === 'ai-graph-version' && !versionId.trim())}
					onClick={stage}
				>
					Stage source
				</Button>
			</div>
		</details>
	);
}

function AIGraphHistoryPanel(): React.ReactElement {
	const host = useQuickSearchHost();
	const deepLinkId = useSharedStore((state) => state.aiGraphDeepLinkId);
	const deepLinkVersionId = useSharedStore((state) => state.aiGraphDeepLinkVersionId);
	const [rows, setRows] = useState<AIGraphHistoryRow[]>([]);
	const [selected, setSelected] = useState<AIGraphArtifactView | null>(null);
	const [loading, setLoading] = useState(true);
	const listRef = useRef<HTMLDivElement | null>(null);
	const listScrollTopRef = useRef(0);
	const refresh = async (): Promise<void> => {
		setLoading(true);
		try {
			setRows(await host.listAIGraphArtifacts());
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		void refresh();
	}, []);
	useEffect(() => {
		if (!deepLinkId) return;
		useSharedStore.getState().consumeAIGraphDeepLink();
		void host.openAIGraphArtifact(deepLinkId, deepLinkVersionId ?? undefined).then((view) => {
			if (view) setSelected(view);
		});
	}, [deepLinkId, deepLinkVersionId, host]);
	useEffect(() => {
		if (selected) return;
		const frame = requestAnimationFrame(() => {
			if (listRef.current) listRef.current.scrollTop = listScrollTopRef.current;
		});
		return () => cancelAnimationFrame(frame);
	}, [selected]);
	if (selected) {
		return (
			<AIGraphDetail
				initialView={selected}
				onBack={() => {
					setSelected(null);
					void refresh();
				}}
			/>
		);
	}
	return (
		<section className="pk-ai-graph-history">
			<div className="pk-ai-graph-history-head">
				<span>
					<strong>AI Graphs</strong>
					<small>{rows.length} persisted artifacts</small>
				</span>
				{loading && <span>Loading…</span>}
			</div>
			{!loading && rows.length === 0 && (
				<div className="pk-ai-graph-empty">
					<Network />
					<strong>No AI Graphs yet</strong>
					<span>Describe a graph above. Successful generation saves an immutable artifact automatically.</span>
				</div>
			)}
			<div
				ref={listRef}
				className="pk-ai-graph-history-list"
				role="listbox"
				aria-label="AI Graph history"
				onScroll={(event) => {
					listScrollTopRef.current = event.currentTarget.scrollTop;
				}}
			>
				{rows.map((row) => (
					<Button
						key={row.graphId}
						variant="ghost"
						type="button"
						role="option"
						className="pk-ai-graph-history-row"
						onClick={() => {
							void host.openAIGraphArtifact(row.graphId).then((view) => {
								if (view) setSelected(view);
							});
						}}
					>
						<span className="pk-ai-graph-history-title">{row.title}</span>
						<span className="pk-ai-graph-history-meta">
							{row.stats.nodeCount} nodes · {row.stats.relationCount} relations · {row.stats.sourceCount} sources · v{row.versionNumber}
						</span>
						<span className="pk-ai-graph-history-origin">
							Created in {row.createdFrom.surface} · {row.createdFrom.contextRefs[0]?.label ?? 'No context'}
						</span>
						<span className="pk-ai-graph-history-badges">
							{row.stats.needsReviewCount > 0 && <em>{row.stats.needsReviewCount} needs review</em>}
							{row.changedSourceCount > 0 && <em>{row.changedSourceCount} source changed</em>}
							<time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(row.updatedAt)}</time>
						</span>
					</Button>
				))}
			</div>
		</section>
	);
}

function canonicalGraphData(view: AIGraphArtifactView): LensGraphData {
	const nodeById = new Map(view.version.nodes.map((node) => [node.nodeId, node]));
	return {
		nodes: view.version.nodes
			.filter((node) => node.reviewStatus !== 'rejected')
			.map((node) => ({
				label: node.label,
				path: node.canonicalRef?.replace(/^vault:\/\//, '') ?? node.nodeId,
				summary: node.description,
				role: node.kind === 'claim' ? 'bridge' : 'leaf',
			})),
		edges: view.version.relations
			.filter((relation) => relation.reviewStatus !== 'rejected')
				.map((relation) => ({
				source: nodeById.get(relation.sourceNodeId)?.canonicalRef?.replace(/^vault:\/\//, '')
					?? relation.sourceNodeId,
				target: nodeById.get(relation.targetNodeId)?.canonicalRef?.replace(/^vault:\/\//, '')
					?? relation.targetNodeId,
					kind: relation.family === 'temporal'
						? 'temporal'
						: relation.family === 'causal'
							? 'derives'
							: relation.family === 'taxonomic'
								? 'builds_on'
								: relation.family === 'structural'
									? 'link'
									: 'references',
				label: relation.label,
				directionality: relation.directed ? 'directed' : 'undirected',
				canonicalRelationId: relation.relationId,
				accessibleLabel: `${nodeById.get(relation.sourceNodeId)?.label ?? relation.sourceNodeId} → ${relation.predicate} → ${nodeById.get(relation.targetNodeId)?.label ?? relation.targetNodeId}`,
				reviewStatus: relation.reviewStatus,
				confidence: relation.confidence,
					evidenceCount: relation.evidenceIds.length,
					predicate: relation.predicate,
					relationFamily: relation.family,
					qualifiers: relation.qualifiers,
				})),
		availableLenses: ['topology', 'thinking-tree', 'timeline'],
	};
}

function AIGraphDetail({
	initialView,
	onBack,
}: {
	initialView: AIGraphArtifactView;
	onBack(): void;
}): React.ReactElement {
	const host = useQuickSearchHost();
	const [view, setView] = useState(initialView);
	const [versions, setVersions] = useState<AIGraphVersion[]>([]);
	const [instruction, setInstruction] = useState('');
	const [diff, setDiff] = useState<AIGraphSemanticDiff | null>(null);
	const [comparison, setComparison] = useState<AIGraphVersionComparison | null>(null);
	const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
	const [error, setError] = useState<string | null>(null);
	const [sourceKind, setSourceKind] = useState<'web-page' | 'manual-text' | 'ai-graph-version'>('web-page');
	const [sourceTitle, setSourceTitle] = useState('');
	const [sourceValue, setSourceValue] = useState('');
	const [sourceVersion, setSourceVersion] = useState('');
	const [selection, setSelection] = useState<
		| { kind: 'node'; nodeId: string }
		| { kind: 'relation'; relationId: string }
		| null
	>(null);
	const changeCount = diff
		? diff.nodes.added.length + diff.nodes.changed.length + diff.nodes.removed.length
			+ diff.relations.added.length + diff.relations.changed.length + diff.relations.removed.length
			+ diff.evidence.added.length + diff.evidence.removed.length
		: 0;
	const isHeadVersion = view.version.versionId === view.manifest.headVersionId;
	const activeSources = view.sources.filter(isActiveAIGraphSource);
	const inactiveSources = view.sources.filter((source) => !isActiveAIGraphSource(source));
	const changedSources = activeSources.filter((source) =>
		source.freshness === 'changed' || source.freshness === 'unavailable');
	useEffect(() => {
		void host.listAIGraphVersions(view.manifest.graphId).then(setVersions);
	}, [host, view.manifest.graphId, view.version.versionId]);
	const propose = async (): Promise<void> => {
		if (!isHeadVersion) {
			setStatus('error');
			setError('Open the current head version before updating this graph.');
			return;
		}
		setStatus('submitting');
		setError(null);
		try {
			setDiff(await host.proposeAIGraphUpdate(
				view.manifest.graphId,
				view.version.versionId,
				instruction,
				selection
					? { kind: selection.kind, id: selection.kind === 'node' ? selection.nodeId : selection.relationId }
					: undefined,
			));
			setStatus('idle');
		} catch (nextError) {
			setStatus('error');
			setError(nextError instanceof Error ? nextError.message : String(nextError));
		}
	};
	const addSource = async (): Promise<void> => {
		setError(null);
		try {
			let updated: AIGraphArtifactView;
			if (sourceKind === 'web-page') {
				updated = await host.addAIGraphSource(view.manifest.graphId, {
					kind: 'web-page',
					title: sourceTitle,
					url: sourceValue,
				});
			} else if (sourceKind === 'manual-text') {
				updated = await host.addAIGraphSource(view.manifest.graphId, {
					kind: 'manual-text',
					title: sourceTitle,
					text: sourceValue,
				});
			} else {
				updated = await host.addAIGraphSource(view.manifest.graphId, {
					kind: 'ai-graph-version',
					title: sourceTitle,
					graphId: sourceValue,
					versionId: sourceVersion,
				});
			}
			setView(updated);
			setSourceTitle('');
			setSourceValue('');
			setSourceVersion('');
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : String(nextError));
		}
	};
	return (
		<section className="pk-ai-graph-detail">
			<div className="pk-ai-graph-detail-head">
				<Button variant="ghost" onClick={onBack}>Back</Button>
				<span>
					<strong>{view.manifest.title}</strong>
					<small>{view.manifest.graphType} · {view.version.versionId}</small>
				</span>
				<span>{view.version.stats.needsReviewCount} needs review</span>
				<Button
					variant="ghost"
					type="button"
					onClick={() => {
						void host.exportAIGraphMarkdown(
							view.manifest.graphId,
							view.version.versionId,
						).then((markdown) => navigator.clipboard.writeText(markdown));
					}}
				>
					Copy Markdown export
				</Button>
			</div>
			<div className="pk-ai-graph-origin">
				<strong>Creation origin</strong>
				<span>Created in {view.manifest.createdFrom.surface}</span>
				{view.manifest.createdFrom.contextRefs.map((contextRef) => (
					<Button
						key={`${contextRef.kind}:${contextRef.ref}`}
						variant="ghost"
						type="button"
						onClick={() => void host.openAIGraphOrigin(contextRef)}
					>
						{contextRef.label}
					</Button>
				))}
				{view.version.updateProvenance && (
					<span>
						This version updated in {view.version.updateProvenance.surface}
						<small>
							base {view.version.updateProvenance.baseVersionId}
							{view.version.updateProvenance.runId
								? ` · run ${view.version.updateProvenance.runId}`
								: ''}
						</small>
					</span>
				)}
			</div>
			<AIInstructionComposer
				surface="ai-graph"
				capabilityId="ai-graph.update"
				value={instruction}
				onValueChange={setInstruction}
				onSubmit={propose}
				status={status}
				placeholder="Describe how this graph should change…"
				context={[
					{
						id: view.manifest.graphId,
						kind: 'artifact',
						label: `${view.manifest.title} · ${view.version.versionId}`,
						source: 'automatic',
					},
					...activeSources.slice(0, 3).map((source) => ({
						id: source.sourceId,
						kind: 'custom' as const,
						label: source.title,
						source: 'automatic' as const,
					})),
					...(selection ? [{
						id: selection.kind === 'node' ? selection.nodeId : selection.relationId,
						kind: 'custom' as const,
						label: `Selected ${selection.kind}`,
						source: 'automatic' as const,
					}] : []),
				]}
				compact
			/>
			{error && <div className="pk-ai-graph-update-error" role="alert">{error}</div>}
			{!isHeadVersion && (
				<div className="pk-ai-graph-update-error" role="status">
					You are inspecting an immutable historical version. Open the head version to update.
				</div>
			)}
			{diff && (
				<div className="pk-ai-graph-diff">
					<span>
						<strong>Semantic diff</strong>
						<small>
							+{diff.nodes.added.length} / ~{diff.nodes.changed.length} / −{diff.nodes.removed.length} nodes ·
							+{diff.relations.added.length} / ~{diff.relations.changed.length} / −{diff.relations.removed.length} relations
						</small>
					</span>
					<AIGraphDiffBreakdown diff={diff} />
					<Button variant="ghost" onClick={() => setDiff(null)}>Cancel</Button>
					<Button
						variant="default"
						disabled={changeCount === 0}
						onClick={() => {
							void host.acceptAIGraphUpdate(diff).then((accepted) => {
								setView(accepted);
								setDiff(null);
								setInstruction('');
							});
						}}
					>
						Accept new version
					</Button>
				</div>
			)}
			<div className="pk-ai-graph-detail-body">
				<div className="pk-ai-graph-canvas">
					<MultiLensGraph
						graphData={canonicalGraphData(view)}
						defaultLens="topology"
						showControls
						className="pktw-h-full"
						onNodeClick={(path) => {
							const node = view.version.nodes.find((candidate) =>
								(candidate.canonicalRef?.replace(/^vault:\/\//, '') ?? candidate.nodeId) === path);
							if (node) setSelection({ kind: 'node', nodeId: node.nodeId });
						}}
						onEdgeClick={(edge) => {
							if (edge.relationId) {
								setSelection({ kind: 'relation', relationId: edge.relationId });
							}
						}}
					/>
				</div>
					<aside className="pk-ai-graph-detail-aside">
							<AIGraphSelectionInspector
								view={view}
								selection={selection}
								onViewChange={(next) => {
									setView(next);
									setSelection(null);
									setDiff(null);
								}}
								onError={setError}
							/>
						<strong>Versions</strong>
						{versions.map((version, index) => (
							<div
								key={version.versionId}
								className="pk-ai-graph-version-row"
								aria-current={version.versionId === view.version.versionId ? 'true' : undefined}
							>
								<Button
									variant="ghost"
									type="button"
									onClick={() => {
										void host.openAIGraphArtifact(
											view.manifest.graphId,
											version.versionId,
										).then((historical) => {
											if (historical) {
												setView(historical);
												setDiff(null);
												setSelection(null);
												setComparison(null);
											}
										});
									}}
								>
									v{versions.length - index} · {version.changeKind}
									<small>
										{version.versionId === view.manifest.headVersionId ? 'head' : 'immutable'}
									</small>
								</Button>
								<Button
									variant="ghost"
									type="button"
									aria-label={`Compare version ${version.versionId} with head`}
									onClick={() => {
										void host.compareAIGraphVersions(
											view.manifest.graphId,
											version.versionId,
											view.manifest.headVersionId,
										).then(setComparison);
									}}
								>
									Compare
								</Button>
								{version.versionId !== view.manifest.headVersionId && (
									<Button
										variant="ghost"
										type="button"
										aria-label={`Restore version ${version.versionId} as new head`}
										onClick={() => {
											void host.restoreAIGraphVersion(
												view.manifest.graphId,
												version.versionId,
											).then((restored) => {
												setView(restored);
												setComparison(null);
											});
										}}
									>
										Restore
									</Button>
								)}
								<Button
									variant="ghost"
									type="button"
									aria-label={`Duplicate version ${version.versionId}`}
									onClick={() => {
										void host.duplicateAIGraphVersion(
											view.manifest.graphId,
											version.versionId,
										).then((duplicate) => setView(duplicate));
									}}
								>
									Duplicate
								</Button>
							</div>
						))}
						{comparison && <AIGraphVersionComparisonSummary comparison={comparison} />}
						<strong>Sources</strong>
						<span>
							Source changes are staged here only. They do not run AI or create a version.
						</span>
						<Button
						variant="ghost"
						type="button"
						onClick={() => {
							setError(null);
							void host.addActiveFileToAIGraphSources(view.manifest.graphId)
								.then(setView)
								.catch((nextError) => setError(
									nextError instanceof Error ? nextError.message : String(nextError),
								));
						}}
						>
							Add current Vault file
						</Button>
						<div className="pk-ai-graph-source-add">
							<select
								aria-label="Source kind"
								value={sourceKind}
								onChange={(event) => setSourceKind(
									event.target.value as typeof sourceKind,
								)}
							>
								<option value="web-page">Web URL</option>
								<option value="manual-text">Pasted text</option>
								<option value="ai-graph-version">Existing graph version</option>
							</select>
							<input
								aria-label="Source title"
								value={sourceTitle}
								placeholder="Source title"
								onChange={(event) => setSourceTitle(event.target.value)}
							/>
							{sourceKind === 'manual-text' ? (
								<textarea
									aria-label="Pasted source text"
									value={sourceValue}
									placeholder="Paste source text"
									onChange={(event) => setSourceValue(event.target.value)}
								/>
							) : (
								<input
									aria-label={sourceKind === 'web-page' ? 'Source URL' : 'Source graph id'}
									value={sourceValue}
									placeholder={sourceKind === 'web-page' ? 'https://…' : 'Graph id'}
									onChange={(event) => setSourceValue(event.target.value)}
								/>
							)}
							{sourceKind === 'ai-graph-version' && (
								<input
									aria-label="Source graph version id"
									value={sourceVersion}
									placeholder="Version id"
									onChange={(event) => setSourceVersion(event.target.value)}
								/>
							)}
							<Button
								variant="ghost"
								type="button"
								disabled={!sourceValue.trim() || (
									sourceKind === 'ai-graph-version' && !sourceVersion.trim()
								)}
								onClick={() => void addSource()}
							>
								Add source
							</Button>
						</div>
						{activeSources.map((source) => (
							<span
								key={source.sourceId}
								className="pk-ai-graph-source-row"
								data-freshness={source.freshness}
							>
								<span>{source.title}<small>{source.freshness}</small></span>
								<Button
									variant="ghost"
									type="button"
									aria-label={`Check source ${source.title}`}
									onClick={() => {
										void host.recheckAIGraphSource(
											view.manifest.graphId,
											source.sourceId,
										).then(setView);
									}}
								>
									Check
								</Button>
								<Button
								variant="ghost"
								type="button"
								aria-label={`Remove source ${source.title}`}
								onClick={() => {
									void host.removeAIGraphSource(
										view.manifest.graphId,
										source.sourceId,
									).then(setView);
								}}
							>
								Remove
							</Button>
							</span>
						))}
						{inactiveSources.length > 0 && (
							<span>
								{inactiveSources.length} removed source record
								{inactiveSources.length === 1 ? '' : 's'} retained for immutable history
							</span>
						)}
					{changedSources.length > 0 && (
						<Button
							variant="ghost"
							type="button"
							onClick={() => setInstruction(
								`Use source changes in Update graph: ${changedSources.map((source) => source.title).join(', ')}`,
							)}
						>
							Use source changes in Update graph
						</Button>
					)}
						<strong>Evidence & review</strong>
						<span>{view.version.evidence.length} evidence records</span>
						<span>{view.version.stats.needsReviewCount} suggested items</span>
						<AIGraphEvidenceList
							view={view}
							evidenceIds={view.version.evidence.map((item) => item.evidenceId)}
						/>
					</aside>
			</div>
		</section>
	);
}

function AIGraphDiffBreakdown({
	diff,
}: {
	diff: AIGraphSemanticDiff;
}): React.ReactElement {
	const groups = [
		{
			label: 'Nodes',
			items: [
				...diff.nodes.added.map((item) => `Added ${item.label}`),
				...diff.nodes.changed.map((item) => `Changed ${item.before.label} → ${item.after.label}`),
				...diff.nodes.removed.map((item) => `Removed ${item.label}`),
			],
		},
		{
			label: 'Relations',
			items: [
				...diff.relations.added.map((item) => `Added ${item.predicate}`),
				...diff.relations.changed.map((item) => `Changed ${item.before.predicate} → ${item.after.predicate}`),
				...diff.relations.removed.map((item) => `Removed ${item.predicate}`),
			],
		},
		{
			label: 'Evidence',
			items: [
				...diff.evidence.added.map((item) => `Added ${item.evidenceId}`),
				...diff.evidence.removed.map((item) => `Removed ${item.evidenceId}`),
			],
		},
	];
	return (
		<div className="pk-ai-graph-diff-breakdown">
			{groups.map((group) => (
				<span key={group.label}>
					<strong>{group.label}</strong>
					{group.items.length === 0
						? <small>No changes</small>
						: group.items.map((item) => <small key={item}>{item}</small>)}
				</span>
			))}
		</div>
	);
}

function AIGraphVersionComparisonSummary({
	comparison,
}: {
	comparison: AIGraphVersionComparison;
}): React.ReactElement {
	return (
		<div className="pk-ai-graph-version-comparison" role="status">
			<strong>Version comparison</strong>
			<span>{comparison.fromVersionId} → {comparison.toVersionId}</span>
			<small>
				Nodes +{comparison.nodes.added.length} / ~{comparison.nodes.changed.length}
				/ −{comparison.nodes.removed.length}
			</small>
			<small>
				Relations +{comparison.relations.added.length}
				/ ~{comparison.relations.changed.length}
				/ −{comparison.relations.removed.length}
			</small>
			<small>
				Evidence +{comparison.evidence.added.length}
				/ −{comparison.evidence.removed.length}
			</small>
		</div>
	);
}

function AIGraphEvidenceList({
	view,
	evidenceIds,
}: {
	view: AIGraphArtifactView;
	evidenceIds: readonly string[];
}): React.ReactElement {
	const host = useQuickSearchHost();
	const evidenceById = new Map(view.version.evidence.map((item) => [item.evidenceId, item]));
	const sourceById = new Map(view.sources.map((item) => [item.sourceId, item]));
	const records = evidenceIds.flatMap((evidenceId) => {
		const evidence = evidenceById.get(evidenceId);
		if (!evidence) return [];
		return [{ evidence, source: sourceById.get(evidence.sourceId) }];
	});
	if (records.length === 0) {
		return <span className="pk-ai-graph-evidence-empty">No linked evidence.</span>;
	}
	return (
		<div className="pk-ai-graph-evidence-list">
			{records.map(({ evidence, source }) => (
				<span key={evidence.evidenceId} className="pk-ai-graph-evidence-row">
					<span>
						<strong>{source?.title ?? evidence.sourceId}</strong>
						<small>
							{evidence.selector.kind} · captured{' '}
							{new Intl.DateTimeFormat(undefined, {
								dateStyle: 'medium',
								timeStyle: 'short',
							}).format(evidence.capturedAt)}
						</small>
					</span>
					{evidence.quote && <small>{evidence.quote}</small>}
					<Button
						variant="ghost"
						type="button"
						disabled={!source}
						onClick={() => {
							void host.openAIGraphEvidence(
								view.manifest.graphId,
								view.version.versionId,
								evidence.evidenceId,
							);
						}}
					>
						Open evidence
					</Button>
				</span>
			))}
		</div>
	);
}

function AIGraphSelectionInspector({
	view,
	selection,
	onViewChange,
	onError,
}: {
	view: AIGraphArtifactView;
	selection:
		| { kind: 'node'; nodeId: string }
		| { kind: 'relation'; relationId: string }
		| null;
	onViewChange(view: AIGraphArtifactView): void;
	onError(error: string | null): void;
}): React.ReactElement {
	const host = useQuickSearchHost();
	const selectedRelation = selection?.kind === 'relation'
		? view.version.relations.find((candidate) => candidate.relationId === selection.relationId)
		: undefined;
	const [predicate, setPredicate] = useState('');
	const [label, setLabel] = useState('');
	const [confidence, setConfidence] = useState('');
	const [directed, setDirected] = useState(false);
	const [reviewing, setReviewing] = useState(false);
	useEffect(() => {
		setPredicate(selectedRelation?.predicate ?? '');
		setLabel(selectedRelation?.label ?? '');
		setConfidence(selectedRelation?.confidence === null || selectedRelation?.confidence === undefined
			? ''
			: String(selectedRelation.confidence));
		setDirected(selectedRelation?.directed ?? false);
	}, [selectedRelation?.relationId, view.version.versionId]);
	const reviewRelation = async (
		status: 'accepted' | 'edited' | 'rejected',
	): Promise<void> => {
		if (!selectedRelation || reviewing) return;
		setReviewing(true);
		onError(null);
		try {
			const parsedConfidence = confidence.trim() === ''
				? null
				: Number(confidence);
			if (
				parsedConfidence !== null
				&& (!Number.isFinite(parsedConfidence)
					|| parsedConfidence < 0
					|| parsedConfidence > 1)
			) {
				throw new Error('Confidence must be a number between 0 and 1.');
			}
			onViewChange(await host.reviewAIGraphRelation(
				view.manifest.graphId,
				view.version.versionId,
				selectedRelation.relationId,
				{
					status,
					...(status === 'edited'
						? {
							predicate,
							label,
							confidence: parsedConfidence,
							directed,
						}
						: {}),
				},
			));
		} catch (nextError) {
			onError(nextError instanceof Error ? nextError.message : String(nextError));
		} finally {
			setReviewing(false);
		}
	};
	if (!selection) {
		return (
			<>
				<strong>Selection</strong>
				<span>Select a node or relation to inspect its evidence and review state.</span>
			</>
		);
	}
	if (selection.kind === 'node') {
		const node = view.version.nodes.find((candidate) => candidate.nodeId === selection.nodeId);
		if (!node) return <span>Selected node is unavailable in this version.</span>;
		return (
			<>
				<strong>{node.label}</strong>
					<span>{node.kind}<small>{node.reviewStatus}</small></span>
					{node.description && <span>{node.description}</span>}
					<span>{node.evidenceIds.length} evidence record{node.evidenceIds.length === 1 ? '' : 's'}</span>
					<AIGraphEvidenceList view={view} evidenceIds={node.evidenceIds} />
				</>
		);
	}
	const relation = selectedRelation;
	if (!relation) return <span>Selected relation is unavailable in this version.</span>;
	const source = view.version.nodes.find((node) => node.nodeId === relation.sourceNodeId);
	const target = view.version.nodes.find((node) => node.nodeId === relation.targetNodeId);
	return (
		<>
			<strong>Relation</strong>
			<span className="pk-ai-graph-relation-readable">
				{source?.label ?? relation.sourceNodeId} → {relation.predicate} → {target?.label ?? relation.targetNodeId}
			</span>
			<span>
				{relation.family} · {relation.directed ? 'directed' : 'symmetric'}
				<small>{relation.reviewStatus} · confidence {relation.confidence ?? 'unknown'}</small>
			</span>
			{relation.qualifiers.map((qualifier) => (
				<span key={`${qualifier.key}:${String(qualifier.value)}`}>
					{qualifier.key}<small>{String(qualifier.value)}</small>
				</span>
			))}
			<span>{relation.evidenceIds.length} evidence record{relation.evidenceIds.length === 1 ? '' : 's'}</span>
			<AIGraphEvidenceList view={view} evidenceIds={relation.evidenceIds} />
			{relation.explanation && <span>{relation.explanation}</span>}
			{view.version.versionId === view.manifest.headVersionId && (
				<div className="pk-ai-graph-relation-review">
					<strong>Review relation</strong>
					<input
						aria-label="Relation predicate"
						value={predicate}
						onChange={(event) => setPredicate(event.target.value)}
					/>
					<input
						aria-label="Relation label"
						value={label}
						onChange={(event) => setLabel(event.target.value)}
					/>
					<input
						aria-label="Relation confidence"
						inputMode="decimal"
						value={confidence}
						placeholder="Confidence 0–1"
						onChange={(event) => setConfidence(event.target.value)}
					/>
					<label>
						<input
							type="checkbox"
							checked={directed}
							onChange={(event) => setDirected(event.target.checked)}
						/>
						Directed
					</label>
					<span>
						<Button
							variant="ghost"
							type="button"
							disabled={reviewing}
							onClick={() => void reviewRelation('accepted')}
						>
							Accept
						</Button>
						<Button
							variant="ghost"
							type="button"
							disabled={reviewing || !predicate.trim() || !label.trim()}
							onClick={() => void reviewRelation('edited')}
						>
							Save edit
						</Button>
						<Button
							variant="ghost"
							type="button"
							disabled={reviewing}
							onClick={() => void reviewRelation('rejected')}
						>
							Reject
						</Button>
					</span>
					<small>Review creates a new immutable semantic version.</small>
				</div>
			)}
		</>
	);
}

/**
 * Compound Suggest control — main click opens a fresh Suggest round, hover
 * reveals a dropdown of recent stored rounds so the user can replay any
 * candidate list from a past click without spending tokens again.
 *
 * 300ms open delay + 150ms close delay so cursor transit between button and
 * popover doesn't dismiss the menu mid-motion. Popover suppresses itself
 * when the history is empty rather than showing an empty state — no need to
 * teach users about a feature that has nothing to show yet.
 */
const SuggestButton: React.FC<{
	onOpen: () => void;
	onReplay?: (entryId: string) => void;
}> = ({ onOpen, onReplay }) => {
	const [popoverOpen, setPopoverOpen] = React.useState(false);
	const [entries, setEntries] = React.useState<SuggestHistoryEntry[]>(() => suggestHistoryStore.list());
	const openTimerRef = React.useRef<number | null>(null);
	const closeTimerRef = React.useRef<number | null>(null);

	React.useEffect(() => {
		const unsub = suggestHistoryStore.subscribe(() => setEntries([...suggestHistoryStore.list()]));
		return () => {
			unsub();
			if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
			if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
		};
	}, []);

	const scheduleOpen = () => {
		if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
		if (openTimerRef.current) return;
		openTimerRef.current = window.setTimeout(() => {
			openTimerRef.current = null;
			setPopoverOpen(true);
		}, 300);
	};
	const scheduleClose = () => {
		if (openTimerRef.current) { window.clearTimeout(openTimerRef.current); openTimerRef.current = null; }
		if (closeTimerRef.current) return;
		closeTimerRef.current = window.setTimeout(() => {
			closeTimerRef.current = null;
			setPopoverOpen(false);
		}, 150);
	};

	const showPopover = popoverOpen && entries.length > 0 && !!onReplay;

	return (
		<div className="pktw-relative pktw-flex-shrink-0" onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose}>
			<button
				type="button"
				onClick={onOpen}
				aria-label="AI suggests queries based on your browsing"
				title="AI suggests queries based on your actions — hover for recent"
				className={cn(
					'pktw-inline-flex pktw-items-center pktw-gap-1.5',
					'pktw-text-pk-sm pktw-font-medium pktw-whitespace-nowrap',
					'pktw-rounded-full pktw-border pktw-px-2.5 pktw-py-1',
					'pktw-bg-pk-background pktw-text-pk-accent pktw-border-pk-accent-tint hover:pktw-bg-pk-accent-tint',
					'pktw-transition-colors pktw-cursor-pointer',
				)}
			>
				<Sparkles className="pktw-w-3 pktw-h-3" />
				Refine
			</button>
			{showPopover && (
				<div
					className={cn(
						'pktw-absolute pktw-top-full pktw-right-0 pktw-mt-1 pktw-z-50',
						'pktw-w-[320px] pktw-max-h-[320px] pktw-overflow-y-auto',
						'pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-shadow-lg',
						'pktw-py-1',
					)}
					role="menu"
				>
					<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-text-[10.5px] pktw-font-semibold pktw-text-pk-foreground-muted pktw-uppercase pktw-tracking-wide">
						<Clock className="pktw-w-3 pktw-h-3" />
						Recent Refine ({entries.length})
					</div>
					{entries.slice(0, 20).map((e) => (
						<button
							key={e.id}
							type="button"
							role="menuitem"
							onClick={() => {
								setPopoverOpen(false);
								onReplay?.(e.id);
							}}
							className={cn(
								'pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5',
								'hover:pktw-bg-pk-surface-sunken pktw-transition-colors',
								'pktw-flex pktw-flex-col pktw-gap-0.5',
							)}
						>
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-pk-base pktw-text-pk-foreground pktw-truncate">
								<span className="pktw-truncate">
									{e.currentQuery.trim() || <span className="pktw-italic pktw-text-pk-foreground-muted">(empty query)</span>}
								</span>
							</div>
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-[10.5px] pktw-text-pk-foreground-muted">
								<span>{formatRelativeTime(e.savedAt)}</span>
								<span>·</span>
								<span>{e.candidates.length} suggest{e.candidates.length === 1 ? '' : 's'}</span>
								{e.fromFallback && (
									<>
										<span>·</span>
										<span className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-text-pk-warning">
											<AlertTriangle className="pktw-w-2.5 pktw-h-2.5" />
											fallback
										</span>
									</>
								)}
								{e.pickedIndex != null && (
									<>
										<span>·</span>
										<span className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-text-pk-success">
											<CheckCircle2 className="pktw-w-2.5 pktw-h-2.5" />
											picked
										</span>
									</>
								)}
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
};

function formatRelativeTime(t: number): string {
	const diff = Date.now() - t;
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	return new Date(t).toLocaleDateString();
}

interface VaultTabContentProps {
	onClose?: () => void;
	activeTab: TabType;
	setActiveTab: (tab: TabType) => void;
	/** Open the AI Query Rewrite (Suggest) overlay — wired through by the modal wrapper. */
	onOpenSuggest?: () => void;
	/** Open the Suggest modal in replay mode for a stored history entry. */
	onReplaySuggest?: (entryId: string) => void;
}

/** Returns search query string for the given mode (prefix # / ? or none). */
function transformQueryForMode(raw: string, toMode: QuickSearchMode): string {
	const trimmed = raw.trimStart();
	// Strip existing mode prefix (#, ?).
	const withoutPrefix = trimmed.replace(/^\s*[#?]\s*/, '') || '';
	if (toMode === 'all') return withoutPrefix;
	if (toMode === 'heading') return trimmed.startsWith('#') ? raw : `# ${withoutPrefix}`;
	return raw;
}

/**
 * Vault Search tab: input row (mode icon + input) + VaultSearchTab content.
 * Mode can be switched by clicking the icon or by typing # / : / @.
 */
const VaultTabContent: React.FC<VaultTabContentProps> = ({ onClose, activeTab, setActiveTab, onOpenSuggest, onReplaySuggest }) => {
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { vaultStats, vaultNavigation } = useServiceContext();
	const { vaultSearchQuery, setVaultSearchQuery, setSearchQuery } = useSharedStore();
	const { updateParsedQuery, isSearching, quickSearchMode, inspectorOpen, lastSearchDuration, lastSearchResults, resultView } = useVaultSearchStore();
	const hasSearchQuery = !!vaultSearchQuery.trim();
	const [inspectorPath, setInspectorPath] = useState<string | null>(null);
	const [navigateToPath, setNavigateToPath] = useState<string | null>(null);
	const openHubGraphSubview = useOpenHubGraphSubview();

	// Heading mode moved to Copilot Modal's Atlas tab — no `#` cycling here.

	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setActiveTab('ai');
			return;
		}
		// Alt+ArrowUp/Down previously cycled sub-modes; heading mode moved
		// to Copilot Modal's Atlas tab, so this shortcut is retired.
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			return;
		}
		if (e.key === 'ArrowRight' && !vaultSearchQuery) {
			e.preventDefault();
			useVaultSearchStore.getState().setInspectorOpen(true);
			return;
		}
		if (e.key === 'ArrowLeft' && useVaultSearchStore.getState().inspectorOpen) {
			e.preventDefault();
			useVaultSearchStore.getState().setInspectorOpen(false);
			return;
		}
		if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey) && inputRef.current) {
			e.preventDefault();
			e.stopPropagation();
			inputRef.current?.select?.();
			return;
		}
	};

	useEffect(() => {
		updateParsedQuery(vaultStats.activeFilePath(), vaultSearchQuery);
	}, [vaultStats, vaultSearchQuery, updateParsedQuery]);

	useEffect(() => {
		if (inputRef.current) inputRef.current.focus();
	}, []);

	return (
		<>
			{/* Input row */}
			<div className="pktw-flex-shrink-0 pktw-p-2 pktw-bg-pk-background pktw-border-b pktw-border-pk-border">
				<div className="pktw-flex pktw-gap-3 pktw-items-center">
					<div className="pktw-relative pktw-flex-1 pktw-min-w-0">
						<ResultBrowserSearchInput
							ref={inputRef}
							value={vaultSearchQuery}
							onChange={setVaultSearchQuery}
							onKeyDown={handleInputKeyDown}
							placeholder="Search your vault…"
						/>
					</div>
					<SuggestButton
						onOpen={() => {
							if (onOpenSuggest) onOpenSuggest();
							else setActiveTab('ai');
						}}
						onReplay={onReplaySuggest}
					/>
				</div>
			</div>

			{/* View toolbar row — heading mode moved to Copilot Modal's Atlas tab.
			    Left: 3-way ViewModeToggle (List / Tree view / Graph view).
			    Right: graph-only controls (presets + semantic) that appear
			    when Graph view is active. */}
			<div className="pktw-flex-shrink-0 pktw-px-3 pktw-py-1.5 pktw-bg-pk-background pktw-border-b pktw-border-pk-border pktw-flex pktw-items-center pktw-gap-2.5">
				<ViewModeToggle />
				{resultView === 'graph' ? (
					<ResultPaneGraphControls mode={quickSearchMode} className="pktw-ml-auto" />
				) : (
					<div className="pktw-ml-auto pktw-flex pktw-items-center pktw-gap-2.5">
						<ResultDensityToggle />
					</div>
				)}
			</div>

			{/* Content area — side-by-side results + inspector */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-flex">
				{/* Results panel — always visible */}
				<div className={cn(
					'pktw-min-w-0 pktw-overflow-hidden',
					inspectorOpen ? 'pktw-flex-1' : 'pktw-w-full',
				)}>
					<VaultSearchTab
						onClose={onClose}
						onSelectForInspector={(path) => setInspectorPath(path)}
						navigateToPath={navigateToPath}
					/>
				</div>

				{/* Inspector side panel — 340px, conditional */}
				{inspectorOpen && !isMobile() && (
					<div className="pktw-w-[340px] pktw-flex-shrink-0 pktw-border-l pktw-border-pk-border pktw-overflow-hidden">
						<InspectorSidePanel
							currentPath={inspectorPath}
							searchQuery={vaultSearchQuery}
							onClose={() => useVaultSearchStore.getState().setInspectorOpen(false)}
							onOpenDocument={(path) => {
								// Open the doc but keep the Search modal open so the user can hop.
								void createOpenSourceCallback(undefined, true, vaultNavigation)(path);
							}}
							onInspectInPanel={(path) => {
								setInspectorPath(path);
								setNavigateToPath(path);
							}}
							onOpenHubLocalGraph={(path) => {
								void openHubGraphSubview(path);
							}}
							onFindRelated={(path) => {
								const title = path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
								setVaultSearchQuery(title);
								useVaultSearchStore.getState().setResultView('graph');
							}}
						/>
					</div>
				)}
			</div>

			{/* Footer — modal level, always visible */}
			<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2.5 pktw-bg-pk-surface-raised pktw-border-t pktw-border-pk-border pktw-flex pktw-items-center pktw-justify-between">
				<VaultSearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{hasSearchQuery && (
						isSearching ? (
							<span className="pktw-text-xs pktw-text-pk-text-tertiary">Searching...</span>
						) : (
							<>
								<span className="pktw-text-xs pktw-text-pk-text-tertiary">
									{lastSearchResults.length} result{lastSearchResults.length !== 1 ? 's' : ''}
								</span>
								{lastSearchDuration !== null && (
									<span className="pktw-text-xs pktw-text-pk-text-tertiary">
										• <strong className="pktw-text-pk-text-primary">{formatDuration(lastSearchDuration)}</strong>
									</span>
								)}
							</>
						)
					)}
				</div>
			</div>
		</>
	);
};

interface QuickSearchModalContentProps {
	onClose?: () => void;
	/** Optional Vault Intelligence context supplied by QuickSearchModal wrapper. */
	intelCtx?: DocumentContext | null;
	/** Fired when the user runs a vault-intelligence auto-run. */
	onVaultAuto?: (mode: 'fast' | 'complete') => void;
	/** Fired when the user opens a past vault review record. */
	onOpenVaultRecord?: (record: VaultReviewHistoryRecord) => void;
	/**
	 * Fired when the user clicks the ✦ Suggest button — the QuickSearchModal
	 * wrapper opens `AIQueryRewriteModal` (spec:
	 * `docs/research/2026-07-08-ai-query-rewrite/README.md`).
	 */
	onOpenSuggest?: () => void;
	/**
	 * Fired when the user clicks a row in the Suggest button's hover history
	 * dropdown — modal wrapper opens `AIQueryRewriteModal` in replay mode so
	 * the stored candidate list re-appears without another LLM call.
	 */
	onReplaySuggest?: (entryId: string) => void;
}

/** Root quick search: Vault Search plus one AI workspace selector. */
export const QuickSearchModalContent: React.FC<QuickSearchModalContentProps> = ({
	onClose,
	intelCtx = null,
	onVaultAuto,
	onOpenVaultRecord,
	onOpenSuggest,
	onReplaySuggest,
}) => {
	const {
		activeTab,
		setActiveTab,
		aiWorkspaceMode,
		setAIWorkspaceMode,
	} = useSharedStore();
	// Graph view claims all available modal height (list view stays
	// content-driven so short result sets don't leave empty space).
	const resultView = useVaultSearchStore((s) => s.resultView);
	const isGraph = activeTab === 'vault' && resultView === 'graph';
	const rootRef = React.useRef<HTMLDivElement | null>(null);

	// The Obsidian `Modal` wrapper (`.modal` ancestor) is set up in
	// `QuickSearchModal.onOpen()` with a content-driven height. To make
	// graph view fill the viewport, walk up to that ancestor and force
	// its inline height while the graph view is active; restore on exit
	// so list-mode sizing is untouched.
	React.useEffect(() => {
		if (!rootRef.current) return;
		const modalEl = rootRef.current.closest('.modal') as HTMLElement | null;
		if (!modalEl) return;
		if (isGraph) {
			modalEl.style.height = 'calc(100vh - 160px)';
		} else {
			modalEl.style.height = '';
		}
	}, [isGraph]);

	const modalStyle: React.CSSProperties = isGraph
		? { height: '100%', maxHeight: 'calc(100vh - 160px)' }
		: { maxHeight: 'calc(100vh - 160px)', minHeight: '400px' };

	return (
		<div
			ref={rootRef}
			className="pktw-w-full pktw-flex-1 pktw-min-h-0 pktw-bg-pk-background pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-overflow-hidden peak-no-native-outline"
			tabIndex={-1}
			style={modalStyle}
		>
			<div className="pktw-flex-shrink-0 pktw-relative pktw-flex pktw-border-b pktw-border-pk-border pktw-bg-pk-surface-raised pktw-min-h-[48px]">
				<TabButton
					tab="vault"
					label="Vault Search"
					activeTab={activeTab}
					onClick={() => setActiveTab('vault')}
					className="pktw-rounded-tl-lg"
				/>
				<AIWorkspaceSelector
					mode={aiWorkspaceMode}
					active={activeTab === 'ai'}
					onActivate={() => setActiveTab('ai')}
					onModeChange={setAIWorkspaceMode}
				/>
			</div>
			{activeTab === 'ai' ? (
				aiWorkspaceMode === 'vault-intelligence' ? (
					<CopilotPickerContent
						hideTabBar
						initialTab="vault"
						ctx={intelCtx}
						onSelect={() => { /* Vault actions dispatched separately */ }}
						onAuto={(_tab, mode) => onVaultAuto?.(mode)}
						onOpenHistoryRecord={() => { /* document-scope only; unused here */ }}
						onOpenAllHistory={() => { /* wired via Copilot Modal path */ }}
						onOpenVaultRecord={(record) => onOpenVaultRecord?.(record)}
						onClose={onClose}
					/>
				) : (
					<AITabContent onClose={onClose} mode={aiWorkspaceMode} />
				)
			) : (
				<VaultTabContent onClose={onClose} activeTab={activeTab} setActiveTab={setActiveTab} onOpenSuggest={onOpenSuggest} onReplaySuggest={onReplaySuggest} />
			)}
		</div>
	);
};
