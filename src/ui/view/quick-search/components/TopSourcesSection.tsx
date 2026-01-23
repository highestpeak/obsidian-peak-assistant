import React from 'react';
import { FileText } from 'lucide-react';
import { mixSearchResultsBySource } from '@/core/utils/source-mixer';
import { getSourceIcon } from '@/ui/view/shared/file-utils';
import type { SearchResultItem } from '@/service/search/types';

/**
 * Top sources section component showing relevant files with optional staggered animation
 */
export const TopSourcesSection: React.FC<{
	sources: SearchResultItem[];
	onOpen: (source: SearchResultItem | string) => void;
	skipAnimation?: boolean;
}> = ({ sources, onOpen, skipAnimation = false }) => {
	const [visibleCount, setVisibleCount] = React.useState(0);

	// Apply source mixing strategy (ensure minimum 2 items per source, then interleave)
	const mixedSources = React.useMemo(() => {
		return mixSearchResultsBySource(sources, 2);
	}, [sources]);

	React.useEffect(() => {
		if (mixedSources.length === 0) {
			setVisibleCount(0);
			return;
		}

		if (skipAnimation) {
			// Skip animation and show all items immediately
			setVisibleCount(mixedSources.length);
			return;
		}

		// Reset and animate items one by one
		setVisibleCount(0);
		let current = 0;
		const interval = setInterval(() => {
			current++;
			setVisibleCount(current);
			if (current >= mixedSources.length) {
				clearInterval(interval);
			}
		}, 100); // Show one item every 100ms

		return () => clearInterval(interval);
	}, [mixedSources.length, skipAnimation]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Top Sources</span>
				<span className="pktw-text-xs pktw-text-[#999999]">({mixedSources.length} files)</span>
			</div>
			<div className="pktw-space-y-2">
				{mixedSources.slice(0, visibleCount).map((source, index) => (
					<div
						key={source.id || index}
						className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-2 pktw-rounded hover:pktw-bg-[#f5f5f5] pktw-cursor-pointer pktw-transition-all pktw-group"
						style={{
							opacity: 0,
							transform: 'translateY(-8px)',
							animation: `fadeInSlide 0.3s ease-out ${index * 0.1}s forwards`
						}}
						onClick={() => onOpen(source)}
					>
						<div
							className="pktw-w-1 pktw-h-8 pktw-bg-[#7c3aed] pktw-rounded-full"
							style={{ opacity: Math.max(0.3, Math.min(1, ((source.finalScore ?? source.score ?? 0) + 1) / 10)) }}
						/>
						{/* Source icon */}
						<div className="pktw-flex-shrink-0">
							{getSourceIcon(source.source)}
						</div>
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-text-sm pktw-text-[#2e3338] pktw-truncate group-hover:pktw-text-[#7c3aed]">
								{source.title}
							</div>
							<div className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
								{source.path}
							</div>
						</div>
						<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-medium">
							{(source.finalScore ?? source.score) ? (source.finalScore ?? source.score ?? 0).toFixed(2) : ''}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};