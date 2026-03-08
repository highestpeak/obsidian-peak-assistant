/**
 * Pipeline stage visualizer: Classify (dimension ring) + Recon (points/ripple) + Grouping (bubbles) + Evidence (group progress, reading path).
 * Driven by search-stage ui-signal and parallel-stream-progress; uses real dimensions/groups from backend.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useSearchPipelineStage } from '../../hooks/useSearchPipelineStage';

const DIMENSION_COLORS = [
	'#7c3aed',
	'#3b82f6',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#6366f1',
	'#14b8a6',
	'#a855f7',
	'#f97316',
	'#84cc16',
	'#ec4899',
	'#0ea5e9',
	'#d946ef',
	'#059669',
	'#eab308',
];

function getDimensionColor(index: number): string {
	return DIMENSION_COLORS[index % DIMENSION_COLORS.length];
}

export const SearchPipelineVisualizer: React.FC<{ isStreaming?: boolean }> = ({ isStreaming }) => {
	const { state } = useSearchPipelineStage({ isStreaming });

	const inPipeline = state.stage !== 'idle';
	const showRing = inPipeline && (state.stage === 'classify' || state.stage === 'recon' || state.stage === 'consolidate');
	const showReconDots = state.stage === 'recon' && state.dimensions.length > 0;
	const showGroupingBubbles = state.stage === 'grouping' && state.groups.length > 0;
	const showEvidenceView = state.stage === 'evidence';
	const showPlanReportView = (state.stage === 'reportPlan' || state.stage === 'visualBlueprint' || state.stage === 'reportBlock') &&
		(state.reportPlanProgress.total > 0 || state.visualBlueprintProgress.total > 0 || state.reportBlockOrder.length > 0 || state.reportBlockCompleted.size > 0);
	const activeGroupId = useMemo(() => {
		if (!showEvidenceView) return null;
		const withPath = Object.entries(state.evidencePerGroup).find(([, v]) => v.currentPath);
		return withPath?.[0] ?? null;
	}, [showEvidenceView, state.evidencePerGroup]);
	const currentReadingPath = activeGroupId ? state.evidencePerGroup[activeGroupId]?.currentPath : undefined;

	const centerX = 50;
	const centerY = 50;
	const radius = 38;
	const dimensions = state.dimensions;

	const points = useMemo(() => {
		return dimensions.map((_, index) => {
			const angle = (index / Math.max(dimensions.length, 1)) * Math.PI * 2 - Math.PI / 2;
			return {
				x: centerX + Math.cos(angle) * radius,
				y: centerY + Math.sin(angle) * radius,
				angle,
				color: getDimensionColor(index),
			};
		});
	}, [dimensions.length]);

	if (!inPipeline) return null;

	// Plan checklist + Result frame skeleton
	if (showPlanReportView) {
		const planTotal = Math.max(state.reportPlanProgress.total, 1);
		const planDone = state.reportPlanProgress.index;
		const blockOrder = state.reportBlockOrder.length > 0 ? state.reportBlockOrder : Array.from({ length: Math.max(state.visualBlueprintProgress.total, state.reportBlockCompleted.size, 1) }, (_, i) => `block_${i}`);
		return (
			<div className="pktw-relative pktw-w-full pktw-min-h-[200px] pktw-flex pktw-flex-col pktw-bg-[#f3f4f6] pktw-rounded-t-lg pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0 pktw-p-3">
				<div className="pktw-flex pktw-gap-4 pktw-flex-1 pktw-min-h-0">
					{/* Plan checklist */}
					<div className="pktw-flex-1 pktw-min-w-0">
						<div className="pktw-text-[10px] pktw-font-medium pktw-text-[#6b7280] pktw-mb-1.5">Plan</div>
						<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
							{Array.from({ length: planTotal }, (_, i) => {
								const done = i < planDone;
								return (
									<motion.div
										key={i}
										className={`pktw-w-5 pktw-h-5 pktw-rounded pktw-flex pktw-items-center pktw-justify-center pktw-border ${done ? 'pktw-bg-[#10b981] pktw-border-[#10b981]' : 'pktw-bg-white pktw-border-[#e5e7eb]'}`}
										initial={false}
										animate={{ scale: done ? 1 : 0.95 }}
										transition={{ duration: 0.2 }}
									>
										{done && <Check className="pktw-w-3 pktw-h-3 pktw-text-white" strokeWidth={3} />}
									</motion.div>
								);
							})}
						</div>
					</div>
					{/* Result frame skeleton */}
					<div className="pktw-flex-1 pktw-min-w-0">
						<div className="pktw-text-[10px] pktw-font-medium pktw-text-[#6b7280] pktw-mb-1.5">Result</div>
						<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
							{blockOrder.slice(0, 12).map((blockId, i) => {
								const done = state.reportBlockCompleted.has(blockId);
								return (
									<motion.div
										key={blockId}
										className={`pktw-h-5 pktw-flex-1 pktw-min-w-[24px] pktw-max-w-[48px] pktw-rounded pktw-border pktw-overflow-hidden pktw-relative ${done ? 'pktw-bg-[#10b981]/20 pktw-border-[#10b981]' : 'pktw-bg-[#e5e7eb] pktw-border-[#d1d5db]'}`}
										initial={false}
										animate={{ opacity: 1 }}
									>
										{done && (
											<motion.div
												className="pktw-absolute pktw-inset-0 pktw-bg-[#10b981]/30"
												initial={{ scaleX: 0 }}
												animate={{ scaleX: 1 }}
												transition={{ duration: 0.4 }}
												style={{ transformOrigin: 'left' }}
											/>
										)}
										{done && (
											<span className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center">
												<Check className="pktw-w-2.5 pktw-h-2.5 pktw-text-[#10b981]" strokeWidth={3} />
											</span>
										)}
									</motion.div>
								);
							})}
						</div>
					</div>
				</div>
				<div className="pktw-text-center pktw-text-xs pktw-text-[#6b7280] pktw-mt-1">
					{state.stage === 'reportPlan' && 'Report plan'}
					{state.stage === 'visualBlueprint' && 'Visual blueprint'}
					{state.stage === 'reportBlock' && `${state.reportBlockCompleted.size} blocks written`}
				</div>
			</div>
		);
	}

	// Grouping: semantic bubbles (no dimension labels)
	if (showGroupingBubbles) {
		return (
			<div className="pktw-relative pktw-w-full pktw-min-h-[200px] pktw-flex pktw-items-center pktw-justify-center pktw-bg-[#f3f4f6] pktw-rounded-t-lg pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0 pktw-p-3">
				<div className="pktw-flex pktw-flex-wrap pktw-gap-2 pktw-justify-center pktw-items-center">
					{state.groups.map((g, i) => (
						<motion.div
							key={g.groupId}
							className="pktw-px-3 pktw-py-2 pktw-rounded-xl pktw-border pktw-text-xs pktw-max-w-[140px]"
							style={{
								backgroundColor: `${DIMENSION_COLORS[i % DIMENSION_COLORS.length]}18`,
								borderColor: `${DIMENSION_COLORS[i % DIMENSION_COLORS.length]}60`,
							}}
							initial={{ scale: 0, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={{ duration: 0.35, delay: i * 0.06 }}
						>
							<div className="pktw-font-medium pktw-truncate pktw-text-[#374151]" title={g.topic_anchor}>
								{g.topic_anchor || g.groupId}
							</div>
							<div className="pktw-text-[10px] pktw-text-[#6b7280] pktw-mt-0.5 pktw-line-clamp-2" title={g.group_focus}>
								{g.group_focus}
							</div>
						</motion.div>
					))}
				</div>
				<div className="pktw-absolute pktw-bottom-2 pktw-left-0 pktw-right-0 pktw-text-center pktw-text-xs pktw-text-[#6b7280]">
					Grouping · {state.groups.length} groups
				</div>
			</div>
		);
	}

	// Evidence: group bubbles (left) + reading path (bottom) + evidence placeholder (right)
	if (showEvidenceView) {
		const groupIds = state.groups.length > 0 ? state.groups.map((g) => g.groupId) : Object.keys(state.evidencePerGroup);
		return (
			<div className="pktw-relative pktw-w-full pktw-min-h-[200px] pktw-flex pktw-bg-[#f3f4f6] pktw-rounded-t-lg pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0 pktw-p-2">
				<div className="pktw-flex pktw-flex-1 pktw-min-w-0 pktw-gap-2">
					{/* Left: group bubbles with task progress */}
					<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-content-start pktw-flex-1 pktw-min-w-0">
						{(groupIds.length ? groupIds : ['evidence']).map((groupId, i) => {
							const prog = state.evidencePerGroup[groupId];
							const total = prog?.totalTasks ?? 0;
							const done = prog?.completedTasks ?? 0;
							const isActive = groupId === activeGroupId;
							const color = DIMENSION_COLORS[i % DIMENSION_COLORS.length];
							const label = state.groups.find((g) => g.groupId === groupId)?.topic_anchor ?? groupId;
							return (
								<motion.div
									key={groupId}
									className={`pktw-px-2 pktw-py-1.5 pktw-rounded-lg pktw-text-[10px] pktw-border ${isActive ? 'pktw-border-2' : ''}`}
									style={{
										backgroundColor: `${color}20`,
										borderColor: isActive ? color : `${color}50`,
									}}
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ delay: i * 0.04 }}
								>
									<span className="pktw-font-medium pktw-truncate pktw-block pktw-max-w-[80px]">{label}</span>
									<span className="pktw-text-[#6b7280]">{done}/{total} tasks</span>
								</motion.div>
							);
						})}
					</div>
					{/* Right: evidence library placeholder */}
					<div className="pktw-w-20 pktw-shrink-0 pktw-rounded pktw-border pktw-border-[#e5e7eb] pktw-bg-white/60 pktw-p-1.5 pktw-text-[10px] pktw-text-[#6b7280]">
						Evidence
					</div>
				</div>
				{/* Bottom: current reading path + caption */}
				<div className="pktw-absolute pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-flex pktw-flex-col pktw-gap-0.5 pktw-px-2 pktw-pb-1.5">
					{currentReadingPath && (
						<motion.div
							className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-truncate pktw-bg-white/80 pktw-py-1 pktw-px-2 pktw-rounded"
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
						>
							Reading {currentReadingPath}…
						</motion.div>
					)}
					<div className="pktw-text-center pktw-text-xs pktw-text-[#6b7280]">
						Evidence · {state.evidenceCompletedIndices.length}/{state.evidenceTotal || groupIds.length || 1} groups
					</div>
				</div>
			</div>
		);
	}

	// Classify + Recon: dimension ring (star chart)
	return (
		<div className="pktw-relative pktw-w-full pktw-min-h-[240px] pktw-flex pktw-items-center pktw-justify-center pktw-bg-[#f3f4f6] pktw-rounded-t-lg pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0">
			<svg viewBox="0 0 100 100" className="pktw-w-full pktw-h-full pktw-min-h-[200px] pktw-max-h-[320px] pktw-block">
				<motion.circle cx={centerX} cy={centerY} r={1.2} fill="#7c3aed" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 0.9 }} transition={{ duration: 0.4 }} />
				<motion.circle cx={centerX} cy={centerY} r={2} fill="none" stroke="#7c3aed" strokeWidth={0.15} initial={{ r: 0, opacity: 0.6 }} animate={{ r: 8, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }} />
				<motion.circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="#d1d5db" strokeWidth={0.2} strokeDasharray="1.5,1.5" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.5 }} transition={{ duration: 0.6 }} />
				{showRing && points.map((pt, index) => {
					const isActive = state.stage === 'classify' || index < state.dimensions.length;
					const isReconComplete = showReconDots && state.reconCompletedIndices.includes(index);
					const color = pt.color;
					return (
						<g key={state.dimensions[index]?.id ?? index}>
							{isActive && state.stage === 'classify' && (
								<motion.line x1={centerX} y1={centerY} x2={pt.x} y2={pt.y} stroke={color} strokeWidth={0.12} opacity={0.35} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: index * 0.05 }} />
							)}
							<motion.circle cx={pt.x} cy={pt.y} r={showReconDots ? 0.8 : 1.4} fill={color} initial={{ scale: 0, opacity: 0 }} animate={{ scale: isActive ? 1 : 0, opacity: isActive ? 1 : 0 }} transition={{ duration: 0.35, delay: index * 0.05 }} />
							{showReconDots && isReconComplete && (
								<motion.circle cx={pt.x} cy={pt.y} r={0.8} fill="none" stroke={color} strokeWidth={0.25} initial={{ r: 0.8, opacity: 0.9 }} animate={{ r: 3.5, opacity: 0 }} transition={{ duration: 1, ease: 'easeOut' }} />
							)}
							{showReconDots && (
								<motion.circle cx={pt.x + Math.cos(pt.angle) * 2.5} cy={pt.y + Math.sin(pt.angle) * 2.5} r={0.4} fill={isReconComplete ? color : '#9ca3af'} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: isReconComplete ? 1 : 0.6 }} transition={{ duration: 0.3, delay: index * 0.03 }} />
							)}
						</g>
					);
				})}
			</svg>
			{state.stage === 'classify' && dimensions.length > 0 && (
				<div className="pktw-absolute pktw-inset-0 pktw-pointer-events-none pktw-flex pktw-items-center pktw-justify-center">
					{points.map((pt, index) => {
						const dim = dimensions[index];
						const labelRadius = 50;
						const angle = (index / Math.max(dimensions.length, 1)) * Math.PI * 2 - Math.PI / 2;
						const x = 50 + Math.cos(angle) * labelRadius;
						const y = 50 + Math.sin(angle) * labelRadius;
						return (
							<motion.div
								key={dim?.id ?? index}
								className="pktw-absolute pktw-px-2 pktw-py-0.5 pktw-rounded-full pktw-text-[10px] pktw-font-medium pktw-max-w-[72px] pktw-truncate pktw-border"
								style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', backgroundColor: `${pt.color}30`, color: pt.color, borderColor: `${pt.color}80` }}
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ duration: 0.35, delay: index * 0.05 }}
							>
								{dim?.id?.replace(/_/g, ' ') ?? `D${index + 1}`}
							</motion.div>
						);
					})}
				</div>
			)}
			<div className="pktw-absolute pktw-bottom-2 pktw-left-0 pktw-right-0 pktw-text-center pktw-text-xs pktw-text-[#6b7280]">
				{state.stage === 'classify' && 'Classify'}
				{state.stage === 'recon' && `Recon · ${state.reconCompletedIndices.length}/${state.reconTotal || state.dimensions.length} dimensions`}
				{state.stage === 'consolidate' && 'Consolidate'}
			</div>
		</div>
	);
};
