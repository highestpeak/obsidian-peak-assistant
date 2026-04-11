import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, ChevronDown } from 'lucide-react';
import type { SearchStep, SearchStepType } from '../types/search-steps';
import { AUTO_COLLAPSE_TYPES, STAY_EXPANDED_TYPES } from '../types/search-steps';
import { StepRenderer } from './StepRenderer';
import { useSearchSessionStore } from '../store/searchSessionStore';

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

function getStepSummary(step: SearchStep): string | null {
	if (step.status !== 'completed') return null;
	switch (step.type) {
		case 'classify': return step.dimensions.length > 0 ? `${step.dimensions.length} dimensions` : null;
		case 'decompose': return step.taskCount > 0 ? `${step.dimensionCount} dims → ${step.taskCount} task${step.taskCount !== 1 ? 's' : ''}` : null;
		case 'recon': return step.completedIndices.length > 0 ? `${step.completedIndices.length}/${step.total}` : null;
		case 'plan': {
			const parts: string[] = [];
			if (step.snapshot?.confidence) parts.push(step.snapshot.confidence);
			if (step.snapshot?.suggestedSections?.length) parts.push(`${step.snapshot.suggestedSections.length} sections`);
			return parts.length > 0 ? parts.join(' · ') : null;
		}
		default: return null;
	}
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
	/** When true, step is force-collapsed (e.g. report step appeared — prior steps recede) */
	forceCollapsed?: boolean;
}

const StepItem: React.FC<StepItemProps> = ({
	step,
	onClose,
	startedAtMs,
	durationMs,
	onOpenWikilink,
	itemRef,
	forceCollapsed = false,
}) => {
	const [expanded, setExpanded] = useState(() => defaultExpanded(step));
	const hitlPaused = useSearchSessionStore((s) => !!s.hitlState?.isPaused);

	// When a running step becomes completed, apply auto-collapse rules
	const prevStatusRef = useRef(step.status);
	useEffect(() => {
		if (prevStatusRef.current === 'running' && step.status === 'completed') {
			if (shouldAutoCollapse(step)) setExpanded(false);
			else if (shouldStayExpanded(step)) setExpanded(true);
		}
		prevStatusRef.current = step.status;
	}, [step.status, step]);

	// When report appears, collapse this step initially (user can still re-expand)
	useEffect(() => {
		if (forceCollapsed) setExpanded(false);
	}, [forceCollapsed]);

	const isExpanded = expanded;
	const toggle = () => setExpanded((v) => !v);

	return (
		<div ref={itemRef} data-step={step.type} className="pktw-mb-2">
			{/* Header */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer pktw-select-none pktw-py-1.5 pktw-px-2 pktw-rounded hover:pktw-bg-[#f3f0ff] pktw-transition-colors"
				onClick={toggle}
			>
				{step.status === 'running' && <RunningDot />}
				{step.status === 'completed' && <CompletedDot />}
				{step.status === 'error' && <ErrorDot />}
				{step.status === 'skipped' && <SkippedDot />}
				<span className="pktw-flex-1 pktw-text-xs pktw-font-medium pktw-text-[#2e3338] pktw-truncate">
					{getStepLabel(step)}
				</span>
				{/* Recon progress badge — always visible so user sees % while expanded */}
				{step.type === 'recon' && step.total > 0 && (() => {
					const done = step.tasks.filter(t => t.done).length;
					const total = step.total;
					const pct = Math.round((done / total) * 100);
					const color = step.status === 'completed' ? 'pktw-text-[#9ca3af]' : 'pktw-text-[#7c3aed]';
					return (
						<span className={`pktw-text-[10px] pktw-font-mono pktw-tabular-nums pktw-shrink-0 ${color}`}>
							{done}/{total} · {pct}%
						</span>
					);
				})()}
				{step.type !== 'recon' && !isExpanded && (() => {
					const summary = getStepSummary(step);
					return summary ? <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0">{summary}</span> : null;
				})()}
				{step.status === 'running' && (
					step.type === 'plan' && hitlPaused
						? <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-shrink-0">⏸ reviewing</span>
						: <LiveTimer startedAtMs={step.startedAt} />
				)}
				{step.status === 'completed' && step.endedAt != null && (
					<StaticDuration startedAt={step.startedAt} endedAt={step.endedAt} />
				)}
				{isExpanded
					? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-shrink-0" />
					: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-shrink-0" />
				}
			</div>

			{/* Collapsible content */}
			<AnimatePresence>
				{isExpanded && (
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
	const prevRunningIdRef = useRef<string | null>(null);

	// Auto-scroll when a new step appears OR the running step changes
	useEffect(() => {
		const runningStep = steps.find(s => s.status === 'running');
		const runningId = runningStep?.id ?? null;

		if (steps.length > prevCountRef.current) {
			const lastStep = steps[steps.length - 1];
			const ref = itemRefs.current.get(lastStep.id);
			// New classify = start of a new round → scroll to top so user sees round boundary
			const classifyCount = steps.filter(s => s.type === 'classify').length;
			const isNewRound = lastStep.type === 'classify' && classifyCount > 1;
			ref?.current?.scrollIntoView({ behavior: 'smooth', block: isNewRound ? 'start' : 'nearest' });
		} else if (runningId && runningId !== prevRunningIdRef.current) {
			// Running step changed (e.g. recon moved to next task) — scroll it into view
			const ref = itemRefs.current.get(runningId);
			ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}

		prevCountRef.current = steps.length;
		prevRunningIdRef.current = runningId;
	}, [steps]);

	// Filter out only generic steps; all named steps (including decompose) are always visible
	const visibleSteps = steps.filter(s => s.type !== 'generic');

	// Multi-round detection: find the start index of the current round (last classify step)
	let currentRoundStart = 0;
	for (let i = visibleSteps.length - 1; i >= 0; i--) {
		if (visibleSteps[i].type === 'classify') { currentRoundStart = i; break; }
	}
	const isMultiRound = currentRoundStart > 0;

	// Collapse rules for current round
	const hasReportStep = visibleSteps.slice(currentRoundStart).some(s => s.type === 'report');
	const hitlResolved = visibleSteps.slice(currentRoundStart).some(s => s.type === 'plan' && (s as any).userFeedback);
	const shouldForceCollapseCurrentRound = hasReportStep || hitlResolved;

	return (
		<div>
			{visibleSteps.map((step, idx) => {
				if (!itemRefs.current.has(step.id)) {
					itemRefs.current.set(step.id, React.createRef<HTMLDivElement>());
				}
				const ref = itemRefs.current.get(step.id)!;
				const isPrevRound = isMultiRound && idx < currentRoundStart;
				const isCurrentRound = !isPrevRound;
				const forceCollapsed =
					isPrevRound ||
					// Don't collapse sources — user needs to be able to expand it after report appears
					(isCurrentRound && shouldForceCollapseCurrentRound && step.type !== 'report' && step.type !== 'sources');
				return (
					<StepItem
						key={step.id}
						step={step}
						onClose={onClose}
						startedAtMs={startedAtMs}
						durationMs={durationMs}
						onOpenWikilink={onOpenWikilink}
						itemRef={ref}
						forceCollapsed={forceCollapsed}
					/>
				);
			})}
		</div>
	);
};
