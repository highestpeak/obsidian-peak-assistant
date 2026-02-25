import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
	useAIAnalysisSummaryStore,
	useAIAnalysisResultStore,
	useAIAnalysisTopicsStore,
	getHasGraphData,
} from '../../store/aiAnalysisStore';
import { useAnalyzeTopicResults } from '../../hooks/useAIAnalysisResult';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { TopicMenuPopover } from '../ai-analysis-topic-section/TopicMenuPopover';
import { TopicCapsule } from '../ai-analysis-topic-section/TopicCapsule';
import { loadGraphForTopic } from '../ai-analysis-topic-section/TopicGraphPopover';
import { InlineFollowupChat } from '@/ui/component/mine/InlineFollowupChat';
import { useTopicFollowupChatConfig } from '../../hooks/useAIAnalysisPostAIInteractions';
import type { AISearchTopic } from '@/service/agents/AISearchAgent';

const getSizeClasses = (size: string) => {
	switch (size) {
		case 'lg':
			return 'pktw-text-sm pktw-px-3 pktw-py-1.5';
		case 'md':
			return 'pktw-text-xs pktw-px-2.5 pktw-py-1';
		case 'sm':
			return 'pktw-text-xs pktw-px-2 pktw-py-0.5';
		default:
			return 'pktw-text-xs pktw-px-2 pktw-py-1';
	}
};

const getColorClasses = (size: string) => {
	switch (size) {
		case 'lg':
			return 'pktw-bg-violet-100 pktw-text-violet-800 pktw-border-violet-300 hover:pktw-bg-violet-200 hover:pktw-text-violet-900 hover:pktw-border-violet-400';
		case 'md':
			return 'pktw-bg-violet-50 pktw-text-violet-700 pktw-border-violet-200 hover:pktw-bg-violet-100 hover:pktw-text-violet-800 hover:pktw-border-violet-300';
		case 'sm':
		default:
			return 'pktw-bg-white pktw-text-violet-600 pktw-border-violet-100 hover:pktw-bg-violet-50 hover:pktw-text-violet-700 hover:pktw-border-violet-200';
	}
};

interface TagCloudProps {
	topics?: AISearchTopic[];
	onTopicHover?: (topicLabel: string, evt: React.MouseEvent) => void;
	onTopicLeave?: () => void;
}

/**
 * Tag cloud for AI search insights. Hover a topic to open its menu.
 */
export const TagCloud: React.FC<TagCloudProps> = ({ topics, onTopicHover, onTopicLeave }) => {
	if (!topics || topics.length === 0) {
		return (
			<span className="pktw-text-xs pktw-text-[#999999]">No topics extracted yet...</span>
		);
	}

	const displayTags = [...topics]
		.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
		.map((topic) => {
			const w = topic.weight ?? 0.5;
			let size: 'lg' | 'md' | 'sm' = 'sm';
			if (w >= 0.75) size = 'lg';
			else if (w >= 0.5) size = 'md';
			return { name: topic.label, size };
		});

	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
			{displayTags.map((tag, index) => (
				<motion.div
					key={index}
					initial={{ opacity: 0, y: 6, scale: 0.98 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{ duration: 0.22, delay: Math.min(0.6, index * 0.04) }}
				>
					<Button
						variant="ghost"
						style={{ cursor: 'pointer' }}
						className={cn(
							getSizeClasses(tag.size),
							getColorClasses(tag.size),
							'pktw-shadow-none pktw-rounded-md pktw-border pktw-h-auto pktw-font-medium hover:pktw-shadow-sm active:pktw-scale-95'
						)}
						title="Hover for menu"
						onMouseEnter={(evt) => onTopicHover?.(tag.name, evt)}
						onMouseLeave={onTopicLeave}
					>
						{tag.name}
					</Button>
				</motion.div>
			))}
		</div>
	);
};

export interface TagCloudSectionProps {
	topics?: AISearchTopic[];
	onClose?: () => void;
}

/**
 * Tag cloud section with topic menu (Copy, Inspect, Analyze, Create Note) and manual add topic.
 */
