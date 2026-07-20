import React from 'react';
import { BookOpen, ExternalLink, FileSearch } from 'lucide-react';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { SourceArtifact } from '@/service/copilot/CopilotRunArtifacts';

export const SourcesArtifactPanel: React.FC<{
	sources: SourceArtifact[];
}> = ({ sources }) => {
	const { vault } = useCopilotPanelVault();

	const openNote = (path: string): Promise<void> =>
		// 'tab' opens in a new tab, leaving the current note intact.
		vault.openNote(path, { newLeaf: 'tab' });

	if (sources.length === 0) {
		return (
			<div className="pktw-flex pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-muted-foreground">
				No source notes were attached to this run.
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4">
			<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-rounded-md pktw-bg-muted/40 pktw-px-3 pktw-py-2 pktw-text-pk-sm pktw-text-muted-foreground">
				<BookOpen className="pktw-mt-0.5 pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-text-pk-accent" />
				<span>
					Notes the agent cited as evidence during this review. Not your document's own backlinks — these are vault notes the agent read and judged relevant to its insights or proposed changes.
				</span>
			</div>
			<div className="pktw-grid pktw-gap-3 md:pktw-grid-cols-2">
			{sources.map(source => (
				<div
					key={source.id}
					role="button"
					tabIndex={0}
					onClick={() => void openNote(source.path)}
					onKeyDown={e => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							void openNote(source.path);
						}
					}}
					className="pktw-group pktw-flex pktw-cursor-pointer pktw-flex-col pktw-rounded-lg pktw-border pktw-border-border pktw-bg-background pktw-p-3 pktw-text-left pktw-transition-colors hover:pktw-border-pk-accent/40 hover:pktw-bg-muted/20"
					title={`Open ${source.path} in Obsidian`}
				>
					<div className="pktw-flex pktw-items-start pktw-gap-2">
						<FileSearch className="pktw-mt-0.5 pktw-h-4 pktw-w-4 pktw-shrink-0 pktw-text-pk-accent" />
						<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-1">
							<span className="pktw-truncate pktw-text-sm pktw-font-semibold pktw-text-foreground group-hover:pktw-text-pk-accent">{source.title}</span>
							<span className="pktw-truncate pktw-text-pk-sm pktw-text-muted-foreground">{source.path}</span>
						</div>
						<ExternalLink className="pktw-mt-0.5 pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-text-muted-foreground/50 group-hover:pktw-text-pk-accent" />
					</div>
					{source.excerpt && (
						<div
							className="pktw-mt-3 pktw-rounded-md pktw-bg-muted/40 pktw-p-2 pktw-text-xs pktw-leading-relaxed pktw-text-muted-foreground"
							style={{ userSelect: 'text' }}
							onClick={e => e.stopPropagation()}
						>
							{source.excerpt}
						</div>
					)}
					{source.provenance.length > 0 && (
						<div className="pktw-mt-3 pktw-flex pktw-flex-wrap pktw-gap-1.5">
							{source.provenance.map(item => (
								<span
									key={`${source.id}-${item.capabilityId}-${item.label}`}
									className="pktw-rounded-full pktw-bg-pk-accent/10 pktw-px-2 pktw-py-0.5 pktw-text-pk-xs pktw-text-pk-accent"
								>
									{item.label}
								</span>
							))}
						</div>
					)}
				</div>
			))}
			</div>
		</div>
	);
};
