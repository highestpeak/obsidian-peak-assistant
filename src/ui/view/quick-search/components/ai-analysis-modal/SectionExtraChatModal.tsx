import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import { AppContext } from '@/app/context/AppContext';
import { openFile } from '@/core/utils/obsidian-utils';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { IntelligenceFrame } from '../../../../component/mine/IntelligenceFrame';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { SectionAnalyzeResult } from '../../store/aiAnalysisStore';
import { StreamdownIsolated } from '@/ui/component/mine';
import { ChevronDown, ChevronRight, FileText, MessageSquare, Network } from 'lucide-react';
import { GraphVisualization } from '@/ui/component/mine/GraphVisualization';
import { Button } from '@/ui/component/shared-ui/button';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { createObsidianGraphPreset } from '../../presets/obsidianGraphPreset';
import { useStreamdownWikilinkClick } from '../../callbacks/useStreamdownWikilinkClick';

enum SectionType {
	ANALYZE = 'analyze',
	INSPECT = 'inspect',
	GRAPH = 'graph',
}

type AnalyzeItem = {
	question: string;
	answerSoFar: string;
	isStreaming: boolean;
}

const AnalyzeItemSection: React.FC<{
	item: AnalyzeItem;
	collapsed: boolean;
	onToggle: () => void;
	onClose: () => void;
}> = ({ item, collapsed, onToggle, onClose }) => {
	const titleForQuestion = (q: string) => {
		const t = q.trim();
		if (t.length <= QUESTION_TITLE_MAX) return t;
		return t.slice(0, QUESTION_TITLE_MAX) + '…';
	};

	const title = `AI analysis - ${titleForQuestion(item.question)}`;

	return (
		<div className="pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-overflow-hidden">
			<Button
				variant="ghost"
				size="sm"
				style={{ cursor: 'pointer' }}
				className="pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-gap-2 pktw-bg-[#f9fafb]"
				onClick={(e) => { e.stopPropagation(); onToggle(); }}
			>
				{collapsed
					? <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
					: <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
				}
				<MessageSquare className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
				<span className="pktw-truncate">{title}</span>
				{item.isStreaming && <span className="pktw-text-[10px] pktw-text-violet-500 pktw-flex-shrink-0">streaming…</span>}
			</Button>
			{!collapsed && (
				<div className="pktw-p-2 pktw-bg-white">
					<StreamdownIsolated
						className="pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none"
						isAnimating={item.isStreaming}
						onClick={useStreamdownWikilinkClick(createOpenSourceCallback(onClose))}
					>
						{item.answerSoFar || (item.isStreaming ? 'Streaming…' : '')}
					</StreamdownIsolated>
				</div>
			)}
		</div>
	)
};

const InspectItem: React.FC<{
	inspectItems: SearchResultItem[];
	isInspectLoading: boolean;
	collapsed: boolean;
	onToggle: () => void;
	onClose: () => void;
}> = ({ inspectItems, isInspectLoading, collapsed, onToggle, onClose }) => {
	return (
		<div className="pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-overflow-hidden">
			<Button
				variant="ghost"
				size="sm"
				style={{ cursor: 'pointer' }}
				className="pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-gap-2 pktw-bg-[#f9fafb]"
				onClick={(e) => { e.stopPropagation(); onToggle(); }}
			>
				{collapsed
					? <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
					: <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
				}
				<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
				<span className="pktw-truncate">Inspect</span>
				{isInspectLoading && <span className="pktw-text-[10px] pktw-text-violet-500 pktw-flex-shrink-0">Searching...</span>}
			</Button>
			{!collapsed && (inspectItems.map((item) => (
				<li key={item.id ?? item.path}>
					<Button
						variant="ghost"
						style={{ cursor: 'pointer' }}
						className="pktw-text-left pktw-text-xs pktw-text-[#7c3aed] hover:pktw-text-violet-700 hover:pktw-underline pktw-truncate pktw-block pktw-w-full pktw-cursor-pointer"
						onClick={() => createOpenSourceCallback(onClose)(item)}
						title={item.path}
					>
						{item.title || item.path}
					</Button>
				</li>
			)))}
		</div>
	);
};

