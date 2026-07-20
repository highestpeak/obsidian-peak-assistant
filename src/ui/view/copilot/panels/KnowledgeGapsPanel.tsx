import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { KnowledgeGaps } from '@/service/copilot/copilot-schemas';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { HelpCircle, AlertTriangle, AlertCircle, Info, FilePlus } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { FindingCard, PanelEmptyState, type SeverityConfig } from '@/ui/view/copilot/components/FindingsBodyParts';

const PRIORITY_CONFIG: Record<string, SeverityConfig> = {
	high: { icon: AlertTriangle, label: 'High', bg: 'pktw-bg-pk-error/10', text: 'pktw-text-pk-error', order: 0 },
	medium: { icon: AlertCircle, label: 'Medium', bg: 'pktw-bg-pk-warning/10', text: 'pktw-text-pk-warning', order: 1 },
	low: { icon: Info, label: 'Low', bg: 'pktw-bg-pk-info/10', text: 'pktw-text-pk-info', order: 2 },
};

interface KnowledgeGapsPanelProps {
	result: KnowledgeGaps;
	ctx: DocumentContext;
	onClose: () => void;
}

export const KnowledgeGapsPanel: React.FC<KnowledgeGapsPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();

	const sortedGaps = [...result.gaps].sort((a, b) => {
		const orderA = PRIORITY_CONFIG[a.priority]?.order ?? 3;
		const orderB = PRIORITY_CONFIG[b.priority]?.order ?? 3;
		return orderA - orderB;
	});

	const handleCreate = async (suggestedTitle: string, description: string) => {
		try {
			const parentFolder = ctx.file.parent?.path ?? '';
			const content = `# ${suggestedTitle}\n\n${description}\n\n---\nIdentified as a knowledge gap from [[${ctx.title}]].\n`;
			await vault.createNoteInFolder(parentFolder, suggestedTitle, content);
			new Notice(`Created note: ${suggestedTitle}`);
		} catch (e) {
			new Notice(`Failed to create note: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={HelpCircle}
			title="Knowledge Gaps"
			badge={`${result.gaps.length} gaps`}
			footerSummary={`Gaps identified for "${ctx.title}"`}
			onClose={onClose}
		>
			{sortedGaps.length === 0 ? (
				<PanelEmptyState message="No knowledge gaps identified. Your notes cover this topic well." />
			) : (
				sortedGaps.map((gap, i) => {
					const config = PRIORITY_CONFIG[gap.priority] ?? PRIORITY_CONFIG.low;
					return (
						<FindingCard key={i} config={config} title={gap.topic}>
							<span className="pktw-text-pk-sm pktw-text-muted-foreground pktw-leading-relaxed pktw-block pktw-mb-2">
								{gap.description}
							</span>
							<div className="pktw-flex pktw-items-center pktw-justify-between">
								<span className="pktw-text-pk-xs pktw-text-muted-foreground/60">
									Suggested: {gap.suggestedTitle}
								</span>
								<Button
									variant="ghost"
									size="sm"
									className="pktw-h-6 pktw-text-pk-xs pktw-gap-1"
									onClick={() => handleCreate(gap.suggestedTitle, gap.description)}
								>
									<FilePlus className="pktw-w-3 pktw-h-3" />
									Create
								</Button>
							</div>
						</FindingCard>
					);
				})
			)}
		</CopilotPanelShell>
	);
};
