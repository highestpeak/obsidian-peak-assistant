import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp, Copy, MessageCircle } from 'lucide-react';
import { AppContext } from '@/app/context/AppContext';
import { openFile } from '@/core/utils/obsidian-utils';
import { GraphVisualization, GraphVisualizationHandle, GraphVizNodeHoverInfo, GraphVizNodeInfo } from '@/ui/component/mine/GraphVisualization';
import { useAIAnalysisStore, useGraphAnimationStore, useGraphQueuePump } from '@/ui/view/quick-search/store';
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
import { AISearchGraph, AISearchNode } from '@/service/agents/AISearchAgent';
import { DEFAULT_NODE_TYPE } from '@/service/agents/search-agent-helper/ResultUpdateToolHelper';
import { UIPreviewGraph } from '@/ui/component/mine/GraphVisualization';

/** Reusable context menu item: label + onClick, optionally icon or disabled. */
const ContextMenuItem: React.FC<{
	children: React.ReactNode;
	onClick: () => void | Promise<void>;
	disabled?: boolean;
	icon?: React.ReactNode;
	className?: string;
}> = ({ children, onClick, disabled, icon, className = '' }) => (
	<Button
		variant="ghost"
		size="sm"
		style={{ cursor: 'pointer' }}
		disabled={disabled}
		className={`pktw-shadow-none pktw-w-full  pktw-flex pktw-justify-start pktw-text-[#2e3338] disabled:pktw-opacity-50 ${icon ? 'pktw-gap-2' : ''} ${className}`.trim()}
		onClick={onClick}
	>
		{icon ?? null}
		{children}
	</Button>
);

/** Graph node context menu: Open, Copy, Inspect, Expand, Path, Chat. */
const GraphNodeContextMenu: React.FC<{
	node: GraphVizNodeInfo;
	clientX: number;
	clientY: number;
	pathStart: string | null;
	setPathStart: (path: string | null) => void;
	menuLeaveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
	closeMenu: () => void;
	openSource: (path: string) => Promise<void>;
	onToggleFollowup?: () => void;
	onOpenChatForNode?: (node: GraphVizNodeInfo) => void;
}> = ({ node, clientX, clientY, pathStart, closeMenu, menuLeaveTimerRef, openSource, setPathStart, onToggleFollowup, onOpenChatForNode }) => {

	const { runGraphTool } = useAnalyzeGraphResults();

	return (
		<div
			className="pktw-fixed pktw-z-[100] pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-shadow-lg pktw-overflow-hidden pktw-min-w-[190px] pktw-transition-opacity pktw-duration-150 pktw-ease-out"
			style={{ left: clientX, top: clientY }}
			onMouseEnter={() => {
				if (menuLeaveTimerRef.current) {
					clearTimeout(menuLeaveTimerRef.current);
					menuLeaveTimerRef.current = null;
				}
			}}
			onMouseLeave={() => {
				menuLeaveTimerRef.current = setTimeout(() => {
					closeMenu();
					menuLeaveTimerRef.current = null;
				}, 600);
			}}
		>
			<div className="pktw-px-2.5 pktw-py-2 pktw-border-b pktw-border-[#f3f4f6]">
				<div className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">
					{node.label || node.id}
				</div>
				<div className="pktw-text-[11px] pktw-text-[#9ca3af] pktw-truncate">
					{node.path ? node.path : node.type}
				</div>
			</div>

			<div className="pktw-py-1">
				{node.path ? (
					<ContextMenuItem
						onClick={async () => {
							try {
								if (!node.path) return;
								await openSource(node.path);
							} finally {
								closeMenu();
							}
						}}
					>
						Open
					</ContextMenuItem>
				) : null}

				<ContextMenuItem
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(node.label || node.id || '');
						} finally {
							closeMenu();
						}
					}}
				>
					Copy label
				</ContextMenuItem>

				{node.path ? (
					<ContextMenuItem
						onClick={async () => {
							try {
								if (!node.path) return;
								await navigator.clipboard.writeText(node.path);
							} finally {
								closeMenu();
							}
						}}
					>
						Copy path
					</ContextMenuItem>
				) : null}
			</div>

			{node.path ? (
				<div className="pktw-border-t pktw-border-[#f3f4f6] pktw-py-1">
					<ContextMenuItem
						onClick={async () => {
							try {
								if (!node.path) return;
								await runGraphTool('inspect_note_context', {
									note_path: node.path
								});
							} finally {
								closeMenu();
							}
						}}
					>
						Inspect context
					</ContextMenuItem>

					<ContextMenuItem
						onClick={async () => {
							try {
								if (!node.path) return;
								await runGraphTool('graph_traversal', {
									start_note_path: node.path
								});
							} finally {
								closeMenu();
							}
						}}
					>
						Expand neighborhood
					</ContextMenuItem>

					<ContextMenuItem
						onClick={() => {
							setPathStart(node.path || null);
							closeMenu();
						}}
					>
						Set as path start
					</ContextMenuItem>

					<ContextMenuItem
						disabled={!pathStart || pathStart === node.path}
						className="pktw-px-3 pktw-py-2 pktw-text-xs"
						onClick={async () => {
							try {
								if (!node.path || !pathStart || pathStart === node.path) return;
								await runGraphTool('find_path', {
									start_note_path: pathStart,
									end_note_path: node.path,
								});
							} finally {
								closeMenu();
							}
						}}
					>
						Find path from start
						{pathStart ? (
							<span className="pktw-ml-2 pktw-text-[11px]">
								({pathStart.split('/').pop()})
							</span>
						) : null}
					</ContextMenuItem>
				</div>
			) : null}

			<div className="pktw-border-t pktw-border-[#f3f4f6] pktw-py-1">
				{onToggleFollowup || onOpenChatForNode ? (
					<ContextMenuItem
						icon={<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />}
						onClick={() => {
							if (onOpenChatForNode) {
								onOpenChatForNode(node);
							} else {
								onToggleFollowup?.();
							}
							closeMenu();
						}}
					>
						Chat about this node
					</ContextMenuItem>
				) : null}
			</div>
		</div>
	)
};

