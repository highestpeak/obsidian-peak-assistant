// src/ui/view/copilot/panels/KnowledgeGapsPanel.tsx
import React from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { KnowledgeGaps } from '@/service/copilot/copilot-schemas';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { HelpCircle, AlertTriangle, AlertCircle, Info, FilePlus, type LucideIcon } from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { icon: LucideIcon; label: string; bg: string; text: string; order: number }> = {
	high: { icon: AlertTriangle, label: 'High', bg: 'pktw-bg-[var(--pk-error,#ef4444)]/10', text: 'pktw-text-[var(--pk-error,#ef4444)]', order: 0 },
	medium: { icon: AlertCircle, label: 'Medium', bg: 'pktw-bg-[var(--pk-warning,#f59e0b)]/10', text: 'pktw-text-[var(--pk-warning,#f59e0b)]', order: 1 },
	low: { icon: Info, label: 'Low', bg: 'pktw-bg-[var(--pk-info,#3b82f6)]/10', text: 'pktw-text-[var(--pk-info,#3b82f6)]', order: 2 },
};

interface KnowledgeGapsPanelProps {
	result: KnowledgeGaps;
	ctx: DocumentContext;
	onClose: () => void;
}

export const KnowledgeGapsPanel: React.FC<KnowledgeGapsPanelProps> = ({
	result, ctx, onClose,
}) => {
	const sortedGaps = [...result.gaps].sort((a, b) => {
		const orderA = PRIORITY_CONFIG[a.priority]?.order ?? 3;
		const orderB = PRIORITY_CONFIG[b.priority]?.order ?? 3;
		return orderA - orderB;
	});

	const handleCreate = async (suggestedTitle: string, description: string) => {
		const app = AppContext.getInstance().app;
		try {
			const parentFolder = ctx.file.parent?.path ?? '';
			const path = parentFolder ? `${parentFolder}/${suggestedTitle}.md` : `${suggestedTitle}.md`;
			const content = `# ${suggestedTitle}\n\n${description}\n\n---\nIdentified as a knowledge gap from [[${ctx.title}]].\n`;
			await app.vault.create(path, content);
			new Notice(`Created note: ${suggestedTitle}`);
		} catch (e) {
			new Notice(`Failed to create note: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<HelpCircle className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Knowledge Gaps</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.gaps.length} gaps
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{sortedGaps.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No knowledge gaps identified. Your notes cover this topic well.
					</div>
				) : (
					sortedGaps.map((gap, i) => {
						const config = PRIORITY_CONFIG[gap.priority] ?? PRIORITY_CONFIG.low;
						return (
							<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
								<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
									<div className={`pktw-w-[22px] pktw-h-[22px] pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 ${config.bg} ${config.text}`}>
										<config.icon className="pktw-w-3 pktw-h-3" />
									</div>
									<span className="pktw-text-[13px] pktw-font-semibold pktw-flex-1">{gap.topic}</span>
									<span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${config.bg} ${config.text}`}>
										{config.label}
									</span>
								</div>
								<div className="pktw-px-3.5 pktw-py-2.5">
									<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-leading-relaxed pktw-block pktw-mb-2">
										{gap.description}
									</span>
									<div className="pktw-flex pktw-items-center pktw-justify-between">
										<span className="pktw-text-[10px] pktw-text-muted-foreground/60">
											Suggested: {gap.suggestedTitle}
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="pktw-h-6 pktw-text-[10px] pktw-gap-1"
											onClick={() => handleCreate(gap.suggestedTitle, gap.description)}
										>
											<FilePlus className="pktw-w-3 pktw-h-3" />
											Create
										</Button>
									</div>
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					Gaps identified for "{ctx.title}"
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
