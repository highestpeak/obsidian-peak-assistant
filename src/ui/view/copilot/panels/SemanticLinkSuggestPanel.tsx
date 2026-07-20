import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import { Share2 } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { SelectableRow, DirectionBadge, SuggestionSummaryBox } from '@/ui/view/copilot/components/SuggestionBodyParts';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

interface SemanticLinkSuggestion {
	path: string;
	title: string;
	score: number;
	direction: 'outgoing' | 'incoming';
	snippet: string;
}

interface SemanticLinkSuggestPanelProps {
	result: {
		suggestions: SemanticLinkSuggestion[];
		summary: string;
	};
	file: TFile;
	originalContent: string;
	onClose: () => void;
}

const formatScore = (score: number) => {
	const pct = Math.round(score * 100);
	if (pct >= 80) return { label: `${pct}%`, className: 'pktw-text-pk-success' };
	if (pct >= 50) return { label: `${pct}%`, className: 'pktw-text-accent' };
	return { label: `${pct}%`, className: 'pktw-text-muted-foreground' };
};

export const SemanticLinkSuggestPanel: React.FC<SemanticLinkSuggestPanelProps> = ({
	result, file, originalContent, onClose,
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

	const selectedItems = result.suggestions.filter((_, i) => selected.has(i));

	const handleInsert = async () => {
		try {
			let content = await vault.readFileContent(file);
			const linkLines = selectedItems.map(s => `- [[${s.path.replace(/\.md$/, '')}|${s.title}]]`);
			content += `\n\n## Related Notes\n\n${linkLines.join('\n')}\n`;
			await vault.replaceFileContent(file, content);
			new Notice(`Inserted ${selectedItems.length} link${selectedItems.length !== 1 ? 's' : ''}.`);
			onClose();
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={Share2}
			title="Semantic Link Suggestions"
			footerSummary={`${selected.size} of ${result.suggestions.length} selected`}
			onClose={onClose}
			actions={[{
				label: `Insert ${selectedItems.length} Link${selectedItems.length !== 1 ? 's' : ''}`,
				onClick: handleInsert,
				disabled: selectedItems.length === 0,
			}]}
		>
			<SuggestionSummaryBox count={result.suggestions.length}>{result.summary}</SuggestionSummaryBox>

			{result.suggestions.length === 0 ? (
				<PanelEmptyState message="No unlinked semantic neighbors found." />
			) : (
				result.suggestions.map((suggestion, i) => {
					const scoreInfo = formatScore(suggestion.score);
					return (
						<SelectableRow key={i} checked={selected.has(i)} onClick={() => toggle(i)}>
							<div className="pktw-flex pktw-items-center pktw-gap-1.5">
								<span className="pktw-text-pk-md pktw-font-semibold pktw-text-accent pktw-truncate">[[{suggestion.title}]]</span>
								<span className={`pktw-text-pk-xs pktw-font-bold ${scoreInfo.className}`}>{scoreInfo.label}</span>
								<DirectionBadge direction={suggestion.direction} label={{ out: 'out', in: 'in' }} />
							</div>
							<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-block pktw-mt-0.5 pktw-truncate">
								{suggestion.path}
							</span>
						</SelectableRow>
					);
				})
			)}
		</CopilotPanelShell>
	);
};