export const TopicSection: React.FC<TagCloudSectionProps> = ({
	topics = [],
	onClose,
}) => {
	const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);
	const sources = useAIAnalysisResultStore((s) => s.sources);
	const addTopic = useAIAnalysisResultStore((s) => s.addTopic);

	const topicAnalyzeStreaming = useAIAnalysisTopicsStore((s) => s.topicAnalyzeStreaming);
	const topicAnalyzeResults = useAIAnalysisTopicsStore((s) => s.topicAnalyzeResults);
	const topicInspectResults = useAIAnalysisTopicsStore((s) => s.topicInspectResults);
	const topicGraphResults = useAIAnalysisTopicsStore((s) => s.topicGraphResults);
	const topicGraphLoading = useAIAnalysisTopicsStore((s) => s.topicGraphLoading);
	const topicInspectLoading = useAIAnalysisTopicsStore((s) => s.topicInspectLoading);
	const setTopicGraphLoading = useAIAnalysisTopicsStore((s) => s.setTopicGraphLoading);
	const setTopicGraphResult = useAIAnalysisTopicsStore((s) => s.setTopicGraphResult);
	const setTopicAnalyzeStreaming = useAIAnalysisTopicsStore((s) => s.setTopicAnalyzeStreaming);
	const setTopicAnalyzeStreamingAppend = useAIAnalysisTopicsStore((s) => s.setTopicAnalyzeStreamingAppend);
	const setTopicAnalyzeResult = useAIAnalysisTopicsStore((s) => s.setTopicAnalyzeResult);
	const setTopicModalOpen = useAIAnalysisTopicsStore((s) => s.setTopicModalOpen);

	const streamingTextLengthRef = useRef(0);

	const summary = summaryChunks.join('');

	const [menu, setMenu] = useState<{
		open: boolean;
		anchorRect: { left: number; top: number; width: number; height: number } | null;
		topicLabel: string;
	}>({ open: false, anchorRect: null, topicLabel: '' });

	// all topics state ===============================================

	const expansionTopics = useMemo(() => {
		// all topics that are being analyzed, inspected, or have a graph 
		const set = new Set<string>();
		if (topicAnalyzeStreaming?.topic) set.add(topicAnalyzeStreaming.topic);
		Object.keys(topicAnalyzeResults ?? {}).forEach((t) => set.add(t));
		Object.keys(topicInspectResults ?? {}).forEach((t) => set.add(t));
		Object.keys(topicGraphResults ?? {}).forEach((t) => set.add(t));
		if (topicGraphLoading) set.add(topicGraphLoading);
		if (topicInspectLoading) set.add(topicInspectLoading);
		return Array.from(set);
	}, [topicAnalyzeResults, topicAnalyzeStreaming, topicInspectResults, topicGraphResults, topicGraphLoading, topicInspectLoading]);
	const otherTopics = useMemo(() => {
		// all topics that are not being analyzed, inspected, or have a graph
		const expSet = new Set(expansionTopics);
		return topics.filter((t) => !expSet.has(String(t.label).trim()));
	}, [topics, expansionTopics]);

	// user input question for a topic to ask about ===============================================

	const [userInputTopic, setUserInputTopic] = useState<string | null>(null);

	const handleRequestUserInput = useCallback((topic: string) => {
		setUserInputTopic(topic);
		setMenu((m) => ({ ...m, open: false }));
	}, []);

	// manual add topic input ===============================================

	const [showAddInput, setShowAddInput] = useState(false);
	const [addTopicValue, setAddTopicValue] = useState('');
	const [userInputDuplicate, setUserInputDuplicate] = useState(false);

	// hover menu close delay ===============================================

	const closeDelayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearCloseDelay = useCallback(() => {
		if (closeDelayRef.current) {
			clearTimeout(closeDelayRef.current);
			closeDelayRef.current = null;
		}
	}, []);

	const topicFollowupConfig = useTopicFollowupChatConfig({ summary, topicLabel: userInputTopic });

	const scheduleClose = useCallback(() => {
		clearCloseDelay();
		closeDelayRef.current = setTimeout(() => {
			closeDelayRef.current = null;
			setMenu((m) => ({ ...m, open: false }));
		}, 200);
	}, [clearCloseDelay]);

	useEffect(() => () => clearCloseDelay(), [clearCloseDelay]);

	const handleTopicHover = useCallback((topicLabel: string, evt: React.MouseEvent) => {
		clearCloseDelay();
		const el = (evt.currentTarget as HTMLElement).getBoundingClientRect();
		setMenu({
			open: true,
			anchorRect: { left: el.left, top: el.top, width: el.width, height: el.height },
			topicLabel,
		});
	}, [clearCloseDelay]);

	const { handleInspectTopic, handleCopyTopicInfo } = useAnalyzeTopicResults();

	const handleViewGraphForTopic = useCallback(
		async (topic: string) => {
			setTopicGraphLoading(topic);
			try {
				const graphPreview = await loadGraphForTopic(topic);
				setTopicGraphResult(topic, graphPreview);
			} catch (e) {
				console.warn('[TagCloudSection] Load graph failed:', e);
				setTopicGraphResult(topic, { nodes: [], edges: [] });
			} finally {
				setTopicGraphLoading(null);
			}
		},
		[setTopicGraphLoading, setTopicGraphResult]
	);

	const handleAddTopicConfirm = useCallback(() => {
		const trimmed = addTopicValue.trim();
		if (!trimmed) return;
		const current = useAIAnalysisResultStore.getState().topics;
		const seen = new Set(current.map((t) => String(t.label).toLowerCase()));
		if (seen.has(trimmed.toLowerCase())) {
			setUserInputDuplicate(true);
			setTimeout(() => {
				setUserInputDuplicate(false);
			}, 2000);
			return;
		}
		addTopic({ label: trimmed, weight: 0.5 });
		setAddTopicValue('');
		setShowAddInput(false);
	}, [addTopicValue, addTopic]);

	if (!topics || topics.length === 0) return null;

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]" data-topic-menu>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Key Topics</span>
			</div>

			{/* Single row: capsules first (with expansion), then tag pills (no expansion) */}
			<div className="pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2">
				{/* Expansion topics as narrow capsules; click opens TopicModal */}
				{expansionTopics.map((label) => (
					<div key={label} className="pktw-w-[180px] pktw-flex-shrink-0">
						<TopicCapsule
							topicLabel={label}
							onHover={(evt) => handleTopicHover(label, evt)}
							onLeave={scheduleClose}
						/>
					</div>
				))}
				{otherTopics.length > 0 ? (
					<TagCloud topics={otherTopics} onTopicHover={handleTopicHover} onTopicLeave={scheduleClose} />
				) : expansionTopics.length === 0 ? (
					<span className="pktw-text-xs pktw-text-[#999999]">No topics extracted yet...</span>
				) : null}
				{/* Manual add topic */}
				{!showAddInput ? (
					<Button
						variant="ghost"
						size="sm"
						style={{ cursor: 'pointer' }}
						className="pktw-shadow-none pktw-rounded-md pktw-border pktw-border-dashed pktw-border-violet-300 pktw-text-violet-600 pktw-font-medium pktw-inline-flex pktw-items-center pktw-justify-center"
						title="Add topic"
						onClick={() => setShowAddInput((v) => !v)}
					>
						<Plus className="pktw-w-4 pktw-h-4" />
					</Button>
				) : (
					<div className="pktw-inline-flex pktw-items-center pktw-gap-1">
						<input
							className="pktw-h-8 pktw-w-40 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-px-2 pktw-text-xs"
							value={addTopicValue}
							onChange={(e) => setAddTopicValue(e.target.value)}
							placeholder="Topic name"
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleAddTopicConfirm();
								if (e.key === 'Escape') setShowAddInput(false);
							}}
							autoFocus
						/>
						<Button
							size="sm"
							className={cn("pktw-h-8", userInputDuplicate ? 'pktw-bg-red-500 hover:pktw-bg-red-600 pktw-text-white' : '')}
							onClick={handleAddTopicConfirm}
						>
							{userInputDuplicate ? 'Duplicate Topic (X)' : 'Confirm'}
						</Button>
					</div>
				)}
			</div>

			{/* Full-width inline follow-up chat (smooth appear) */}
			<AnimatePresence>
				{userInputTopic !== null && (
					<motion.div
						key={userInputTopic}
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: 'auto' }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.2, ease: 'easeOut' }}
						className="pktw-mt-3 pktw-overflow-hidden"
					>
						<InlineFollowupChat
							{...topicFollowupConfig}
							hideModeToggle={true}
							outputPlace="modal"
							onOpenModal={(question) => {
								setTopicModalOpen(userInputTopic!);
								streamingTextLengthRef.current = 0;
								setTopicAnalyzeStreaming({ topic: userInputTopic!, question, chunks: [] });
							}}
							onStreamingReplace={(text, ctx) => {
								if (text !== null && ctx?.question != null) {
									const chunk = text.length > streamingTextLengthRef.current ? text.slice(streamingTextLengthRef.current) : '';
									streamingTextLengthRef.current = text.length;
									if (chunk) setTopicAnalyzeStreamingAppend(chunk);
								}
							}}
							onApply={(answer, _mode, question) => {
								setTopicAnalyzeResult(userInputTopic!, question ?? '', answer);
								setTopicAnalyzeStreaming(null);
								setUserInputTopic(null);
							}}
							onCancel={() => setUserInputTopic(null)}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			<TopicMenuPopover
				open={menu.open}
				anchorRect={menu.anchorRect}
				topicLabel={menu.topicLabel}
				suggestQuestions={topics.find((t) => t.label === menu.topicLabel)?.suggestQuestions}
				summary={summary}
				sources={sources}
				isInspectLoading={topicInspectLoading === menu.topicLabel}
				onClose={() => setMenu((m) => ({ ...m, open: false }))}
				onMouseEnter={clearCloseDelay}
				onMouseLeave={scheduleClose}
				onCopyTopicInfo={handleCopyTopicInfo}
				onInspectTopic={handleInspectTopic}
				onRequestUserInput={handleRequestUserInput}
				onViewGraphForTopic={handleViewGraphForTopic}
				hasGraph={getHasGraphData()}
				onOpenSource={createOpenSourceCallback(onClose)}
			/>
		</div>
	);
};
