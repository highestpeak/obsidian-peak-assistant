import React from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import type { LintFinding } from '@/service/lint/types';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

const SeverityIcon: React.FC<{ severity: LintFinding['severity'] }> = ({ severity }) => {
	if (severity === 'error') return <AlertCircle className="pktw-w-4 pktw-h-4 pktw-text-red-500 pktw-shrink-0" />;
	if (severity === 'warning') return <AlertTriangle className="pktw-w-4 pktw-h-4 pktw-text-amber-500 pktw-shrink-0" />;
	return <Info className="pktw-w-4 pktw-h-4 pktw-text-blue-400 pktw-shrink-0" />;
};

interface PriorityActionsListProps {
	findings: LintFinding[];
}

export const PriorityActionsList: React.FC<PriorityActionsListProps> = ({ findings }) => {
	const { showInfoFindings, setShowInfoFindings } = useVaultLintStore();

	const sorted = [...findings].sort((a, b) => {
		return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
	});

	const visible = showInfoFindings ? sorted : sorted.filter(f => f.severity !== 'info');
	const infoCount = sorted.filter(f => f.severity === 'info').length;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			{visible.map(f => (
				<div key={f.id} className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2
					pktw-rounded-lg hover:pktw-bg-muted pktw-transition-colors pktw-cursor-pointer">
					<SeverityIcon severity={f.severity} />
					<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-0.5">
						<span className="pktw-text-[12px] pktw-leading-5 pktw-text-foreground">{f.title}</span>
						{f.description && (
							<span className="pktw-text-[11px] pktw-leading-4 pktw-text-muted-foreground pktw-break-words">
								{f.description}
							</span>
						)}
					</div>
				</div>
			))}

			{!showInfoFindings && infoCount > 0 && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5">
					<span className="pktw-text-[11px] pktw-text-muted-foreground">
						{infoCount} more info items
					</span>
					<Button variant="ghost" size="sm" onClick={() => setShowInfoFindings(true)}
						className="pktw-h-6 pktw-text-[11px] pktw-gap-1">
						Show all <ChevronDown className="pktw-w-3 pktw-h-3" />
					</Button>
				</div>
			)}

			{showInfoFindings && infoCount > 0 && (
				<Button variant="ghost" size="sm" onClick={() => setShowInfoFindings(false)}
					className="pktw-self-start pktw-ml-3 pktw-h-6 pktw-text-[11px] pktw-gap-1">
					Collapse info <ChevronUp className="pktw-w-3 pktw-h-3" />
				</Button>
			)}
		</div>
	);
};
