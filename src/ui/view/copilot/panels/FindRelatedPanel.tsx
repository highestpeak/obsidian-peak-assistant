import React from 'react';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { FindRelatedResult } from '@/service/copilot/actions';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Search, ExternalLink } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

interface FindRelatedPanelProps {
	result: FindRelatedResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const FindRelatedPanel: React.FC<FindRelatedPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();

	return (
		<CopilotPanelShell
			icon={Search}
			title="Related Notes"
			badge={`${result.items.length} found`}
			footerSummary={`Semantic similarity to "${ctx.title}"`}
			onClose={onClose}
		>
			{result.items.length === 0 ? (
				<PanelEmptyState message="No related notes found in the vault." />
			) : (
				result.items.map((item, i) => (
					<div
						key={item.path}
						className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors pktw-group"
						onClick={() => { void vault.openNote(item.path, { newLeaf: false }); }}
					>
						<div className="pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-bg-accent/10 pktw-text-accent pktw-flex pktw-items-center pktw-justify-center pktw-text-[11px] pktw-font-bold pktw-flex-shrink-0 pktw-mt-0.5">
							{i + 1}
						</div>
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-flex pktw-items-center pktw-gap-1.5">
								<span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent pktw-truncate">{item.title}</span>
								<span className="pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-flex-shrink-0">
									{Math.round(item.score * 100)}%
								</span>
								<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-flex-shrink-0" />
							</div>
							{item.excerpt && (
								<span className="pktw-text-[11px] pktw-text-muted-foreground/60 pktw-block pktw-mt-1 pktw-line-clamp-2 pktw-leading-relaxed">
									{item.excerpt}
								</span>
							)}
							<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-block pktw-mt-0.5">{item.path}</span>
						</div>
					</div>
				))
			)}
		</CopilotPanelShell>
	);
};
