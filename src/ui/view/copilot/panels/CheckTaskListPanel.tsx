import React from 'react';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { CheckTaskListResult } from '@/service/copilot/copilot-schemas';
import { ListChecks, AlertTriangle, AlertCircle, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { CollapsibleSection, StatStrip } from '@/ui/view/copilot/components/FindingsBodyParts';

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

export const CheckTaskListPanel: React.FC<CheckTaskListPanelProps> = ({ result, onClose }) => {
	const { summary } = result;
	const incompleteTasks = result.tasks.filter((t) => !t.completed);

	return (
		<CopilotPanelShell
			icon={ListChecks}
			title="Task List Analysis"
			footerSummary={`${summary.incomplete} incomplete, ${summary.blocked} blocked, ${summary.stale} stale`}
			onClose={onClose}
		>
			<div className="pktw--mx-5 pktw-px-5">
				<StatStrip stats={[
					{ value: summary.total, label: 'Total' },
					{ value: summary.completed, label: 'Done', tone: 'success' },
					{ value: summary.overdue, label: 'Overdue', tone: summary.overdue > 0 ? 'error' : 'default' },
					{ value: `${Math.round(summary.completionRate * 100)}%`, label: 'Rate' },
				]} />
			</div>

			{result.recommendations.length > 0 && (
				<div className="pktw-mt-4 pktw-mb-4">
					<CollapsibleSection
						title="Recommendations"
						count={result.recommendations.length}
						defaultOpen
					>
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
					</CollapsibleSection>
				</div>
			)}

			<CollapsibleSection title="Incomplete Tasks" count={incompleteTasks.length}>
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
			</CollapsibleSection>
		</CopilotPanelShell>
	);
};
