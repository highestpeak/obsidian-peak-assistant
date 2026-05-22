import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { CheckTaskListResult } from '@/service/copilot/copilot-schemas';
import { ListChecks, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

const PRIORITY_CONFIG: Record<string, { icon: LucideIcon; bg: string; text: string }> = {
	high: { icon: AlertTriangle, bg: 'pktw-bg-[var(--pk-error)]/10', text: 'pktw-text-[var(--pk-error)]' },
	medium: { icon: AlertCircle, bg: 'pktw-bg-[var(--pk-warning)]/10', text: 'pktw-text-[var(--pk-warning)]' },
	low: { icon: Info, bg: 'pktw-bg-[var(--pk-info)]/10', text: 'pktw-text-[var(--pk-info)]' },
};

const REC_TYPE_LABELS: Record<string, string> = {
	'reorder': 'Reorder',
	'break-down': 'Break Down',
	'mark-stale': 'Mark Stale',
	'escalate': 'Escalate',
	'remove': 'Remove',
};

interface CheckTaskListPanelProps {
	result: CheckTaskListResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const CheckTaskListPanel: React.FC<CheckTaskListPanelProps> = ({
	result, ctx, onClose,
}) => {
	const [recsOpen, setRecsOpen] = useState(true);
	const [tasksOpen, setTasksOpen] = useState(false);

	const { summary } = result;
	const incompleteTasks = result.tasks.filter(t => !t.completed);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<ListChecks className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Task List Analysis</span>
				</div>
			</div>

			{/* Summary stats */}
			<div className="pktw-grid pktw-grid-cols-4 pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border pktw-bg-secondary/50">
				<div className="pktw-text-center">
					<span className="pktw-text-[16px] pktw-font-bold pktw-block">{summary.total}</span>
					<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-uppercase">Total</span>
				</div>
				<div className="pktw-text-center">
					<span className="pktw-text-[16px] pktw-font-bold pktw-text-emerald-600 pktw-block">{summary.completed}</span>
					<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-uppercase">Done</span>
				</div>
				<div className="pktw-text-center">
					<span className={cn('pktw-text-[16px] pktw-font-bold pktw-block', summary.overdue > 0 && 'pktw-text-[var(--pk-error)]')}>
						{summary.overdue}
					</span>
					<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-uppercase">Overdue</span>
				</div>
				<div className="pktw-text-center">
					<span className="pktw-text-[16px] pktw-font-bold pktw-block">{Math.round(summary.completionRate * 100)}%</span>
					<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-uppercase">Rate</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{/* Recommendations (expanded by default) */}
				{result.recommendations.length > 0 && (
					<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden pktw-mb-4">
						<div
							className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
							onClick={() => setRecsOpen(prev => !prev)}
						>
							{recsOpen
								? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
								: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
							}
							<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
								Recommendations ({result.recommendations.length})
							</span>
						</div>
						{recsOpen && (
							<div className="pktw-px-3.5 pktw-py-2">
								{result.recommendations.map((rec, i) => (
									<div key={i} className="pktw-py-2 pktw-border-b pktw-border-border/50 last:pktw-border-b-0">
										<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
											<span className="pktw-text-[9px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase">
												{REC_TYPE_LABELS[rec.type] ?? rec.type}
											</span>
										</div>
										<span className="pktw-text-[12px] pktw-font-medium pktw-block">{rec.description}</span>
										<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">
											{rec.suggestedAction}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* Incomplete Tasks (collapsed by default) */}
				<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
					<div
						className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
						onClick={() => setTasksOpen(prev => !prev)}
					>
						{tasksOpen
							? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
							: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
						}
						<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
							Incomplete Tasks ({incompleteTasks.length})
						</span>
					</div>
					{tasksOpen && (
						<div className="pktw-px-3.5 pktw-py-2">
							{incompleteTasks.map((task, i) => {
								const config = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
								const PriorityIcon = config.icon;
								return (
									<div key={i} className="pktw-flex pktw-items-start pktw-gap-2 pktw-py-1.5 pktw-border-b pktw-border-border/30 last:pktw-border-b-0">
										<div className={cn('pktw-w-[18px] pktw-h-[18px] pktw-rounded pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5', config.bg, config.text)}>
											<PriorityIcon className="pktw-w-2.5 pktw-h-2.5" />
										</div>
										<div className="pktw-flex-1 pktw-min-w-0">
											<span className="pktw-text-[12px] pktw-block">{task.text}</span>
											<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-block pktw-mt-0.5">
												{task.priorityReason}
												{task.isOverdue && task.dueDate && ` — Overdue: ${task.dueDate}`}
												{task.isStale && task.staleReason && ` — ${task.staleReason}`}
											</span>
											{task.blockers.length > 0 && (
												<span className="pktw-text-[10px] pktw-text-[var(--pk-warning)] pktw-block pktw-mt-0.5">
													Blocked: {task.blockers.join(', ')}
												</span>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{summary.incomplete} incomplete, {summary.blocked} blocked, {summary.stale} stale
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
