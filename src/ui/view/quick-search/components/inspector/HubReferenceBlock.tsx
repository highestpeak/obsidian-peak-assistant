import React, { useEffect, useState } from 'react';
import { Layers, Waypoints, ChevronDown } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { getHubReferencesForDoc, type HubReference } from '@/service/search/inspectorService';

const INITIAL_VISIBLE = 5;

export interface HubReferenceBlockProps {
	/** Selected doc path from the Inspector (list mode or Result Graph View). */
	selectedDocId: string | null;
	/** Default row click: open the hub_doc markdown in current pane. */
	onOpenHub: (hubPath: string) => void;
	/** Middle click / Cmd+Enter: open the hub_doc in a new tab. */
	onOpenHubInNewTab: (hubPath: string) => void;
	/**
	 * Modifier click / dedicated icon click: open Result Graph View scoped to
	 * this hub's constituents. Placeholder for T7's `useOpenHubGraphSubview`.
	 */
	onOpenHubGraphSubview?: (hubNodeId: string) => void;
}

interface HubReferenceRowProps {
	hub: HubReference;
	onOpenHub: (hubPath: string) => void;
	onOpenHubInNewTab: (hubPath: string) => void;
	onOpenHubGraphSubview?: (hubNodeId: string) => void;
}

const HubReferenceRow: React.FC<HubReferenceRowProps> = ({
	hub,
	onOpenHub,
	onOpenHubInNewTab,
	onOpenHubGraphSubview,
}) => {
	const handleRowClick = (e: React.MouseEvent<HTMLSpanElement>) => {
		if (e.metaKey || e.ctrlKey) {
			onOpenHubGraphSubview?.(hub.hubNodeId);
			return;
		}
		onOpenHub(hub.hubPath);
	};

	const handleAuxClick = (e: React.MouseEvent<HTMLSpanElement>) => {
		// Middle-click = button 1
		if (e.button === 1) {
			e.preventDefault();
			onOpenHubInNewTab(hub.hubPath);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			onOpenHubInNewTab(hub.hubPath);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			onOpenHub(hub.hubPath);
		}
	};

	const handleGraphIconClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		onOpenHubGraphSubview?.(hub.hubNodeId);
	};

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-min-w-0">
			<Layers className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />
			<span
				role="button"
				tabIndex={0}
				className="pktw-flex-1 pktw-min-w-0 pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-cursor-pointer hover:pktw-text-pk-accent"
				onClick={handleRowClick}
				onAuxClick={handleAuxClick}
				onKeyDown={handleKeyDown}
				title={`${hub.hubPath}${hub.constituentCount ? ` (${hub.constituentCount} constituents)` : ''}`}
			>
				<span className="pktw-truncate">{hub.label}</span>
				{hub.constituentCount > 0 && (
					<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-bg-pk-surface-sunken pktw-px-1 pktw-rounded pktw-shrink-0">
						{hub.constituentCount}
					</span>
				)}
			</span>
			<Button
				variant="ghost"
				size="xs"
				className="pktw-shadow-none !pktw-w-5 !pktw-h-5 pktw-shrink-0"
				title="Open hub graph subview"
				onClick={handleGraphIconClick}
			>
				<Waypoints className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted" />
			</Button>
		</div>
	);
};

/**
 * Bottom-of-Inspector "Hub Reference" block (T6). Renders the hubs that
 * contain the selected document as a constituent. Hidden entirely when the
 * selected doc has no `hub_constituent` entries — no placeholder row.
 *
 * Rows: single click opens the hub markdown via `onOpenHub`. Cmd/Ctrl+click
 * or the trailing Waypoints icon opens the hub graph subview (T7 wire).
 * Middle click / Cmd+Enter opens in a new tab.
 *
 * See spec §Hub Reference · Click Behavior + §Acceptance Criteria For Hub Reference.
 */
export const HubReferenceBlock: React.FC<HubReferenceBlockProps> = ({
	selectedDocId,
	onOpenHub,
	onOpenHubInNewTab,
	onOpenHubGraphSubview,
}) => {
	const [refs, setRefs] = useState<HubReference[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		if (!selectedDocId) {
			setRefs([]);
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setExpanded(false);
		getHubReferencesForDoc(selectedDocId)
			.then((result) => {
				if (cancelled) return;
				setRefs(result);
				setLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setRefs([]);
				setLoading(false);
			});
		return () => { cancelled = true; };
	}, [selectedDocId]);

	// Empty state per AC: hide the entire block when no hub_constituent entries.
	if (!selectedDocId) return null;
	if (loading) return null;
	if (refs.length === 0) return null;

	const visible = expanded ? refs : refs.slice(0, INITIAL_VISIBLE);
	const remaining = refs.length - INITIAL_VISIBLE;

	return (
		<div className="pktw-border-b pktw-border-pk-border">
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-4 pktw-py-2">
				<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-uppercase pktw-tracking-wide">
					Hub Reference
				</span>
			</div>
			<div className="pktw-px-4 pktw-pb-3 pktw-flex pktw-flex-col pktw-gap-1">
				{visible.map((hub) => (
					<HubReferenceRow
						key={hub.hubNodeId}
						hub={hub}
						onOpenHub={onOpenHub}
						onOpenHubInNewTab={onOpenHubInNewTab}
						onOpenHubGraphSubview={onOpenHubGraphSubview}
					/>
				))}
				{!expanded && remaining > 0 && (
					<Button
						variant="ghost"
						size="xs"
						className="pktw-shadow-none pktw-h-5 pktw-px-0 pktw-text-[10px] pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground-muted pktw-self-start pktw-gap-0.5"
						onClick={() => setExpanded(true)}
					>
						<ChevronDown className="pktw-w-3 pktw-h-3" />
						+{remaining} more
					</Button>
				)}
			</div>
		</div>
	);
};
