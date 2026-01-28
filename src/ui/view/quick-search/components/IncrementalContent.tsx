import React, { useMemo } from 'react';
import { Lightbulb, Tag, FileText } from 'lucide-react';
import { InsightCard, AISearchTopic, AISearchSource } from '@/service/agents/AISearchAgent';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

// Stagger animation variants for container
const containerVariants = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: {
			staggerChildren: 0.08
		}
	}
};

// Animation variants for individual items
const itemVariants = {
	hidden: { opacity: 0, y: 10, scale: 0.95 },
	show: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: { type: "spring" as const, stiffness: 300, damping: 25 }
	},
	exit: {
		opacity: 0,
		scale: 0.9,
		transition: { duration: 0.2 }
	}
};

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

	// Dedupe arrays first to prevent duplicate key issues
	const dedupeById = <T extends { id: string }>(arr: T[]): T[] => {
		const seen = new Set<string>();
		return arr.filter(item => {
			if (seen.has(item.id)) return false;
			seen.add(item.id);
			return true;
		});
	};

	const dedupeByLabel = <T extends { label: string }>(arr: T[]): T[] => {
		const seen = new Set<string>();
		return arr.filter(item => {
			if (seen.has(item.label)) return false;
			seen.add(item.label);
			return true;
		});
	};

	const dedupedInsightCards = useMemo(() => dedupeById(insightCards), [insightCards]);
	const dedupedTopics = useMemo(() => dedupeByLabel(topics), [topics]);
	const dedupedSources = useMemo(() => dedupeById(sources), [sources]);

	const diff = useMemo(() => {
		const prev = prevStateRef.current;
		const newInsightCards = dedupedInsightCards.filter(card => !prev.insightCards.find(p => p.id === card.id));
		const removedInsightCards = prev.insightCards.filter(card => !dedupedInsightCards.find(c => c.id === card.id));
		const newTopics = dedupedTopics.filter(topic => !prev.topics.find(p => p.label === topic.label));
		const removedTopics = prev.topics.filter(topic => !dedupedTopics.find(t => t.label === topic.label));
		const newSources = dedupedSources.filter(source => !prev.sources.find(p => p.id === source.id));
		const removedSources = prev.sources.filter(source => !dedupedSources.find(s => s.id === source.id));

		// Update ref with deduped values
		prevStateRef.current = {
			insightCards: dedupedInsightCards,
			topics: dedupedTopics,
			sources: dedupedSources,
		};

		return {
			newInsightCards,
			removedInsightCards,
			newTopics,
			removedTopics,
			newSources,
			removedSources,
		};
	}, [dedupedInsightCards, dedupedTopics, dedupedSources]);

	return (
		<div className="pktw-space-y-4">
			{/* Insight Cards */}
			{(dedupedInsightCards.length > 0 || diff.newInsightCards.length > 0 || diff.removedInsightCards.length > 0) && (
				<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<Lightbulb className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Insights</span>
					</div>
					<div className="pktw-space-y-2">
						{/* New insight cards */}
						{diff.newInsightCards.map((card, index) => (
							<div key={`new-${card.id}-${index}`} className="pktw-bg-green-50 pktw-border pktw-border-green-200 pktw-rounded pktw-p-3 pktw-text-xs">
								<div className="pktw-font-medium pktw-text-green-800">{card.title}</div>
								<div className="pktw-text-green-700 pktw-mt-1">{card.description}</div>
							</div>
						))}
						{/* Removed insight cards */}
						{diff.removedInsightCards.map((card, index) => (
							<div key={`removed-${card.id}-${index}`} className="pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded pktw-p-3 pktw-text-xs pktw-line-through">
								<div className="pktw-font-medium pktw-text-red-800">{card.title}</div>
								<div className="pktw-text-red-700 pktw-mt-1">{card.description}</div>
							</div>
						))}
						{/* Existing insight cards */}
						{dedupedInsightCards.filter(card => !diff.newInsightCards.find(c => c.id === card.id)).map((card, index) => (
							<div key={`existing-${card.id}-${index}`} className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-p-3 pktw-text-xs">
								<div className="pktw-font-medium pktw-text-[#2e3338]">{card.title}</div>
								<div className="pktw-text-[#6c757d] pktw-mt-1">{card.description}</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Topics with stagger animation */}
			{(dedupedTopics.length > 0 || diff.newTopics.length > 0 || diff.removedTopics.length > 0) && (
				<motion.div 
					className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
				>
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<Tag className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Topics</span>
					</div>
					<motion.div 
						className="pktw-flex pktw-flex-wrap pktw-gap-2"
						variants={containerVariants}
						initial="hidden"
						animate="show"
					>
						<AnimatePresence mode="popLayout">
							{/* New topics with pop animation */}
							{diff.newTopics.map((topic, index) => (
								<motion.span 
									key={`new-topic-${topic.label}-${index}`} 
									className="pktw-bg-green-100 pktw-text-green-800 pktw-text-xs pktw-px-2 pktw-py-1 pktw-rounded pktw-font-medium"
									variants={itemVariants}
									layout
								>
									+ {topic.label}
								</motion.span>
							))}
							{/* Removed topics with exit animation */}
							{diff.removedTopics.map((topic, index) => (
								<motion.span 
									key={`removed-topic-${topic.label}-${index}`} 
									className="pktw-bg-red-100 pktw-text-red-800 pktw-text-xs pktw-px-2 pktw-py-1 pktw-rounded pktw-font-medium pktw-line-through"
									variants={itemVariants}
									exit="exit"
									layout
								>
									- {topic.label}
								</motion.span>
							))}
							{/* Existing topics */}
							{dedupedTopics.filter(topic => !diff.newTopics.find(t => t.label === topic.label)).map((topic, index) => (
								<motion.span 
									key={`existing-topic-${topic.label}-${index}`} 
									className="pktw-bg-[#e5e7eb] pktw-text-[#2e3338] pktw-text-xs pktw-px-2 pktw-py-1 pktw-rounded pktw-font-medium"
									variants={itemVariants}
									layout
								>
									{topic.label}
								</motion.span>
							))}
						</AnimatePresence>
					</motion.div>
				</motion.div>
			)}

			{/* Sources with layout animation */}
			{(dedupedSources.length > 0 || diff.newSources.length > 0 || diff.removedSources.length > 0) && (
				<motion.div 
					className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
				>
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
						<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Sources</span>
						<span className="pktw-text-xs pktw-text-[#9ca3af]">({dedupedSources.length})</span>
					</div>
					<LayoutGroup>
						<div className="pktw-space-y-2">
							<AnimatePresence mode="popLayout">
								{/* New sources with slide-in animation */}
								{diff.newSources.map((source, index) => (
									<motion.div 
										key={`new-source-${source.id}-${index}`} 
										className="pktw-bg-green-50 pktw-border pktw-border-green-200 pktw-rounded pktw-p-3 pktw-text-xs"
										initial={{ opacity: 0, x: -20, scale: 0.95 }}
										animate={{ opacity: 1, x: 0, scale: 1 }}
										exit={{ opacity: 0, x: 20, scale: 0.95 }}
										transition={{ type: "spring", stiffness: 300, damping: 25 }}
										layout
									>
										<div className="pktw-font-medium pktw-text-green-800">{source.title}</div>
										<div className="pktw-text-green-700 pktw-mt-1">{source.reasoning}</div>
									</motion.div>
								))}
								{/* Removed sources with exit animation */}
								{diff.removedSources.map((source, index) => (
									<motion.div 
										key={`removed-source-${source.id}-${index}`} 
										className="pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded pktw-p-3 pktw-text-xs pktw-line-through"
										initial={{ opacity: 1 }}
										exit={{ opacity: 0, height: 0, marginBottom: 0, padding: 0 }}
										transition={{ duration: 0.2 }}
										layout
									>
										<div className="pktw-font-medium pktw-text-red-800">{source.title}</div>
										<div className="pktw-text-red-700 pktw-mt-1">{source.reasoning}</div>
									</motion.div>
								))}
								{/* Existing sources with layout animation for smooth reordering */}
								{dedupedSources.filter(source => !diff.newSources.find(s => s.id === source.id)).map((source, index) => (
									<motion.div 
										key={`existing-source-${source.id}-${index}`} 
										className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-p-3 pktw-text-xs"
										layout
										transition={{ type: "spring", stiffness: 300, damping: 30 }}
									>
										<div className="pktw-font-medium pktw-text-[#2e3338]">{source.title}</div>
										<div className="pktw-text-[#6c757d] pktw-mt-1">{source.reasoning}</div>
									</motion.div>
								))}
							</AnimatePresence>
						</div>
					</LayoutGroup>
				</motion.div>
			)}
		</div>
	);
};