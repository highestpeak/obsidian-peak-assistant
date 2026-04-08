import React from 'react';
import type { ReconStep as ReconStepType } from '../../types/search-steps';

function ProgressBar({ value, max, label, currentPath }: {
	value: number;
	max: number;
	label?: string;
	currentPath?: string;
}) {
	const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2">
				{label ? (
					<span className="pktw-text-[11px] pktw-text-[#6b7280] pktw-truncate pktw-flex-1">{label}</span>
				) : null}
				<span className="pktw-text-[11px] pktw-font-mono pktw-text-[#9ca3af] pktw-flex-shrink-0">
					{value}/{max}
				</span>
			</div>
			<div className="pktw-h-1 pktw-bg-[#e5e7eb] pktw-rounded-full pktw-overflow-hidden">
				<div
					className="pktw-h-full pktw-bg-[#7c3aed] pktw-rounded-full pktw-transition-all pktw-duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
			{currentPath ? (
				<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-truncate pktw-font-mono" title={currentPath}>
					{currentPath.split('/').slice(-2).join('/')}
				</span>
			) : null}
		</div>
	);
}

export const ReconStep: React.FC<{ step: ReconStepType }> = ({ step }) => {
	// Per-task progress bars if tasks are available
	if (step.tasks.length > 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-2">
				{step.tasks.map((task) => {
					const groupKey = String(task.index);
					const groupProg = step.groupProgress[groupKey];
					const currentPath = groupProg?.currentPath ?? task.currentPath;
					return (
						<ProgressBar
							key={task.index}
							label={task.label ?? `Task ${task.index + 1}`}
							value={task.completedFiles}
							max={task.totalFiles}
							currentPath={currentPath}
						/>
					);
				})}
			</div>
		);
	}

	// Fallback: single progress bar using total from groupProgress
	const groupKeys = Object.keys(step.groupProgress);
	if (groupKeys.length > 0) {
		const aggregated = groupKeys.reduce(
			(acc, key) => {
				const g = step.groupProgress[key];
				return {
					completed: acc.completed + (g?.completedTasks ?? 0),
					total: acc.total + (g?.totalTasks ?? 0),
					currentPath: g?.currentPath ?? acc.currentPath,
				};
			},
			{ completed: 0, total: 0, currentPath: undefined as string | undefined }
		);
		return (
			<ProgressBar
				value={aggregated.completed}
				max={aggregated.total || step.total || 1}
				currentPath={aggregated.currentPath}
			/>
		);
	}

	return (
		<ProgressBar
			value={step.completedIndices.length}
			max={step.total || 1}
		/>
	);
};
