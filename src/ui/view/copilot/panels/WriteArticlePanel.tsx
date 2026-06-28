import React from 'react';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { WriteArticleResult } from '@/service/copilot/copilot-schemas';
import { FileText, FilePlus, Copy } from 'lucide-react';
import { TextStreamPanel, type TextStreamSection } from '@/ui/view/copilot/components/TextStreamPanel';

interface WriteArticlePanelProps {
	result: WriteArticleResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const WriteArticlePanel: React.FC<WriteArticlePanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();

	const handleSaveAsNote = async () => {
		try {
			const title = result.title || `${ctx.title} - Article`;
			const parentFolder = ctx.file.parent?.path ?? '';
			const sourceLinks = result.sources.map(s => `- [[${s.title}]] — ${s.contribution}`).join('\n');
			const content = `# ${title}\n\n${result.content}\n\n---\n## Sources\n${sourceLinks}\n`;
			await vault.createNoteInFolder(parentFolder, title, content);
			new Notice(`Created article: ${title}`);
		} catch (e) {
			new Notice(`Failed to create note: ${(e as Error).message}`);
		}
	};

	const handleCopy = () => {
		navigator.clipboard.writeText(result.content);
		new Notice('Article copied to clipboard.');
	};

	const sections: TextStreamSection[] = [
		{
			key: 'sources',
			label: 'Sources',
			count: result.sources.length,
			items: result.sources.map(s => ({
				title: s.title,
				subtitle: s.contribution,
				onClick: () => { void vault.openNote(s.path, { newLeaf: false }); },
			})),
		},
	];
	if (result.gaps && result.gaps.length > 0) {
		sections.push({
			key: 'gaps',
			label: 'Knowledge Gaps',
			count: result.gaps.length,
			warn: true,
			items: result.gaps.map(g => ({ title: g.topic, subtitle: g.description })),
		});
	}

	return (
		<TextStreamPanel
			icon={FileText}
			title={result.title || 'Article Draft'}
			badge={`${result.sources.length} sources`}
			body={result.content}
			footerSummary={result.summary}
			onClose={onClose}
			sections={sections}
			actions={[
				{ label: 'Copy', variant: 'ghost', icon: Copy, onClick: handleCopy },
				{ label: 'Save as Note', icon: FilePlus, onClick: handleSaveAsNote },
			]}
		/>
	);
};
