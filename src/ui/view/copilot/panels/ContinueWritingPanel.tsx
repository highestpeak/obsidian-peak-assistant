import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { Check } from 'lucide-react';
import { TextStreamPanel } from '@/ui/view/copilot/components/TextStreamPanel';

interface ContinueWritingPanelProps {
	result: string;
	file: TFile;
	onClose: () => void;
}

export const ContinueWritingPanel: React.FC<ContinueWritingPanelProps> = ({
	result, file, onClose,
}) => {
	const { vault } = useCopilotPanelVault();

	const handleInsert = async () => {
		try {
			await vault.appendToFile(file, result);
			new Notice('Continuation appended to document.');
			onClose();
		} catch (e) {
			new Notice(`Failed to insert: ${(e as Error).message}`);
		}
	};

	return (
		<TextStreamPanel
			title="Continue Writing"
			badge="Continuation"
			body={result}
			bodyStyle="left-bordered"
			onClose={onClose}
			actions={[{ label: 'Insert at End', icon: Check, onClick: handleInsert }]}
		/>
	);
};
