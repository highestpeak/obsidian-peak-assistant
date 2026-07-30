import React, { useEffect, useState } from 'react';
import { Layers, Eye, Network, Search } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { ContextualHubRef, DocumentGraphContext } from '@/core/ports/ContextualGraphPort';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface HubSectionProps {
	currentPath: string;
	onOpenDocument: (path: string) => void;
	onInspectInPanel: (path: string) => void;
	onOpenLocalGraph?: (path: string) => void;
	onFindRelated?: (path: string) => void;
}

/**
 * Lists hubs that contain the current doc as a constituent.
 * Renders nothing when the doc belongs to no hub.
 */
export const HubSection: React.FC<HubSectionProps> = ({
	currentPath,
	onOpenDocument,
	onInspectInPanel,
	onOpenLocalGraph,
	onFindRelated,
}) => {
	const { contextualGraph } = useServiceContext();
	const [context, setContext] = useState<DocumentGraphContext | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		if (!contextualGraph) {
			setContext(null);
			setLoading(false);
			return;
		}
		contextualGraph.loadDocumentContext(currentPath)
			.then((result) => {
				if (!cancelled) {
					setContext(result);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setContext(null);
					setLoading(false);
				}
			});
		return () => { cancelled = true; };
	}, [contextualGraph, currentPath]);

	if (loading) return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Loading...</span>;
	if (!context) return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Hub context unavailable.</span>;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{context.hubs.map((hub: ContextualHubRef) => (
				<div key={hub.path} className="pktw-flex pktw-flex-col pktw-gap-1 pktw-rounded-md pktw-border pktw-border-pk-border pktw-p-2">
					<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-min-w-0">
					<Layers className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />
					<span
						className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-cursor-pointer hover:pktw-text-pk-accent"
						onClick={() => onOpenDocument(hub.path)}
						title={hub.path}
					>
						{hub.label}
					</span>
					<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted">
						{hub.status === 'primary'
							? 'primary'
							: `candidate ${Math.round((hub.confidence ?? 0) * 100)}%`}
					</span>
					<Button
						variant="ghost"
						size="xs"
						className="pktw-shadow-none !pktw-w-5 !pktw-h-5 pktw-ml-auto pktw-shrink-0"
						title="Inspect in panel"
						onClick={(e) => {
							e.stopPropagation();
							onInspectInPanel(hub.path);
						}}
					>
						<Eye className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted" />
					</Button>
					</div>
					<div className="pktw-flex pktw-gap-1">
						<Button
							variant="outline"
							size="xs"
							onClick={() => onOpenDocument(hub.path)}
						>
							Open hub doc
						</Button>
						{hub.status === 'primary' && onOpenLocalGraph ? (
							<Button
								variant="outline"
								size="xs"
								onClick={() => onOpenLocalGraph(hub.path)}
							>
								<Network className="pktw-w-3 pktw-h-3" />
								View local graph
							</Button>
						) : null}
					</div>
				</div>
			))}
			{context.hubs.length === 0 && (
				<div className="pktw-flex pktw-flex-col pktw-gap-2">
					<span className="pktw-text-xs pktw-text-pk-foreground-muted">
						{context.orphanStatus === 'soft-orphan'
							? 'No confirmed hub. Related notes suggest a soft orphan.'
							: 'No hub or related cluster found. This note is currently orphaned.'}
					</span>
					{onFindRelated ? (
						<Button variant="outline" size="xs" onClick={() => onFindRelated(currentPath)}>
							<Search className="pktw-w-3 pktw-h-3" />
							Find related
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
};
