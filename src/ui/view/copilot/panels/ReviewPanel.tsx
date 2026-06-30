import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/core/types/prompt';
import type { ReviewResult } from '@/service/copilot/copilot-schemas';
import { PolishPanel } from './PolishPanel';
import { AlertCircle, AlertTriangle, Info, FileCheck, Wrench, Lightbulb, Check } from 'lucide-react';
import { CopilotPanelShell, type CopilotPanelAction } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SeverityIcon, SeverityBadge, type SeverityConfig } from '@/ui/view/copilot/components/FindingsBodyParts';

const SEVERITY_CONFIG: Record<string, SeverityConfig> = {
	error: { icon: AlertCircle, label: 'Error', bg: 'pktw-bg-[var(--pk-error)]/10', text: 'pktw-text-[var(--pk-error)]' },
	warning: { icon: AlertTriangle, label: 'Warning', bg: 'pktw-bg-[var(--pk-warning)]/10', text: 'pktw-text-[var(--pk-warning)]' },
	info: { icon: Info, label: 'Info', bg: 'pktw-bg-[var(--pk-info)]/10', text: 'pktw-text-[var(--pk-info)]' },
};

interface ReviewPanelProps {
	result: ReviewResult;
	file: TFile;
	scope: 'full' | 'selection';
	originalContent: string;
	selectedText?: string;
	onClose: () => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
	result, file, scope, originalContent, selectedText, onClose,
}) => {
	const { manager } = useServiceContext();
	const [fixedIndices, setFixedIndices] = useState<Set<number>>(new Set());
	const [fixingIndex, setFixingIndex] = useState<number | null>(null);
	const [fixResult, setFixResult] = useState<string | null>(null);
	const [isFixLoading, setIsFixLoading] = useState(false);

	const handleFix = async (index: number) => {
		const section = result.sections[index];
		setFixingIndex(index);
		setIsFixLoading(true);
		try {
			const content = scope === 'selection' && selectedText ? selectedText : originalContent;
			const fixed = await manager.queryText(PromptId.DocPolish, {
				content,
				title: file.basename,
				scope,
				instruction: section.suggestion,
			});
			setFixResult(fixed);
			setIsFixLoading(false);
		} catch (e) {
			setIsFixLoading(false);
			setFixingIndex(null);
			new Notice(`Fix failed: ${(e as Error).message}`);
		}
	};

	const handleFixAccepted = () => {
		if (fixingIndex !== null) {
			setFixedIndices(prev => new Set([...prev, fixingIndex]));
		}
		setFixingIndex(null);
		setFixResult(null);
	};

	const handleFixBack = () => {
		setFixingIndex(null);
		setFixResult(null);
	};

	const handleCopyFeedback = () => {
		const md = [
			`## Review: ${file.basename}`,
			'',
			result.overall,
			'',
			...result.sections.map(s => `### ${s.severity.toUpperCase()}: ${s.title}\n${s.feedback}\n> 💡 ${s.suggestion}`),
		].join('\n');
		navigator.clipboard.writeText(md);
		new Notice('Feedback copied to clipboard.');
	};

	if (fixingIndex !== null && fixResult) {
		const section = result.sections[fixingIndex];
		return (
			<PolishPanel
				result={fixResult}
				file={file}
				scope={scope}
				originalContent={originalContent}
				selectedText={selectedText}
				onClose={() => { handleFixAccepted(); }}
				breadcrumb={`Fix: ${section.title}`}
				onBack={handleFixBack}
			/>
		);
	}

	const actions: CopilotPanelAction[] = [{ label: 'Copy Feedback', variant: 'ghost', onClick: handleCopyFeedback }];

	return (
		<CopilotPanelShell
			icon={FileCheck}
			title="Article Review"
			scope={scope}
			footerSummary={`${fixedIndices.size} of ${result.sections.length} fixed`}
			onClose={onClose}
			actions={actions}
		>
			{isFixLoading && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-3 pktw-bg-accent/10 pktw-rounded-lg pktw-mb-3 pktw-text-sm pktw-text-muted-foreground">
					<Wrench className="pktw-w-4 pktw-h-4 pktw-animate-pulse" /> Generating fix...
				</div>
			)}

			<div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-[13px] pktw-leading-relaxed pktw-border-l-3 pktw-border-l-accent">
				{result.overall}
			</div>

			{result.sections.map((section, i) => {
				const config = SEVERITY_CONFIG[section.severity];
				const isFixed = fixedIndices.has(i);
				return (
					<div key={i} className={`pktw-flex pktw-gap-2.5 pktw-py-2.5 pktw-border-b pktw-border-border ${isFixed ? 'pktw-opacity-50' : ''}`}>
						<SeverityIcon config={config} />
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
								<span className="pktw-text-xs pktw-font-semibold">{section.title}</span>
								<SeverityBadge config={config} />
							</div>
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-block pktw-mb-1.5 pktw-leading-relaxed">{section.feedback}</span>
							<div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-text-[11px] pktw-bg-secondary pktw-p-2 pktw-rounded-md pktw-border-l-2 pktw-border-l-accent pktw-leading-relaxed">
								<Lightbulb className="pktw-w-3.5 pktw-h-3.5 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
								<span>{section.suggestion}</span>
							</div>
							<div className="pktw-mt-2">
								{isFixed ? (
									<span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-bg-[var(--pk-success)]/10 pktw-text-[var(--pk-success)]">
										<Check className="pktw-w-3 pktw-h-3" /> Fixed
									</span>
								) : (
									<span
										className="pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-accent pktw-bg-accent/10 pktw-text-accent pktw-cursor-pointer hover:pktw-bg-accent hover:pktw-text-white pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
										onClick={() => handleFix(i)}
									>
										<Wrench className="pktw-w-3 pktw-h-3" /> Fix
									</span>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</CopilotPanelShell>
	);
};
