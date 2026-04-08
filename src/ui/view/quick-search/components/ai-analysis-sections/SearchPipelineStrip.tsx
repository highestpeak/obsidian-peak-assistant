import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useSearchPipelineStage, type PipelineStage, type SearchPipelineState } from '../../hooks/useSearchPipelineStage';

const PHASES = [
	{ id: 'classify', label: 'Classify' },
	{ id: 'decompose', label: 'Decompose' },
	{ id: 'recon', label: 'Recon' },
	{ id: 'presentPlan', label: 'Plan' },
	{ id: 'reportBlock', label: 'Report' },
] as const;

/** Map any PipelineStage to its display phase index. */
function getPhaseIndex(stage: PipelineStage): number {
	switch (stage) {
		case 'classify': return 0;
		case 'decompose': return 1;
		case 'recon': case 'consolidate': case 'grouping': case 'evidence': return 2;
		case 'presentPlan': case 'reportPlan': return 3;
		case 'visualBlueprint': case 'reportBlock': return 4;
		default: return -1;
	}
}

const DIM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
	semantic: { bg: '#7c3aed15', text: '#7c3aed', border: '#7c3aed40' },
	topology: { bg: '#3b82f615', text: '#3b82f6', border: '#3b82f640' },
	temporal: { bg: '#f59e0b15', text: '#f59e0b', border: '#f59e0b40' },
};

function getDimType(id: string): 'semantic' | 'topology' | 'temporal' {
	if (id === 'inventory_mapping') return 'topology';
	if (id === 'temporal_mapping') return 'temporal';
	return 'semantic';
}

/** ● ── ● ── ○ ── ○ ── ○ horizontal phase bar */
const PhaseBar: React.FC<{ stage: PipelineStage }> = ({ stage }) => {
	const activeIdx = getPhaseIndex(stage);
	return (
		<div className="pktw-flex pktw-items-center pktw-w-full">
			{PHASES.map((phase, i) => {
				const isCompleted = activeIdx > i;
				const isActive = activeIdx === i;
				return (
					<React.Fragment key={phase.id}>
						<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-0.5">
							<div className="pktw-relative pktw-flex pktw-items-center pktw-justify-center">
								{isActive && (
									<motion.div
										className="pktw-absolute pktw-w-2.5 pktw-h-2.5 pktw-rounded-full pktw-bg-[#7c3aed]"
										animate={{ scale: [1, 1.8, 1.8], opacity: [0.5, 0, 0] }}
										transition={{ duration: 1.5, repeat: Infinity }}
									/>
								)}
								<div
									className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-transition-colors pktw-duration-300"
									style={{
										backgroundColor: isCompleted ? '#10b981' : isActive ? '#7c3aed' : '#d1d5db',
									}}
								/>
							</div>
							<span
								className="pktw-text-[9px] pktw-font-medium pktw-whitespace-nowrap pktw-transition-colors pktw-duration-300"
								style={{
									color: isCompleted ? '#10b981' : isActive ? '#7c3aed' : '#9ca3af',
								}}
							>
								{phase.label}
							</span>
						</div>
						{i < PHASES.length - 1 && (
							<div
								className="pktw-flex-1 pktw-h-px pktw-min-w-[8px] pktw-transition-colors pktw-duration-300"
								style={{ backgroundColor: activeIdx > i ? '#10b981' : '#e5e7eb' }}
							/>
						)}
					</React.Fragment>
				);
			})}
		</div>
	);
};