const GraphItemSection: React.FC<{
	graph: GraphPreview;
	isGraphLoading: boolean;
	collapsed: boolean;
	onToggle: () => void;
	onClose: () => void;
}> = ({ graph, isGraphLoading, collapsed, onToggle, onClose }) => {
	const obsidianPreset = useMemo(
		() =>
			createObsidianGraphPreset({
				onOpenPath: createOpenSourceCallback(onClose),
				openFile: (path) => openFile(AppContext.getInstance().app, path, true),
			}),
		[onClose]
	);

	return (
		<div className="pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-overflow-hidden">
			<Button
				variant="ghost"
				size="sm"
				style={{ cursor: 'pointer' }}
				className="pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-gap-2 pktw-bg-[#f9fafb]"
				onClick={(e) => { e.stopPropagation(); onToggle(); }}
			>
				{collapsed
					? <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
					: <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
				}
				<Network className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0" />
				<span className="pktw-truncate">Graph</span>
				{isGraphLoading && <span className="pktw-text-[10px] pktw-text-violet-500 pktw-flex-shrink-0">Loading...</span>}
			</Button>
			{!collapsed ? (
				graph.nodes?.length > 0 ? (
					<div className="pktw-h-[280px] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden">
						<GraphVisualization
							{...obsidianPreset}
							graph={graph}
							containerClassName="pktw-w-full pktw-h-full"
						/>
					</div>
				) : (
					<div className="pktw-h-[120px] pktw-flex pktw-items-center pktw-justify-center pktw-bg-[#f9fafb] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-text-xs pktw-text-[#9ca3af]">
						No graph data for this topic
					</div>
				)
			) : null}
		</div>
	);
};

interface SectionExtraChatCardProps {
	/** Currently streaming for this topic: { question, answerSoFar }. */
	streaming?: { question: string; answerSoFar: string } | null;
	/** Completed Q&A from Analyze. */
	analyzeResults?: SectionAnalyzeResult[];
	activeQuestion?: string;

	inspectItems: SearchResultItem[];
	isInspectLoading: boolean;

	graph: GraphPreview | null;
	isGraphLoading: boolean;

	/** Called when user interacts with the card (e.g. click header) to move it to top. */
	onClose: () => void;
	onInteract?: () => void;
}

const QUESTION_TITLE_MAX = 56;

/**
 * Single expansion card: each AI analysis Q&A as its own section, Inspect, Graph.
 */
const SectionExtraChatCard: React.FC<SectionExtraChatCardProps> = ({
	activeQuestion,
	streaming,
	analyzeResults,

	inspectItems,
	isInspectLoading,

	graph,
	isGraphLoading,

	onClose,
	onInteract,
}) => {
	// we should remember the trigger section, and don't auto collapse it after streaming/loading is complete
	const triggerSection = useRef<string | null>(null);

	// streaming is first item, then analyze results
	const analyzeItems = useMemo(() => {
		const list: Array<AnalyzeItem> = [];
		if (streaming) {
			list.push({
				question: streaming.question,
				answerSoFar: streaming.answerSoFar,
				isStreaming: true
			});
		}
		analyzeResults?.forEach((r) => list.push({
			question: r.question,
			answerSoFar: r.answer,
			isStreaming: false
		}));
		return list;
	}, [streaming, analyzeResults]);

	// only set the collapsed sections if there is data loading
	const initialCollapsedSections = useCallback((): Set<string> => {
		const set = new Set<string>();

		// analysis items
		const count = (streaming ? 1 : 0) + (analyzeResults?.length ?? 0);
		for (let i = 0; i < count; i++) {
			const isStreaming = i === 0 && !!streaming;
			if (isStreaming) {
				triggerSection.current = SectionType.ANALYZE + '-' + i;
				continue;
			}

			if (activeQuestion && activeQuestion === analyzeResults?.[i]?.question) {
				triggerSection.current = SectionType.ANALYZE + '-' + i;
				continue;
			}

			set.add(SectionType.ANALYZE + '-' + i);
		}

		// graph item
		if (!isGraphLoading) {
			set.add(SectionType.GRAPH);
		} else {
			triggerSection.current = SectionType.GRAPH;
		}

		// inspect items
		if (!isInspectLoading) {
			set.add(SectionType.INSPECT)
		} else {
			triggerSection.current = SectionType.INSPECT;
		}

		return set;
	}, [streaming, isGraphLoading, isInspectLoading, activeQuestion]);

	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

	// useEffect(() => {
	// 	setCollapsedSections(initialCollapsedSections());
	// }, [initialCollapsedSections]);

	// Sync collapsed state when list grows (e.g. new round completed) in defaultCollapsed mode
	React.useEffect(() => {
		setCollapsedSections(
			initialCollapsedSections()
		);
	}, [initialCollapsedSections, analyzeItems.length, streaming, isGraphLoading, isInspectLoading]);

	const toggleSection = useCallback((sectionId: string) => {
		if (sectionId === triggerSection.current) {
			triggerSection.current = null;
			setCollapsedSections((prev) => {
				const next = new Set(prev);
				next.add(sectionId);
				return next;
			});
		} else {
			setCollapsedSections((prev) => {
				const next = new Set(prev);
				if (next.has(sectionId)) next.delete(sectionId);
				else next.add(sectionId);
				return next;
			});
		}
		onInteract?.();
	}, [onInteract, setCollapsedSections]);

	const shouldCollapseSection = useCallback((sectionId: string) => {
		return collapsedSections.has(sectionId) && sectionId !== triggerSection.current;
	}, [collapsedSections, triggerSection]);

	const hasAnalyze = analyzeItems.length > 0;
	const hasInspect = inspectItems.length > 0 || isInspectLoading;
	const hasGraph = graph || isGraphLoading;

	if (!hasAnalyze && !hasInspect && !hasGraph) return null;

	return (
		<div className="pktw-bg-white pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden">
			<div className="pktw-p-3 pktw-flex pktw-flex-col pktw-gap-3">
				{/* Each AI analysis Q&A as its own section */}
				{hasAnalyze && analyzeItems
					// when streaming, only show the streaming item.
					// this is because the auto scroll may scroll over the streaming item. 
					// it's a simple way to avoid this problem
					.filter((item) => streaming ? item.isStreaming : true)
					.map((item, index) => {
						return <AnalyzeItemSection
							key={index}
							item={item}
							collapsed={shouldCollapseSection(SectionType.ANALYZE + '-' + index)}
							onToggle={() => toggleSection(SectionType.ANALYZE + '-' + index)}
							onClose={onClose}
						/>
					})}

				{/* Inspect */}
				{hasInspect && !streaming && (
					<InspectItem
						inspectItems={inspectItems}
						isInspectLoading={isInspectLoading}
						collapsed={shouldCollapseSection(SectionType.INSPECT)}
						onToggle={() => toggleSection(SectionType.INSPECT)}
						onClose={onClose} />
				)}

				{/* Graph */}
				{hasGraph && graph && !streaming && (
					<GraphItemSection
						graph={graph}
						isGraphLoading={isGraphLoading}
						collapsed={shouldCollapseSection(SectionType.GRAPH)}
						onToggle={() => toggleSection(SectionType.GRAPH)}
						onClose={onClose}
					/>
				)}
			</div>
		</div>
	);
};

