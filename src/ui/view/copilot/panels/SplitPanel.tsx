import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { SplitPlan } from '@/service/copilot/copilot-schemas';
import { Scissors, Ruler } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';

interface SplitPanelProps {
	result: SplitPlan;
	file: TFile;
	originalContent: string;
	onClose: () => void;
}

const SPLIT_COLORS = ['pktw-bg-accent', 'pktw-bg-pk-info', 'pktw-bg-pk-success', 'pktw-bg-pk-warning', 'pktw-bg-pk-error'];

export const SplitPanel: React.FC<SplitPanelProps> = ({ result, file, originalContent, onClose }) => {
	const { vault } = useCopilotPanelVault();
	const lines = originalContent.split('\n');

	const splitWordCounts = result.splits.map((split) => {
		const [start, end] = split.lineRange;
		const content = lines.slice(start - 1, end).join(' ');
		return content.split(/\s+/).filter(Boolean).length;
	});
	const totalWords = splitWordCounts.reduce((a, b) => a + b, 0);

	const handleSplit = async () => {
		const parentFolder = file.parent?.path ?? '';
		try {
			const sortedSplits = [...result.splits].sort((a, b) => b.lineRange[0] - a.lineRange[0]);
			for (const split of sortedSplits) {
				const [start, end] = split.lineRange;
				const extractedLines = lines.slice(start - 1, end);
				const content = extractedLines.join('\n');
				await vault.createNoteInFolder(parentFolder, split.newTitle, content);
				const linkLine = `→ [[${split.newTitle}]]`;
				lines.splice(start - 1, end - start + 1, linkLine);
			}
			await vault.replaceFileContent(file, lines.join('\n'));
			const titles = result.splits.map((s) => s.newTitle).join(', ');
			new Notice(`Split into ${result.splits.length} notes: ${titles}`);
			onClose();
		} catch (e) {
			new Notice(`Split failed: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={Scissors}
			title="Split Suggestion"
			badge={`${totalWords.toLocaleString()} words`}
			onClose={onClose}
			actions={[{ label: `Split into ${result.splits.length} Notes`, onClick: handleSplit }]}
		>
			<div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed pktw-border-l-3 pktw-border-l-pk-warning">
				<Ruler className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0 pktw-mt-0.5" />
				{result.reason}
			</div>

			<div className="pktw-flex pktw-gap-0.5 pktw-mb-4 pktw-h-2 pktw-rounded pktw-overflow-hidden">
				{result.splits.map((_, i) => (
					<div
						key={i}
						className={`${SPLIT_COLORS[i % SPLIT_COLORS.length]} pktw-rounded-sm`}
						style={{ flex: splitWordCounts[i] }}
					/>
				))}
			</div>

			{result.splits.map((split, i) => (
				<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
					<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
						<div className="pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-bg-accent/10 pktw-text-accent pktw-flex pktw-items-center pktw-justify-center pktw-text-pk-sm pktw-font-bold pktw-flex-shrink-0">
							{i + 1}
						</div>
						<span className="pktw-text-pk-md pktw-font-semibold pktw-flex-1">{split.newTitle}</span>
						<span className="pktw-text-pk-xs pktw-text-muted-foreground pktw-tabular-nums">~{splitWordCounts[i].toLocaleString()} words</span>
					</div>
					<div className="pktw-px-3.5 pktw-py-2.5">
						<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mb-2">
							{split.headings.map((h) => (
								<span key={h} className="pktw-text-pk-xs pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground pktw-border pktw-border-border">{h}</span>
							))}
						</div>
						<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-leading-relaxed pktw-block">{split.summary}</span>
						<div className="pktw-mt-2 pktw-p-2 pktw-bg-background pktw-border pktw-border-border pktw-rounded-md pktw-text-pk-sm pktw-text-muted-foreground/60 pktw-leading-relaxed pktw-max-h-[60px] pktw-overflow-hidden pktw-relative">
							<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-block pktw-mb-1">
								Original content <span className="pktw-text-accent pktw-font-semibold pktw-ml-1.5">Lines {split.lineRange[0]}–{split.lineRange[1]}</span>
							</span>
							{split.excerpt}
							<div className="pktw-absolute pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-5 pktw-bg-gradient-to-t pktw-from-background pktw-to-transparent" />
						</div>
					</div>
				</div>
			))}
		</CopilotPanelShell>
	);
};
