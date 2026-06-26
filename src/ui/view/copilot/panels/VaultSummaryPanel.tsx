// src/ui/view/copilot/panels/VaultSummaryPanel.tsx
import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { VaultSummaryResult } from '@/service/copilot/copilot-schemas';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Calendar, FolderOpen, FileText, Copy } from 'lucide-react';

interface VaultSummaryPanelProps {
	result: VaultSummaryResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const VaultSummaryPanel: React.FC<VaultSummaryPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

	const openNote = (path: string): Promise<void> =>
		vault.openNote(path, { newLeaf: false });

	const handleCopy = async () => {
		const md = [
			`## Vault Summary: ${result.period}`,
			'',
			result.narrative,
			'',
			...result.groups.map(g => [
				`### ${g.topic}`,
				g.summary,
				'',
				...g.notes.map(n => `- [[${n.title}]] (${n.modifiedDate})`),
				'',
			].join('\n')),
		].join('\n');
		await navigator.clipboard.writeText(md);
		new Notice('Summary copied to clipboard.');
	};

	const handleInsertAsNote = async () => {
		const date = new Date().toISOString().slice(0, 10);
		const title = `Vault Summary ${date}`;
		const md = [
			'---',
			`date: ${date}`,
			`period: "${result.period}"`,
			`total_notes: ${result.totalNotes}`,
			'---',
			'',
			`# Vault Summary: ${result.period}`,
			'',
			result.narrative,
			'',
			...result.groups.map(g => [
				`## ${g.topic}`,
				'',
				g.summary,
				'',
				...g.notes.map(n => `- [[${n.title}]] (${n.modifiedDate})`),
				'',
			].join('\n')),
		].join('\n');

		try {
			await vault.createNoteInFolder('', title, md);
			new Notice(`Created ${title}.md`);
			onClose();
		} catch (e) {
			new Notice(`Failed to create note: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Calendar className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Vault Summary</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.totalNotes} notes
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">{result.period}</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{/* Narrative */}
				<div className="pktw-p-4 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-[13px] pktw-leading-relaxed pktw-mb-4">
					{result.narrative}
				</div>

				{/* Groups */}
				{result.groups.map((group, i) => {
					const isExpanded = expandedGroup === i;
					return (
						<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
							<div
								className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
								onClick={() => setExpandedGroup(isExpanded ? null : i)}
							>
								<FolderOpen className="pktw-w-3.5 pktw-h-3.5 pktw-text-accent pktw-flex-shrink-0" />
								<span className="pktw-text-[13px] pktw-font-semibold pktw-flex-1">{group.topic}</span>
								<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-tabular-nums">{group.notes.length} notes</span>
							</div>
							<div className="pktw-px-3.5 pktw-py-2.5">
								<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-leading-relaxed pktw-block pktw-mb-2">{group.summary}</span>
								{isExpanded && (
									<div className="pktw-mt-2 pktw-border-t pktw-border-border pktw-pt-2">
										{group.notes.map((note, j) => (
											<div
												key={j}
												className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-cursor-pointer hover:pktw-bg-muted pktw-rounded pktw-px-2 pktw-transition-colors"
												onClick={() => openNote(note.path)}
											>
												<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-flex-shrink-0" />
												<span className="pktw-text-[11px] pktw-font-semibold pktw-flex-1 pktw-truncate">{note.title}</span>
												<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-flex-shrink-0">{note.modifiedDate}</span>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					);
				})}

				{result.groups.length === 0 && (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No activity found in this period.
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{result.groups.length} topic groups
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button variant="ghost" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Copy
				</Button>
				<Button onClick={handleInsertAsNote}>
					<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Save as Note
				</Button>
			</div>
		</div>
	);
};
