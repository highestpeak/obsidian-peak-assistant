import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useAIAnalysisStore, type SectionAnalyzeResult } from '../../store/aiAnalysisStore';
import { Button } from '@/ui/component/shared-ui/button';

const SUMMARY_MAX_LEN = 80;

/** One-line summary from first analyze result or streaming answer. */
function getTopicSummary(
	analyzeResults: SectionAnalyzeResult[],
	streamingAnswer?: string | null
): string {
	const text = streamingAnswer?.trim() ?? analyzeResults?.[0]?.answer?.trim() ?? '';
	if (!text) return '';
	const cleaned = text.replace(/\s+/g, ' ').trim();
	if (cleaned.length <= SUMMARY_MAX_LEN) return cleaned;
	return cleaned.slice(0, SUMMARY_MAX_LEN) + '…';
}

export interface TopicCapsuleProps {
	topicLabel: string;
	onHover?: (evt: React.MouseEvent) => void;
	onLeave?: () => void;
}

/** Compact topic capsule: label + one-line summary. Click opens drawer. */
export const TopicCapsule: React.FC<TopicCapsuleProps> = ({
	topicLabel,
	onHover,
	onLeave,
}) => {
	const { topicAnalyzeResults, topicAnalyzeStreaming, setTopicModalOpen } = useAIAnalysisStore();
	const summary = getTopicSummary(
		topicAnalyzeResults?.[topicLabel] ?? [],
		topicAnalyzeStreaming?.topic === topicLabel ? topicAnalyzeStreaming.chunks.join('') : null
	);
	return (
		<Button
			variant="ghost"
			style={{ cursor: 'pointer' }}
			onClick={() => {
				setTopicModalOpen(topicLabel);
			}}
			onMouseEnter={onHover}
			onMouseLeave={onLeave}
			className="pktw-shadow-none pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-text-left pktw-bg-white pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/40 hover:pktw-bg-[#fafafa] pktw-transition-colors pktw-group"
		>
			<div className="pktw-flex-1 pktw-min-w-0">
				<div className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">
					{topicLabel}
				</div>
				{summary ? (
					<div className="pktw-text-xs pktw-text-[#6b7280] pktw-mt-0.5 pktw-line-clamp-2">
						{summary}
					</div>
				) : null}
			</div>
			<ChevronRight className="pktw-w-4 pktw-h-4 pktw-flex-shrink-0 pktw-text-[#9ca3af] group-hover:pktw-text-[#7c3aed]" />
		</Button>
	);
};
