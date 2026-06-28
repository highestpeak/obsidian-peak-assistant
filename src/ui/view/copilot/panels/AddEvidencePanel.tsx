import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { AddEvidence } from '@/service/copilot/copilot-schemas';
import { ExternalLink, BookOpen } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SelectableRow } from '@/ui/view/copilot/components/SuggestionBodyParts';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

interface AddEvidencePanelProps {
	result: AddEvidence;
	ctx: { file: { path: string } };
	onClose: () => void;
}

export const AddEvidencePanel: React.FC<AddEvidencePanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [selected, setSelected] = useState<Set<number>>(() => new Set());

	const toggle = (i: number) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i); else next.add(i);
			return next;
		});
	};

	const handleInsert = () => {
		try {
			const editor = (window as any).app?.workspace?.activeEditor?.editor;
			if (!editor) {
				new Notice('No active editor found.');
				return;
			}
			const items = result.evidence
				.filter((_, i) => selected.has(i))
				.map(e => e.insertText);
			if (items.length === 0) return;
			editor.replaceRange('\n\n' + items.join('\n\n'), editor.getCursor());
			new Notice(`Inserted ${items.length} evidence item${items.length > 1 ? 's' : ''}.`);
			onClose();
		} catch (e) {
			new Notice(`Failed to insert: ${(e as Error).message}`);
		}
	};

	if (result.evidence.length === 0) {
		return (
			<CopilotPanelShell icon={BookOpen} title="Add Evidence" onClose={onClose}>
				<PanelEmptyState message="No relevant evidence found in your vault." />
			</CopilotPanelShell>
		);
	}

	return (
		<CopilotPanelShell
			icon={BookOpen}
			title="Add Evidence"
			badge={`${result.evidence.length} sources`}
			footerSummary={`${selected.size} of ${result.evidence.length} selected`}
			onClose={onClose}
			actions={[{
				label: `Insert ${selected.size} Item${selected.size !== 1 ? 's' : ''}`,
				onClick: handleInsert,
				disabled: selected.size === 0,
			}]}
		>
			{result.evidence.map((item, i) => (
				<SelectableRow key={i} checked={selected.has(i)} onClick={() => toggle(i)}>
					<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
						<span
							className="pktw-text-[13px] pktw-font-semibold pktw-text-accent pktw-cursor-pointer hover:pktw-underline pktw-inline-flex pktw-items-center pktw-gap-1"
							onClick={(e) => { e.stopPropagation(); void vault.openNote(item.sourcePath, { newLeaf: false }); }}
						>
							{item.sourceTitle}
							<ExternalLink className="pktw-w-3 pktw-h-3 pktw-opacity-60" />
						</span>
						<span className="pktw-text-[9px] pktw-font-semibold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent">
							{Math.round(item.relevance * 100)}%
						</span>
					</div>
					<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-italic pktw-block pktw-mt-1 pktw-pl-2.5 pktw-border-l-2 pktw-border-border pktw-leading-relaxed">
						{item.quote}
					</span>
				</SelectableRow>
			))}
		</CopilotPanelShell>
	);
};
