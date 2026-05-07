import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { AlignLeft, Copy, FileInput } from 'lucide-react';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

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
	const file = fileProp ?? ctx.file;
	const summary = result;

	const handleCopy = async () => {
		await navigator.clipboard.writeText(summary);
		new Notice('Summary copied to clipboard.');
	};

	const handleInsertAtTop = async () => {
		const app = AppContext.getInstance().app;
		try {
			const current = await app.vault.read(file);
			const callout = `> [!summary]\n> ${summary.split('\n').join('\n> ')}\n\n`;

			// Insert after frontmatter if present
			const fmMatch = current.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
			let updated: string;
			if (fmMatch) {
				const fmEnd = fmMatch[0].length;
				updated = current.slice(0, fmEnd) + '\n' + callout + current.slice(fmEnd);
			} else {
				updated = callout + current;
			}

			await app.vault.modify(file, updated);
			new Notice('Summary inserted at top of document.');
			onClose();
		} catch (e) {
			new Notice(`Failed to insert: ${(e as Error).message}`);
		}
	};

	const wordCount = summary.split(/\s+/).filter(Boolean).length;

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<AlignLeft className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Summary</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{ctx.scope === 'selection' ? 'Selection' : 'Full Document'}
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">{file.basename}</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				<div className="pktw-p-4 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">
					{summary}
				</div>
				<div className="pktw-mt-2 pktw-text-[10px] pktw-text-muted-foreground">
					{wordCount} words
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button variant="ghost" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Copy
				</Button>
				<Button onClick={handleInsertAtTop}>
					<FileInput className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Insert at Top
				</Button>
			</div>
		</div>
	);
};
