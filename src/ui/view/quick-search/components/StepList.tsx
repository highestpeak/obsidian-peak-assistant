import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, ChevronDown } from 'lucide-react';
import type { SearchStep, SearchStepType } from '../types/search-steps';
import { AUTO_COLLAPSE_TYPES, STAY_EXPANDED_TYPES } from '../types/search-steps';
import { StepRenderer } from './StepRenderer';

// ---------------------------------------------------------------------------
// Label map
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<SearchStepType, string> = {
	classify: 'Classify',
	decompose: 'Decompose',
	recon: 'Exploring vault',
	plan: 'Review plan',
	report: 'Report',
	summary: 'Summary',
	sources: 'Sources',
	graph: 'Knowledge graph',
	followup: 'Follow-up',
	generic: 'Processing',
};

function getStepLabel(step: SearchStep): string {
	if (step.type === 'generic' && step.title) return step.title;
	return STEP_LABELS[step.type] ?? 'Processing';
}

// ---------------------------------------------------------------------------
// Status indicator sub-components
// ---------------------------------------------------------------------------

const RunningDot: React.FC = () => (
	<div className="pktw-relative pktw-w-3 pktw-h-3 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
		<motion.div
			className="pktw-absolute pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#7c3aed]"
			animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
			transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
		/>
		<motion.div
			className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[#7c3aed]"
			animate={{ scale: [1, 1.1, 1] }}
			transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
		/>
	</div>
);

const CompletedDot: React.FC = () => (
	<motion.div
		className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#10b981] pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"
		initial={{ scale: 0, rotate: -180 }}
		animate={{ scale: 1, rotate: 0 }}
		transition={{ type: 'spring', stiffness: 260, damping: 20 }}
	>
		<Check className="pktw-w-2 pktw-h-2 pktw-text-white" strokeWidth={3} />
	</motion.div>
);

const ErrorDot: React.FC = () => (
	<div className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-red-500 pktw-shrink-0" />
);

const SkippedDot: React.FC = () => (
	<div className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-gray-400 pktw-shrink-0" />
);

// ---------------------------------------------------------------------------
// Live timer (RAF-based)
// ---------------------------------------------------------------------------

const LiveTimer: React.FC<{ startedAtMs: number }> = ({ startedAtMs }) => {
	const [elapsed, setElapsed] = useState(0);
	const rafRef = useRef<number>();

	useEffect(() => {
		const update = () => {
			setElapsed(Date.now() - startedAtMs);
			rafRef.current = requestAnimationFrame(update);
		};
		rafRef.current = requestAnimationFrame(update);
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [startedAtMs]);

	return (
		<span className="pktw-text-[#7c3aed] pktw-font-mono pktw-text-xs pktw-tabular-nums pktw-shrink-0">
			{(elapsed / 1000).toFixed(1)}s
		</span>
	);
};

const StaticDuration: React.FC<{ startedAt: number; endedAt: number }> = ({ startedAt, endedAt }) => (
	<span className="pktw-text-[#9ca3af] pktw-font-mono pktw-text-xs pktw-tabular-nums pktw-shrink-0">
		{((endedAt - startedAt) / 1000).toFixed(1)}s
	</span>
);

// ---------------------------------------------------------------------------
// Collapse logic
// ---------------------------------------------------------------------------

function shouldAutoCollapse(step: SearchStep): boolean {
	if (step.status !== 'completed') return false;
	return AUTO_COLLAPSE_TYPES.has(step.type);
}

function shouldStayExpanded(step: SearchStep): boolean {
	if (step.status !== 'completed') return false;
	return STAY_EXPANDED_TYPES.has(step.type);
}

function defaultExpanded(step: SearchStep): boolean {
	if (step.status === 'running') return true;
	if (shouldAutoCollapse(step)) return false;
	if (shouldStayExpanded(step)) return true;
	return true;
}

// ---------------------------------------------------------------------------
// StepItem
// ---------------------------------------------------------------------------

interface StepItemProps {
	step: SearchStep;
	onClose?: () => void;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
	itemRef?: React.RefObject<HTMLDivElement>;
}

const StepItem: React.FC<StepItemProps> = ({
	step,
	onClose,
	startedAtMs,
	durationMs,
	onOpenWikilink,
	itemRef,
}) => {
	const [expanded, setExpanded] = useState(() => defaultExpanded(step));

	// When a running step becomes completed, apply auto-collapse rules
	const prevStatusRef = useRef(step.status);
	useEffect(() => {
		if (prevStatusRef.current === 'running' && step.status === 'completed') {
			if (shouldAutoCollapse(step)) setExpanded(false);
			else if (shouldStayExpanded(step)) setExpanded(true);
		}
		prevStatusRef.current = step.status;
	}, [step.status, step]);

	const toggle = () => setExpanded((v) => !v);

	return (
		<div ref={itemRef} className="pktw-mb-2">
			{/* Header */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer pktw-select-none pktw-py-1.5 pktw-px-2 pktw-rounded hover:pktw-bg-[#f3f0ff] pktw-transition-colors"
				onClick={toggle}
			>
				{step.status === 'running' && <RunningDot />}
				{step.status === 'completed' && <CompletedDot />}
				{step.status === 'error' && <ErrorDot />}
				{step.status === 'skipped' && <SkippedDot />}
				{expanded
					? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#6b7280] pktw-shrink-0" />
					: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#6b7280] pktw-shrink-0" />
				}
				<span className="pktw-flex-1 pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate">
					{getStepLabel(step)}
				</span>
				{step.status === 'running' && (
					<LiveTimer startedAtMs={step.startedAt} />
				)}
				{step.status === 'completed' && step.endedAt != null && (
					<StaticDuration startedAt={step.startedAt} endedAt={step.endedAt} />
				)}
			</div>

			{/* Collapsible content */}
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
						className="pktw-overflow-hidden"
					>
						<div className="pktw-px-2 pktw-pb-2">
							<StepRenderer
								step={step}
								onClose={onClose}
								startedAtMs={startedAtMs}
								durationMs={durationMs}
								onOpenWikilink={onOpenWikilink}
							/>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

// ---------------------------------------------------------------------------
// StepList
// ---------------------------------------------------------------------------

export interface StepListProps {
	steps: SearchStep[];
	onClose?: () => void;
	startedAtMs: number | null;
	durationMs: number | null;
	onOpenWikilink?: (path: string) => void | Promise<void>;
}

export const StepList: React.FC<StepListProps> = ({
	steps,
	onClose,
	startedAtMs,
	durationMs,
	onOpenWikilink,
}) => {
	const itemRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
	const prevCountRef = useRef(steps.length);

	// Auto-scroll when a new step appears
	useEffect(() => {
		if (steps.length > prevCountRef.current) {
			const lastStep = steps[steps.length - 1];
			const ref = itemRefs.current.get(lastStep.id);
			ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
		prevCountRef.current = steps.length;
	}, [steps]);

	return (
		<div>
			{steps.map((step) => {
				if (!itemRefs.current.has(step.id)) {
					itemRefs.current.set(step.id, React.createRef<HTMLDivElement>());
				}
				const ref = itemRefs.current.get(step.id)!;
				return (
					<StepItem
						key={step.id}
						step={step}
						onClose={onClose}
						startedAtMs={startedAtMs}
						durationMs={durationMs}
						onOpenWikilink={onOpenWikilink}
						itemRef={ref}
					/>
				);
			})}
		</div>
	);
};
