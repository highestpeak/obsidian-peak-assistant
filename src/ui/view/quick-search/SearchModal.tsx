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
import { resolveAnalysisSnapshotFromVault } from '@/core/storage/vault/search-docs/AiAnalysisJsonStore';
import { RecentAnalysisList } from './components/RecentAnalysisList';
import { RecentQueriesDropdown } from './components/RecentQueriesDropdown';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { ResultPaneGraphControls, ResultDensityToggle, ViewModeToggle } from './components/ResultPaneHeader';

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
	activeTab: TabType;
	setActiveTab: (tab: TabType) => void;
}

/**
 * AI Analysis tab: input row (mode, web, Clear/Re-analyze/Cancel/Analyze) + AISearchTab content.
 */
export const PRESET_LABELS: Record<AnalysisMode, { short: string; full: string; placeholder: string }> = {
	vaultFull: { short: 'Vault Analysis', full: 'Vault Analysis · Deep analysis whole vault.', placeholder: 'Ask AI anything about your vault...' },
	aiGraph: { short: 'AI Graph', full: 'AI Graph · Build interactive knowledge graphs.', placeholder: 'Describe the knowledge graph you want to build...' },
};

const AITabContent: React.FC<AITabContentProps> = ({ onClose, activeTab, setActiveTab }) => {
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { eventBus } = useServiceContext();
	const host = useQuickSearchHost();
	const { searchQuery, setSearchQuery, recentQueries, clearRecentQueries } = useSharedStore();
	const webEnabled = useSearchSessionStore((s) => s.webEnabled);
	const toggleWeb = useSearchSessionStore((s) => s.toggleWeb);
	const sessionStatus = useSearchSessionStore((s) => s.status);
	const isInputFrozen = useSearchSessionStore((s) => s.isInputFrozen);
	const hasAnalyzed = useSearchSessionStore((s) => s.hasAnalyzed);
	const setAiModalOpen = useSearchSessionStore((s) => s.setAiModalOpen);
	const analysisMode = useSearchSessionStore((s) => s.analysisMode);
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

	const PRESETS: AnalysisMode[] = isMobile() ? ['vaultFull'] : ['vaultFull', 'aiGraph'];
	const cyclePreset = (dir: 1 | -1) => {
		const idx = PRESETS.indexOf(analysisMode);
		const next = PRESETS[(idx + dir + PRESETS.length) % PRESETS.length];
		setAnalysisMode(next);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setActiveTab('vault');
			return;
		}
		if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault();
			cyclePreset(e.key === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
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
		setAiModalOpen(true);
		return () => setAiModalOpen(false);
	}, [setAiModalOpen]);

	useEffect(() => {
		if (inputRef.current) inputRef.current.focus();
	}, []);

	const [suggestions, setSuggestions] = useState<MatchedSuggestion[]>([]);
	const [totalAnalysisCount, setTotalAnalysisCount] = useState(0);
	const [showModeMenu, setShowModeMenu] = useState(false);
	const modeBadgeRef = useRef<HTMLDivElement>(null);

	// Close dropdown on click outside
	useEffect(() => {
		if (!showModeMenu) return;
		const handler = (e: MouseEvent) => {
			if (modeBadgeRef.current?.contains(e.target as Node)) return;
			setShowModeMenu(false);
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [showModeMenu]);

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

		host.aiAnalysisHistory.count()
			.then(setTotalAnalysisCount).catch(() => {});
	}, []);

	return (
		<>
			<div className="pktw-flex-shrink-0 pktw-p-2 pktw-bg-pk-background pktw-border-b pktw-border-pk-border">
				<div className="pktw-flex pktw-gap-2 pktw-items-center">
					<div className="pktw-relative pktw-flex-1 pktw-min-w-0">
						<div className="pktw-relative pktw-flex pktw-items-center pktw-min-w-0">
							<CodeMirrorInput
								ref={inputRef}
								value={searchQuery}
								onChange={setSearchQuery}
								onKeyDown={handleInputKeyDown}
								onEnterSubmit={handleAnalyze}
								placeholder={PRESET_LABELS[analysisMode].placeholder}
								enableSearchTags={true}
								singleLine={true}
								disabled={isInputFrozen}
								containerClassName={`pktw-flex-1 pktw-min-w-0 ${analysisMode === 'aiGraph' ? 'pktw-pl-[105px]' : 'pktw-pl-[140px]'} pktw-pr-16 pktw-py-2.5 pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border focus-within:pktw-border-pk-accent focus-within:pktw-shadow-sm pktw-rounded-full pktw-transition-all pktw-z-0`}
								className="pktw-pr-4"
							/>
							{/* Mode dropdown */}
							<div ref={modeBadgeRef} className="pktw-absolute pktw-left-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10">
								<div
									onClick={() => setShowModeMenu((v) => !v)}
									className={cn(
										'pktw-flex pktw-items-center pktw-h-6 pktw-px-2 pktw-rounded-full pktw-text-pk-xs pktw-font-medium pktw-select-none pktw-transition-all',
										'pktw-bg-pk-highlight pktw-text-pk-accent pktw-border pktw-border-pk-accent/20 hover:pktw-bg-pk-accent-muted pktw-cursor-pointer'
									)}
									title={`${PRESET_LABELS[analysisMode].full} (⌥↑/⌥↓ to switch)`}
								>
									{analysisMode === 'aiGraph' ? <Network className="pktw-w-3 pktw-h-3 pktw-mr-1" /> : <Library className="pktw-w-3 pktw-h-3 pktw-mr-1" />}
									{PRESET_LABELS[analysisMode].short}
									<ChevronDown className={cn('pktw-w-2.5 pktw-h-2.5 pktw-ml-0.5 pktw-opacity-60 pktw-transition-transform', showModeMenu && 'pktw-rotate-180')} />
								</div>
								{showModeMenu && (
									<div className="pktw-absolute pktw-top-full pktw-left-0 pktw-mt-1 pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-rounded-lg pktw-shadow-lg pktw-py-1 pktw-z-50 pktw-min-w-[200px]">
										{PRESETS.map((p) => {
											const Icon = p === 'aiGraph' ? Network : Library;
											return (
												<div
													key={p}
													onClick={() => { setAnalysisMode(p); setShowModeMenu(false); }}
													className={cn(
														'pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3 pktw-py-2 pktw-text-xs pktw-cursor-pointer pktw-transition-colors',
														analysisMode === p
															? 'pktw-text-pk-accent pktw-font-medium pktw-bg-pk-accent/5'
															: 'pktw-text-pk-foreground hover:pktw-bg-pk-surface-raised'
													)}
												>
													<div className={cn(
														'pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
														analysisMode === p ? 'pktw-bg-pk-accent pktw-text-pk-text-inverted' : 'pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border'
													)}>
														<Icon className="pktw-w-3.5 pktw-h-3.5" />
													</div>
													<div className="pktw-flex-1">
														<span className="pktw-block pktw-font-medium">{PRESET_LABELS[p].short}</span>
														<span className="pktw-block pktw-text-pk-xs pktw-text-pk-foreground-muted pktw-font-normal">{PRESET_LABELS[p].full.split('·')[1]?.trim()}</span>
													</div>
												</div>
											);
										})}
										<div className="pktw-border-t pktw-border-pk-border pktw-mt-1 pktw-pt-1 pktw-px-3 pktw-pb-1">
											<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted">⌥↑ ⌥↓ to switch</span>
										</div>
									</div>
								)}
							</div>
							{!isMobile() && (
								<Button
									variant="ghost"
									onClick={() => {
										// Check if web search profile is configured before enabling
										if (!webEnabled && !ProfileRegistry.getInstance().getActiveWebSearchProfile()) {
											new Notice('No Web Search profile configured. Go to Settings → Profiles and assign a profile as "Web Search".', 5000);
											return;
										}
										const newQuery = toggleWeb(searchQuery);
										setSearchQuery(newQuery);
									}}
									className={`pktw-shadow-none pktw-absolute pktw-right-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-p-1.5 pktw-rounded pktw-transition-colors
										${webEnabled ? 'pktw-text-pk-info pktw-border pktw-border-pk-info/30' : 'pktw-border-0 pktw-bg-transparent '} pktw-cursor-pointer`}
									title={webEnabled ? 'Web: ON' : 'Web: OFF'}
								>
									{webEnabled ? <Globe className="pktw-w-5 pktw-h-5" /> : <GlobeOff className="pktw-w-5 pktw-h-5" />}
								</Button>
							)}
						</div>
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
								className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-pk-accent pktw-text-pk-text-inverted hover:pktw-bg-pk-accent-hover pktw-cursor-pointer"
								title="Start AI analysis"
							>
								<Sparkles className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Analyze</span>
							</Button>
						)}
					</div>
				</div>
			</div>
			{sessionStatus === 'idle' && (
				<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-py-3">
					{!searchQuery.trim() && recentQueries.length > 0 && (
						<RecentQueriesDropdown
							queries={recentQueries}
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
							// Increment usage count in background
							(async () => {
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
					<ActiveSessionsList onRestore={restoreFromBackground} />
					<RecentAnalysisList
						filterQuery={searchQuery}
						onSelectQuery={(query) => {
							useSharedStore.getState().setSearchQuery(query);
							useSearchSessionStore.getState().resetAll();
							useSearchSessionStore.getState().incrementTriggerAnalysis();
						}}
						onSelectRecord={async (record) => {
							const path = String(record.vault_rel_path ?? '').trim();
							if (!path) return;
							try {
								// T11N: vault read goes through the host's named
								// `readVaultFileText` op so this modal no longer
								// performs raw `app.vault.{getAbstractFileByPath,read}`.
								// The host returns `null` for missing/non-file
								// paths, matching the previous TFile-check fall
								// through to `getAnalysisMarkdownForReplay`.
								let md: string | null = await host.readVaultFileText(path);
								if (!md) {
									md = await host.getAnalysisMarkdownForReplay(path);
								}
								if (!md) {
									new Notice('Analysis file not found in vault.');
									return;
								}
								// `.json` records resolve directly; legacy `.md` still parses.
								const loaded = resolveAnalysisSnapshotFromVault(path, md, Number.isFinite(record.created_at_ts) ? record.created_at_ts : undefined);
								if (!loaded) {
									new Notice('Failed to load saved analysis.');
									return;
								}
								loadCompletedAnalysisSnapshot(loaded.snapshot, path);
								const query = loaded.query || record.query || '';
								if (query) {
									useSharedStore.getState().setSearchQuery(query);
									useSearchSessionStore.setState({ query });
								}
							} catch (e) {
								console.warn('[SearchModal] Failed to load snapshot:', e);
								new Notice('Failed to load saved analysis.');
								if (record.query) {
									useSharedStore.getState().setSearchQuery(record.query);
								}
							}
						}}
					/>
					{suggestions.length === 0 && totalAnalysisCount === 0 && (
						<div className="pktw-px-4 pktw-py-8 pktw-text-center pktw-text-sm pktw-text-pk-foreground-muted">
							No analyses yet. Type a question above or click a suggestion to get started.
						</div>
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
						<span>⌥↑⌥↓ Switch mode</span>
					</div>
					<span className="pktw-text-xs pktw-text-pk-accent">
						{totalAnalysisCount} analyses
					</span>
				</div>
			)}
		</>
	);
};

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
						<CodeMirrorInput
							ref={inputRef}
							value={vaultSearchQuery}
							onChange={setVaultSearchQuery}
							onKeyDown={handleInputKeyDown}
							placeholder="Search your vault…"
							enableSearchTags={false}
							singleLine={true}
							containerClassName="pktw-flex-1 pktw-min-w-0 pktw-px-4 pktw-py-2.5 pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border focus-within:pktw-border-pk-accent focus-within:pktw-shadow-sm pktw-rounded-full pktw-transition-all pktw-z-0"
							className="pktw-pr-2"
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

/**
 * Root quick search modal content with tabs for vault and AI search.
 * A floating Sparkles button in the tab bar reveals the Vault Intelligence
 * panel (activeTab='intel'). Tab-key cycling only rotates between 'vault'
 * and 'ai' — the intel panel is button-only to avoid accidentally triggering
 * an expensive review.
 */
export const QuickSearchModalContent: React.FC<QuickSearchModalContentProps> = ({
	onClose,
	intelCtx = null,
	onVaultAuto,
	onOpenVaultRecord,
	onOpenSuggest,
	onReplaySuggest,
}) => {
	const { activeTab, setActiveTab } = useSharedStore();
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

	const handleContainerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			// Tab cycles only vault ↔ ai. When on 'intel', Tab exits back to vault.
			if (activeTab === 'intel') setActiveTab('vault');
			else setActiveTab(activeTab === 'vault' ? 'ai' : 'vault');
		}
		if (e.key === 'Escape' && activeTab === 'intel') {
			e.preventDefault();
			setActiveTab('vault');
		}
	};

	return (
		<div
			ref={rootRef}
			className="pktw-w-full pktw-flex-1 pktw-min-h-0 pktw-bg-pk-background pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-overflow-hidden peak-no-native-outline"
			onKeyDown={handleContainerKeyDown}
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
				<TabButton
					tab="ai"
					label="AI Search"
					activeTab={activeTab}
					onClick={() => setActiveTab('ai')}
					className="pktw-rounded-tr-lg"
				/>
				{/* Floating Vault Intelligence button — outside Tab-key cycle */}
				<div className="pktw-absolute pktw-right-3 pktw-top-0 pktw-bottom-0 pktw-z-10 pktw-flex pktw-items-center">
					<button
						type="button"
						onClick={() => setActiveTab(activeTab === 'intel' ? 'vault' : 'intel')}
						title="Vault Intelligence — vault-wide AI review (expensive, manual)"
						className={cn(
							'pktw-inline-flex pktw-items-center pktw-gap-1.5',
							'pktw-text-pk-sm pktw-font-medium pktw-whitespace-nowrap',
							'pktw-rounded-full pktw-border pktw-px-2.5 pktw-py-1',
							activeTab === 'intel'
								? 'pktw-bg-pk-accent pktw-text-white pktw-border-pk-accent'
								: 'pktw-bg-pk-background pktw-text-pk-accent pktw-border-pk-accent-tint hover:pktw-bg-pk-accent-tint',
						)}
					>
						<Sparkles className="pktw-w-3 pktw-h-3" />
						<span>Vault Intelligence</span>
					</button>
				</div>
			</div>
			{activeTab === 'ai' ? (
				<AITabContent onClose={onClose} activeTab={activeTab} setActiveTab={setActiveTab} />
			) : activeTab === 'intel' ? (
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
				<VaultTabContent onClose={onClose} activeTab={activeTab} setActiveTab={setActiveTab} onOpenSuggest={onOpenSuggest} onReplaySuggest={onReplaySuggest} />
			)}
		</div>
	);
};
