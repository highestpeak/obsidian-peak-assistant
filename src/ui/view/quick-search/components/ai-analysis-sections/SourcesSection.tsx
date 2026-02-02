import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Info, MessageCircle } from 'lucide-react';
import { mixSearchResultsBySource } from '@/core/utils/source-mixer';
import { getSourceIcon } from '@/ui/view/shared/file-utils';
import type { SearchResultItem } from '@/service/search/types';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/ui/component/shared-ui/hover-card';
import { InlineFollowupChat } from '@/ui/component/mine/InlineFollowupChat';
import { PromptId } from '@/service/prompt/PromptId';
import { useAIAnalysisStore } from '../../store/aiAnalysisStore';

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

/**
 * Top sources section component showing relevant files with reasoning, badges, and score breakdown
 */
export const TopSourcesSection: React.FC<{
	sources: SearchResultItem[];
	onOpen: (source: SearchResultItem | string) => void;
	skipAnimation?: boolean;
}> = ({ sources, onOpen, skipAnimation = false }) => {

	const {
		setContextChatModal,
		appendSourcesFollowup,
		sourcesFollowupHistory,
	} = useAIAnalysisStore();

	const [showSourcesFollowup, setShowSourcesFollowup] = useState(false);

	// Apply source mixing strategy (ensure minimum 2 items per source, then interleave)
	const mixedSources = React.useMemo(() => {
		return mixSearchResultsBySource(sources, 2);
	}, [sources]);

	// animate the sources one by one
	const [visibleCount, setVisibleCount] = React.useState(0);
	React.useEffect(() => {
		if (mixedSources.length === 0) {
			setVisibleCount(0);
			return;
		}

		if (skipAnimation) {
			// Skip animation and show all items immediately
			setVisibleCount(mixedSources.length);
			return;
		}

		// Reset and animate items one by one
		setVisibleCount(0);
		let current = 0;
		const interval = setInterval(() => {
			current++;
			setVisibleCount(current);
			if (current >= mixedSources.length) {
				clearInterval(interval);
			}
		}, 100); // Show one item every 100ms

		return () => clearInterval(interval);
	}, [mixedSources.length, skipAnimation]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3 pktw-w-full pktw-group">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Top Sources</span>
				<span className="pktw-text-xs pktw-text-[#999999]">({mixedSources.length} files)</span>
				<div className="pktw-flex-1" />
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
						<HoverCardContent align="end" className="pktw-w-48 pktw-p-1 pktw-z-[10000]">
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
							title="Ask about Sources"
							placeholder="Ask to explain why these sources matter…"
							promptId={PromptId.AiAnalysisFollowupSources}
							getVariables={(question) => ({
								question,
								sourcesList: sources.slice(0, 10).map((s: any) => `- ${s.title || s.path}`).join('\n') || '(empty)',
							})}
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
			<div className="pktw-space-y-3">
				{mixedSources.slice(0, visibleCount).map((source, index) => (
					<div
						key={source.id || index}
						className="pktw-p-3 pktw-rounded-lg pktw-bg-white pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/30 hover:pktw-bg-[#fafafa] pktw-cursor-pointer pktw-transition-all pktw-group"
						style={{
							opacity: 0,
							transform: 'translateY(-8px)',
							animation: `fadeInSlide 0.3s ease-out ${index * 0.1}s forwards`
						}}
						onClick={() => onOpen(source)}
					>
						{/* Header row: icon, title, score */}
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<div className="pktw-flex-shrink-0">
								{getSourceIcon(source.source)}
							</div>
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0">
									<div className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-truncate group-hover:pktw-text-[#7c3aed] pktw-min-w-0">
										{source.title}
									</div>
									{source.badges && source.badges.length > 0 ? (
										<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-flex-shrink-0">
											{source.badges.map((badge, i) => (
												<span
													key={i}
													className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed] pktw-font-medium"
													title={badge}
												>
													{badge}
												</span>
											))}
										</div>
									) : null}
								</div>
								<div className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
									{source.path}
								</div>
							</div>
							{/* Score breakdown: horizontal gauges (Physical, Semantic, Average) */}
							{source.scoreDetail ? (
								<div
									className="pktw-flex pktw-items-flex-end pktw-gap-2 pktw-flex-shrink-0"
									title="Score breakdown: Physical / Semantic / Average"
								>
									<ScoreGauge label="Physical" value={source.scoreDetail.physical} color="#3b82f6" />
									<ScoreGauge label="Semantic" value={source.scoreDetail.semantic} color="#8b5cf6" />
									<ScoreGauge label="Average" value={source.scoreDetail.average} color="#22c55e" />
								</div>
							) : (
								<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-medium">
									{(source.finalScore ?? source.score) ? (source.finalScore ?? source.score ?? 0).toFixed(2) : ''}
								</div>
							)}
						</div>

						{/* Reasoning row (content field) */}
						{source.content && (
							<div className="pktw-mt-2 pktw-flex pktw-items-center pktw-gap-1.5">
								<Info className="pktw-w-3 pktw-h-3 pktw-text-[#999999] pktw-flex-shrink-0" aria-hidden />
								<span className="pktw-text-xs pktw-text-[#6c757d] pktw-leading-relaxed pktw-line-clamp-2">
									{source.content}
								</span>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
};