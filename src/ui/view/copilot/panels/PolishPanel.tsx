import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { Sparkles, Lightbulb } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { DiffSection, applyDiffResult } from '@/ui/view/copilot/components/DiffBodyParts';

interface PolishPanelProps {
	result: string;
	file: TFile;
	scope: 'full' | 'selection';
	originalContent: string;
	selectedText?: string;
	onClose: () => void;
	// Optional: Review-Fix flow breadcrumb
	breadcrumb?: string;
	onBack?: () => void;
}

export const PolishPanel: React.FC<PolishPanelProps> = ({
	result, file, scope, originalContent, selectedText, onClose, breadcrumb, onBack,
}) => {
	const { vault } = useCopilotPanelVault();
	const original = scope === 'selection' && selectedText ? selectedText : originalContent;
	const originalWords = original.split(/(\s+)/);
	const polishedWords = result.split(/(\s+)/);

	const handleApply = async () => {
		try {
			await applyDiffResult({ scope, file, modified: result, vault });
			new Notice('Changes applied.');
			onClose();
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	const title = breadcrumb ?? 'Document Polish';
	const wordDelta = `${originalWords.length} → ${polishedWords.length} words`;

	return (
		<CopilotPanelShell
			icon={breadcrumb ? undefined : Sparkles}
			title={title}
			scope={scope}
			onBack={onBack}
			footerSummary={onBack ? '← Back to review' : wordDelta}
			closeLabel={onBack ? 'Skip' : 'Dismiss'}
			onClose={onClose}
			actions={[{ label: onBack ? 'Accept Fix' : 'Apply Changes', onClick: handleApply }]}
		>
			{breadcrumb && (
				<div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-mb-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-xs pktw-text-muted-foreground">
					<Lightbulb className="pktw-w-3.5 pktw-h-3.5 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
					<span>{breadcrumb}</span>
				</div>
			)}
			<DiffSection original={original} modified={result} />
			{!onBack && (
				<div className="pktw-flex pktw-gap-3 pktw-mt-3 pktw-text-[10px] pktw-text-muted-foreground">
					<span>{wordDelta}</span>
				</div>
			)}
		</CopilotPanelShell>
	);
};
