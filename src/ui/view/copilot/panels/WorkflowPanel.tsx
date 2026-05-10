import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { WorkflowAgentResult } from '@/service/workflow/WorkflowAgent';
import { Workflow, CheckCircle2, XCircle, SkipForward, Copy, FileText } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

interface WorkflowPanelProps {
	result: WorkflowAgentResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({ result, ctx, onClose }) => {
	const { steps, executionResult } = result;
	const { finalOutput, totalDurationMs } = executionResult;

	const handleCopy = async () => {
		await navigator.clipboard.writeText(finalOutput);
		new Notice('Workflow output copied to clipboard.');
	};

	const handleSaveAsNote = async () => {
		const app = AppContext.getInstance().app;
		const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
		const filename = `Workflow-Output/workflow-${timestamp}.md`;
		const folder = 'Workflow-Output';

		try {
			const folderRef = app.vault.getAbstractFileByPath(folder);
			if (!folderRef) await app.vault.createFolder(folder);
			await app.vault.create(filename, finalOutput);
			new Notice(`Saved: ${filename}`);
			onClose();
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Workflow className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Workflow Result</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{steps.length} steps
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">
					{(totalDurationMs / 1000).toFixed(1)}s
				</span>
			</div>

			{/* Steps */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				<div className="pktw-mb-4">
					{executionResult.steps.map((stepResult, idx) => {
						const stepDef = steps[idx];
						const StatusIcon = stepResult.status === 'success' ? CheckCircle2
							: stepResult.status === 'error' ? XCircle
							: SkipForward;
						const statusColor = stepResult.status === 'success' ? 'pktw-text-emerald-600'
							: stepResult.status === 'error' ? 'pktw-text-red-500'
							: 'pktw-text-gray-400';

						return (
							<div key={stepResult.stepId} className="pktw-flex pktw-items-start pktw-gap-3 pktw-py-2 pktw-border-b pktw-border-border/50 last:pktw-border-b-0">
								<StatusIcon className={cn('pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-flex-shrink-0', statusColor)} />
								<div className="pktw-flex-1 pktw-min-w-0">
									<span className="pktw-text-[13px] pktw-font-medium pktw-block">
										{stepDef?.description ?? `Step ${idx + 1}`}
									</span>
									<span className="pktw-text-[11px] pktw-text-muted-foreground">
										{stepDef?.action} — {stepResult.durationMs}ms
									</span>
									{stepResult.error && (
										<span className="pktw-text-[11px] pktw-text-red-500 pktw-block pktw-mt-0.5">
											{stepResult.error}
										</span>
									)}
								</div>
							</div>
						);
					})}
				</div>

				{/* Final Output */}
				<div className="pktw-mt-3">
					<span className="pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-muted-foreground pktw-block pktw-mb-2">
						Output
					</span>
					<div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-border pktw-border-border pktw-text-[12px] pktw-font-mono pktw-whitespace-pre-wrap pktw-max-h-[300px] pktw-overflow-y-auto">
						{finalOutput.slice(0, 3000)}
						{finalOutput.length > 3000 && '\n\n... (truncated)'}
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button variant="ghost" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Copy
				</Button>
				<Button onClick={handleSaveAsNote}>
					<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Save as Note
				</Button>
			</div>
		</div>
	);
};
