import React, { useEffect, useRef } from 'react';
import { VaultSearchTab } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { Search, Sparkles, Globe, X, RotateCcw, Zap, Brain } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { GlobeOff } from '@/ui/component/icon';
import { useSharedStore, useVaultSearchStore, useAIAnalysisStore } from './store';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { useAIAnalysis } from './hooks/useAIAnalysis';

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
									className="pktw-shadow-none pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10 !pktw-w-6 !pktw-h-6 pktw-rounded-full pktw-bg-[#f0f0f0]/80 pktw-text-[#999999] hover:pktw-text-[#6b7280] hover:pktw-bg-[#e8e8e8]"
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

/**
 * Vault Search tab: input row (search icon) + VaultSearchTab content.
 */
const VaultTabContent: React.FC<VaultTabContentProps> = ({ onClose, activeTab, setActiveTab }) => {
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { app } = useServiceContext();
	const { searchQuery, setSearchQuery } = useSharedStore();
	const { updateParsedQuery, isSearching, quickSearchMode } = useVaultSearchStore();

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
		updateParsedQuery(app, searchQuery);
	}, [app, searchQuery, updateParsedQuery]);

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
				<div className="pktw-flex pktw-gap-2 pktw-items-center">
					<div className="pktw-relative pktw-flex-1">
						<div
							className="pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10 pktw-flex pktw-items-center pktw-justify-center pktw-w-6 pktw-h-6 pktw-rounded-full pktw-bg-[#f0f0f0]/80 pktw-text-[#999999]"
							aria-hidden
						>
							<Search className="pktw-w-4 pktw-h-4" />
						</div>
						<CodeMirrorInput
							ref={inputRef}
							value={searchQuery}
							onChange={setSearchQuery}
							onKeyDown={handleInputKeyDown}
							placeholder="Search in vault... (# in-file, : go to line)"
							enableSearchTags={false}
							singleLine={true}
							containerClassName="pktw-w-full pktw-pl-11 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all"
							className="pktw-pr-4"
						/>
					</div>
				</div>
			</div>
			<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-white pktw-overflow-visible pktw-flex pktw-flex-col">
				<VaultSearchTab onClose={onClose} />
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
			className="pktw-w-full pktw-bg-white pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-overflow-visible"
			onKeyDown={handleContainerKeyDown}
			tabIndex={-1}
			style={{ maxHeight: 'calc(100vh - 160px)' }}
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
