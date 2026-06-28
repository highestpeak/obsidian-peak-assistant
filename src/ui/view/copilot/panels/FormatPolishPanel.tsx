import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { WrapText } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { DiffSection, applyDiffResult } from '@/ui/view/copilot/components/DiffBodyParts';

interface FormatPolishPanelProps {
	result: string;
	file: TFile;
	scope: 'full' | 'selection';
	originalContent: string;
	selectedText?: string;
	onClose: () => void;
}

export const FormatPolishPanel: React.FC<FormatPolishPanelProps> = ({
	result, file, scope, originalContent, selectedText, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const original = scope === 'selection' && selectedText ? selectedText : originalContent;

	const handleApply = async () => {
		try {
			await applyDiffResult({ scope, file, modified: result, vault });
			new Notice('Formatting fixes applied.');
			onClose();
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={WrapText}
			title="Format Polish"
			scope={scope}
			onClose={onClose}
			actions={[{ label: 'Apply Changes', onClick: handleApply }]}
		>
			<DiffSection original={original} modified={result} />
		</CopilotPanelShell>
	);
};
