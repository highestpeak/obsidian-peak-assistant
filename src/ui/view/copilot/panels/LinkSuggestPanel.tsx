import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { LinkSuggestions } from '@/service/copilot/copilot-schemas';
import { Link2 } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SelectableRow, DirectionBadge, SuggestionSummaryBox } from '@/ui/view/copilot/components/SuggestionBodyParts';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

interface LinkSuggestPanelProps {
	result: LinkSuggestions;
	file: TFile;
	originalContent: string;
	onClose: () => void;
}

export const LinkSuggestPanel: React.FC<LinkSuggestPanelProps> = ({
	result, file, originalContent, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [selected, setSelected] = useState<Set<number>>(() => {
		const s = new Set<number>();
		result.links.forEach((link, i) => { if (link.type === 'outgoing') s.add(i); });
		return s;
	});

	const toggle = (i: number) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i); else next.add(i);
			return next;
		});
	};

	const outgoingCount = result.links.filter(l => l.type === 'outgoing').length;
	const incomingCount = result.links.filter(l => l.type === 'incoming').length;
	const selectedOutgoing = result.links.filter((l, i) => l.type === 'outgoing' && selected.has(i));

	const handleInsert = async () => {
		try {
			let content = await vault.readFileContent(file);
			for (const link of selectedOutgoing) {
				const contextIdx = content.indexOf(link.context);
				if (contextIdx !== -1) {
					const insertPos = contextIdx + link.context.length;
					content = content.slice(0, insertPos) + ` [[${link.target}]]` + content.slice(insertPos);
				}
			}
			await vault.replaceFileContent(file, content);
			new Notice(`Inserted ${selectedOutgoing.length} links.`);
			onClose();
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={Link2}
			title="Link Suggestions"
			footerSummary={`${selected.size} of ${result.links.length} selected`}
			onClose={onClose}
			actions={[{
				label: `Insert ${selectedOutgoing.length} Links`,
				onClick: handleInsert,
				disabled: selectedOutgoing.length === 0,
			}]}
		>
			<SuggestionSummaryBox count={result.links.length}>
				potential links · <span className="pktw-font-semibold pktw-text-accent">{outgoingCount}</span> outgoing · <span className="pktw-font-semibold pktw-text-pk-success">{incomingCount}</span> incoming
			</SuggestionSummaryBox>

			{result.links.length === 0 && <PanelEmptyState message="No link candidates found." />}

			{result.links.map((link, i) => (
				<SelectableRow key={i} checked={selected.has(i)} onClick={() => toggle(i)}>
					<div className="pktw-flex pktw-items-center pktw-gap-1.5">
						<span className="pktw-text-pk-md pktw-font-semibold pktw-text-accent">[[{link.target}]]</span>
						<DirectionBadge direction={link.type} />
					</div>
					<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-block pktw-mt-0.5">{link.reason}</span>
					{link.context && (
						<span className="pktw-text-pk-sm pktw-text-muted-foreground/60 pktw-italic pktw-block pktw-mt-1 pktw-pl-2.5 pktw-border-l-2 pktw-border-border">
							...{link.context}...
						</span>
					)}
				</SelectableRow>
			))}
		</CopilotPanelShell>
	);
};
