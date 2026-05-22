import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { WriteArticleResult } from '@/service/copilot/copilot-schemas';
import { FileText, ChevronDown, ChevronRight, ExternalLink, FilePlus, Copy, AlertTriangle } from 'lucide-react';

interface WriteArticlePanelProps {
	result: WriteArticleResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const WriteArticlePanel: React.FC<WriteArticlePanelProps> = ({
	result, ctx, onClose,
}) => {
	const [sourcesOpen, setSourcesOpen] = useState(false);
	const [gapsOpen, setGapsOpen] = useState(false);

	const openNote = async (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && 'extension' in file) {
			await app.workspace.getLeaf(false).openFile(file as any);
		}
	};

	const handleSaveAsNote = async () => {
		const app = AppContext.getInstance().app;
		try {
			const title = result.title || `${ctx.title} - Article`;
			const parentFolder = ctx.file.parent?.path ?? '';
			const path = parentFolder ? `${parentFolder}/${title}.md` : `${title}.md`;

			const sourceLinks = result.sources.map(s => `- [[${s.title}]] — ${s.contribution}`).join('\n');
			const content = `# ${title}\n\n${result.content}\n\n---\n## Sources\n${sourceLinks}\n`;

			await app.vault.create(path, content);
			new Notice(`Created article: ${title}`);
		} catch (e) {
			new Notice(`Failed to create note: ${(e as Error).message}`);
		}
	};

	const handleCopy = () => {
		navigator.clipboard.writeText(result.content);
		new Notice('Article copied to clipboard.');
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<FileText className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">{result.title || 'Article Draft'}</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.sources.length} sources
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{/* Article content */}
				<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap pktw-mb-4">
					{result.content}
				</div>

				{/* Collapsible Sources */}
				<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden pktw-mb-2.5">
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
									className="pktw-flex pktw-items-start pktw-gap-2 pktw-py-1.5 pktw-cursor-pointer hover:pktw-text-accent pktw-transition-colors pktw-group"
									onClick={() => openNote(source.path)}
								>
									<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-w-4 pktw-text-right pktw-flex-shrink-0">{i + 1}</span>
									<div className="pktw-flex-1 pktw-min-w-0">
										<div className="pktw-flex pktw-items-center pktw-gap-1.5">
											<span className="pktw-text-[12px] pktw-text-accent pktw-truncate">{source.title}</span>
											<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-flex-shrink-0" />
										</div>
										<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-block pktw-mt-0.5">
											{source.contribution}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Collapsible Gaps */}
				{result.gaps && result.gaps.length > 0 && (
					<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
						<div
							className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
							onClick={() => setGapsOpen(prev => !prev)}
						>
							{gapsOpen
								? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
								: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
							}
							<AlertTriangle className="pktw-w-3 pktw-h-3 pktw-text-[var(--pk-warning)]" />
							<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
								Knowledge Gaps ({result.gaps.length})
							</span>
						</div>
						{gapsOpen && (
							<div className="pktw-px-3.5 pktw-py-2">
								{result.gaps.map((gap, i) => (
									<div key={i} className="pktw-py-1.5">
										<span className="pktw-text-[12px] pktw-font-medium pktw-block">{gap.topic}</span>
										<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-block pktw-mt-0.5">
											{gap.description}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{result.summary}
				</span>
				<Button variant="ghost" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Copy
				</Button>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button onClick={handleSaveAsNote} className="pktw-gap-1">
					<FilePlus className="pktw-w-3.5 pktw-h-3.5" />
					Save as Note
				</Button>
			</div>
		</div>
	);
};
