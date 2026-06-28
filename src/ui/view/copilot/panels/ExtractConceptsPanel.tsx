import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { Lightbulb, FilePlus } from 'lucide-react';
import type { ExtractConcepts } from '@/service/copilot/copilot-schemas';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SelectableRow } from '@/ui/view/copilot/components/SuggestionBodyParts';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

interface ExtractConceptsPanelProps {
	result: ExtractConcepts;
	ctx: DocumentContext;
	onClose: () => void;
}

export const ExtractConceptsPanel: React.FC<ExtractConceptsPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
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
		setSelected(selected.size === result.concepts.length
			? new Set()
			: new Set(result.concepts.map((_, i) => i)));
	};

	const handleCreateNotes = async () => {
		const sourceFile = ctx.file;
		const folder = sourceFile.parent?.path ?? '';
		let created = 0;

		for (const idx of selected) {
			const concept = result.concepts[idx];
			const fileName = concept.term.replace(/[/\\:*?"<>|]/g, '-');
			if (vault.findFileByPath(folder ? `${folder}/${fileName}.md` : `${fileName}.md`)) {
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
				await vault.createNoteInFolder(folder, fileName, content);
				created++;
			} catch (e) {
				new Notice(`Failed to create "${concept.term}": ${(e as Error).message}`);
			}
		}

		new Notice(`Created ${created} note${created !== 1 ? 's' : ''}.`);
		onClose();
	};

	const allSelected = selected.size === result.concepts.length;

	return (
		<CopilotPanelShell
			icon={Lightbulb}
			title="Extracted Concepts"
			subtitle={ctx.file.basename}
			footerSummary={allSelected ? 'Deselect All' : 'Select All'}
			onClose={onClose}
			actions={[
				{ label: allSelected ? 'Deselect All' : 'Select All', variant: 'ghost', onClick: toggleAll },
				{
					label: `Create ${selected.size} Note${selected.size !== 1 ? 's' : ''}`,
					icon: FilePlus,
					onClick: handleCreateNotes,
					disabled: selected.size === 0,
				},
			]}
		>
			{result.concepts.length === 0 ? (
				<PanelEmptyState message="No concepts found in this document." />
			) : (
				result.concepts.map((concept, i) => (
					<SelectableRow key={i} checked={selected.has(i)} onClick={() => toggle(i)}>
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
					</SelectableRow>
				))
			)}
		</CopilotPanelShell>
	);
};
