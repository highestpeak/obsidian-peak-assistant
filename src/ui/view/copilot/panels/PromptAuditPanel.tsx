import React, { useState } from 'react';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { PromptAuditResult } from '@/service/copilot/copilot-schemas';
import { ClipboardCheck, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';

const SEVERITY_CONFIG: Record<string, { icon: LucideIcon; bg: string; text: string }> = {
	high: { icon: AlertTriangle, bg: 'pktw-bg-[var(--pk-error)]/10', text: 'pktw-text-[var(--pk-error)]' },
	medium: { icon: AlertCircle, bg: 'pktw-bg-[var(--pk-warning)]/10', text: 'pktw-text-[var(--pk-warning)]' },
	low: { icon: Info, bg: 'pktw-bg-[var(--pk-info)]/10', text: 'pktw-text-[var(--pk-info)]' },
};

function scoreColor(score: number): string {
	if (score >= 8) return 'pktw-text-emerald-600';
	if (score >= 6) return 'pktw-text-[var(--pk-warning)]';
	return 'pktw-text-[var(--pk-error)]';
}

interface PromptAuditPanelProps {
	result: PromptAuditResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const PromptAuditPanel: React.FC<PromptAuditPanelProps> = ({
	result, ctx, onClose,
}) => {
	const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
	const sortedAudits = [...result.audits].sort((a, b) => a.overallScore - b.overallScore);

	return (
		<CopilotPanelShell
			icon={ClipboardCheck}
			title="Prompt Audit"
			badge={`${result.summary.totalPrompts} prompts`}
			subtitle={`Avg: ${result.summary.averageScore.toFixed(1)}/10`}
			footerSummary={`Best: ${result.summary.bestPracticed.slice(0, 2).join(', ')} | Needs work: ${result.summary.needsWork.slice(0, 2).join(', ')}`}
			onClose={onClose}
		>
			<div className="pktw-mb-3 pktw-p-3 pktw-bg-secondary/50 pktw-rounded-lg">
				<span className="pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-muted-foreground pktw-block pktw-mb-1">
					Top Issues
				</span>
				<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
					{result.summary.topIssues.map((issue, i) => (
						<span key={i} className="pktw-text-[10px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-[var(--pk-warning)]/10 pktw-text-[var(--pk-warning)]">
							{issue}
						</span>
					))}
				</div>
			</div>

			{sortedAudits.map((audit, idx) => {
				const isExpanded = expandedIdx === idx;
				return (
					<div key={audit.promptId} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
						<div
							className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
							onClick={() => setExpandedIdx(isExpanded ? null : idx)}
						>
							{isExpanded
								? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
								: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
							}
							<span className="pktw-text-[12px] pktw-font-mono pktw-flex-1 pktw-truncate">{audit.promptId}</span>
							<span className={cn('pktw-text-[13px] pktw-font-bold', scoreColor(audit.overallScore))}>
								{audit.overallScore.toFixed(1)}
							</span>
						</div>
						{isExpanded && (
							<div className="pktw-px-3.5 pktw-py-3">
								<div className="pktw-grid pktw-grid-cols-3 pktw-gap-x-4 pktw-gap-y-1 pktw-mb-3">
									{Object.entries(audit.scores).map(([dim, score]) => (
										<div key={dim} className="pktw-flex pktw-items-center pktw-justify-between">
											<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-capitalize">{dim}</span>
											<span className={cn('pktw-text-[11px] pktw-font-bold', scoreColor(score as number))}>{score}</span>
										</div>
									))}
								</div>

								{audit.strengths.length > 0 && (
									<div className="pktw-mb-2">
										<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-emerald-600 pktw-block pktw-mb-1">Strengths</span>
										{audit.strengths.map((s, i) => (
											<span key={i} className="pktw-text-[11px] pktw-text-muted-foreground pktw-block">+ {s}</span>
										))}
									</div>
								)}

								{audit.issues.length > 0 && (
									<div className="pktw-mb-2">
										<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-[var(--pk-error)] pktw-block pktw-mb-1">Issues</span>
										{audit.issues.map((issue, i) => {
											const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.low;
											const SeverityIcon = config.icon;
											return (
												<div key={i} className="pktw-py-1 pktw-border-b pktw-border-border/30 last:pktw-border-b-0">
													<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-0.5">
														<SeverityIcon className={cn('pktw-w-3 pktw-h-3', config.text)} />
														<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-capitalize">{issue.dimension}</span>
													</div>
													<span className="pktw-text-[11px] pktw-block">{issue.description}</span>
													<span className="pktw-text-[10px] pktw-text-accent pktw-block pktw-mt-0.5 pktw-italic">{issue.suggestion}</span>
												</div>
											);
										})}
									</div>
								)}

								{audit.rewriteSuggestion && (
									<div className="pktw-mt-2 pktw-p-2 pktw-bg-muted pktw-rounded pktw-text-[11px] pktw-font-mono pktw-whitespace-pre-wrap pktw-max-h-[150px] pktw-overflow-y-auto">
										{audit.rewriteSuggestion}
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}
		</CopilotPanelShell>
	);
};
