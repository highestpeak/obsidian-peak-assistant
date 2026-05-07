// src/ui/view/copilot/panels/RewriteSelectionPanel.tsx
import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { PenLine } from 'lucide-react';

interface RewriteSelectionPanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
}

export const RewriteSelectionPanel: React.FC<RewriteSelectionPanelProps> = ({
	result, ctx, onClose,
}) => {
	const original = ctx.selection ?? '';
	const rewritten = result;

	const originalWords = original.split(/(\s+)/);
	const rewrittenWords = rewritten.split(/(\s+)/);

	const handleApply = () => {
		const app = AppContext.getInstance().app;
		try {
			const editor = app.workspace.activeEditor?.editor;
			if (editor) {
				editor.replaceSelection(rewritten);
				new Notice('Selection replaced.');
				onClose();
			} else {
				new Notice('No active editor found.');
			}
		} catch (e) {
			new Notice(`Failed to apply: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<PenLine className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Rewrite Selection</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						Before / After
					</span>
				</div>
			</div>

			{/* Side-by-side diff */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				<div className="pktw-grid pktw-grid-cols-2 pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
					<div className="pktw-p-4 pktw-bg-secondary pktw-border-r pktw-border-border">
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
							<div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[var(--pk-error,#ef4444)] pktw-opacity-60" />
							<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Original</span>
						</div>
						<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{original}</div>
					</div>
					<div className="pktw-p-4">
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
							<div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[var(--pk-success,#22c55e)] pktw-opacity-60" />
							<span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Rewritten</span>
						</div>
						<div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{rewritten}</div>
					</div>
				</div>
				<div className="pktw-flex pktw-gap-3 pktw-mt-3 pktw-text-[10px] pktw-text-muted-foreground">
					<span>{originalWords.length} → {rewrittenWords.length} words</span>
				</div>
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button onClick={handleApply}>Apply Rewrite</Button>
			</div>
		</div>
	);
};
