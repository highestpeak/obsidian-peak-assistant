// src/ui/view/copilot/panels/FindRelatedPanel.tsx
import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { FindRelatedResult } from '@/service/copilot/actions/find-related';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Search, ExternalLink } from 'lucide-react';

interface FindRelatedPanelProps {
	result: FindRelatedResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const FindRelatedPanel: React.FC<FindRelatedPanelProps> = ({
	result, ctx, onClose,
}) => {
	const openNote = async (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && 'extension' in file) {
			await app.workspace.getLeaf(false).openFile(file as any);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Search className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Related Notes</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.items.length} found
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{result.items.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No related notes found in the vault.
					</div>
				) : (
					result.items.map((item, i) => (
						<div
							key={item.path}
							className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors pktw-group"
							onClick={() => openNote(item.path)}
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
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					Semantic similarity to "{ctx.title}"
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
