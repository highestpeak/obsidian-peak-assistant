import React, { useEffect, useRef } from 'react';
import { VaultSearchTab } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { Search, Sparkles, Globe, X, RotateCcw, Zap, Brain, Hash, ListOrdered, FolderSearch, Blend } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { GlobeOff } from '@/ui/component/icon';
import { useSharedStore, useVaultSearchStore, useAIAnalysisStore } from './store';
import type { QuickSearchMode } from './store/vaultSearchStore';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { useAIAnalysis } from './hooks/useAIAnalysis';
import { getActiveNoteDetail } from '@/core/utils/obsidian-utils';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { InspectorPanel } from './components/inspector/InspectorPanel';

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
					? 'pktw-text-[#7c3aed] pktw-bg-white hover:pktw-bg-white hover:pktw-text-[#7c3aed]'
					: 'pktw-text-black hover:pktw-text-white pktw-bg-[#f0f0f0]',
				className
			)}
		>
			<span className="pktw-font-medium">{label}</span>
			{isActive && (
				<div className="pktw-absolute pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-0.5 pktw-bg-[#7c3aed]" />
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
const AITabContent: React.FC<AITabContentProps> = ({ onClose, activeTab, setActiveTab }) => {
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { searchQuery, setSearchQuery } = useSharedStore();
	const {
		webEnabled,
		toggleWeb,
		resetAnalysisState,
		isAnalyzing,
		hasAnalyzed,
		analysisCompleted,
		setAiModalOpen,
		analysisMode,
		setAnalysisMode,
	} = useAIAnalysisStore();
	const { performAnalysis, cancel } = useAIAnalysis();
	const hasResult = hasAnalyzed || analysisCompleted;

	const handleAnalyze = () => {
		if (searchQuery.trim()) {
			resetAnalysisState();
			performAnalysis();
		}
	};

	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setActiveTab('vault');
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
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAnalyze();
		}
	};

	useEffect(() => {
		setAiModalOpen(true);
		return () => setAiModalOpen(false);
	}, [setAiModalOpen]);

	useEffect(() => {
		if (inputRef.current) inputRef.current.focus();
	}, []);

	return (
		<>
			<div className="pktw-flex-shrink-0 pktw-p-2 pktw-bg-white pktw-border-b pktw-border-[#e5e7eb]">
				<div className="pktw-flex pktw-gap-2 pktw-items-center">
					<div className="pktw-relative pktw-flex-1">
						<HoverCard openDelay={200} closeDelay={100}>
							<HoverCardTrigger asChild>
								<Button
									variant="ghost"
									size="xs"
									style={{ cursor: 'pointer' }}
									className="pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10 !pktw-w-6 !pktw-h-6 pktw-rounded-full pktw-bg-white pktw-shadow-[0_2px_10px_rgba(124,58,237,0.22),0_0_0_1px_rgba(124,58,237,0.12)] pktw-text-[#5b21b6] pktw-transition-[box-shadow,color,background-color] hover:pktw-bg-[#f5f3ff] hover:pktw-shadow-[0_4px_14px_rgba(124,58,237,0.28),0_0_0_1px_rgba(124,58,237,0.2)] hover:pktw-text-[#7c3aed] focus-visible:pktw-ring-2 focus-visible:pktw-ring-[#7c3aed]/40"
									title={analysisMode === 'simple' ? 'Simple (summary + sources)' : 'Full analysis'}
								>
									{analysisMode === 'simple' ? <Zap className="pktw-w-4 pktw-h-4" /> : <Brain className="pktw-w-4 pktw-h-4" />}
								</Button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="pktw-w-auto pktw-min-w-[160px] pktw-py-0.5 pktw-px-1">
								<div className="pktw-text-[11px] pktw-font-medium pktw-text-[#6b7280] pktw-px-2 pktw-pt-1 pktw-pb-0.5">Analysis mode</div>
								<Button
									variant="ghost"
									onClick={() => setAnalysisMode('simple')}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										analysisMode === 'simple' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<Zap className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />
									<span className="pktw-font-medium">Simple</span>
									<span className="pktw-text-[11px]">· summary + sources</span>
								</Button>
								<Button
									variant="ghost"
									onClick={() => setAnalysisMode('full')}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										analysisMode === 'full' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<Brain className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />
									<span className="pktw-font-medium">Full</span>
									<span className="pktw-text-[11px]">· full analysis</span>
								</Button>
							</HoverCardContent>
						</HoverCard>
						<div className="pktw-relative pktw-flex pktw-items-center">
							<CodeMirrorInput
								ref={inputRef}
								value={searchQuery}
								onChange={setSearchQuery}
								onKeyDown={handleInputKeyDown}
								placeholder="Ask AI anything about your vault..."
								enableSearchTags={true}
								singleLine={true}
								containerClassName="pktw-w-full pktw-pl-11 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all"
								className="pktw-pr-12"
							/>
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
						</div>
					</div>
					<div className="pktw-flex pktw-items-center pktw-gap-2">
						{!isAnalyzing && hasResult && (
							<Button
								onClick={() => resetAnalysisState()}
								style={{ cursor: 'pointer' }}
								variant="outline"
								className="pktw-shadow-none pktw-px-4 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-border-[#e5e7eb] pktw-bg-white pktw-text-[#6c757d]"
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
								className="pktw-shadow-none pktw-px-3 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-border-[#7c3aed]/25 pktw-bg-white pktw-text-[#7c3aed]"
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
								className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-white pktw-text-[#7c3aed] pktw-border pktw-border-[#7c3aed]/30 hover:pktw-bg-[#f5f3ff]"
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
								className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9]"
								title="Start AI analysis"
							>
								<Sparkles className="pktw-w-4 pktw-h-4" />
								<span className="pktw-ml-2">Analyze</span>
							</Button>
						)}
					</div>
				</div>
			</div>
			<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-white pktw-overflow-visible pktw-flex pktw-flex-col">
				<AISearchTab onClose={onClose} />
			</div>
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
	// Strip existing mode prefix, including Inspector prefix `[[`.
	// This ensures we can switch away from Inspector mode via the menu.
	const withoutPrefix = trimmed.replace(/^\s*(\[\[|[#@:])\s*/, '') || '';
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
	const { updateParsedQuery, isSearching, quickSearchMode } = useVaultSearchStore();
	const { incrementTriggerAnalysis, resetAnalysisState } = useAIAnalysisStore();
	const inspectorOpen = vaultSearchQuery.includes('[[');
	/**
	 * Display mode is derived from the raw input prefix, not from store mode.
	 * Store mode may fallback to 'vault' when there is no file context (desktop/mock),
	 * but UI should still highlight what the user is trying to use (# / : / [[).
	 */
	const displayMode = inspectorOpen
		? ('inspector' as const)
		: vaultSearchQuery.trimStart().startsWith('#')
			? ('inFile' as const)
			: vaultSearchQuery.trimStart().startsWith(':')
				? ('goToLine' as const)
				: vaultSearchQuery.trimStart().startsWith('@')
					? ('inFolder' as const)
					: ('vault' as const);
	const currentPath = getActiveNoteDetail(app).activeFile?.path ?? null;

	const handleAskAI = () => {
		setSearchQuery(vaultSearchQuery);
		setActiveTab('ai');
		incrementTriggerAnalysis();
		resetAnalysisState();
	};

	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			setActiveTab('ai');
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
			<div className="pktw-flex-shrink-0 pktw-p-2 pktw-bg-white pktw-border-b pktw-border-[#e5e7eb]">
				<div className="pktw-flex pktw-gap-3 pktw-items-center">
					<div className="pktw-relative pktw-flex-1 pktw-min-w-0">
						<HoverCard openDelay={200} closeDelay={100}>
							<HoverCardTrigger asChild>
								<Button
									variant="ghost"
									size="xs"
									style={{ cursor: 'pointer' }}
									className="pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10 !pktw-w-6 !pktw-h-6 pktw-rounded-full pktw-bg-white pktw-shadow-[0_2px_10px_rgba(124,58,237,0.22),0_0_0_1px_rgba(124,58,237,0.12)] pktw-text-[#5b21b6] pktw-transition-[box-shadow,color,background-color] hover:pktw-bg-[#f5f3ff] hover:pktw-shadow-[0_4px_14px_rgba(124,58,237,0.28),0_0_0_1px_rgba(124,58,237,0.2)] hover:pktw-text-[#7c3aed] focus-visible:pktw-ring-2 focus-visible:pktw-ring-[#7c3aed]/40"
									title="Search mode (click to switch)"
								>
									{displayMode === 'inspector' ? (
										<Blend className="pktw-w-4 pktw-h-4" />
									) : displayMode === 'goToLine' ? (
										<ListOrdered className="pktw-w-4 pktw-h-4" />
									) : displayMode === 'inFile' ? (
										<Hash className="pktw-w-4 pktw-h-4" />
									) : (
										<Search className="pktw-w-4 pktw-h-4" />
									)}
								</Button>
							</HoverCardTrigger>
							<HoverCardContent side="bottom" align="start" className="pktw-w-auto pktw-min-w-[160px] pktw-py-0.5 pktw-px-1">
								<div className="pktw-text-[11px] pktw-font-medium pktw-text-[#6b7280] pktw-px-2 pktw-pt-1 pktw-pb-0.5">Search mode</div>
								<Button
									variant="ghost"
									onClick={() => setVaultSearchQuery(transformQueryForMode(vaultSearchQuery, 'vault'))}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										displayMode === 'vault' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<Search className={cn('pktw-w-3.5 pktw-h-3.5 pktw-shrink-0', displayMode === 'vault' && 'pktw-text-[#7c3aed]')} />
									<span className="pktw-font-medium">Vault</span>
									<span className="pktw-text-[11px]">· search entire vault</span>
								</Button>
								<Button
									variant="ghost"
									onClick={() => setVaultSearchQuery(transformQueryForMode(vaultSearchQuery, 'inFile'))}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										displayMode === 'inFile' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<Hash className={cn('pktw-w-3.5 pktw-h-3.5 pktw-shrink-0', displayMode === 'inFile' && 'pktw-text-[#7c3aed]')} />
									<span className="pktw-font-medium">In-file</span>
									<span className="pktw-text-[11px]">· search current file</span>
								</Button>
								{/* In-folder (@) temporarily hidden
								<Button
									variant="ghost"
									onClick={() => setVaultSearchQuery(transformQueryForMode(vaultSearchQuery, 'inFolder'))}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										quickSearchMode === 'inFolder' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<FolderSearch className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />
									<span className="pktw-font-medium">In-folder</span>
									<span className="pktw-text-[11px]">· @ prefix</span>
								</Button>
								*/}
								<Button
									variant="ghost"
									onClick={() => setVaultSearchQuery(transformQueryForMode(vaultSearchQuery, 'goToLine'))}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										displayMode === 'goToLine' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<ListOrdered className={cn('pktw-w-3.5 pktw-h-3.5 pktw-shrink-0', displayMode === 'goToLine' && 'pktw-text-[#7c3aed]')} />
									<span className="pktw-font-medium">Go to line</span>
									<span className="pktw-text-[11px]">· go to target line</span>
								</Button>
								<Button
									variant="ghost"
									onClick={() => setVaultSearchQuery('[[')}
									style={{ cursor: 'pointer' }}
									className={cn(
										'pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1 pktw-text-left pktw-text-sm pktw-rounded',
										displayMode === 'inspector' && 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]'
									)}
								>
									<Blend className={cn('pktw-w-3.5 pktw-h-3.5 pktw-shrink-0', displayMode === 'inspector' && 'pktw-text-[#7c3aed]')} />
									<span className="pktw-font-medium">Inspector</span>
									<span className="pktw-text-[11px]">· inspect target note</span>
								</Button>
							</HoverCardContent>
						</HoverCard>
						<div className="pktw-relative pktw-flex pktw-items-center pktw-min-w-0">
							<CodeMirrorInput
								ref={inputRef}
								value={vaultSearchQuery}
								onChange={setVaultSearchQuery}
								onKeyDown={handleInputKeyDown}
								placeholder="Search in vault... (# in-file, : go to line, [[ inspector)"
								enableSearchTags={false}
								singleLine={true}
								containerClassName="pktw-flex-1 pktw-min-w-0 pktw-pl-11 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all pktw-z-0"
								className="pktw-pr-4"
							/>
						</div>
					</div>
					<div className="pktw-flex pktw-shrink-0 pktw-items-center pktw-gap-2 pktw-relative pktw-z-10">
						<Button
							onClick={handleAskAI}
							style={{ cursor: 'pointer' }}
							className="pktw-shadow-none pktw-px-5 pktw-py-2.5 pktw-h-10 pktw-whitespace-nowrap !pktw-rounded-md pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] pktw-relative pktw-z-10"
							title="Switch to AI Analysis"
						>
							<Sparkles className="pktw-w-4 pktw-h-4" />
							<span className="pktw-ml-2">Ask AI</span>
						</Button>
					</div>
				</div>
			</div>
			{inspectorOpen && (
				<div className="pktw-flex-1 pktw-min-h-[320px] pktw-min-w-0 pktw-flex pktw-flex-col">
					<InspectorPanel
						currentPath={currentPath}
						onClose={onClose}
					/>
				</div>
			)}
			<div className={cn(
				'pktw-min-w-0 pktw-bg-white pktw-overflow-visible pktw-flex pktw-flex-col',
				inspectorOpen ? 'pktw-flex-shrink-0' : 'pktw-flex-1 pktw-min-h-0'
			)}>
				<VaultSearchTab onClose={onClose} inspectorOpen={inspectorOpen} />
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
			className="pktw-w-full pktw-flex-1 pktw-min-h-0 pktw-bg-white pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-overflow-hidden"
			onKeyDown={handleContainerKeyDown}
			tabIndex={-1}
			style={{ maxHeight: 'calc(100vh - 160px)', minHeight: '400px' }}
		>
			<div className="pktw-flex-shrink-0 pktw-flex pktw-border-b pktw-border-[#e5e7eb] pktw-bg-[#fafafa]">
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
