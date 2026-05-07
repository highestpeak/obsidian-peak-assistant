// src/ui/view/copilot/panels/SynthesizePanel.tsx
import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { SynthesizeResult } from '@/service/copilot/actions/synthesize-topic';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Layers, ChevronDown, ChevronRight, ExternalLink, FilePlus } from 'lucide-react';

interface SynthesizePanelProps {
	result: SynthesizeResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const SynthesizePanel: React.FC<SynthesizePanelProps> = ({
	result, ctx, onClose,
}) => {
	const [sourcesOpen, setSourcesOpen] = useState(false);

	const openNote = async (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && 'extension' in file) {
			await app.workspace.getLeaf(false).openFile(file as any);
		}
	};

	const handleCreateNote = async () => {
		const app = AppContext.getInstance().app;
		try {
			const title = `${ctx.title} - Synthesis`;
			const parentFolder = ctx.file.parent?.path ?? '';
			const path = parentFolder ? `${parentFolder}/${title}.md` : `${title}.md`;

			const sourceLinks = result.sources.map(s => `- [[${s.title}]]`).join('\n');
			const content = `# ${title}\n\n${result.text}\n\n---\n## Sources\n${sourceLinks}\n`;

			await app.vault.create(path, content);
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
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Layers className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Topic Synthesis</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.sources.length} sources
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{/* Synthesis text */}
				<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap pktw-mb-4">
					{result.text}
				</div>

				{/* Collapsible Sources */}
				<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
					<div
						className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
						onClick={() => setSourcesOpen(prev => !prev)}
					>
						{sourcesOpen
							? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
							: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
						}
						<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
							Sources ({result.sources.length})
						</span>
					</div>
					{sourcesOpen && (
						<div className="pktw-px-3.5 pktw-py-2">
							{result.sources.map((source, i) => (
								<div
									key={source.path}
									className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-cursor-pointer hover:pktw-text-accent pktw-transition-colors pktw-group"
									onClick={() => openNote(source.path)}
								>
									<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-w-4 pktw-text-right pktw-flex-shrink-0">{i + 1}</span>
									<span className="pktw-text-[12px] pktw-text-accent pktw-truncate">{source.title}</span>
									<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-flex-shrink-0" />
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					Synthesis of "{ctx.title}"
				</span>
				<Button variant="ghost" onClick={handleCopy}>Copy</Button>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button onClick={handleCreateNote} className="pktw-gap-1">
					<FilePlus className="pktw-w-3.5 pktw-h-3.5" />
					Create as New Note
				</Button>
			</div>
		</div>
	);
};
