import React from 'react';
import { Sparkles } from 'lucide-react';
import { Streamdown } from 'streamdown';

/**
 * AI analysis result section component
 */
export const AnalysisSection: React.FC<{ summary: string; isStreaming: boolean }> = ({ summary, isStreaming }) => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-text-lg">AI Analysis</span>
		</div>
		<div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
			<div className="pktw-select-text" data-streamdown-root>
				{summary ? (
					<Streamdown isAnimating={isStreaming}>{summary}</Streamdown>
				) : (
					<span className="pktw-text-[#999999]">No summary available.</span>
				)}
			</div>
		</div>
	</div>
);