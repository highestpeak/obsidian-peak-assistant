import React from 'react';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { AlignLeft, Copy, FileInput } from 'lucide-react';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { TextStreamPanel } from '@/ui/view/copilot/components/TextStreamPanel';

interface SummarizePanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
	// Compat props forwarded by CopilotResultModal
	file?: import('obsidian').TFile;
	scope?: 'full' | 'selection';
	originalContent?: string;
	selectedText?: string;
}

export const SummarizePanel: React.FC<SummarizePanelProps> = ({
	result, ctx, onClose, file: fileProp,
}) => {
	const { vault } = useCopilotPanelVault();
	const file = fileProp ?? ctx.file;

	const handleCopy = async () => {
		await navigator.clipboard.writeText(result);
		new Notice('Summary copied to clipboard.');
	};

	const handleInsertAtTop = async () => {
		try {
			const current = await vault.readFileContent(file);
			const callout = `> [!summary]\n> ${result.split('\n').join('\n> ')}\n\n`;
			const fmMatch = current.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
			const updated = fmMatch
				? current.slice(0, fmMatch[0].length) + '\n' + callout + current.slice(fmMatch[0].length)
				: callout + current;
			await vault.replaceFileContent(file, updated);
			new Notice('Summary inserted at top of document.');
			onClose();
		} catch (e) {
			new Notice(`Failed to insert: ${(e as Error).message}`);
		}
	};

	return (
		<TextStreamPanel
			icon={AlignLeft}
			title="Summary"
			badge={ctx.scope === 'selection' ? 'Selection' : 'Full Document'}
			subtitle={file.basename}
			body={result}
			bodyStyle="callout"
			showWordCount
			onClose={onClose}
			actions={[
				{ label: 'Copy', variant: 'ghost', icon: Copy, onClick: handleCopy },
				{ label: 'Insert at Top', icon: FileInput, onClick: handleInsertAtTop },
			]}
		/>
	);
};
