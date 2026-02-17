import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp, Copy, MessageCircle, Maximize2, X } from 'lucide-react';
import { AppContext } from '@/app/context/AppContext';
import { openFile } from '@/core/utils/obsidian-utils';
import { GraphVisualization, GraphVisualizationHandle, GraphVizNodeHoverInfo, GraphVizNodeInfo } from '@/ui/component/mine/GraphVisualization';
import { useAIAnalysisStore, useGraphAnimationStore } from '@/ui/view/quick-search/store';
import { createOpenSourceCallback } from '@/ui/view/quick-search/callbacks/open-source-file';
import {
	createObsidianGraphPreset,
	type ObsidianGraphPresetResult,
} from '@/ui/view/quick-search/presets/obsidianGraphPreset';
import { Button } from '@/ui/component/shared-ui/button';
import { InlineFollowupChat } from '@/ui/component/mine/InlineFollowupChat';
import { useGraphFollowupChatConfig } from '../../hooks/useAIAnalysisPostAIInteractions';
import { useAnalyzeGraphResults } from '../../hooks/useAIAnalysisResult';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/ui/component/shared-ui/hover-card';
import { AISearchNode } from '@/service/agents/AISearchAgent';
import { DEFAULT_NODE_TYPE } from '@/service/agents/search-agent-helper/DashboardUpdateToolBuilder';
import { convertGraphToGraphPreview } from '@/ui/view/shared/graph-utils';
import { copyText } from '@/ui/view/shared/common-utils';
import { logClick } from '@/core/utils/perf-debug';
import { cn } from '@/ui/react/lib/utils';

/**
 * Key Topics–style pill palette. Node types (including custom ones from the agent)
 * are mapped to a color by stable hash so each type gets a distinct, consistent style.
 */
const PILL_PALETTE: readonly string[] = [
	'pktw-bg-sky-100 pktw-text-sky-800 hover:pktw-bg-sky-200',
	'pktw-bg-violet-100 pktw-text-violet-800 hover:pktw-bg-violet-200',
	'pktw-bg-amber-100 pktw-text-amber-800 hover:pktw-bg-amber-200',
	'pktw-bg-emerald-100 pktw-text-emerald-800 hover:pktw-bg-emerald-200',
	'pktw-bg-rose-100 pktw-text-rose-800 hover:pktw-bg-rose-200',
	'pktw-bg-cyan-100 pktw-text-cyan-800 hover:pktw-bg-cyan-200',
	'pktw-bg-orange-100 pktw-text-orange-800 hover:pktw-bg-orange-200',
	'pktw-bg-teal-100 pktw-text-teal-800 hover:pktw-bg-teal-200',
	'pktw-bg-slate-100 pktw-text-slate-800 hover:pktw-bg-slate-200',
];

