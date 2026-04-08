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
	// Show progress bar
	const progressBar = step.tasks.length > 0 ? (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{step.tasks.map((task) => {
				const groupProg = step.groupProgress[String(task.index)];
				return (
					<ProgressBar
						key={task.index}
						label={task.label ?? `Task ${task.index + 1}`}
						value={task.completedFiles}
						max={task.totalFiles}
						currentPath={groupProg?.currentPath ?? task.currentPath}
					/>
				);
			})}
		</div>
	) : (
		<ProgressBar
			value={step.completedIndices.length}
			max={step.total || 1}
		/>
	);

	// Show latest progress log entries (agent loop plan/tool details)
	const recentLog = step.progressLog.slice(-6); // Show last 6 entries

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{progressBar}
			{recentLog.length > 0 ? (
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-mt-1">
					{recentLog.map((entry, i) => (
						<div key={i} className="pktw-flex pktw-items-start pktw-gap-1.5">
							<span className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-shrink-0 pktw-mt-px">▸</span>
							<span className="pktw-text-[11px] pktw-text-[#6b7280] pktw-leading-snug">
								{entry.label ? <span className="pktw-font-medium pktw-text-[#374151]">{entry.label}</span> : null}
								{entry.label && entry.detail ? ' — ' : ''}
								{entry.detail}
							</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
};
