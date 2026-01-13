import React, { useEffect, useRef, useState } from 'react';
import { VaultSearchTab } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { Search, Sparkles, Globe } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { SearchScopeMode } from '@/service/search/types';
import { parseQuickSearchInput } from '@/service/search/view/query-parser';
import { GlobeOff } from '@/ui/component/icon';

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
				'pktw-rounded-none pktw-inline-flex pktw-items-center pktw-justify-center pktw-whitespace-nowrap pktw-font-medium focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-offset-2 disabled:pktw-pointer-events-none disabled:pktw-opacity-50 pktw-flex-1 pktw-relative',
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

/**
 * Root quick search modal content with tabs for vault and AI search.
 */
export const QuickSearchModalContent: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
	const [activeTab, setActiveTab] = useState<TabType>('vault');
	const [searchQuery, setSearchQuery] = useState('');
	const [triggerAnalysis, setTriggerAnalysis] = useState(0);
	const [webEnabled, setWebEnabled] = useState(false);
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { app, searchClient } = useServiceContext();

	const [indexProgress, setIndexProgress] = useState<{ processed: number; total?: number } | null>(null);
	const [modeOverride, setModeOverride] = useState<SearchScopeMode | null>(null);
	const [showModeList, setShowModeList] = useState(false);

	const handleAnalyze = () => {
		if (searchQuery.trim()) {
			setTriggerAnalysis(prev => prev + 1);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Tab key switches between tabs instead of navigating between elements
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation(); // Prevent bubbling to container handler
			setActiveTab(activeTab === 'vault' ? 'ai' : 'vault');
			return;
		}

		// Allow navigation keys to work even when focus is in input
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			// Prevent default cursor movement in input, but let event bubble for navigation
			e.preventDefault();
			return;
		}

		// Cmd/Ctrl+A for select all in input
		if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey) && inputRef.current) {
			e.preventDefault();
			e.stopPropagation();
			inputRef.current.select();
			return;
		}

		if (e.key === 'Enter' && activeTab === 'ai') {
			e.preventDefault();
			handleAnalyze();
		}
	};

	// Detect @web@ trigger in search query (don't remove from display, just enable web mode)
	useEffect(() => {
		if (activeTab === 'ai') {
			const trimmed = searchQuery.trim();
			const hasWebTrigger = trimmed.includes('@web@');
			if (hasWebTrigger && !webEnabled) {
				setWebEnabled(true);
			} else if (!hasWebTrigger && webEnabled) {
				// Only disable if user manually removes @web@
				setWebEnabled(false);
			}
		}
	}, [searchQuery, activeTab, webEnabled]);

	// Get clean query without @web@ for actual search
	const getCleanQuery = (query: string): string => {
		return query.replace(/@web@\s*/g, '').trim();
	};

	const parsed = parseQuickSearchInput({
		app,
		rawInput: searchQuery,
		modeOverride,
		topK: 50,
	});

	useEffect(() => {
		setShowModeList(parsed.showModeList);
	}, [parsed.showModeList]);

	// Auto focus when switching tabs
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, [activeTab]);

	// Focus is now handled automatically by CodeMirrorInput on creation


	// Handle Tab key on container level to switch tabs
	const handleContainerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			setActiveTab(prev => prev === 'vault' ? 'ai' : 'vault');
		}
	};

	return (
		<div
			className="pktw-w-full pktw-bg-white pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden"
			onKeyDown={handleContainerKeyDown}
			tabIndex={-1}
			style={{ maxHeight: 'calc(100vh - 160px)' }}
		>
			{/* Tab Header */}
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

			{/* Search Input */}
			<div className="pktw-flex-shrink-0 pktw-p-4 pktw-bg-white pktw-border-b pktw-border-[#e5e7eb]">
				<div className="pktw-flex pktw-gap-2 pktw-items-center">
					<div className="pktw-relative pktw-flex-1">
						<Search className="pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-w-4 pktw-h-4 pktw-text-[#999999] pktw-z-10" />
						<div className="pktw-relative pktw-flex pktw-items-center">
							<CodeMirrorInput
								value={searchQuery}
								onChange={setSearchQuery}
								onKeyDown={handleKeyDown}
								placeholder={
									activeTab === 'vault'
										? 'Search in vault... (# for in-file, @ for folder, : to go to line)'
										: 'Ask AI anything about your vault...'
								}
								enableSearchTags={activeTab === 'ai'}
								singleLine={true}
								containerClassName="pktw-w-full pktw-pl-11 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all"
								className="pktw-pr-12" // Reserve space for button
							/>
							{/* Web toggle button inside input (AI tab only) */}
							{activeTab === 'ai' && (
								<Button
									variant="ghost"
									onClick={() => {
										if (searchQuery.includes('@web@')) {
											setSearchQuery(prev => prev.replace(/@web@\s*/g, '').trim());
											setWebEnabled(false);
										} else {
											setSearchQuery(prev => prev + (prev.trim() ? ' @web@' : '@web@'));
											setWebEnabled(true);
										}
									}}
									className={`pktw-absolute pktw-right-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-p-1.5 pktw-rounded pktw-transition-colors
										${webEnabled ? 'pktw-text-[#3b82f6] pktw-border pktw-border-[#3b82f6]/30' : 'pktw-border-0 pktw-bg-transparent '}`
									}
									title={webEnabled ? 'Web: ON' : 'Web: OFF'}
								>
									{webEnabled
										? (<Globe className={`pktw-w-5 pktw-h-5 `} />)
										: (<GlobeOff className={`pktw-w-5 pktw-h-5 `} />)
									}
								</Button>
							)}
						</div>

						{/* Mode list */}
						{activeTab === 'vault' && showModeList && (
							<div className="pktw-absolute pktw-left-0 pktw-right-0 pktw-mt-2 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-overflow-hidden">
								<div className="pktw-flex pktw-flex-col">
									<Button
										variant="ghost"
										className="pktw-justify-start !pktw-rounded-none"
										onClick={() => {
											setModeOverride('vault');
											setShowModeList(false);
											if (searchQuery.trimStart().startsWith('/')) {
												setSearchQuery(searchQuery.trimStart().slice(1).trimStart());
											}
										}}
									>
										<span className="pktw-text-sm">Vault</span>
									</Button>
									<Button
										variant="ghost"
										className="pktw-justify-start !pktw-rounded-none"
										onClick={() => {
											setModeOverride('inFile');
											setShowModeList(false);
											if (searchQuery.trimStart().startsWith('/')) {
												setSearchQuery(searchQuery.trimStart().slice(1).trimStart());
											}
										}}
									>
										<span className="pktw-text-sm">In File</span>
									</Button>
									<Button
										variant="ghost"
										className="pktw-justify-start !pktw-rounded-none"
										onClick={() => {
											setModeOverride('inFolder');
											setShowModeList(false);
											if (searchQuery.trimStart().startsWith('/')) {
												setSearchQuery(searchQuery.trimStart().slice(1).trimStart());
											}
										}}
									>
										<span className="pktw-text-sm">In Folder</span>
									</Button>
								</div>
							</div>
						)}
					</div>
					{activeTab === 'ai' && (
						<Button
							onClick={handleAnalyze}
							disabled={!searchQuery.trim()}
							className="pktw-px-5 pktw-py-2.5 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] pktw-whitespace-nowrap !pktw-rounded-md"
						>
							<Sparkles className="pktw-w-4 pktw-h-4" />
							<span>Analyze</span>
						</Button>
					)}
				</div>
			</div>

			{/* Tab Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-white pktw-overflow-hidden pktw-flex pktw-flex-col">
				{activeTab === 'ai' ? (
					<AISearchTab searchQuery={getCleanQuery(searchQuery)} triggerAnalysis={triggerAnalysis} searchClient={searchClient} webEnabled={webEnabled} onWebEnabledChange={setWebEnabled} onSearchQueryChange={setSearchQuery} onClose={onClose} />
				) : (
					<VaultSearchTab
						searchInput={searchQuery}
						searchQuery={parsed.query}
						onSwitchToAI={() => setActiveTab('ai')}
						searchClient={searchClient}
						indexProgress={indexProgress}
						onClose={onClose}
					/>
				)}
			</div>
		</div>
	);
};


