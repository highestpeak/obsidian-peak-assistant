// src/ui/view/copilot/panels/CorrectContentPanel.tsx
import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { CorrectContentResult } from '@/service/copilot/copilot-schemas';
import { ShieldCheck, Check, X, AlertCircle, AlertTriangle, Info, type LucideIcon } from 'lucide-react';

const SEVERITY_CONFIG: Record<string, { icon: LucideIcon; label: string; bg: string; text: string }> = {
	critical: { icon: AlertCircle, label: 'Critical', bg: 'pktw-bg-[var(--pk-error,#ef4444)]/10', text: 'pktw-text-[var(--pk-error,#ef4444)]' },
	major: { icon: AlertTriangle, label: 'Major', bg: 'pktw-bg-[var(--pk-warning,#f59e0b)]/10', text: 'pktw-text-[var(--pk-warning,#f59e0b)]' },
	minor: { icon: Info, label: 'Minor', bg: 'pktw-bg-[var(--pk-info,#3b82f6)]/10', text: 'pktw-text-[var(--pk-info,#3b82f6)]' },
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
	const [decisions, setDecisions] = useState<Map<number, 'accepted' | 'rejected'>>(new Map());

	const handleAccept = async (index: number) => {
		const correction = result.corrections[index];
		const app = AppContext.getInstance().app;
		try {
			if (scope === 'selection') {
				const editor = app.workspace.activeEditor?.editor;
				if (editor) {
					const currentSelection = editor.getSelection();
					const updated = currentSelection.replace(correction.original, correction.corrected);
					editor.replaceSelection(updated);
				}
			} else {
				const current = await app.vault.read(file);
				const updated = current.replace(correction.original, correction.corrected);
				await app.vault.modify(file, updated);
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
		const app = AppContext.getInstance().app;
		try {
			let content = scope === 'selection' && selectedText ? selectedText : await app.vault.read(file);
			for (let i = result.corrections.length - 1; i >= 0; i--) {
				if (decisions.get(i) === 'rejected') continue;
				const c = result.corrections[i];
				content = content.replace(c.original, c.corrected);
			}
			if (scope === 'selection') {
				const editor = app.workspace.activeEditor?.editor;
				if (editor) editor.replaceSelection(content);
			} else {
				await app.vault.modify(file, content);
			}
			new Notice(`Applied ${result.corrections.length - [...decisions.values()].filter(v => v === 'rejected').length} corrections.`);
			onClose();
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	const acceptedCount = [...decisions.values()].filter(v => v === 'accepted').length;
	const rejectedCount = [...decisions.values()].filter(v => v === 'rejected').length;

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<ShieldCheck className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Content Corrections</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.corrections.length} found
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{/* Summary */}
				<div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-[13px] pktw-leading-relaxed pktw-border-l-3 pktw-border-l-accent">
					{result.summary}
				</div>

				{/* Corrections */}
				{result.corrections.map((correction, i) => {
					const config = SEVERITY_CONFIG[correction.severity];
					const decision = decisions.get(i);
					return (
						<div key={i} className={`pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden ${decision ? 'pktw-opacity-50' : ''}`}>
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2 pktw-bg-secondary pktw-border-b pktw-border-border">
								<div className={`pktw-w-[22px] pktw-h-[22px] pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 ${config.bg} ${config.text}`}>
									<config.icon className="pktw-w-3 pktw-h-3" />
								</div>
								<span className={`pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-px-1.5 pktw-py-0.5 pktw-rounded ${config.bg} ${config.text}`}>
									{config.label}
								</span>
								<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground">
									{TYPE_LABELS[correction.type] ?? correction.type}
								</span>
								{decision && (
									<span className={`pktw-ml-auto pktw-text-[9px] pktw-font-semibold pktw-px-1.5 pktw-py-0.5 pktw-rounded ${
										decision === 'accepted'
											? 'pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]'
											: 'pktw-bg-muted pktw-text-muted-foreground'
									}`}>
										{decision === 'accepted' ? 'Applied' : 'Skipped'}
									</span>
								)}
							</div>
							<div className="pktw-px-3.5 pktw-py-2.5">
								{/* Before/After */}
								<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-mb-2">
									<div className="pktw-flex pktw-items-start pktw-gap-2">
										<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-text-[var(--pk-error,#ef4444)] pktw-flex-shrink-0 pktw-mt-0.5 pktw-w-10">Before</span>
										<span className="pktw-text-[11px] pktw-leading-relaxed pktw-p-1.5 pktw-rounded pktw-bg-[var(--pk-error,#ef4444)]/5 pktw-flex-1 pktw-line-through">{correction.original}</span>
									</div>
									<div className="pktw-flex pktw-items-start pktw-gap-2">
										<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-text-[var(--pk-success,#22c55e)] pktw-flex-shrink-0 pktw-mt-0.5 pktw-w-10">After</span>
										<span className="pktw-text-[11px] pktw-leading-relaxed pktw-p-1.5 pktw-rounded pktw-bg-[var(--pk-success,#22c55e)]/5 pktw-flex-1">{correction.corrected}</span>
									</div>
								</div>
								{/* Explanation */}
								<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-leading-relaxed">{correction.explanation}</span>
								{/* Actions */}
								{!decision && (
									<div className="pktw-flex pktw-gap-2 pktw-mt-2">
										<span
											className="pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-[var(--pk-success,#22c55e)] pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)] pktw-cursor-pointer hover:pktw-bg-[var(--pk-success,#22c55e)] hover:pktw-text-white pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
											onClick={() => handleAccept(i)}
										>
											<Check className="pktw-w-3 pktw-h-3" /> Accept
										</span>
										<span
											className="pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-border pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
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
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No errors found in this document.
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{acceptedCount} accepted, {rejectedCount} rejected
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				{result.corrections.length > 0 && decisions.size < result.corrections.length && (
					<Button onClick={handleAcceptAll}>Accept All Remaining</Button>
				)}
			</div>
		</div>
	);
};
