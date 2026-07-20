import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { CorrectContentResult } from '@/service/copilot/copilot-schemas';
import { ShieldCheck, Check, X, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SeverityIcon, SeverityBadge, PanelEmptyState, type SeverityConfig } from '@/ui/view/copilot/components/FindingsBodyParts';

const SEVERITY_CONFIG: Record<string, SeverityConfig> = {
	critical: { icon: AlertCircle, label: 'Critical', bg: 'pktw-bg-pk-error/10', text: 'pktw-text-pk-error' },
	major: { icon: AlertTriangle, label: 'Major', bg: 'pktw-bg-pk-warning/10', text: 'pktw-text-pk-warning' },
	minor: { icon: Info, label: 'Minor', bg: 'pktw-bg-pk-info/10', text: 'pktw-text-pk-info' },
};

const TYPE_LABELS: Record<string, string> = {
	factual: 'Factual',
	logical: 'Logic',
	reference: 'Reference',
	typo: 'Typo',
};

interface CorrectContentPanelProps {
	result: CorrectContentResult;
	file: TFile;
	scope: 'full' | 'selection';
	originalContent: string;
	selectedText?: string;
	onClose: () => void;
}

export const CorrectContentPanel: React.FC<CorrectContentPanelProps> = ({
	result, file, scope, originalContent, selectedText, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [decisions, setDecisions] = useState<Map<number, 'accepted' | 'rejected'>>(new Map());

	const handleAccept = async (index: number) => {
		const correction = result.corrections[index];
		try {
			if (scope === 'selection') {
				const editor = (window as any).app?.workspace?.activeEditor?.editor;
				if (editor) {
					const currentSelection = editor.getSelection();
					editor.replaceSelection(currentSelection.replace(correction.original, correction.corrected));
				}
			} else {
				const current = await vault.readFileContent(file);
				await vault.replaceFileContent(file, current.replace(correction.original, correction.corrected));
			}
			setDecisions(prev => new Map(prev).set(index, 'accepted'));
			new Notice('Correction applied.');
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	const handleReject = (index: number) => {
		setDecisions(prev => new Map(prev).set(index, 'rejected'));
	};

	const handleAcceptAll = async () => {
		try {
			let content = scope === 'selection' && selectedText ? selectedText : await vault.readFileContent(file);
			for (let i = result.corrections.length - 1; i >= 0; i--) {
				if (decisions.get(i) === 'rejected') continue;
				const c = result.corrections[i];
				content = content.replace(c.original, c.corrected);
			}
			if (scope === 'selection') {
				const editor = (window as any).app?.workspace?.activeEditor?.editor;
				if (editor) editor.replaceSelection(content);
			} else {
				await vault.replaceFileContent(file, content);
			}
			const rejected = [...decisions.values()].filter(v => v === 'rejected').length;
			new Notice(`Applied ${result.corrections.length - rejected} corrections.`);
			onClose();
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	const acceptedCount = [...decisions.values()].filter(v => v === 'accepted').length;
	const rejectedCount = [...decisions.values()].filter(v => v === 'rejected').length;
	const hasRemaining = result.corrections.length > 0 && decisions.size < result.corrections.length;

	return (
		<CopilotPanelShell
			icon={ShieldCheck}
			title="Content Corrections"
			badge={`${result.corrections.length} found`}
			footerSummary={`${acceptedCount} accepted, ${rejectedCount} rejected`}
			onClose={onClose}
			actions={hasRemaining ? [{ label: 'Accept All Remaining', onClick: handleAcceptAll }] : []}
		>
			<div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-pk-md pktw-leading-relaxed pktw-border-l-3 pktw-border-l-accent">
				{result.summary}
			</div>

			{result.corrections.map((correction, i) => {
				const config = SEVERITY_CONFIG[correction.severity];
				const decision = decisions.get(i);
				return (
					<div key={i} className={`pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden ${decision ? 'pktw-opacity-50' : ''}`}>
						<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2 pktw-bg-secondary pktw-border-b pktw-border-border">
							<SeverityIcon config={config} />
							<SeverityBadge config={config} />
							<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground">
								{TYPE_LABELS[correction.type] ?? correction.type}
							</span>
							{decision && (
								<span className={`pktw-ml-auto pktw-text-[9px] pktw-font-semibold pktw-px-1.5 pktw-py-0.5 pktw-rounded ${
									decision === 'accepted'
										? 'pktw-bg-pk-success/10 pktw-text-pk-success'
										: 'pktw-bg-muted pktw-text-muted-foreground'
								}`}>
									{decision === 'accepted' ? 'Applied' : 'Skipped'}
								</span>
							)}
						</div>
						<div className="pktw-px-3.5 pktw-py-2.5">
							<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-mb-2">
								<div className="pktw-flex pktw-items-start pktw-gap-2">
									<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-text-pk-error pktw-flex-shrink-0 pktw-mt-0.5 pktw-w-10">Before</span>
									<span className="pktw-text-pk-sm pktw-leading-relaxed pktw-p-1.5 pktw-rounded pktw-bg-pk-error/5 pktw-flex-1 pktw-line-through">{correction.original}</span>
								</div>
								<div className="pktw-flex pktw-items-start pktw-gap-2">
									<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-text-pk-success pktw-flex-shrink-0 pktw-mt-0.5 pktw-w-10">After</span>
									<span className="pktw-text-pk-sm pktw-leading-relaxed pktw-p-1.5 pktw-rounded pktw-bg-pk-success/5 pktw-flex-1">{correction.corrected}</span>
								</div>
							</div>
							<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-block pktw-leading-relaxed">{correction.explanation}</span>
							{!decision && (
								<div className="pktw-flex pktw-gap-2 pktw-mt-2">
									<span
										className="pktw-text-pk-xs pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-pk-success pktw-bg-pk-success/10 pktw-text-pk-success pktw-cursor-pointer hover:pktw-bg-pk-success hover:pktw-text-white pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
										onClick={() => handleAccept(i)}
									>
										<Check className="pktw-w-3 pktw-h-3" /> Accept
									</span>
									<span
										className="pktw-text-pk-xs pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-border pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
										onClick={() => handleReject(i)}
									>
										<X className="pktw-w-3 pktw-h-3" /> Reject
									</span>
								</div>
							)}
						</div>
					</div>
				);
			})}

			{result.corrections.length === 0 && (
				<PanelEmptyState message="No errors found in this document." />
			)}
		</CopilotPanelShell>
	);
};