/** Phase-specific detail content */
const DetailStrip: React.FC<{ state: SearchPipelineState }> = ({ state }) => {
	const { stage, dimensions, reconCompletedIndices, reconTotal, taskCount, reportBlockCompleted, reportBlockOrder } = state;

	if (stage === 'classify') {
		if (dimensions.length === 0) {
			return (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1">
					<motion.div
						className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[#7c3aed]"
						animate={{ opacity: [1, 0.3, 1] }}
						transition={{ duration: 1.2, repeat: Infinity }}
					/>
					<span className="pktw-text-[10px] pktw-text-[#9ca3af]">Analyzing query...</span>
				</div>
			);
		}
		return (
			<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-max-h-[52px] pktw-overflow-hidden">
				{dimensions.map((dim, i) => {
					const type = getDimType(dim.id);
					const colors = DIM_COLORS[type];
					return (
						<motion.span
							key={`${dim.id}-${i}`}
							className="pktw-inline-flex pktw-items-center pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-text-[10px] pktw-font-medium pktw-border"
							style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.2, delay: i * 0.04 }}
							title={dim.intent_description}
						>
							{dim.id.replace(/_/g, ' ')}
						</motion.span>
					);
				})}
			</div>
		);
	}

	if (stage === 'decompose') {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-gap-2 pktw-py-1">
				<span className="pktw-text-[10px] pktw-text-[#6b7280]">{dimensions.length} dimensions</span>
				<motion.div className="pktw-w-4 pktw-h-px pktw-bg-[#d1d5db]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} />
				<motion.span
					className="pktw-text-[10px] pktw-font-medium pktw-text-[#7c3aed]"
					initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
				>
					{taskCount > 0 ? `${taskCount} tasks` : '...'}
				</motion.span>
			</div>
		);
	}

	if (stage === 'recon' || stage === 'consolidate' || stage === 'grouping' || stage === 'evidence') {
		const total = reconTotal || taskCount || 1;
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-1">
				{Array.from({ length: total }, (_, i) => {
					const isCompleted = reconCompletedIndices.includes(i);
					const isActive = !isCompleted && (reconCompletedIndices.length === i);
					return (
						<div key={i} className="pktw-flex pktw-items-center pktw-gap-2">
							{isCompleted ? (
								<div className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#10b981] pktw-flex pktw-items-center pktw-justify-center">
									<Check className="pktw-w-2 pktw-h-2 pktw-text-white" strokeWidth={3} />
								</div>
							) : isActive ? (
								<motion.div
									className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#7c3aed]"
									animate={{ scale: [1, 1.2, 1] }}
									transition={{ duration: 0.8, repeat: Infinity }}
								/>
							) : (
								<div className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-border pktw-border-[#d1d5db]" />
							)}
							<span className={`pktw-text-[10px] ${isActive ? 'pktw-text-[#7c3aed] pktw-font-medium' : 'pktw-text-[#6b7280]'}`}>
								Task {i + 1}
							</span>
							<div className="pktw-flex-1 pktw-h-1 pktw-bg-[#e5e7eb] pktw-rounded-full pktw-overflow-hidden">
								<motion.div
									className="pktw-h-full pktw-rounded-full"
									style={{ backgroundColor: isCompleted ? '#10b981' : isActive ? '#7c3aed' : 'transparent' }}
									initial={{ width: 0 }}
									animate={{ width: isCompleted ? '100%' : isActive ? '50%' : '0%' }}
									transition={{ duration: 0.4 }}
								/>
							</div>
						</div>
					);
				})}
			</div>
		);
	}

	if (stage === 'presentPlan' || stage === 'reportPlan') {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1">
				<motion.div
					className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[#7c3aed]"
					animate={{ opacity: [1, 0.3, 1] }}
					transition={{ duration: 1.2, repeat: Infinity }}
				/>
				<span className="pktw-text-[10px] pktw-text-[#9ca3af]">Preparing report plan...</span>
			</div>
		);
	}

	if (stage === 'visualBlueprint' || stage === 'reportBlock') {
		if (reportBlockOrder.length === 0) {
			return (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1">
					<motion.div
						className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[#7c3aed]"
						animate={{ opacity: [1, 0.3, 1] }}
						transition={{ duration: 1.2, repeat: Infinity }}
					/>
					<span className="pktw-text-[10px] pktw-text-[#9ca3af]">Generating report...</span>
				</div>
			);
		}
		return (
			<div className="pktw-flex pktw-gap-0.5 pktw-items-center">
				{reportBlockOrder.map((blockId) => (
					<motion.div
						key={blockId}
						className="pktw-h-3 pktw-flex-1 pktw-min-w-[12px] pktw-max-w-[32px] pktw-rounded-sm"
						animate={{ backgroundColor: reportBlockCompleted.has(blockId) ? '#10b981' : '#e5e7eb' }}
						transition={{ duration: 0.3 }}
					/>
				))}
				<span className="pktw-text-[10px] pktw-text-[#6b7280] pktw-ml-1.5">
					{reportBlockCompleted.size}/{reportBlockOrder.length}
				</span>
			</div>
		);
	}

	return null;
};

/** Single-line status */
const StatusLine: React.FC<{ state: SearchPipelineState }> = ({ state }) => {
	const { stage, dimensions, reconCompletedIndices, reconTotal, taskCount, reportBlockCompleted, reportBlockOrder } = state;
	let text = '';
	if (stage === 'classify') text = dimensions.length > 0 ? `${dimensions.length} dimensions identified` : 'Analyzing query';
	else if (stage === 'decompose') text = taskCount > 0 ? `${taskCount} search tasks created` : 'Decomposing into tasks';
	else if (stage === 'recon') text = `Task ${reconCompletedIndices.length}/${reconTotal || taskCount}`;
	else if (stage === 'presentPlan' || stage === 'reportPlan') text = 'Reviewing evidence plan';
	else if (stage === 'visualBlueprint' || stage === 'reportBlock') text = reportBlockOrder.length > 0 ? `${reportBlockCompleted.size}/${reportBlockOrder.length} blocks` : 'Generating report';
	if (!text) return null;
	return <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-truncate">{text}</span>;
};

export const SearchPipelineStrip: React.FC<{ isStreaming?: boolean }> = ({ isStreaming }) => {
	const { state } = useSearchPipelineStage({ isStreaming });
	if (state.stage === 'idle' && !isStreaming) return null;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<PhaseBar stage={state.stage} />
			<DetailStrip state={state} />
			<StatusLine state={state} />
		</div>
	);
};
