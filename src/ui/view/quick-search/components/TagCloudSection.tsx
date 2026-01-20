import React from 'react';
import { Sparkles } from 'lucide-react';
import { TagCloud } from './TagCloud';

/**
 * Tag cloud section component
 */
export const TagCloudSection: React.FC<{
	topics?: Array<{ label: string; weight: number }>;
	topicsRawText?: string;
}> = ({ topics, topicsRawText }) => {
	const showRawText = topicsRawText && (!topics || topics.length === 0);
	const scrollContainerRef = React.useRef<HTMLDivElement>(null);

	// Auto-scroll to the right when new text is added
	React.useEffect(() => {
		if (showRawText && scrollContainerRef.current) {
			const container = scrollContainerRef.current;
			// Scroll to the rightmost position
			container.scrollLeft = container.scrollWidth;
		}
	}, [topicsRawText, showRawText]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Key Topics</span>
			</div>
			{showRawText ? (
				<div
					ref={scrollContainerRef}
					className="pktw-w-full pktw-overflow-x-auto pktw-py-2 pktw-scroll-smooth"
				>
					<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-mono pktw-whitespace-nowrap pktw-animate-pulse">
						{topicsRawText}
						<span className="pktw-inline-block pktw-w-2 pktw-h-4 pktw-bg-[#7c3aed] pktw-ml-1 pktw-animate-pulse" />
					</div>
				</div>
			) : (
				<TagCloud topics={topics} />
			)}
			<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-3">
				Click any topic to search
			</span>
		</div>
	);
};