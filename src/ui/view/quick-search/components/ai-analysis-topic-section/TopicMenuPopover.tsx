import React, { useCallback } from 'react';
import { Copy, Search, MessageSquare, FileEdit, FileText, Network } from 'lucide-react';
import type { SearchResultItem } from '@/service/search/types';
import type { AISearchSource } from '@/service/agents/AISearchAgent';
import { Button } from '@/ui/component/shared-ui/button';
import { useAIAnalysisStore } from '../../store/aiAnalysisStore';
import { useAnalyzeTopic } from '../../hooks/useAIAnalysisPostAIInteractions';

const MENU_ITEM_CLASS =
	'pktw-shadow-none pktw-w-full pktw-text-[12px] pktw-flex pktw-items-center pktw-gap-2 disabled:pktw-opacity-50 pktw-flex pktw-justify-start';

export interface TopicMenuPopoverProps {
	open: boolean;
	anchorRect: { left: number; top: number; width: number; height: number } | null;
	topicLabel: string;
	/** AI-generated suggested questions for this topic. When provided, used instead of default suggestions. */
	suggestQuestions?: string[];
	summary: string;
	sources: AISearchSource[];
	isInspectLoading: boolean;
	onClose: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	onCopyTopicInfo: (topic: string) => void;
	onInspectTopic: (topic: string) => void;
	onRequestUserInput: (topic: string) => void;
	onViewGraphForTopic: (topic: string) => void;
	onOpenSource: (pathOrItem: string | SearchResultItem) => void;
	hasGraph: boolean;
}

/** Default suggestions when topic has no suggestQuestions from agent. */
const DEFAULT_SUGGESTED_QUESTIONS = (topic: string) => [
	`In this analysis, what are the conclusions about ${topic}?`,
	`How does ${topic} appear in my vault? (Which notes and in what way?)`,
	`Expand on ${topic} in more detail.`,
];

/**
 * Floating menu for a topic: actions only; content is shown below Key Topics.
 */
const TRUNCATE_LEN = 42;

export const TopicMenuPopover: React.FC<TopicMenuPopoverProps> = ({
	open,
	anchorRect,
	onMouseEnter,
	onMouseLeave,
	topicLabel,
	suggestQuestions,
	onCopyTopicInfo,
	isInspectLoading,
	onInspectTopic,
	onRequestUserInput,
	sources,
	onOpenSource,
	hasGraph,
	onViewGraphForTopic,
	onClose,
}) => {
	const { setTopicModalOpen } = useAIAnalysisStore();

	const { handleStartAnalyze } = useAnalyzeTopic();

	const analyzeQuestions = (suggestQuestions?.length ?? 0) > 0
		? suggestQuestions!
		: DEFAULT_SUGGESTED_QUESTIONS(topicLabel);

	const handleAnalyze = useCallback((question: string) => {
		if (!question.trim()) return;
		setTopicModalOpen(topicLabel);
		handleStartAnalyze(topicLabel, question.trim());
		onClose();
	}, [topicLabel, handleStartAnalyze, onClose]);

	if (!open || !anchorRect) return null;

	const x = anchorRect.left;
	const y = anchorRect.top + anchorRect.height + 4;
	const maxHeight = typeof window !== 'undefined' ? Math.min(400, window.innerHeight - y - 16) : 360;

	return (
		<div
			className="pktw-fixed pktw-z-[100] pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-shadow-lg pktw-min-w-[220px] pktw-max-w-[360px] pktw-overflow-hidden pktw-flex pktw-flex-col"
			style={{
				left: x,
				top: y,
				maxHeight,
			}}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className="pktw-px-2.5 pktw-py-2 pktw-border-b pktw-border-[#f3f4f6]">
				<div className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">
					{topicLabel}
				</div>
			</div>

			<div className="pktw-overflow-y-auto pktw-flex-1 pktw-py-1">
				<Button variant="ghost" style={{ cursor: 'pointer' }} className={MENU_ITEM_CLASS} onClick={() => { onCopyTopicInfo(topicLabel); onClose(); }}>
					<Copy className="pktw-w-3.5 pktw-h-3.5" />
					Copy Topic Info
				</Button>
				<Button
					variant="ghost"
					style={{ cursor: 'pointer' }}
					className={MENU_ITEM_CLASS}
					disabled={isInspectLoading}
					onClick={() => { setTopicModalOpen(topicLabel); onInspectTopic(topicLabel); onClose(); }}
				>
					<Search className="pktw-w-3.5 pktw-h-3.5" />
					{isInspectLoading ? 'Searching…' : 'Inspect Topic'}
				</Button>

				<div className="pktw-px-2.5 pktw-py-0.5 pktw-text-[11px] pktw-text-[#9ca3af]">Analyze</div>
				{analyzeQuestions.map((q, i) => (
					<Button
						variant="ghost"
						key={i}
						style={{ cursor: 'pointer' }}
						className={MENU_ITEM_CLASS}
						onClick={() => handleAnalyze(q)}
						title={q}
					>
						<MessageSquare className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
						<span className="pktw-truncate">{q.length > TRUNCATE_LEN ? `${q.slice(0, TRUNCATE_LEN)}…` : q}</span>
					</Button>
				))}
				<Button
					variant="ghost"
					style={{ cursor: 'pointer' }}
					className={MENU_ITEM_CLASS}
					onClick={() => { onRequestUserInput(topicLabel); onClose(); }}
				>
					<MessageSquare className="pktw-w-3.5 pktw-h-3.5" />
					User input question…
				</Button>

				<div className="pktw-border-t pktw-border-[#f3f4f6] pktw-my-1" />
				<div className="pktw-px-2.5 pktw-py-0.5 pktw-text-[11px] pktw-text-[#9ca3af]">Sources from this analysis</div>
				{hasGraph ? (
					<Button
						variant="ghost"
						style={{ cursor: 'pointer' }}
						className={MENU_ITEM_CLASS}
						onClick={() => { setTopicModalOpen(topicLabel); onViewGraphForTopic(topicLabel); onClose(); }}
					>
						<Network className="pktw-w-3.5 pktw-h-3.5" />
						View graph for this topic
					</Button>
				) : null}
				{sources.slice(0, 6).map((s, i) => (
					<Button
						variant="ghost"
						style={{ cursor: 'pointer' }}
						key={i}
						className={MENU_ITEM_CLASS}
						onClick={() => { setTopicModalOpen(topicLabel); onOpenSource(s.path); onClose(); }}
					>
						<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
						<span className="pktw-truncate">{s.title || s.path}</span>
					</Button>
				))}
			</div>
		</div>
	);
};