const LabeledPillPanel: React.FC<{
	items: string[];
	label: string;
	nodeType: string;
	pillClassName: string;
	onOpenChatForNode?: (node: GraphVizNodeInfo) => void;
	copyText: (text: string) => void;
}> = ({ items, label, nodeType, pillClassName, onOpenChatForNode, copyText }) => {
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
			<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
				{items.slice(0, 120).map((item) => (
					<Button
						variant="ghost"
						size="sm"
						style={{ cursor: 'pointer' }}
						key={item}
						className={`pktw-text-[11px] pktw-px-2 pktw-py-1 pktw-max-w-[140px] pktw-truncate pktw-rounded-full ${pillClassName}`}
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

const convertGraphToGraphPreview = (aiGraph: AISearchGraph | null): UIPreviewGraph | null => {
	if (aiGraph === null || aiGraph === undefined) return null;
	return {
		nodes: aiGraph.nodes.map(node => ({
			id: node.id,
			label: node.title || node.id,
			type: node.type || 'document',
			attributes: {
				...node.attributes,
				path: node.path,
			},
		})),
		edges: aiGraph.edges.map(edge => ({
			id: edge.id,
			from_node_id: edge.source,
			to_node_id: edge.target,
			kind: edge.type,
			weight: edge.attributes.weight || 1,
			attributes: {
				...edge.attributes,
			},
		})),
	};
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

	const { graph: aiGraph } = useAIAnalysisStore();
	const uiGraph = convertGraphToGraphPreview(aiGraph)

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

	const [graphChatNodeContext, setGraphChatNodeContext] = useState<GraphVizNodeInfo | null>(null);
	const [followupOpen, setFollowupOpen] = useState(false);

	const graphFollowupConfig = useGraphFollowupChatConfig({ uiGraph, graphChatNodeContext });

	// graph section ref
	const containerRef = useRef<HTMLDivElement>(null);
	// graph ref
	const graphRef = useRef<GraphVisualizationHandle>(null);

	// graph node context menu
	const [menu, setMenu] = useState<{
		open: boolean;
		clientX: number;
		clientY: number;
		node: GraphVizNodeInfo | null;
	}>(() => ({ open: false, clientX: 0, clientY: 0, node: null }));
	const menuLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// put this field outside the context menu as its state will be reset when the context menu is closed.
	// but we want to keep it when the context menu is open/close => then we can select another node and find path from it.
	const [pathStart, setPathStart] = useState<string | null>(null);

	// graph rendering progress's animation

	const {
		queue,
		mode,
		overlayText,
		effect,
		clear: clearStore,
	} = useGraphAnimationStore();

	useGraphQueuePump();

	// close the node context menu when clicking outside
	useEffect(() => {
		const onDocPointerDown = (evt: PointerEvent) => {
			if (!menu.open) return;
			const el = containerRef.current;
			if (!el) return;
			// Close menu when clicking outside.
			if (!el.contains(evt.target as any)) {
				if (menuLeaveTimerRef.current) {
					clearTimeout(menuLeaveTimerRef.current);
					menuLeaveTimerRef.current = null;
				}
				setMenu((m) => ({ ...m, open: false, node: null }));
			}
		};
		document.addEventListener('pointerdown', onDocPointerDown, { capture: true });
		return () => document.removeEventListener('pointerdown', onDocPointerDown, { capture: true } as any);
	}, [menu.open]);

	// Clear leave timer when menu closes.
	useEffect(() => {
		if (!menu.open && menuLeaveTimerRef.current) {
			clearTimeout(menuLeaveTimerRef.current);
			menuLeaveTimerRef.current = null;
		}
	}, [menu.open]);

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

	const copyText = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			console.warn('[KnowledgeGraphSection] Failed to copy:', e);
		}
	};

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

	// node tooltip
	const [hover, setHover] = useState<GraphVizNodeHoverInfo | null>(null);
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

			<div
				className={useSidePanel
					? 'pktw-w-full pktw-flex pktw-flex-nowrap pktw-gap-3 pktw-items-stretch pktw-min-w-0'
					: 'pktw-w-full pktw-relative'}
			>
				<div className={useSidePanel ? 'pktw-flex-1 pktw-min-w-0 pktw-relative' : ''}>
					<GraphVisualization
						ref={graphRef}
						{...obsidianPreset}
						graph={uiGraph}
						effect={effect}
						onNodeHover={setHover}
						containerClassName={graphBoxClass}
						onNodeContextMenu={(pos, node) => {
							if (menuLeaveTimerRef.current) {
								clearTimeout(menuLeaveTimerRef.current);
								menuLeaveTimerRef.current = null;
							}
							const gap = 4;
							const menuW = 210;
							const menuH = 320;
							const left = Math.max(8, Math.min(pos.x, window.innerWidth - menuW - 8));
							const top = Math.max(8, Math.min(pos.y + gap, window.innerHeight - menuH - 8));
							setMenu({ open: true, clientX: left, clientY: top, node });
						}}
					/>

					{/* Process overlay (narration layer) */}
					{overlayText ? (
						<div className="pktw-absolute pktw-bottom-2 pktw-left-2 pktw-z-20 pktw-pointer-events-none">
							<div className="pktw-bg-white/80 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-[#374151] pktw-shadow-sm">
								{overlayText}
							</div>
						</div>
					) : null}

					{/* Queue indicator */}
					{queue.length > 0 ? (
						<div className="pktw-absolute pktw-bottom-2 pktw-right-2 pktw-z-20 pktw-pointer-events-none">
							<div className="pktw-bg-white/70 pktw-backdrop-blur-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-[#6b7280] pktw-shadow-sm">
								Queue: {queue.length}
							</div>
						</div>
					) : null}
				</div>

				{menu.open && menu.node ? (
					<GraphNodeContextMenu
						node={menu.node}
						clientX={menu.clientX}
						clientY={menu.clientY}
						pathStart={pathStart}
						setPathStart={setPathStart}
						menuLeaveTimerRef={menuLeaveTimerRef}
						closeMenu={() => setMenu({ open: false, clientX: 0, clientY: 0, node: null })}
						openSource={createOpenSourceCallback(onClose)}
						onToggleFollowup={() => setFollowupOpen((v) => !v)}
						onOpenChatForNode={setGraphChatNodeContext}
					/>
				) : null}

				{/* show the concepts and tags and other node types on the right side, same max height as graph area, scroll when overflow */}
				{useSidePanel && hasSidePanelContent ? (
					<div className={`pktw-w-[320px] pktw-shrink-0 pktw-space-y-3 pktw-overflow-auto ${graphBoxClass}`}>
						{Array.from(otherNodeTypes.entries()).map(([nodeType, labels]) => (
							<LabeledPillPanel
								key={nodeType}
								items={labels}
								label={nodeType}
								nodeType={nodeType}
								pillClassName="pktw-bg-sky-50 pktw-text-sky-700 pktw-border pktw-border-sky-200"
								onOpenChatForNode={(node) => {
									setFollowupOpen((v) => !v);
									setGraphChatNodeContext(node)
								}}
								copyText={copyText}
							/>
						))}
					</div>
				) : null}
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
							pillClassName="pktw-bg-sky-50 pktw-text-sky-700 pktw-border pktw-border-sky-200"
							onOpenChatForNode={(node) => {
								setFollowupOpen((v) => !v);
								setGraphChatNodeContext(node)
							}}
							copyText={copyText}
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
		</div>
	);
};