/** Stable hash of a string for picking a palette index (any node type, including custom). */
function hashStringToIndex(s: string): number {
	const str = String(s ?? '').trim().toLowerCase() || 'default';
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

function getPillClassNameForNodeType(nodeType: string): string {
	const idx = hashStringToIndex(nodeType) % PILL_PALETTE.length;
	return PILL_PALETTE[idx];
}

/** Sidebar panel: Key Topics–style capsules (soft bg, no border, pill shape) per node type. */
const LabeledPillPanel: React.FC<{
	items: string[];
	label: string;
	nodeType: string;
	pillClassName: string;
	onOpenChatForNode?: (node: GraphVizNodeInfo) => void;
}> = ({ items, label, nodeType, pillClassName, onOpenChatForNode }) => {
	if (items.length === 0) return null;
	return (
		<div className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-p-3">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
				<span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">{label}</span>
				<span className="pktw-text-[11px] pktw-text-[#9ca3af]">({items.length})</span>
				<div className="pktw-flex-1" />
				<Button
					variant="ghost"
					size="sm"
					style={{ cursor: 'pointer' }}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[11px] pktw-text-[#6b7280]"
					onClick={() => copyText(items.join('\n'))}
					title={`Copy all ${label.toLowerCase()}`}
				>
					<Copy className="pktw-w-3 pktw-h-3" />
				</Button>
			</div>
			<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
				{items.slice(0, 120).map((item, idx) => (
					<Button
						variant="ghost"
						size="sm"
						style={{ cursor: 'pointer' }}
						key={`${nodeType}-${idx}-${item}`}
						className={`pktw-text-xs pktw-px-2.5 pktw-py-1 pktw-shadow-none pktw-rounded-md pktw-border pktw-h-auto pktw-font-medium hover:pktw-shadow-sm active:pktw-scale-95 ${pillClassName}`}
						onClick={() => onOpenChatForNode ? onOpenChatForNode({ id: `${nodeType}:${item}`, label: item, type: nodeType, path: null }) : copyText(item)}
						title={onOpenChatForNode ? 'Click to chat' : 'Copy'}
					>
						{item}
					</Button>
				))}
			</div>
		</div>
	);
};

/**
 * Knowledge graph section component
 */
export const KnowledgeGraphSection: React.FC<{
	/**
	 * Optional callback to close the surrounding modal (e.g. Quick Search).
	 * Used when a node click opens a document.
	 */
	onClose?: () => void;
}> = ({ onClose }) => {

	const { graph: aiGraph, title: analysisTitle } = useAIAnalysisStore();
	const uiGraph = useMemo(() => convertGraphToGraphPreview(aiGraph), [aiGraph]);

	/**
	 * Collect all other node types (not DEFAULT_NODE_TYPE=document) and their labels.
	 * key: node type, value: labels
	 * example: 
	 *  {
	 *    "concept": ["concept1", "concept2"],
	 *    "tag": ["tag1", "tag2"],
	 *    "inspire_idea": ["inspire_idea1", "inspire_idea2"],
	 *  }
	 */
	const otherNodeTypes: Map<string, string[]> = useMemo(() => {
		const map = new Map<string, string[]>();
		(aiGraph?.nodes ?? []).forEach((n: AISearchNode) => {
			if (n.type === DEFAULT_NODE_TYPE) return;

			const label = n.title || n.id;
			if (!label) return;

			map.set(n.type, (map.get(n.type) ?? []).concat(label));
		});
		return map;
	}, [aiGraph]);

	const hasSidePanelContent = otherNodeTypes.size > 0 && Array.from(otherNodeTypes.values()).some(labels => labels.length > 0);

	const {
		analysisCompleted,
		graphFollowupHistory,
		setContextChatModal,
		appendGraphFollowup,
	} = useAIAnalysisStore();

	const { runGraphTool } = useAnalyzeGraphResults();

	const [graphChatNodeContext, setGraphChatNodeContext] = useState<GraphVizNodeInfo | null>(null);
	const [followupOpen, setFollowupOpen] = useState(false);
	const [fullscreenOpen, setFullscreenOpen] = useState(false);

	const graphFollowupConfig = useGraphFollowupChatConfig({ uiGraph, graphChatNodeContext });

	// graph section ref
	const containerRef = useRef<HTMLDivElement>(null);
	const graphRef = useRef<GraphVisualizationHandle>(null);
	const inlineContainerRef = useRef<HTMLDivElement>(null);
	const fullscreenContainerRef = useRef<HTMLDivElement>(null);

	// Path start for "Find path from start" in graph node context menu (owned by Section, passed to Viz).
	const [pathStart, setPathStart] = useState<string | null>(null);
	const [hover, setHover] = useState<GraphVizNodeHoverInfo | null>(null);

	// graph rendering progress's animation

	const {
		queue,
		mode,
		overlayText,
		effect,
		clear: clearStore,
	} = useGraphAnimationStore();

	// When analysis resets graph to null, clear pending queue and visualization.
	useEffect(() => {
		if (uiGraph !== null && uiGraph !== undefined) return;
		clearStore();
		graphRef.current?.clear();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [uiGraph]);

	// When analysis completes, stop scanning overlays and clear any pending queue.
	useEffect(() => {
		if (!analysisCompleted) return;
		clearStore();
		// Fit to view after the final state settles to avoid a giant clipped graph.
		setTimeout(() => graphRef.current?.fitToView(), 220);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [analysisCompleted]);

	// Fit graph to view when fullscreen opens; Esc to close
	useEffect(() => {
		if (fullscreenOpen) {
			setTimeout(() => graphRef.current?.fitToView(), 100);
			const onKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') setFullscreenOpen(false);
			};
			document.addEventListener('keydown', onKeyDown);
			return () => document.removeEventListener('keydown', onKeyDown);
		}
	}, [fullscreenOpen]);

	const obsidianPreset = useMemo<ObsidianGraphPresetResult>(() => {
		return createObsidianGraphPreset({
			onOpenPath: onClose ? createOpenSourceCallback(onClose) : undefined,
			openFile: (path) => openFile(AppContext.getInstance().app, path, true),
			copyText,
		})
	}, [onClose]);

	// control graph layout as it's different in the completed view and the streaming view
	const useSidePanel = !!analysisCompleted;
	const graphBoxClass = useSidePanel ? 'pktw-h-[360px]' : 'pktw-h-[260px]';

	/** Single graph instance + overlays; portaled between inline and fullscreen to avoid remount/redraw. */
	const graphWithOverlays = (
		<div className="pktw-w-full pktw-h-full pktw-relative">
			<GraphVisualization
				ref={graphRef}
				{...obsidianPreset}
				graph={uiGraph}
				effect={effect}
				title={analysisTitle ?? undefined}
				hideTitle={fullscreenOpen}
				onNodeHover={setHover}
				containerClassName={fullscreenOpen ? 'pktw-w-full pktw-h-full pktw-min-h-[400px]' : graphBoxClass}
				showToolsPanel={fullscreenOpen}
				nodeContextMenu={{
					onOpenSource: onClose ? createOpenSourceCallback(onClose) : undefined,
					runGraphTool,
					pathStart,
					setPathStart,
					onOpenChatForNode: setGraphChatNodeContext,
					onToggleFollowup: () => setFollowupOpen((v) => !v),
				}}
			/>
			{overlayText ? (
				<div className="pktw-absolute pktw-bottom-2 pktw-left-2 pktw-z-20 pktw-pointer-events-none">
					<div className="pktw-bg-white/80 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-[#374151] pktw-shadow-sm">
						{overlayText}
					</div>
				</div>
			) : null}
			{queue.length > 0 ? (
				<div className="pktw-absolute pktw-bottom-2 pktw-right-2 pktw-z-20 pktw-pointer-events-none">
					<div className="pktw-bg-white/70 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-[#6b7280] pktw-shadow-sm">
						Queue: {queue.length}
					</div>
				</div>
			) : null}
		</div>
	);

	const portalTarget = fullscreenOpen ? fullscreenContainerRef.current : inlineContainerRef.current;

	const pillsContent = useSidePanel && hasSidePanelContent ? (
		<div className={`pktw-w-[320px] pktw-shrink-0 pktw-space-y-3 pktw-overflow-auto ${fullscreenOpen ? 'pktw-h-full' : graphBoxClass}`}>
			{Array.from(otherNodeTypes.entries()).map(([nodeType, labels]) => (
				<LabeledPillPanel
					key={nodeType}
					items={labels}
					label={nodeType}
					nodeType={nodeType}
					pillClassName={getPillClassNameForNodeType(nodeType)}
					onOpenChatForNode={(node) => {
						setFollowupOpen((v) => !v);
						setGraphChatNodeContext(node);
					}}
				/>
			))}
		</div>
	) : null;

	// node tooltip
	const tooltipPos = useMemo(() => {
		if (!hover) return null;
		// Fixed tooltip near the mouse with a simple clamp.
		// This avoids the “tooltip is far away” issue when the graph is large.
		const w = 280;
		const h = hover.node.path ? 56 : 44;
		const pad = 10;
		const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
		const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
		const left = Math.max(pad, Math.min(vw - w - pad, hover.x + 12));
		const top = Math.max(pad, Math.min(vh - h - pad, hover.y + 12));
		return { left, top, w };
	}, [hover]);

	return (
		<div
			ref={containerRef}
			className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-flex pktw-flex-col pktw-items-center"
		>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3 pktw-w-full pktw-group">
				<TrendingUp className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
					Knowledge Graph
				</span>
				<div className="pktw-flex-1" />
				<Button
					variant="ghost"
					size="icon"
					className="pktw-shadow-none pktw-rounded-md pktw-border pktw-opacity-40 hover:pktw-opacity-100"
					title="Fullscreen"
					onClick={() => {
					logClick('graph-fullscreen-open');
					setFullscreenOpen(true);
				}}
				>
					<Maximize2 className="pktw-w-4 pktw-h-4" />
				</Button>
				<HoverCard openDelay={100} closeDelay={150}>
					<HoverCardTrigger asChild>
						<Button
							variant="ghost"
							style={{ cursor: 'pointer' }}
							onClick={() => setFollowupOpen((v) => !v)}
							className={`pktw-shadow-none pktw-rounded-md pktw-border pktw-opacity-40`}
							size="icon"
							title={followupOpen ? 'Hide follow-up' : 'Open follow-up'}
						>
							<MessageCircle className="pktw-w-5 pktw-h-5" />
						</Button>
					</HoverCardTrigger>
					{/* Version history */}
					{graphFollowupHistory.length > 0 && <HoverCardContent align="end" className="pktw-w-48 pktw-p-1 pktw-z-[10000]">
						{graphFollowupHistory.map((item, idx) => (
							<Button
								key={idx}
								variant="ghost"
								style={{ cursor: 'pointer' }}
								onClick={() => setContextChatModal((prev) => {
									if (prev && prev.type === 'graph') {
										return { ...prev, activeQuestion: item.question };
									}
									return { type: 'graph', title: 'Graph Follow-up', messages: graphFollowupHistory, activeQuestion: item.question };
								})}
								className={`pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none`}
							>
								{item.question}
							</Button>
						))}
					</HoverCardContent>}
				</HoverCard>
				<span className="pktw-text-xs pktw-text-[#9ca3af]">
					{mode !== 'idle' ? mode : ''}
				</span>
			</div>

			<AnimatePresence>
				{followupOpen ? (
					<motion.div
						key="graph-followup"
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
						className="pktw-w-full pktw-mb-3"
					>
						<InlineFollowupChat
							{...graphFollowupConfig}
							outputPlace="modal"
							onOpenModal={(question) => setContextChatModal((prev) => {
								if (prev && prev.type === 'graph') {
									return { ...prev, streamingQuestion: question, streamingText: '' };
								}
								return { type: 'graph', streamingQuestion: question, streamingText: '', title: 'Graph Follow-up', messages: graphFollowupHistory };
							})}
							onStreamingReplace={(streamingText) => setContextChatModal((prev) => prev ? { ...prev, streamingText: streamingText ?? '' } : null)}
							onApply={(acc, _mode, q) => {
								appendGraphFollowup(q ?? '', acc);
								setContextChatModal((prev) => prev ? {
									...prev,
									messages: [...(prev.messages ?? []), { question: q ?? '', answer: acc }],
									streamingQuestion: '',
									streamingText: '',
								} : null);
							}}
						/>
					</motion.div>
				) : null}
			</AnimatePresence>

			{/* Inline graph area: portal target; hidden when fullscreen */}
			<div
				className={cn(
					useSidePanel ? 'pktw-w-full pktw-flex pktw-flex-nowrap pktw-gap-3 pktw-items-stretch pktw-min-w-0' : 'pktw-w-full pktw-relative',
					fullscreenOpen && 'pktw-hidden'
				)}
				style={!fullscreenOpen && !useSidePanel ? { height: 260 } : undefined}
			>
				<div
					ref={inlineContainerRef}
					className={cn(useSidePanel ? 'pktw-flex-1 pktw-min-w-0 pktw-relative' : 'pktw-relative', !useSidePanel && 'pktw-h-[260px]')}
				/>
				{pillsContent}
			</div>

			{/* during streaming. show below the graph */}
			{(!useSidePanel && hasSidePanelContent) ? (
				<div className="pktw-w-full pktw-mt-3 pktw-space-y-3">
					{Array.from(otherNodeTypes.entries()).map(([nodeType, labels]) => (
						<LabeledPillPanel
							key={nodeType}
							items={labels}
							label={nodeType}
							nodeType={nodeType}
							pillClassName={getPillClassNameForNodeType(nodeType)}
							onOpenChatForNode={(node) => {
								setFollowupOpen((v) => !v);
								setGraphChatNodeContext(node)
							}}
						/>
					))}
				</div>
			) : null}

			{/* Mouse-near tooltip */}
			{hover && tooltipPos ? (
				<div className="pktw-fixed pktw-z-[1000] pktw-pointer-events-none" style={{ left: tooltipPos.left, top: tooltipPos.top, width: tooltipPos.w, maxWidth: 320 }}>
					<div className="pktw-bg-white/90 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-[12px] pktw-text-[#111827] pktw-shadow-sm">
						<div className="pktw-font-medium pktw-truncate">{hover.node.label || hover.node.id}</div>
						{hover.node.path ? (
							<div className="pktw-text-[11px] pktw-text-[#9ca3af] pktw-truncate pktw-mt-0.5" title={hover.node.path}>
								{hover.node.path}
							</div>
						) : null}
					</div>
				</div>
			) : null}

			{/* Fullscreen overlay: always in DOM for stable portal ref; visibility via CSS */}
			<div
				className={cn(
					'pktw-fixed pktw-inset-0 pktw-bg-black/30 pktw-z-[10000] pktw-flex pktw-items-center pktw-justify-center pktw-p-4',
					!fullscreenOpen && 'pktw-pointer-events-none pktw-invisible'
				)}
				style={fullscreenOpen ? undefined : { visibility: 'hidden' }}
				onClick={(e) => {
					if (fullscreenOpen && e.target === e.currentTarget) {
						logClick('graph-fullscreen-backdrop-close');
						setFullscreenOpen(false);
					}
				}}
			>
				<motion.div
					initial={false}
					animate={{ opacity: fullscreenOpen ? 1 : 0 }}
					transition={{ duration: 0.2 }}
					className="pktw-bg-white pktw-rounded-lg pktw-shadow-xl pktw-border pktw-border-[#e5e7eb] pktw-w-full pktw-h-full pktw-max-w-[95vw] pktw-max-h-[95vh] pktw-flex pktw-flex-col pktw-overflow-hidden"
					onClick={(e) => e.stopPropagation()}
					style={!fullscreenOpen ? { pointerEvents: 'none' } : undefined}
				>
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-p-2 pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0">
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">
							{analysisTitle ? `Knowledge Graph: ${analysisTitle}` : 'Knowledge Graph'}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="pktw-rounded-md"
							title="Close"
							onClick={() => setFullscreenOpen(false)}
						>
							<X className="pktw-w-5 pktw-h-5" />
						</Button>
					</div>
					<div className="pktw-flex-1 pktw-min-h-0 pktw-p-4 pktw-flex pktw-flex-nowrap pktw-gap-3 pktw-overflow-hidden">
						<div
							ref={fullscreenContainerRef}
							className="pktw-flex-1 pktw-min-w-0 pktw-min-h-0 pktw-flex pktw-flex-col"
						/>
						{pillsContent}
					</div>
				</motion.div>
			</div>

			{portalTarget && createPortal(graphWithOverlays, portalTarget)}
		</div>
	);
};