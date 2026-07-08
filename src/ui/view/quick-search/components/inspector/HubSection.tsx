import React, { useEffect, useState } from 'react';
import { Layers, Eye } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { getHubsForDoc, type HubForDoc } from '@/service/search/inspectorService';

export interface HubSectionProps {
	currentPath: string;
	onOpenDocument: (path: string) => void;
	onInspectInPanel: (path: string) => void;
}

/**
 * Lists hubs that contain the current doc as a constituent.
 * Renders nothing when the doc belongs to no hub.
 */
export const HubSection: React.FC<HubSectionProps> = ({ currentPath, onOpenDocument, onInspectInPanel }) => {
	const [hubs, setHubs] = useState<HubForDoc[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		getHubsForDoc(currentPath)
			.then((result) => {
				if (!cancelled) {
					setHubs(result);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setHubs([]);
					setLoading(false);
				}
			});
		return () => { cancelled = true; };
	}, [currentPath]);

	if (loading) return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Loading...</span>;
	if (hubs.length === 0) return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Not in any hub.</span>;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			{hubs.map((hub) => (
				<div key={hub.path} className="pktw-flex pktw-items-center pktw-gap-1 pktw-min-w-0">
					<Layers className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />
					<span
						className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-cursor-pointer hover:pktw-text-pk-accent"
						onClick={() => onOpenDocument(hub.path)}
						title={hub.path}
					>
						{hub.label}
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
			))}
		</div>
	);
};
