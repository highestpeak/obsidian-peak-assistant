import React, { useMemo } from 'react';
import { Lightbulb, Tag, FileText } from 'lucide-react';
import { InsightCard, AISearchTopic, AISearchSource } from '@/service/agents/AISearchAgent';

/**
 * Incremental content component - shows new/changed content with diff highlighting
 */
export const IncrementalContent: React.FC<{
	insightCards: InsightCard[];
	topics: AISearchTopic[];
	sources: AISearchSource[];
}> = ({ insightCards, topics, sources }) => {
	// Track previous state for diff calculation
	const prevStateRef = React.useRef({
		insightCards: [] as InsightCard[],
		topics: [] as AISearchTopic[],
		sources: [] as AISearchSource[],
	});

	const diff = useMemo(() => {
		const prev = prevStateRef.current;
		const newInsightCards = insightCards.filter(card => !prev.insightCards.find(p => p.id === card.id));
		const removedInsightCards = prev.insightCards.filter(card => !insightCards.find(c => c.id === card.id));
		const newTopics = topics.filter(topic => !prev.topics.find(p => p.label === topic.label));
		const removedTopics = prev.topics.filter(topic => !topics.find(t => t.label === topic.label));
		const newSources = sources.filter(source => !prev.sources.find(p => p.id === source.id));
		const removedSources = prev.sources.filter(source => !sources.find(s => s.id === source.id));

		// Update ref
		prevStateRef.current = { insightCards, topics, sources };

		return {
			newInsightCards,
			removedInsightCards,
			newTopics,
			removedTopics,
			newSources,
			removedSources,
		};
	}, [insightCards, topics, sources]);

	return (
		<div className="pktw-space-y-4">
			{/* Insight Cards */}
			{(insightCards.length > 0 || diff.newInsightCards.length > 0 || diff.removedInsightCards.length > 0) && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<Lightbulb className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Insights</span>
					</div>
					<div className="pktw-space-y-2">
						{/* New insight cards */}
						{diff.newInsightCards.map((card) => (
							<div key={'new' + card.id} className="pktw-bg-green-50 pktw-border pktw-border-green-200 pktw-rounded pktw-p-3 pktw-text-xs">
								<div className="pktw-font-medium pktw-text-green-800">{card.title}</div>
								<div className="pktw-text-green-700 pktw-mt-1">{card.description}</div>
							</div>
						))}
						{/* Removed insight cards */}
						{diff.removedInsightCards.map((card) => (
							<div key={'removed' + card.id} className="pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded pktw-p-3 pktw-text-xs pktw-line-through">
								<div className="pktw-font-medium pktw-text-red-800">{card.title}</div>
								<div className="pktw-text-red-700 pktw-mt-1">{card.description}</div>
							</div>
						))}
						{/* Existing insight cards */}
						{insightCards.filter(card => !diff.newInsightCards.find(c => c.id === card.id)).map((card) => (
							<div key={'existing' + card.id} className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-p-3 pktw-text-xs">
								<div className="pktw-font-medium pktw-text-[#2e3338]">{card.title}</div>
								<div className="pktw-text-[#6c757d] pktw-mt-1">{card.description}</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Topics */}
			{(topics.length > 0 || diff.newTopics.length > 0 || diff.removedTopics.length > 0) && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<Tag className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Topics</span>
					</div>
					<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
						{/* New topics */}
						{diff.newTopics.map((topic) => (
							<span key={'new' + topic.label} className="pktw-bg-green-100 pktw-text-green-800 pktw-text-xs pktw-px-2 pktw-py-1 pktw-rounded pktw-font-medium">
								+ {topic.label}
							</span>
						))}
						{/* Removed topics */}
						{diff.removedTopics.map((topic) => (
							<span key={'removed' + topic.label} className="pktw-bg-red-100 pktw-text-red-800 pktw-text-xs pktw-px-2 pktw-py-1 pktw-rounded pktw-font-medium pktw-line-through">
								- {topic.label}
							</span>
						))}
						{/* Existing topics */}
						{topics.filter(topic => !diff.newTopics.find(t => t.label === topic.label)).map((topic) => (
							<span key={'existing' + topic.label} className="pktw-bg-[#e5e7eb] pktw-text-[#2e3338] pktw-text-xs pktw-px-2 pktw-py-1 pktw-rounded pktw-font-medium">
								{topic.label}
							</span>
						))}
					</div>
				</div>
			)}

			{/* Sources */}
			{(sources.length > 0 || diff.newSources.length > 0 || diff.removedSources.length > 0) && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Sources</span>
					</div>
					<div className="pktw-space-y-2">
						{/* New sources */}
						{diff.newSources.map((source) => (
							<div key={'new' + source.id} className="pktw-bg-green-50 pktw-border pktw-border-green-200 pktw-rounded pktw-p-3 pktw-text-xs">
								<div className="pktw-font-medium pktw-text-green-800">{source.title}</div>
								<div className="pktw-text-green-700 pktw-mt-1">{source.reasoning}</div>
							</div>
						))}
						{/* Removed sources */}
						{diff.removedSources.map((source) => (
							<div key={'removed' + source.id} className="pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded pktw-p-3 pktw-text-xs pktw-line-through">
								<div className="pktw-font-medium pktw-text-red-800">{source.title}</div>
								<div className="pktw-text-red-700 pktw-mt-1">{source.reasoning}</div>
							</div>
						))}
						{/* Existing sources */}
						{sources.filter(source => !diff.newSources.find(s => s.id === source.id)).map((source) => (
							<div key={'existing' + source.id} className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-p-3 pktw-text-xs">
								<div className="pktw-font-medium pktw-text-[#2e3338]">{source.title}</div>
								<div className="pktw-text-[#6c757d] pktw-mt-1">{source.reasoning}</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};