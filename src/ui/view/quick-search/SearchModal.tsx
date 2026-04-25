import React, { useEffect, useRef, useState } from 'react';
import { VaultSearchTab, VaultSearchFooterHints } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { Search, Sparkles, Globe, X, RotateCcw, Brain, Network, ChevronDown } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { GlobeOff } from '@/ui/component/icon';
import { useSharedStore, useVaultSearchStore } from './store';
import { resetAIAnalysisAll } from './store/aiAnalysisStore';
import { useSearchSessionStore } from './store/searchSessionStore';
import type { AnalysisMode } from './store/aiAnalysisStore';
import type { QuickSearchMode } from './store/vaultSearchStore';
import { useSearchSession } from './hooks/useSearchSession';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { AppContext } from '@/app/context/AppContext';
import { formatDuration } from '@/core/utils/format-utils';
import { InspectorSidePanel } from './components/inspector/InspectorSidePanel';
import { isMobile } from '@/core/platform';
import { ContextProvider } from '@/service/context/ContextProvider';
import { matchPatterns, type MatchedSuggestion } from '@/service/context/PatternMatcher';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SuggestionGrid } from './components/SuggestionGrid';
import { ActiveSessionsList } from './components/ActiveSessionsList';
import { RecentAnalysisList } from './components/RecentAnalysisList';

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
			onClick={onClick}
			className={cn(
				'pktw-shadow-none pktw-rounded-none pktw-inline-flex pktw-items-center pktw-justify-center pktw-whitespace-nowrap pktw-font-medium focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-offset-2 disabled:pktw-pointer-events-none disabled:pktw-opacity-50 pktw-flex-1 pktw-relative',
				isActive
					? 'pktw-text-pk-accent pktw-bg-pk-background hover:pktw-bg-pk-background hover:pktw-text-pk-accent'
					: 'pktw-text-black hover:pktw-text-white pktw-bg-[#f0f0f0]',
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
	const { app } = useServiceContext();
	const { searchQuery, setSearchQuery } = useSharedStore();
	const webEnabled = useSearchSessionStore((s) => s.webEnabled);
	const toggleWeb = useSearchSessionStore((s) => s.toggleWeb);
	const sessionStatus = useSearchSessionStore((s) => s.status);
	const isInputFrozen = useSearchSessionStore((s) => s.isInputFrozen);
	const hasAnalyzed = useSearchSessionStore((s) => s.hasAnalyzed);
	const setAiModalOpen = useSearchSessionStore((s) => s.setAiModalOpen);
	const analysisMode = useSearchSessionStore((s) => s.analysisMode);
	const setAnalysisMode = useSearchSessionStore((s) => s.setAnalysisMode);
	const { performAnalysis, cancel, restoreFromBackground } = useSearchSession();

	// Check for pending background session restore on mount
	useEffect(() => {
		const pendingId = BackgroundSessionManager.pendingRestore;
		if (pendingId) {
			BackgroundSessionManager.pendingRestore = null;
			restoreFromBackground(pendingId);
		}
	}, [restoreFromBackground]);

	const isAnalyzing = sessionStatus === 'starting' || sessionStatus === 'streaming';
	const analysisCompleted = sessionStatus === 'completed';
	const hasResult = hasAnalyzed || analysisCompleted;
	const handleAnalyze = () => {
		if (!searchQuery.trim()) return;
		performAnalysis(undefined, undefined);
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
			inputRef.current.select();
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
				const ctxProvider = new ContextProvider(AppContext.getInstance().app);
				const ctx = ctxProvider.collect();
				setSuggestions(matchPatterns(patterns, ctx, 6));
			} catch { setSuggestions([]); }
		})();

		AppContext.getInstance().aiAnalysisHistoryService.count()
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
								containerClassName={`pktw-flex-1 pktw-min-w-0 ${analysisMode === 'aiGraph' ? 'pktw-pl-[105px]' : 'pktw-pl-[140px]'} pktw-pr-16 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all pktw-z-0`}
								className="pktw-pr-4"
							/>
							{/* Mode dropdown */}
							<div ref={modeBadgeRef} className="pktw-absolute pktw-left-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10">
								<div
									style={{ cursor: 'pointer' }}
									onClick={() => setShowModeMenu((v) => !v)}
									className={cn(
										'pktw-flex pktw-items-center pktw-h-6 pktw-px-2 pktw-rounded-full pktw-text-[10px] pktw-font-medium pktw-select-none pktw-transition-all',
										'pktw-bg-[#f5f3ff] pktw-text-pk-accent pktw-border pktw-border-[#7c3aed]/20 hover:pktw-bg-[#ede9fe]'
									)}
									title={`${PRESET_LABELS[analysisMode].full} (⌥↑/⌥↓ to switch)`}
								>
									{analysisMode === 'aiGraph' ? <Network className="pktw-w-3 pktw-h-3 pktw-mr-1" /> : <Brain className="pktw-w-3 pktw-h-3 pktw-mr-1" />}
									{PRESET_LABELS[analysisMode].short}
									<ChevronDown className={cn('pktw-w-2.5 pktw-h-2.5 pktw-ml-0.5 pktw-opacity-60 pktw-transition-transform', showModeMenu && 'pktw-rotate-180')} />
								</div>
								{showModeMenu && (
									<div className="pktw-absolute pktw-top-full pktw-left-0 pktw-mt-1 pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-lg pktw-shadow-lg pktw-py-1 pktw-z-50 pktw-min-w-[200px]">
										{PRESETS.map((p) => {
											const Icon = p === 'aiGraph' ? Network : Brain;
											return (
												<div
													key={p}
													onClick={() => { setAnalysisMode(p); setShowModeMenu(false); }}
													className={cn(
														'pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3 pktw-py-2 pktw-text-xs pktw-cursor-pointer pktw-transition-colors',
														analysisMode === p
															? 'pktw-text-pk-accent pktw-font-medium pktw-bg-pk-accent/5'
															: 'pktw-text-pk-foreground hover:pktw-bg-gray-50'
													)}
												>
													<div className={cn(
														'pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
														analysisMode === p ? 'pktw-bg-pk-accent pktw-text-white' : 'pktw-bg-[#f3f4f6] pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border'
													)}>
														<Icon className="pktw-w-3.5 pktw-h-3.5" />
													</div>
													<div className="pktw-flex-1">
														<span className="pktw-block pktw-font-medium">{PRESET_LABELS[p].short}</span>
														<span className="pktw-block pktw-text-[10px] pktw-text-pk-foreground-muted pktw-font-normal">{PRESET_LABELS[p].full.split('·')[1]?.trim()}</span>
													</div>
												</div>
											);
										})}
										<div className="pktw-border-t pktw-border-pk-border pktw-mt-1 pktw-pt-1 pktw-px-3 pktw-pb-1">
											<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">⌥↑ ⌥↓ to switch</span>
										</div>
									</div>
								)}
							</div>
							{!isMobile() && (
								<Button
									variant="ghost"
									onClick={() => {
										const newQuery = toggleWeb(searchQuery);
										setSearchQuery(newQuery);
									}}
									style={{ cursor: 'pointer' }}
									className={`pktw-shadow-none pktw-absolute pktw-right-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-p-1.5 pktw-rounded pktw-transition-colors
										${webEnabled ? 'pktw-text-[#3b82f6] pktw-border pktw-border-[#3b82f6]/30' : 'pktw-border-0 pktw-bg-transparent '}`}
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
								onClick={() => { useSearchSessionStore.getState().resetAll(); resetAIAnalysisAll(); }}
								style={{ cursor: 'pointer' }}
								variant="outline"
								className="pktw-shadow-none pktw-px-4 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-border-pk-border pktw-bg-pk-background pktw-text-[#6c757d]"
								title="Clear current AI analysis result (in-memory)"
							>
								Clear
							</Button>
						)}
						{!isAnalyzing && hasResult && (
							<Button
								onClick={handleAnalyze}
								disabled={!searchQuery.trim()}
								style={{ cursor: 'pointer' }}
								variant="outline"
								className="pktw-shadow-none pktw-px-3 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-border-[#7c3aed]/25 pktw-bg-pk-background pktw-text-pk-accent"
								title="Re-run AI analysis"
							>
								<RotateCcw className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Re-analyze</span>
							</Button>
						)}
						{isAnalyzing && (
							<Button
								onClick={cancel}
								style={{ cursor: 'pointer' }}
								className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-pk-background pktw-text-pk-accent pktw-border pktw-border-[#7c3aed]/30 hover:pktw-bg-[#f5f3ff]"
								title="Cancel analysis"
							>
								<X className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Cancel</span>
							</Button>
						)}
						{!isAnalyzing && !hasResult && (
							<Button
								onClick={handleAnalyze}
								disabled={!searchQuery.trim()}
								style={{ cursor: 'pointer' }}
								className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-pk-accent pktw-text-white hover:pktw-bg-[#6d28d9]"
								title="Start AI analysis"
							>
								<Sparkles className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Analyze</span>
							</Button>
						)}
					</div>
				</div>
			</div>
			{!searchQuery && sessionStatus === 'idle' && (
				<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-px-4 pktw-py-3">
					<SuggestionGrid
						suggestions={suggestions}
						onSelect={(s) => {
							useSharedStore.getState().setSearchQuery(s.filledTemplate);
							useSearchSessionStore.getState().resetAll();
							resetAIAnalysisAll();
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
					<ActiveSessionsList
						onRestore={(sessionId) => {
							BackgroundSessionManager.pendingRestore = sessionId;
						}}
					/>
					<RecentAnalysisList
						onSelectQuery={(query) => {
							useSharedStore.getState().setSearchQuery(query);
							useSearchSessionStore.getState().resetAll();
							resetAIAnalysisAll();
							useSearchSessionStore.getState().incrementTriggerAnalysis();
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
			{(searchQuery || sessionStatus !== 'idle') && (
				<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-pk-background pktw-overflow-visible pktw-flex pktw-flex-col">
					<AISearchTab onClose={onClose} />
				</div>
			)}
			{sessionStatus === 'idle' && (
				<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2 pktw-bg-[#fafafa] pktw-border-t pktw-border-pk-border pktw-flex pktw-items-center pktw-justify-between">
					<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
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

interface VaultTabContentProps {
	onClose?: () => void;
	activeTab: TabType;
	setActiveTab: (tab: TabType) => void;
}

/** Returns search query string for the given mode (prefix # / @ / : or none). */
function transformQueryForMode(raw: string, toMode: QuickSearchMode): string {
	const trimmed = raw.trimStart();
	// Strip existing mode prefix (#, @, :, ?).
	const withoutPrefix = trimmed.replace(/^\s*[#@:?]\s*/, '') || '';
	if (toMode === 'vault') return withoutPrefix;
	if (toMode === 'inFolder') return trimmed.startsWith('@') ? raw : `@ ${withoutPrefix}`;
	if (toMode === 'inFile') return trimmed.startsWith('#') ? raw : `# ${withoutPrefix}`;
	if (toMode === 'goToLine') return trimmed.startsWith(':') ? raw : `: ${withoutPrefix}`;
	return raw;
}

/**
 * Vault Search tab: input row (mode icon + input) + VaultSearchTab content.
 * Mode can be switched by clicking the icon or by typing # / : / @.
 */
const VaultTabContent: React.FC<VaultTabContentProps> = ({ onClose, activeTab, setActiveTab }) => {
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { app } = useServiceContext();
	const { vaultSearchQuery, setVaultSearchQuery, setSearchQuery } = useSharedStore();
	const { updateParsedQuery, isSearching, quickSearchMode, inspectorOpen, lastSearchDuration, lastSearchResults } = useVaultSearchStore();
	const incrementTriggerAnalysis = useSearchSessionStore((s) => s.incrementTriggerAnalysis);
	const hasSearchQuery = !!vaultSearchQuery.trim();
	const [inspectorPath, setInspectorPath] = useState<string | null>(null);
	const [navigateToPath, setNavigateToPath] = useState<string | null>(null);

	/**
	 * Display mode is derived from the raw input prefix, not from store mode.
	 * Store mode may fallback to 'vault' when there is no file context (desktop/mock),
	 * but UI should still highlight what the user is trying to use (# / : / @).
	 */
	const displayMode = vaultSearchQuery.trimStart().startsWith('#')
		? ('inFile' as const)
		: vaultSearchQuery.trimStart().startsWith(':')
			? ('goToLine' as const)
			: vaultSearchQuery.trimStart().startsWith('@')
				? ('inFolder' as const)
				: ('vault' as const);

	const VAULT_CYCLE_MODES = ['vault', 'inFolder', 'inFile', 'goToLine'] as const;
	const cycleVaultMode = (dir: 1 | -1) => {
		const idx = VAULT_CYCLE_MODES.indexOf(displayMode as typeof VAULT_CYCLE_MODES[number]);
		const safeIdx = idx >= 0 ? idx : 0;
		const nextMode = VAULT_CYCLE_MODES[(safeIdx + dir + VAULT_CYCLE_MODES.length) % VAULT_CYCLE_MODES.length];
		setVaultSearchQuery(transformQueryForMode(vaultSearchQuery, nextMode));
	};

	const handleAskAI = () => {
		setSearchQuery(vaultSearchQuery);
		setActiveTab('ai');
		useSearchSessionStore.getState().resetAll();
		resetAIAnalysisAll();
		incrementTriggerAnalysis();
	};

	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setActiveTab('ai');
			return;
		}
		if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault();
			cycleVaultMode(e.key === 'ArrowUp' ? -1 : 1);
			return;
		}
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
			inputRef.current.select();
			return;
		}
	};

	useEffect(() => {
		updateParsedQuery(app, vaultSearchQuery);
	}, [app, vaultSearchQuery, updateParsedQuery]);

	useEffect(() => {
		if (inputRef.current) inputRef.current.focus();
	}, []);

	useEffect(() => {
		if (quickSearchMode === 'goToLine' && !isSearching && inputRef.current) {
			const t = setTimeout(() => {
				if (inputRef.current) inputRef.current.focus();
			}, 100);
			return () => clearTimeout(t);
		}
	}, [quickSearchMode, isSearching]);

	return (
		<>
			{/* Input row */}
			<div className="pktw-flex-shrink-0 pktw-p-2 pktw-bg-pk-background pktw-border-b pktw-border-pk-border">
				<div className="pktw-flex pktw-gap-3 pktw-items-center">
					<div className="pktw-relative pktw-flex-1 pktw-min-w-0">
						<div className="pktw-relative pktw-flex pktw-items-center pktw-min-w-0">
							<CodeMirrorInput
								ref={inputRef}
								value={vaultSearchQuery}
								onChange={setVaultSearchQuery}
								onKeyDown={handleInputKeyDown}
								placeholder="Search in vault... (# in-file, @ folder, : go to line, ? help)"
								enableSearchTags={false}
								singleLine={true}
								containerClassName="pktw-flex-1 pktw-min-w-0 pktw-pl-4 pktw-pr-16 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all pktw-z-0"
								className="pktw-pr-4"
							/>
							{/* Mode badge — right edge inside input */}
							<span className={cn(
								'pktw-absolute pktw-right-3 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10',
								'pktw-text-[10px] pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded-full',
								'pktw-bg-[#f5f3ff] pktw-text-pk-accent pktw-border pktw-border-[#7c3aed]/20',
							)}>
								{quickSearchMode === 'vault' ? 'vault' :
								 quickSearchMode === 'inFile' ? 'in-file' :
								 quickSearchMode === 'inFolder' ? 'folder' :
								 quickSearchMode === 'goToLine' ? 'line' :
								 quickSearchMode === 'help' ? 'help' : 'vault'}
							</span>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						style={{ cursor: 'pointer' }}
						className="pktw-shadow-none pktw-flex-shrink-0 pktw-text-xs pktw-text-pk-accent pktw-h-8 pktw-px-2"
						onClick={() => setActiveTab('ai')}
						title="Switch to AI Analysis"
					>
						<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
						AI
					</Button>
				</div>
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
							onNavigate={(path) => {
						setInspectorPath(path);
						setNavigateToPath(path);
					}}
						/>
					</div>
				)}
			</div>

			{/* Footer — modal level, always visible */}
			<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-pk-border pktw-flex pktw-items-center pktw-justify-between">
				<VaultSearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{hasSearchQuery && (
						isSearching ? (
							<span className="pktw-text-xs pktw-text-[#999999]">Searching...</span>
						) : (
							<>
								<span className="pktw-text-xs pktw-text-[#999999]">
									{lastSearchResults.length} result{lastSearchResults.length !== 1 ? 's' : ''}
								</span>
								{lastSearchDuration !== null && (
									<span className="pktw-text-xs pktw-text-[#999999]">
										• <strong className="pktw-text-[#2e3338]">{formatDuration(lastSearchDuration)}</strong>
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

/**
 * Root quick search modal content with tabs for vault and AI search.
 */
export const QuickSearchModalContent: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
	const { activeTab, setActiveTab } = useSharedStore();

	const handleContainerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			setActiveTab(activeTab === 'vault' ? 'ai' : 'vault');
		}
	};

	return (
		<div
			className="pktw-w-full pktw-flex-1 pktw-min-h-0 pktw-bg-pk-background pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-overflow-hidden"
			onKeyDown={handleContainerKeyDown}
			tabIndex={-1}
			style={{ maxHeight: 'calc(100vh - 160px)', minHeight: '400px' }}
		>
			<div className="pktw-flex-shrink-0 pktw-flex pktw-border-b pktw-border-pk-border pktw-bg-[#fafafa]">
				<TabButton
					tab="vault"
					label="Vault Search"
					activeTab={activeTab}
					onClick={() => setActiveTab('vault')}
					className="pktw-rounded-tl-lg"
				/>
				<TabButton
					tab="ai"
					label="AI Analysis"
					activeTab={activeTab}
					onClick={() => setActiveTab('ai')}
					className="pktw-rounded-tr-lg"
				/>
			</div>
			{activeTab === 'ai' ? (
				<AITabContent onClose={onClose} activeTab={activeTab} setActiveTab={setActiveTab} />
			) : (
				<VaultTabContent onClose={onClose} activeTab={activeTab} setActiveTab={setActiveTab} />
			)}
		</div>
	);
};