export interface SectionExtraChatModalProps {
	title: string;

	streaming?: { question: string; answerSoFar: string } | null;
	analyzeResults: SectionAnalyzeResult[];
	activeQuestion?: string;

	isInspectLoading: boolean;
	inspectItems: SearchResultItem[];

	isGraphLoading: boolean;
	graph: GraphPreview | null;

	onClose: () => void;
	onInteract?: () => void;
}

/** Centered modal to show full topic expansion (Q&A, Inspect, Graph). Uses custom overlay to stay above search modal. */
export const SectionExtraChatModal: React.FC<SectionExtraChatModalProps> = ({
	title: headerTitle,

	streaming,
	analyzeResults,
	activeQuestion,

	isInspectLoading,
	inspectItems,

	isGraphLoading,
	graph,

	onClose,
	onInteract,
}) => {
	const scrollRef = useRef<HTMLDivElement>(null);
	const isStreaming = !!streaming?.answerSoFar;

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
			e.stopPropagation();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [open, onClose]);

	useEffect(() => {
		if (isStreaming && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [streaming?.answerSoFar, isStreaming]);

	return (
		<div
			className="pktw-fixed pktw-inset-0 pktw-bg-black/20 pktw-flex pktw-items-center pktw-justify-center pktw-z-50 pktw-p-4"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div
				className="pktw-w-full pktw-max-w-3xl pktw-max-h-[85vh] pktw-flex pktw-flex-col pktw-overflow-hidden pktw-p-3"
				onClick={(e) => e.stopPropagation()}
			>
				<IntelligenceFrame
					isActive={isStreaming}
					className="pktw-flex-1 pktw-flex pktw-flex-col pktw-min-h-0 pktw-overflow-hidden"
					innerClassName="pktw-flex-1 pktw-flex pktw-flex-col pktw-min-h-0 pktw-overflow-hidden"
				>
					<div className="pktw-flex pktw-flex-col pktw-flex-1 pktw-min-h-0 pktw-overflow-hidden pktw-bg-white/95 pktw-rounded-[11px]">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-pt-4 pktw-border-b pktw-border-[#e5e7eb] pktw-flex-shrink-0">
							<span className="pktw-font-semibold pktw-text-[#2e3338]">{headerTitle}</span>
							<IconButton onClick={onClose} size="lg" >
								<X />
							</IconButton>
						</div>
						<div
							ref={scrollRef}
							className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-overflow-x-hidden pktw-px-4 pktw-pb-4 pktw-relative"
						>
							<SectionExtraChatCard
								analyzeResults={analyzeResults}
								activeQuestion={activeQuestion}
								streaming={streaming}
								inspectItems={inspectItems}
								graph={graph}
								isGraphLoading={isGraphLoading}
								isInspectLoading={isInspectLoading}
								onClose={onClose}
								onInteract={onInteract}
							/>
						</div>
					</div>
				</IntelligenceFrame>
			</div>
		</div>
	);
};
