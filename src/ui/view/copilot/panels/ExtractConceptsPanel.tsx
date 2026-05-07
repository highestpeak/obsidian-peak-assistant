import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { Lightbulb, Check, FilePlus } from 'lucide-react';
import type { ExtractConcepts } from '@/service/copilot/copilot-schemas';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface ExtractConceptsPanelProps {
	result: ExtractConcepts;
	ctx: DocumentContext;
	onClose: () => void;
}

export const ExtractConceptsPanel: React.FC<ExtractConceptsPanelProps> = ({
	result, ctx, onClose,
}) => {
	const [selected, setSelected] = useState<Set<number>>(() => new Set(result.concepts.map((_, i) => i)));

	const toggle = (index: number) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	const toggleAll = () => {
		if (selected.size === result.concepts.length) {
			setSelected(new Set());
		} else {
			setSelected(new Set(result.concepts.map((_, i) => i)));
		}
	};

	const handleCreateNotes = async () => {
		const app = AppContext.getInstance().app;
		const sourceFile = ctx.file;
		const folder = sourceFile.parent?.path ?? '';
		let created = 0;

		for (const idx of selected) {
			const concept = result.concepts[idx];
			const fileName = concept.term.replace(/[/\\:*?"<>|]/g, '-');
			const filePath = folder ? `${folder}/${fileName}.md` : `${fileName}.md`;

			// Skip if file already exists
			if (app.vault.getAbstractFileByPath(filePath)) {
				new Notice(`Skipped "${concept.term}" — file already exists.`);
				continue;
			}

			const content = [
				`# ${concept.term}`,
				'',
				concept.definition,
				'',
				`---`,
				`Source: [[${sourceFile.basename}]]`,
			].join('\n');

			try {
				await app.vault.create(filePath, content);
				created++;
			} catch (e) {
				new Notice(`Failed to create "${concept.term}": ${(e as Error).message}`);
			}
		}

		new Notice(`Created ${created} note${created !== 1 ? 's' : ''}.`);
		onClose();
	};

	const selectedCount = selected.size;

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Lightbulb className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Extracted Concepts</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">{ctx.file.basename}</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5 pktw-space-y-2">
				{result.concepts.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No concepts found in this document.
					</div>
				) : (
					result.concepts.map((concept, i) => {
						const isSelected = selected.has(i);
						return (
							<div
								key={i}
								className={`pktw-flex pktw-items-start pktw-gap-3 pktw-px-3 pktw-py-3 pktw-rounded-lg pktw-cursor-pointer pktw-transition-colors ${
									isSelected ? 'pktw-bg-accent/5 pktw-border pktw-border-accent/20' : 'pktw-border pktw-border-transparent hover:pktw-bg-muted'
								}`}
								onClick={() => toggle(i)}
							>
								{/* Checkbox */}
								<div className={`pktw-w-5 pktw-h-5 pktw-rounded pktw-border pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 pktw-transition-colors ${
									isSelected
										? 'pktw-bg-accent pktw-border-accent pktw-text-white'
										: 'pktw-border-border'
								}`}>
									{isSelected && <Check className="pktw-w-3 pktw-h-3" />}
								</div>

								{/* Content */}
								<div className="pktw-flex-1 pktw-min-w-0">
									<div className="pktw-flex pktw-items-center pktw-gap-2">
										<span className="pktw-text-[13px] pktw-font-semibold">{concept.term}</span>
										{concept.category && (
											<span className="pktw-text-[8px] pktw-font-bold pktw-uppercase pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-tracking-wider">
												{concept.category}
											</span>
										)}
									</div>
									<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5 pktw-leading-relaxed">
										{concept.definition}
									</span>
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span
					className="pktw-text-[11px] pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-transition-colors"
					onClick={toggleAll}
				>
					{selectedCount === result.concepts.length ? 'Deselect All' : 'Select All'}
				</span>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Button variant="ghost" onClick={onClose}>Dismiss</Button>
					<Button onClick={handleCreateNotes} disabled={selectedCount === 0}>
						<FilePlus className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
						Create {selectedCount} Note{selectedCount !== 1 ? 's' : ''}
					</Button>
				</div>
			</div>
		</div>
	);
};
