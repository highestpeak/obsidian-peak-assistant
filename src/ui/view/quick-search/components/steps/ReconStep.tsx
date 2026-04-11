import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReconStep as ReconStepType, ReconProgressEntry } from '../../types/search-steps';

const TaskRunningDot: React.FC = () => (
	<div className="pktw-relative pktw-w-3 pktw-h-3 pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
		<motion.div
			className="pktw-absolute pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#7c3aed]"
			animate={{ scale: [1, 1.8, 1.8], opacity: [0.5, 0, 0] }}
			transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
		/>
		<motion.div
			className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[#7c3aed]"
			animate={{ scale: [1, 1.1, 1] }}
			transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
		/>
	</div>
);

/** Pulsing "Thinking…" dots shown during LLM gap between tool calls */
const ThinkingIndicator: React.FC = () => (
	<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-pl-0 pktw-mt-0.5">
		<span className="pktw-text-[10px] pktw-text-[#a78bfa] pktw-italic">Thinking</span>
		{[0, 1, 2].map((i) => (
			<motion.span
				key={i}
				className="pktw-w-1 pktw-h-1 pktw-rounded-full pktw-bg-[#a78bfa] pktw-shrink-0"
				animate={{ opacity: [0.3, 1, 0.3] }}
				transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
			/>
		))}
	</div>
);

function TaskProgress({ label, done }: { label?: string; done: boolean }) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2">
			<span className={`pktw-text-[11px] pktw-font-medium pktw-flex-1 pktw-truncate ${done ? 'pktw-text-[#9ca3af]' : 'pktw-text-[#374151]'}`} title={label}>
				{label ?? 'Searching vault...'}
			</span>
			{done ? <span className="pktw-text-[10px] pktw-text-green-600 pktw-shrink-0">✓</span> : null}
		</div>
	);
}

function TaskAgentPanel({ taskIndex, label, entries, done }: {
	taskIndex: number;
	label: string;
	entries: ReconProgressEntry[];
	done: boolean;
}) {
	// Running tasks expand by default; completed tasks collapse by default
	const [expanded, setExpanded] = useState(!done);
	const prevDoneRef = useRef(done);
	const bottomRef = useRef<HTMLDivElement>(null);

	// When task completes, auto-collapse; when a new task starts running, expand
	useEffect(() => {
		if (prevDoneRef.current !== done) {
			setExpanded(!done);
			prevDoneRef.current = done;
		}
	}, [done]);

	// Auto-scroll to bottom as new entries arrive (only when expanded and running)
	const prevEntriesLen = useRef(entries.length);
	useEffect(() => {
		if (!done && expanded && entries.length > prevEntriesLen.current) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
		prevEntriesLen.current = entries.length;
	}, [entries.length, done, expanded]);

	const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

	return (
		<div className={`pktw-flex pktw-flex-col pktw-gap-0.5 pktw-p-1.5 pktw-rounded pktw-border pktw-transition-colors ${done ? 'pktw-bg-[#f0fdf4] pktw-border-[#bbf7d0]' : 'pktw-bg-[#faf5ff]/50 pktw-border-[#ede9fe]'}`}>
			<div
				className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-cursor-pointer pktw-select-none"
				onClick={() => setExpanded((v) => !v)}
			>
				{!done ? <TaskRunningDot /> : <span className="pktw-text-[10px] pktw-text-green-600 pktw-shrink-0">✓</span>}
				<div className="pktw-flex-1 pktw-min-w-0">
					<TaskProgress label={`T${taskIndex + 1}: ${label}`} done={done} />
					{!expanded && lastEntry ? (
						<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-truncate pktw-block" title={lastEntry.detail}>
							{lastEntry.detail}
						</span>
					) : null}
					{!expanded && !done && !lastEntry ? (
						<span className="pktw-text-[10px] pktw-text-[#a78bfa] pktw-italic">Starting...</span>
					) : null}
				</div>
				{expanded
					? <ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-shrink-0" />
					: <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-shrink-0" />
				}
			</div>
			{expanded ? (
				<div className="pktw-flex pktw-flex-col pktw-gap-px pktw-pl-2">
					{entries.length > 0 ? (
						<>
							{entries.map((entry, i) => (
								<span
									key={i}
									className="pktw-text-[10px] pktw-text-[#6b7280] pktw-leading-snug"
									title={entry.detail}
								>
									{entry.detail}
								</span>
							))}
							{/* Show "Thinking…" pulse during LLM gap when task is still running */}
							{!done && <ThinkingIndicator />}
						</>
					) : !done ? (
						<ThinkingIndicator />
					) : null}
					<div ref={bottomRef} />
				</div>
			) : null}
		</div>
	);
}

export const ReconStep: React.FC<{ step: ReconStepType }> = ({ step }) => {
	const hasNamedTasks = step.tasks.length > 0 && step.tasks.some(t => t.label);

	// Group log entries by taskIndex for per-task display
	if (hasNamedTasks) {
		const taskLogs = new Map<number, ReconProgressEntry[]>();
		for (const entry of step.progressLog) {
			const idx = entry.taskIndex ?? 0;
			if (!taskLogs.has(idx)) taskLogs.set(idx, []);
			taskLogs.get(idx)!.push(entry);
		}

		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
				{step.tasks.map((task) => (
					<TaskAgentPanel
						key={task.index}
						taskIndex={task.index}
						label={task.label ?? `Task ${task.index + 1}`}
						entries={taskLogs.get(task.index) ?? []}
						done={task.done}
					/>
				))}
			</div>
		);
	}

	// Fallback: no named tasks — show flat log
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
			<TaskProgress
				label={step.status === 'running' ? 'Searching vault for relevant notes...' : `Found notes in ${step.completedIndices.length} areas`}
				done={step.status === 'completed'}
			/>
			{step.progressLog.length > 0 ? (
				<div className="pktw-flex pktw-flex-col pktw-gap-px">
					{step.progressLog.map((entry, i) => (
						<span key={i} className="pktw-text-[10px] pktw-text-[#6b7280] pktw-leading-snug">
							{entry.detail}
						</span>
					))}
				</div>
			) : step.status === 'running' ? (
				<ThinkingIndicator />
			) : null}
		</div>
	);
};
