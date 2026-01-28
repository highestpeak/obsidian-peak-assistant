import React, { useEffect, useRef } from 'react';
import { VaultSearchTab } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { Search, Sparkles, Globe, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { GlobeOff } from '@/ui/component/icon';
import { useSharedStore, useVaultSearchStore, useAIAnalysisStore } from './store';
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
	const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
	const { app } = useServiceContext();

	// Shared store
	const { activeTab, searchQuery, setActiveTab, setSearchQuery } = useSharedStore();

	// Vault search store
	const { updateParsedQuery, isSearching, quickSearchMode } = useVaultSearchStore();

	// AI analysis store
	const { webEnabled, toggleWeb, resetAnalysisState, isAnalyzing } = useAIAnalysisStore();

	// AI analysis hook
	const { performAnalysis, cancel } = useAIAnalysis();

	const handleAnalyze = () => {
		if (searchQuery.trim()) {
			resetAnalysisState();
			performAnalysis();
		}
	};

	const handleCancel = () => {
		cancel();
	};

	useEffect(() => {
		updateParsedQuery(app, searchQuery);
	}, [app, searchQuery, updateParsedQuery]);

	// Handle Tab key on container level to switch tabs
	const handleContainerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			setActiveTab(activeTab === 'vault' ? 'ai' : 'vault');
		}
	};

	// Handle key down events in the input
	const handleInputKeyDown = (e: React.KeyboardEvent) => {
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

	// Auto focus when switching tabs
	// Focus is now handled automatically by CodeMirrorInput on creation
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, [activeTab]);

	// Restore focus to search input after go-to-line operation completes
	useEffect(() => {
		if (quickSearchMode === 'goToLine' && !isSearching && inputRef.current) {
			// Small delay to ensure the scroll operation has completed
			setTimeout(() => {
				if (inputRef.current) {
					inputRef.current.focus();
				}
			}, 100);
		}
	}, [quickSearchMode, isSearching]);

	return (
		<div
			className="pktw-w-full pktw-bg-white pktw-rounded-lg pktw-shadow-lg pktw-flex pktw-flex-col pktw-overflow-hidden"
			onKeyDown={handleContainerKeyDown}
			tabIndex={-1}
			// Use explicit height to avoid bottom clipping inside Obsidian modal
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
								ref={inputRef}
								value={searchQuery}
								onChange={setSearchQuery}
								onKeyDown={handleInputKeyDown}
								placeholder={
									activeTab === 'vault'
										// ? 'Search in vault... (# for in-file, @ for folder, : to go to line)'
										? 'Search in vault... (# for in-file, : to go to line)'
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
										const newQuery = toggleWeb(searchQuery);
										setSearchQuery(newQuery);
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

					</div>
					{activeTab === 'ai' && (
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<Button
								onClick={isAnalyzing ? handleCancel : handleAnalyze}
								disabled={!searchQuery.trim() && !isAnalyzing}
								className={`pktw-px-5 pktw-py-2.5 pktw-whitespace-nowrap !pktw-rounded-md ${
									isAnalyzing
										? 'pktw-bg-red-500 pktw-text-white hover:pktw-bg-red-600'
										: 'pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9]'
								}`}
							>
								{isAnalyzing ? (
									<>
										<X className="pktw-w-4 pktw-h-4" />
										<span>Cancel</span>
									</>
								) : (
									<>
										<Sparkles className="pktw-w-4 pktw-h-4" />
										<span>Analyze</span>
									</>
								)}
							</Button>
						</div>
					)}
				</div>
			</div>

			{/* Tab Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-bg-white pktw-overflow-hidden pktw-flex pktw-flex-col">
				{activeTab === 'ai' ? (
					<AISearchTab onClose={onClose} />
				) : (
					<VaultSearchTab onClose={onClose} />
				)}
			</div>
		</div>
	);
};
