import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { Languages } from 'lucide-react';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface TranslatePanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
	// Compat props forwarded by CopilotResultModal
	file?: import('obsidian').TFile;
	scope?: 'full' | 'selection';
	originalContent?: string;
	selectedText?: string;
}

export const TranslatePanel: React.FC<TranslatePanelProps> = ({
	result, ctx, onClose, file: fileProp, scope: scopeProp, originalContent: origProp, selectedText,
}) => {
	const file = fileProp ?? ctx.file;
	const scope = scopeProp ?? ctx.scope;
	const original = scope === 'selection' && (selectedText ?? ctx.selection)
		? (selectedText ?? ctx.selection!)
		: (origProp ?? ctx.content);
	const translated = result;

	const handleApply = async () => {
		const app = AppContext.getInstance().app;
		try {
			if (scope === 'selection') {
				const editor = app.workspace.activeEditor?.editor;
				if (editor) {
					editor.replaceSelection(translated);
				}
			} else {
				await app.vault.modify(file, translated);
			}
			new Notice('Translation applied.');
			onClose();
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Languages className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Translation</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{scope === 'selection' ? 'Selection' : 'Full Document'}
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">{file.basename}</span>
			</div>

			{/* Side-by-side comparison */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				<div className="pktw-grid pktw-grid-cols-2 pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
					<div className="pktw-p-4 pktw-bg-secondary pktw-border-r pktw-border-border">
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
							<div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-muted-foreground pktw-opacity-40" />
							<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Original</span>
						</div>
						<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{original}</div>
					</div>
					<div className="pktw-p-4">
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
							<div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-accent pktw-opacity-60" />
							<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Translated</span>
						</div>
						<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{translated}</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button onClick={handleApply}>Apply Translation</Button>
			</div>
		</div>
	);
};
