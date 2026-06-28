import React from 'react';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { Languages } from 'lucide-react';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SideBySideSection, applyDiffResult } from '@/ui/view/copilot/components/DiffBodyParts';

interface TranslatePanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
	file?: import('obsidian').TFile;
	scope?: 'full' | 'selection';
	originalContent?: string;
	selectedText?: string;
}

export const TranslatePanel: React.FC<TranslatePanelProps> = ({
	result, ctx, onClose, file: fileProp, scope: scopeProp, originalContent: origProp, selectedText,
}) => {
	const { vault } = useCopilotPanelVault();
	const file = fileProp ?? ctx.file;
	const scope = scopeProp ?? ctx.scope;
	const original = scope === 'selection' && (selectedText ?? ctx.selection)
		? (selectedText ?? ctx.selection!)
		: (origProp ?? ctx.content);

	const handleApply = async () => {
		try {
			await applyDiffResult({ scope, file, modified: result, vault });
			new Notice('Translation applied.');
			onClose();
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={Languages}
			title="Translation"
			scope={scope}
			subtitle={file.basename}
			onClose={onClose}
			actions={[{ label: 'Apply Translation', onClick: handleApply }]}
		>
			<SideBySideSection
				leftLabel="Original"
				rightLabel="Translated"
				leftText={original}
				rightText={result}
			/>
		</CopilotPanelShell>
	);
};
