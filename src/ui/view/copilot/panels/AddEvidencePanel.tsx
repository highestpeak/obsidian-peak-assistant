// src/ui/view/copilot/panels/AddEvidencePanel.tsx
import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { AddEvidence } from '@/service/copilot/copilot-schemas';
import { Check, ExternalLink, BookOpen } from 'lucide-react';

interface AddEvidencePanelProps {
	result: AddEvidence;
	ctx: { file: { path: string } };
	onClose: () => void;
}

export const AddEvidencePanel: React.FC<AddEvidencePanelProps> = ({
	result, ctx, onClose,
}) => {
	const [selected, setSelected] = useState<Set<number>>(() => new Set());

	const toggle = (i: number) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i); else next.add(i);
			return next;
		});
	};

	const selectedCount = selected.size;

	const handleOpenNote = (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file) {
			app.workspace.openLinkText(path, '', false);
		} else {
			new Notice(`File not found: ${path}`);
		}
	};

	const handleInsert = () => {
		const app = AppContext.getInstance().app;
		try {
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) {
				new Notice('No active editor found.');
				return;
			}

			const items = result.evidence
				.filter((_, i) => selected.has(i))
				.map(e => e.insertText);

			if (items.length === 0) return;

			const insertBlock = '\n\n' + items.join('\n\n');
			const cursor = editor.getCursor();
			editor.replaceRange(insertBlock, cursor);
			new Notice(`Inserted ${items.length} evidence item${items.length > 1 ? 's' : ''}.`);
			onClose();
		} catch (e) {
			new Notice(`Failed to insert: ${(e as Error).message}`);
		}
	};

	if (result.evidence.length === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full">
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
					<BookOpen className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Add Evidence</span>
				</div>
				<div className="pktw-flex-1 pktw-flex pktw-items-center pktw-justify-center pktw-text-sm pktw-text-muted-foreground">
					No relevant evidence found in your vault.
				</div>
				<div className="pktw-flex pktw-items-center pktw-justify-end pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
					<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<BookOpen className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Add Evidence</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.evidence.length} sources
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{result.evidence.map((item, i) => {
					const isChecked = selected.has(i);
					const relevancePct = Math.round(item.relevance * 100);
					return (
						<div
							key={i}
							className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-3 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors pktw-mb-1"
							onClick={() => toggle(i)}
						>
							{/* Checkbox */}
							<div className={`pktw-w-4 pktw-h-4 pktw-rounded pktw-border-2 pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 pktw-transition-all ${
								isChecked
									? 'pktw-bg-accent pktw-border-accent pktw-text-white pktw-text-[10px]'
									: 'pktw-border-border'
							}`}>
								{isChecked && <Check className="pktw-w-2.5 pktw-h-2.5" />}
							</div>

							{/* Card content */}
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
									<span
										className="pktw-text-[13px] pktw-font-semibold pktw-text-accent pktw-cursor-pointer hover:pktw-underline pktw-inline-flex pktw-items-center pktw-gap-1"
										onClick={(e) => { e.stopPropagation(); handleOpenNote(item.sourcePath); }}
									>
										{item.sourceTitle}
										<ExternalLink className="pktw-w-3 pktw-h-3 pktw-opacity-60" />
									</span>
									<span className="pktw-text-[9px] pktw-font-semibold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent">
										{relevancePct}%
									</span>
								</div>
								<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-italic pktw-block pktw-mt-1 pktw-pl-2.5 pktw-border-l-2 pktw-border-border pktw-leading-relaxed">
									{item.quote}
								</span>
							</div>
						</div>
					);
				})}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{selectedCount} of {result.evidence.length} selected
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button onClick={handleInsert} disabled={selectedCount === 0}>
					Insert {selectedCount} Item{selectedCount !== 1 ? 's' : ''}
				</Button>
			</div>
		</div>
	);
};
