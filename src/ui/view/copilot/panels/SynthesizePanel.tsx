import React from 'react';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { SynthesizeResult } from '@/service/copilot/actions';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Layers, FilePlus } from 'lucide-react';
import { TextStreamPanel } from '@/ui/view/copilot/components/TextStreamPanel';

interface SynthesizePanelProps {
	result: SynthesizeResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const SynthesizePanel: React.FC<SynthesizePanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();

	const handleCreateNote = async () => {
		try {
			const title = `${ctx.title} - Synthesis`;
			const parentFolder = ctx.file.parent?.path ?? '';
			const sourceLinks = result.sources.map(s => `- [[${s.title}]]`).join('\n');
			const content = `# ${title}\n\n${result.text}\n\n---\n## Sources\n${sourceLinks}\n`;
			await vault.createNoteInFolder(parentFolder, title, content);
			new Notice(`Created synthesis note: ${title}`);
		} catch (e) {
			new Notice(`Failed to create note: ${(e as Error).message}`);
		}
	};

	const handleCopy = () => {
		navigator.clipboard.writeText(result.text);
		new Notice('Synthesis copied to clipboard.');
	};

	return (
		<TextStreamPanel
			icon={Layers}
			title="Topic Synthesis"
			badge={`${result.sources.length} sources`}
			body={result.text}
			footerSummary={`Synthesis of "${ctx.title}"`}
			onClose={onClose}
			sections={[
				{
					key: 'sources',
					label: 'Sources',
					count: result.sources.length,
					items: result.sources.map(s => ({
						title: s.title,
						onClick: () => { void vault.openNote(s.path, { newLeaf: false }); },
					})),
				},
			]}
			actions={[
				{ label: 'Copy', variant: 'ghost', onClick: handleCopy },
				{ label: 'Create as New Note', icon: FilePlus, onClick: handleCreateNote },
			]}
		/>
	);
};
