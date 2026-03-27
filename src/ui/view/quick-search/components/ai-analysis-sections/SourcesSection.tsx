import { SLICE_CAPS } from '@/core/constant';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Info, MessageCircle, ChevronDown, ChevronRight, List, Network, Loader2, Maximize2, X, BookOpen } from 'lucide-react';
import { mixSearchResultsBySource } from '@/core/utils/source-mixer';
import { getSourceIcon } from '@/ui/view/shared/file-utils';
import type { SearchResultItem } from '@/service/search/types';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/ui/component/shared-ui/hover-card';
import { InlineFollowupChat } from '@/ui/component/mine/InlineFollowupChat';
import { useSourcesFollowupChatConfig } from '../../hooks/useAIAnalysisPostAIInteractions';
import { useAIAnalysisInteractionsStore } from '../../store/aiAnalysisStore';
import { GraphVisualization, GraphVisualizationHandle } from '@/ui/component/mine/GraphVisualization';
import { createObsidianGraphPreset } from '../../presets/obsidianGraphPreset';
import { buildSourcesGraphWithDiscoveredEdges, getCachedSourcesGraph, type SourcesGraph } from '@/service/tools/search-graph-inspector/build-sources-graph';
import type { EvidenceIndex } from '@/service/agents/AISearchAgent';

/** When false, show only a single "Score" (AI-generated); Physical/Semantic/Average gauges are kept in code but not rendered. */
const SHOW_SCORE_BREAKDOWN = false;

/** Effective score for sorting/collapsing: finalScore ?? score ?? scoreDetail.average ?? 0 */
function getEffectiveScore(source: SearchResultItem): number {
	const n = source.finalScore ?? source.score;
	if (typeof n === 'number') return n;
	const avg = source.scoreDetail?.average;
	return typeof avg === 'number' ? avg : 0;
}

/** Radius and center for the semicircle gauge. */
const GAUGE_R = 22;
const GAUGE_CX = 28;
const GAUGE_CY = 28;

/**
 * Circular speedometer-style gauge for a single score (0–100 or 0–1).
 * Value in 0–1 is treated as fraction and shown as percentage; arc and number are in the center.
 */
