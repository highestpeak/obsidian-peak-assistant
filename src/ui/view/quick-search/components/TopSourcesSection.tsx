import React from 'react';
import { FileText, Info } from 'lucide-react';
import { mixSearchResultsBySource } from '@/core/utils/source-mixer';
import { getSourceIcon } from '@/ui/view/shared/file-utils';
import type { SearchResultItem } from '@/service/search/types';

/**
 * Score bar component for visual score breakdown
 */
const ScoreBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
	<div className="pktw-flex pktw-items-center pktw-gap-1.5" title={`${label}: ${Math.round(value)}`}>
		<span className="pktw-text-[10px] pktw-text-[#6b7280] pktw-w-2">{label[0]}</span>
		<div className="pktw-w-10 pktw-h-2 pktw-rounded-full pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-overflow-hidden">
			<div
				className="pktw-h-full pktw-rounded-full pktw-transition-all"
				style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
			/>
		</div>
		<span className="pktw-text-[10px] pktw-font-mono pktw-tabular-nums pktw-text-[#374151] pktw-w-6 pktw-text-right">
			{Math.round(value)}
		</span>
	</div>
);

/**
 * Top sources section component showing relevant files with reasoning, badges, and score breakdown
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
			<div className="pktw-space-y-3">
				{mixedSources.slice(0, visibleCount).map((source, index) => (
					<div
						key={source.id || index}
						className="pktw-p-3 pktw-rounded-lg pktw-bg-white pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/30 pktw-cursor-pointer pktw-transition-all pktw-group"
						style={{
							opacity: 0,
							transform: 'translateY(-8px)',
							animation: `fadeInSlide 0.3s ease-out ${index * 0.1}s forwards`
						}}
						onClick={() => onOpen(source)}
					>
						{/* Header row: icon, title, score */}
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<div className="pktw-flex-shrink-0">
								{getSourceIcon(source.source)}
							</div>
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-truncate group-hover:pktw-text-[#7c3aed]">
									{source.title}
								</div>
								<div className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
									{source.path}
								</div>
							</div>
							{/* Score breakdown */}
							{source.scoreDetail ? (
								<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-flex-shrink-0" title="Score breakdown: Physical/Semantic/Average">
									<ScoreBar label="Physical" value={source.scoreDetail.physical} color="#3b82f6" />
									<ScoreBar label="Semantic" value={source.scoreDetail.semantic} color="#8b5cf6" />
									<ScoreBar label="Average" value={source.scoreDetail.average} color="#22c55e" />
								</div>
							) : (
								<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-medium">
									{(source.finalScore ?? source.score) ? (source.finalScore ?? source.score ?? 0).toFixed(2) : ''}
								</div>
							)}
						</div>
						
						{/* Badges row */}
						{source.badges && source.badges.length > 0 && (
							<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mt-2">
								{source.badges.slice(0, 5).map((badge, i) => (
									<span
										key={i}
										className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed] pktw-font-medium"
									>
										{badge}
									</span>
								))}
							</div>
						)}
						
						{/* Reasoning row (content field) */}
						{source.content && (
							<div className="pktw-mt-2 pktw-flex pktw-items-start pktw-gap-1.5">
								<Info className="pktw-w-3 pktw-h-3 pktw-text-[#999999] pktw-flex-shrink-0 pktw-mt-0.5" />
								<p className="pktw-text-xs pktw-text-[#6c757d] pktw-line-clamp-2">
									{source.content}
								</p>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
};