import React, { useEffect, useRef, useState } from 'react';
import { VaultSearchTab } from './tab-VaultSearch';
import { AISearchTab } from './tab-AISearch';
import { Search, Sparkles } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';

type TabType = 'vault' | 'ai';

interface TabButtonProps {
	tab: TabType;
	label: string;
	activeTab: TabType;
	onClick: () => void;
}

/**
 * Tab button component for switching between tabs.
 */
const TabButton: React.FC<TabButtonProps> = ({ tab, label, activeTab, onClick }) => {
	const isActive = activeTab === tab;
	return (
		<Button
			variant="ghost"
			onClick={onClick}
			className={cn(
				'pktw-flex-1 pktw-px-6 pktw-py-3 pktw-text-sm pktw-transition-all pktw-duration-150 pktw-relative pktw-rounded-none pktw-h-auto pktw-border-0',
				isActive
					? 'pktw-text-[#7c3aed] pktw-bg-white hover:pktw-bg-white hover:!pktw-text-[#7c3aed]'
					: 'pktw-text-[#6c757d] hover:!pktw-text-[#2e3338] hover:pktw-bg-[#f0f0f0]'
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
export const QuickSearchModalContent: React.FC = () => {
	const [activeTab, setActiveTab] = useState<TabType>('vault');
	const [searchQuery, setSearchQuery] = useState('');
	const [triggerAnalysis, setTriggerAnalysis] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);

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

		if (e.key === 'Enter' && activeTab === 'ai') {
			e.preventDefault();
			handleAnalyze();
		}
	};

	useEffect(() => {
		// Auto focus main search input when modal opens
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, []);

	// Handle Tab key on container level to switch tabs
	const handleContainerKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			setActiveTab(prev => prev === 'vault' ? 'ai' : 'vault');
		}
	};

	return (
		<div 
			className="pktw-w-full pktw-max-w-[1100px] pktw-bg-white pktw-rounded-lg pktw-shadow-lg pktw-overflow-hidden pktw-flex pktw-flex-col pktw-h-full"
			onKeyDown={handleContainerKeyDown}
			tabIndex={-1}
		>
			{/* Tab Header */}
			<div className="pktw-flex pktw-border-b pktw-border-[#e5e7eb] pktw-bg-[#fafafa]">
				<TabButton
					tab="vault"
					label="Vault Search"
					activeTab={activeTab}
					onClick={() => setActiveTab('vault')}
				/>
				<TabButton
					tab="ai"
					label="AI Analysis"
					activeTab={activeTab}
					onClick={() => setActiveTab('ai')}
				/>
			</div>

			{/* Search Input */}
			<div className="pktw-p-4 pktw-bg-white pktw-border-b pktw-border-[#e5e7eb]">
				<div className="pktw-flex pktw-gap-2 pktw-items-center">
					<div className="pktw-relative pktw-flex-1">
						<Search className="pktw-absolute pktw-left-4 pktw-top-1/2 -pktw-translate-y-1/2 pktw-w-4 pktw-h-4 pktw-text-[#999999]" />
						<input
							type="text"
							ref={inputRef}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={
								activeTab === 'vault'
									? 'Search in vault... (# for in-file, @ for folder, / for mode list)'
									: 'Ask AI anything about your vault...'
							}
							className="pktw-w-full pktw-pl-11 pktw-pr-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border pktw-border-[#d1d5db] pktw-rounded-full pktw-text-[#2e3338] pktw-placeholder:text-[#999999] pktw-focus:outline-none pktw-focus:ring-2 pktw-focus:ring-[#7c3aed] pktw-focus:border-transparent pktw-transition-all"
						/>
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
			<div className="pktw-bg-white pktw-flex-1 pktw-min-h-0 pktw-overflow-hidden pktw-flex pktw-flex-col">
				{activeTab === 'ai' ? (
					<AISearchTab searchQuery={searchQuery} triggerAnalysis={triggerAnalysis} />
				) : (
					<VaultSearchTab searchQuery={searchQuery} onSwitchToAI={() => setActiveTab('ai')} />
				)}
			</div>
		</div>
	);
};