const ScoreGauge: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
	// Support both 0–1 (e.g. 0.85) and 0–100; use 0–100 for arc and display
	const isFraction = value > 0 && value <= 1;
	const displayValue = isFraction ? Math.round(value * 100) : Math.round(value);
	const pct = Math.max(0, Math.min(100, isFraction ? value * 100 : value));
	// Top semicircle: 0% at left (180°), 100% at right (0°/360°). End angle = 180° + pct% of 180°.
	const startAngle = Math.PI;
	const endAngle = Math.PI + (pct / 100) * Math.PI;
	const x1 = GAUGE_CX + GAUGE_R * Math.cos(startAngle);
	const y1 = GAUGE_CY + GAUGE_R * Math.sin(startAngle);
	const x2 = GAUGE_CX + GAUGE_R * Math.cos(endAngle);
	const y2 = GAUGE_CY + GAUGE_R * Math.sin(endAngle);
	// sweep=1: draw along top semicircle (180° → 270° → endAngle), arc length = pct% of 180°
	const pathD = `M ${x1} ${y1} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${x2} ${y2}`;

	return (
		<div
			className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-0.5"
			title={`${label}: ${displayValue}`}
		>
			<svg
				width={56}
				height={32}
				viewBox="0 0 56 32"
				className="pktw-flex-shrink-0"
				aria-hidden
			>
				{/* Track: top semicircle (dome), visible in viewBox */}
				<path
					d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_CX + GAUGE_R} ${GAUGE_CY}`}
					fill="none"
					stroke="#e5e7eb"
					strokeWidth={4}
					strokeLinecap="round"
				/>
				{/* Value arc: same top semicircle */}
				<path
					d={pathD}
					fill="none"
					stroke={color}
					strokeWidth={4}
					strokeLinecap="round"
					className="pktw-transition-all pktw-duration-300"
				/>
				{/* Number in center of arc (inside the gauge) */}
				<text
					x={GAUGE_CX}
					y={GAUGE_CY - 2}
					textAnchor="middle"
					dominantBaseline="middle"
					className="pktw-select-none"
					style={{
						fontSize: 10,
						fontFamily: 'ui-monospace, monospace',
						fill: '#374151'
					}}
				>
					{displayValue}
				</text>
			</svg>
			<span className="pktw-text-[9px] pktw-text-[#6b7280] pktw-leading-tight pktw-text-center">
				{label}
			</span>
		</div>
	);
};

/** Single source card (title, path, score, reasoning). */
const SourceCard: React.FC<{
	source: SearchResultItem;
	index: number;
	onOpen: () => void;
}> = ({ source, index, onOpen }) => (
	<div
		className="pktw-p-3 pktw-rounded-lg pktw-bg-white pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/30 hover:pktw-bg-[#fafafa] pktw-cursor-pointer pktw-transition-all pktw-group"
		style={{
			opacity: 0,
			transform: 'translateY(-8px)',
			animation: `fadeInSlide 0.3s ease-out ${index * 0.1}s forwards`
		}}
		onClick={onOpen}
	>
		<div className="pktw-flex pktw-items-center pktw-gap-2">
			<div className="pktw-flex-shrink-0">{getSourceIcon(source.source)}</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0">
					<div className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-truncate group-hover:pktw-text-[#7c3aed] pktw-min-w-0">
						{source.title}
					</div>
					{source.badges && source.badges.length > 0 ? (
						<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-flex-shrink-0">
							{source.badges.map((badge, i) => (
								<span key={i} className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed] pktw-font-medium" title={badge}>
									{badge}
								</span>
							))}
						</div>
					) : null}
				</div>
				<div className="pktw-text-xs pktw-text-[#999999] pktw-truncate">{source.path}</div>
			</div>
			{SHOW_SCORE_BREAKDOWN && source.scoreDetail ? (
				<div className="pktw-flex pktw-items-flex-end pktw-gap-2 pktw-flex-shrink-0" title="Score breakdown: Physical / Semantic / Average">
					<ScoreGauge label="Physical" value={source.scoreDetail.physical} color="#3b82f6" />
					<ScoreGauge label="Semantic" value={source.scoreDetail.semantic} color="#8b5cf6" />
					<ScoreGauge label="Average" value={source.scoreDetail.average} color="#22c55e" />
				</div>
			) : (
				<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-flex-shrink-0" title="Score (AI-generated)">
					<span className="pktw-text-xs pktw-text-[#6c757d] pktw-font-medium">
						{typeof (source.finalScore ?? source.score) === 'number'
							? (source.finalScore ?? source.score ?? 0).toFixed(0)
							: source.scoreDetail?.average != null
								? String(Math.round(source.scoreDetail.average))
								: ''}
					</span>
					<span className="pktw-text-[9px] pktw-text-[#9ca3af]">Score</span>
				</div>
			)}
		</div>
		{source.content && (
			<div className="pktw-mt-2 pktw-flex pktw-items-center pktw-gap-1.5">
				<Info className="pktw-w-3 pktw-h-3 pktw-text-[#999999] pktw-flex-shrink-0" aria-hidden />
				<span className="pktw-text-xs pktw-text-[#6c757d] pktw-leading-relaxed pktw-line-clamp-2">{source.content}</span>
			</div>
		)}
	</div>
);

/** Evidence view: by-path list with expandable claims/quotes. */
const EvidenceView: React.FC<{
	evidenceIndex: EvidenceIndex;
	evidencePaths: string[];
	onOpenPath: (path: string) => void;
}> = ({ evidenceIndex, evidencePaths, onOpenPath }) => {
	const [expandedPath, setExpandedPath] = useState<string | null>(null);
	return (
		<div className="pktw-space-y-2">
			{evidencePaths.map((path) => {
				const entry = evidenceIndex[path];
				if (!entry) return null;
				const summaries = entry.summaries ?? [];
				const facts = entry.facts ?? [];
				const isExpanded = expandedPath === path;
				return (
					<div
						key={path}
						className="pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-overflow-hidden"
					>
						<button
							type="button"
							className="pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-text-left hover:pktw-bg-[#f9fafb] pktw-transition-colors"
							onClick={() => setExpandedPath((p) => (p === path ? null : path))}
						>
							{isExpanded ? (
								<ChevronDown className="pktw-w-4 pktw-h-4 pktw-text-[#6b7280] pktw-shrink-0" />
							) : (
								<ChevronRight className="pktw-w-4 pktw-h-4 pktw-text-[#6b7280] pktw-shrink-0" />
							)}
							<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed] pktw-shrink-0" />
							<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-truncate pktw-flex-1" title={path}>
								{path.split(/[/\\]/).pop() ?? path}
							</span>
							<span className="pktw-text-xs pktw-text-[#6b7280] pktw-shrink-0">
								{summaries.length + facts.length} item{(summaries.length + facts.length) !== 1 ? 's' : ''}
							</span>
						</button>
						{isExpanded && (
							<div className="pktw-border-t pktw-border-[#e5e7eb] pktw-p-3 pktw-space-y-3">
								<button
									type="button"
									className="pktw-text-xs pktw-text-[#7c3aed] hover:pktw-underline"
									onClick={() => onOpenPath(path)}
								>
									Open file
								</button>
								{summaries.length > 0 && (
									<div>
										<div className="pktw-text-[10px] pktw-font-medium pktw-text-[#6b7280] pktw-mb-1">Summaries</div>
										<ul className="pktw-text-xs pktw-text-[#374151] pktw-space-y-1 pktw-list-disc pktw-pl-4">
											{summaries.slice(0, SLICE_CAPS.ui.sourcesSummaries).map((s, i) => (
												<li key={i} className="pktw-line-clamp-2">{s}</li>
											))}
											{summaries.length > 3 && <li className="pktw-text-[#6b7280]">+{summaries.length - 3} more</li>}
										</ul>
									</div>
								)}
								{facts.length > 0 && (
									<div>
										<div className="pktw-text-[10px] pktw-font-medium pktw-text-[#6b7280] pktw-mb-1">Claims & quotes</div>
										<ul className="pktw-space-y-2">
											{facts.slice(0, SLICE_CAPS.ui.sourcesFacts).map((f, i) => (
												<li key={i} className="pktw-text-xs pktw-border-l-2 pktw-border-[#7c3aed]/30 pktw-pl-2">
													<span className="pktw-text-[#374151]">{f.claim}</span>
													{f.quote && (
														<blockquote className="pktw-mt-1 pktw-text-[#6b7280] pktw-italic pktw-line-clamp-2">
															{f.quote}
														</blockquote>
													)}
												</li>
											))}
											{facts.length > 8 && <li className="pktw-text-[#6b7280] pktw-text-xs">+{facts.length - 8} more</li>}
										</ul>
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};

/** Hook: build sources graph (cached); uses cache when same sources, skips rebuild. */
function useSourcesGraph(sources: SearchResultItem[]): { graph: SourcesGraph | null; loading: boolean } {
	const cached = useMemo(() => getCachedSourcesGraph(sources), [sources]);
	const [graph, setGraph] = useState<SourcesGraph | null>(() => cached ?? null);
	const [loading, setLoading] = useState(() => !cached);

	useEffect(() => {
		if (!sources.length) {
			setGraph(null);
			setLoading(false);
			return;
		}
		const c = getCachedSourcesGraph(sources);
		if (c) {
			setGraph(c);
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		buildSourcesGraphWithDiscoveredEdges(sources)
			.then((g) => {
				if (!cancelled) setGraph(g);
			})
			.catch((err) => {
				if (!cancelled) console.warn('[SourcesSection] buildSourcesGraph failed:', err);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => { cancelled = true; };
	}, [sources]);

	return { graph, loading };
}

/**
 * Top sources section component showing relevant files with reasoning, badges, and score breakdown.
 * Supports List and Graph views.
 */
export const TopSourcesSection: React.FC<{
	sources: SearchResultItem[];
	onOpen: (source: SearchResultItem | string) => void;
	skipAnimation?: boolean;
	/** Evidence index by path for Evidence view (claim/quote per file). */
	evidenceIndex?: EvidenceIndex;
	/** Deprecated: edges are now discovered via graph-inspector tools. Kept for API compat. */
	graph?: { nodes: { id: string; path?: string }[]; edges: { source: string; target: string; type?: string }[] } | null;
}> = ({ sources, onOpen, skipAnimation = false, evidenceIndex = {} }) => {

	const setContextChatModal = useAIAnalysisInteractionsStore((s) => s.setContextChatModal);
	const appendSourcesFollowup = useAIAnalysisInteractionsStore((s) => s.appendSourcesFollowup);
	const sourcesFollowupHistory = useAIAnalysisInteractionsStore((s) => s.sourcesFollowupHistory);

	const [showSourcesFollowup, setShowSourcesFollowup] = useState(false);
	const [viewMode, setViewMode] = useState<'list' | 'graph' | 'evidence'>('list');
	const evidencePaths = useMemo(() => Object.keys(evidenceIndex).filter((p) => (evidenceIndex[p]?.summaries?.length ?? 0) + (evidenceIndex[p]?.facts?.length ?? 0) > 0), [evidenceIndex]);
	const hasEvidenceView = evidencePaths.length > 0;
	const [fullscreenOpen, setFullscreenOpen] = useState(false);

	const graphRef = useRef<GraphVisualizationHandle>(null);
	// Store container elements in state to trigger re-render when mounted (fixes portal target being null on first paint)
	const [inlineContainerEl, setInlineContainerEl] = useState<HTMLDivElement | null>(null);
	const [fullscreenContainerEl, setFullscreenContainerEl] = useState<HTMLDivElement | null>(null);

	const sourcesFollowupConfig = useSourcesFollowupChatConfig({ sources });

	// Apply source mixing strategy (ensure minimum 2 items per source, then interleave)
	const mixedSources = React.useMemo(() => {
		return mixSearchResultsBySource(sources, 2);
	}, [sources]);

	// Split: scored (score > 0) shown first; zero-score sources collapsed by default
	const { scoredSources, zeroScoreSources } = React.useMemo(() => {
		const scored: SearchResultItem[] = [];
		const zero: SearchResultItem[] = [];
		for (const s of mixedSources) {
			if (getEffectiveScore(s) > 0) scored.push(s);
			else zero.push(s);
		}
		return { scoredSources: scored, zeroScoreSources: zero };
	}, [mixedSources]);

	const [expandZeroScore, setExpandZeroScore] = useState(false);

	const { graph: sourcesGraph, loading: sourcesGraphLoading } = useSourcesGraph(mixedSources);

	// Fit to view when fullscreen opens; Esc to close
	useEffect(() => {
		if (fullscreenOpen) {
			setTimeout(() => graphRef.current?.fitToView(true), 100);
			const onKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') setFullscreenOpen(false);
			};
			document.addEventListener('keydown', onKeyDown);
			return () => document.removeEventListener('keydown', onKeyDown);
		}
	}, [fullscreenOpen]);

	const obsidianPreset = useMemo(() => createObsidianGraphPreset({
		onOpenPath: onOpen ? (path: string) => onOpen(path) : undefined,
		openFile: async (path: string) => {
			if (typeof onOpen === 'function') onOpen(path);
		},
		copyText: async (t: string) => { await navigator.clipboard.writeText(t); },
	}), [onOpen]);

	// Animate scored sources one by one
	const [visibleCount, setVisibleCount] = React.useState(0);
	React.useEffect(() => {
		if (scoredSources.length === 0) {
			setVisibleCount(0);
			return;
		}

		if (skipAnimation) {
			setVisibleCount(scoredSources.length);
			return;
		}

		setVisibleCount(0);
		let current = 0;
		const interval = setInterval(() => {
			current++;
			setVisibleCount(current);
			if (current >= scoredSources.length) clearInterval(interval);
		}, 100);

		return () => clearInterval(interval);
	}, [scoredSources.length, skipAnimation]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3 pktw-w-full pktw-group">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Top Sources</span>
				<span className="pktw-text-xs pktw-text-[#999999]">
					({mixedSources.length} files{zeroScoreSources.length > 0 ? `, ${zeroScoreSources.length} with score 0` : ''})
				</span>
				<div className="pktw-flex-1" />
				{mixedSources.length > 0 || hasEvidenceView ? (
					<div className="pktw-flex pktw-gap-1">
						<Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')} title="List view">
							<List className="pktw-w-4 pktw-h-4" />
						</Button>
						<Button variant={viewMode === 'graph' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('graph')} title="Graph view">
							<Network className="pktw-w-4 pktw-h-4" />
						</Button>
						{hasEvidenceView && (
							<Button variant={viewMode === 'evidence' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('evidence')} title="Evidence view">
								<BookOpen className="pktw-w-4 pktw-h-4" />
							</Button>
						)}
						{viewMode === 'graph' && sourcesGraph ? (
							<Button variant="ghost" size="sm" onClick={() => setFullscreenOpen(true)} title="Fullscreen (use tools)">
								<Maximize2 className="pktw-w-4 pktw-h-4" />
							</Button>
						) : null}
					</div>
				) : null}
				<HoverCard openDelay={100} closeDelay={150}>
					<HoverCardTrigger asChild>
						<Button
							variant="ghost"
							style={{ cursor: 'pointer' }}
							size="icon"
							className="pktw-shadow-none pktw-rounded-md pktw-border pktw-opacity-40"
							onClick={() => setShowSourcesFollowup((v) => !v)}
							title={showSourcesFollowup ? 'Hide follow-up' : 'Open follow-up'}
						>
							<MessageCircle className="pktw-w-5 pktw-h-5" />
						</Button>
					</HoverCardTrigger>
					{sourcesFollowupHistory.length > 0 && (
						<HoverCardContent align="end" className="pktw-w-48 pktw-p-1 pktw-z-[10000] pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
							{sourcesFollowupHistory.map((item, idx) => (
								<Button
									key={idx}
									variant="ghost"
									style={{ cursor: 'pointer' }}
									onClick={() => setContextChatModal((prev) => {
										if (prev && prev.type === 'sources') {
											return { ...prev, activeQuestion: item.question };
										}
										return { type: 'sources', title: 'Sources Follow-up', messages: sourcesFollowupHistory, activeQuestion: item.question };
									})}
									className="pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none"
								>
									{item.question}
								</Button>
							))}
						</HoverCardContent>
					)}
				</HoverCard>
			</div>
			<AnimatePresence>
				{showSourcesFollowup ? (
					<motion.div
						key="sources-followup"
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
						className="pktw-w-full pktw-mb-3"
					>
						<InlineFollowupChat
							{...sourcesFollowupConfig}
							outputPlace="modal"
							onOpenModal={(question) => setContextChatModal((prev) => {
								if (prev && prev.type === 'sources') {
									return { ...prev, streamingQuestion: question, streamingText: '' };
								}
								return { type: 'sources', streamingQuestion: question, streamingText: '', title: 'Sources Follow-up', messages: sourcesFollowupHistory };
							})}
							onStreamingReplace={(streamingText) => setContextChatModal((prev) => prev ? { ...prev, streamingText: streamingText ?? '' } : null)}
							onApply={(acc, _mode, q) => {
								appendSourcesFollowup(q ?? '', acc);
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
			{viewMode === 'graph' ? (
				<div className="pktw-h-[260px] pktw-w-full pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white pktw-overflow-hidden pktw-relative">
					{sourcesGraphLoading ? (
						<div className="pktw-h-full pktw-w-full pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] pktw-text-sm">
							<Loader2 className="pktw-w-5 pktw-h-5 pktw-animate-spin pktw-mr-2" />
							Discovering connections…
						</div>
					) : !sourcesGraph ? (
						<div className="pktw-h-full pktw-w-full pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] pktw-text-sm">
							No graph data
						</div>
					) : (
						<>
							<div
								ref={setInlineContainerEl}
								className={fullscreenOpen ? 'pktw-hidden' : 'pktw-h-full pktw-w-full'}
							/>
							{/* Fullscreen overlay: always in DOM for stable portal ref */}
							<div
								className={
									fullscreenOpen
										? 'pktw-fixed pktw-inset-0 pktw-bg-black/30 pktw-z-[10000] pktw-flex pktw-items-center pktw-justify-center pktw-p-4'
										: 'pktw-fixed pktw-inset-0 pktw-bg-black/30 pktw-z-[10000] pktw-flex pktw-items-center pktw-justify-center pktw-p-4 pktw-pointer-events-none pktw-invisible'
								}
								style={fullscreenOpen ? undefined : { visibility: 'hidden' }}
								onClick={(e) => fullscreenOpen && e.target === e.currentTarget && setFullscreenOpen(false)}
							>
								<motion.div
									initial={false}
									animate={{ opacity: fullscreenOpen ? 1 : 0 }}
									transition={{ duration: 0.2 }}
									className="pktw-bg-white pktw-rounded-lg pktw-shadow-xl pktw-border pktw-border-[#e5e7eb] pktw-w-full pktw-h-full pktw-max-w-[95vw] pktw-max-h-[95vh] pktw-flex pktw-flex-col pktw-overflow-hidden"
									onClick={(e) => e.stopPropagation()}
									style={!fullscreenOpen ? { pointerEvents: 'none' as const } : undefined}
								>
									<div className="pktw-flex pktw-items-center pktw-justify-between pktw-p-2 pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0">
										<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">Sources Graph</span>
										<Button variant="ghost" size="icon" className="pktw-rounded-md" title="Close" onClick={() => setFullscreenOpen(false)}>
											<X className="pktw-w-5 pktw-h-5" />
										</Button>
									</div>
									<div ref={setFullscreenContainerEl} className="pktw-flex-1 pktw-min-h-0 pktw-flex pktw-flex-col pktw-p-4 pktw-overflow-hidden" />
								</motion.div>
							</div>
							{(() => {
								const portalTarget = fullscreenOpen ? fullscreenContainerEl : inlineContainerEl;
								return portalTarget
									? createPortal(
										<GraphVisualization
											ref={graphRef}
											{...obsidianPreset}
											graph={sourcesGraph}
											containerClassName={fullscreenOpen ? 'pktw-w-full pktw-h-full pktw-min-h-[400px]' : 'pktw-h-full pktw-w-full'}
											showToolsPanel={fullscreenOpen}
											showToolbar={fullscreenOpen}
											hideTitle={fullscreenOpen}
										/>,
										portalTarget
									)
									: null;
							})()}
						</>
					)}
				</div>
			) : viewMode === 'evidence' ? (
				<EvidenceView evidenceIndex={evidenceIndex} evidencePaths={evidencePaths} onOpenPath={onOpen} />
			) : (
				<div className="pktw-space-y-3">
					{/* Scored sources (score > 0) */}
					{scoredSources.slice(0, visibleCount).map((source, index) => (
						<SourceCard key={source.id || `s-${index}`} source={source} index={index} onOpen={() => onOpen(source)} />
					))}
					{/* Zero-score sources: collapsed by default */}
					{zeroScoreSources.length > 0 && (
						<div className="pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white/80 pktw-overflow-hidden">
							<Button
								variant="ghost"
								size="sm"
								className="pktw-w-full pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-group"
								onClick={() => setExpandZeroScore((v) => !v)}
								aria-expanded={expandZeroScore}
							>
								{expandZeroScore ? (
									<ChevronDown className="pktw-w-4 pktw-h-4 pktw-text-[#6b7280] group-hover:pktw-text-white pktw-shrink-0" />
								) : (
									<ChevronRight className="pktw-w-4 pktw-h-4 pktw-text-[#6b7280] group-hover:pktw-text-white pktw-shrink-0" />
								)}
								<span className="pktw-text-xs group-hover:pktw-text-white">
									{zeroScoreSources.length} source{zeroScoreSources.length !== 1 ? 's' : ''} with score 0
								</span>
							</Button>
							{expandZeroScore && (
								<div className="pktw-border-t pktw-border-[#e5e7eb] pktw-p-2 pktw-space-y-2">
									{zeroScoreSources.map((source, index) => (
										<SourceCard key={source.id || `z-${index}`} source={source} index={index} onOpen={() => onOpen(source)} />
									))}
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
};