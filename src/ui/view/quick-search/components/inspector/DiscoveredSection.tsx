import React, { useEffect, useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { getDiscoveredConnections, type DiscoveredConnection } from '@/service/search/inspectorService';

const INITIAL_VISIBLE = 3;

const TYPE_BADGE: Record<DiscoveredConnection['type'], { label: string; className: string }> = {
	SEM: { label: 'SEM', className: 'pktw-bg-purple-100 pktw-text-purple-700' },
	'CO-CITE': { label: 'CO-CITE', className: 'pktw-bg-blue-100 pktw-text-blue-700' },
	UNLINKED: { label: 'UNLINKED', className: 'pktw-bg-amber-100 pktw-text-amber-700' },
};

export interface DiscoveredSectionProps {
	currentPath: string;
	searchQuery: string;
	onNavigate: (notePath: string) => void;
}

export const DiscoveredSection: React.FC<DiscoveredSectionProps> = ({
	currentPath,
	searchQuery,
	onNavigate,
}) => {
	const [items, setItems] = useState<DiscoveredConnection[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setExpanded(false);

		getDiscoveredConnections(currentPath)
			.then((result) => {
				if (!cancelled) {
					setItems(result);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setItems([]);
					setLoading(false);
				}
			});

		return () => { cancelled = true; };
	}, [currentPath]);

	if (loading) {
		return <span className="pktw-text-xs pktw-text-[#9ca3af]">Loading...</span>;
	}

	if (items.length === 0) {
		return <span className="pktw-text-xs pktw-text-[#9ca3af]">No discovered connections.</span>;
	}

	const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);
	const remaining = items.length - INITIAL_VISIBLE;
	const badge = (type: DiscoveredConnection['type']) => TYPE_BADGE[type];

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
			{visible.map((item, i) => {
				const scorePercent = Math.round(item.score * 100);
				const { label: badgeLabel, className: badgeClass } = badge(item.type);

				return (
					<div key={`${item.path}-${i}`} className="pktw-flex pktw-flex-col pktw-gap-0.5">
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-min-w-0">
							<span
								className="pktw-text-xs pktw-font-medium pktw-text-[#374151] pktw-truncate pktw-cursor-pointer hover:pktw-text-[#7c3aed]"
								onClick={() => onNavigate(item.path)}
								title={item.path}
							>
								{item.label}
							</span>

							<span className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-shrink-0">
								{scorePercent}%
							</span>

							<span className={cn(
								'pktw-text-[9px] pktw-font-medium pktw-px-1 pktw-rounded pktw-shrink-0',
								badgeClass,
							)}>
								{badgeLabel}
							</span>
						</div>

						{item.whyText && (
							<span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-leading-tight pktw-line-clamp-1">
								{item.whyText}
							</span>
						)}
					</div>
				);
			})}

			{!expanded && remaining > 0 && (
				<Button
					variant="ghost"
					size="xs"
					className="pktw-shadow-none pktw-h-5 pktw-px-0 pktw-text-[10px] pktw-text-[#9ca3af] hover:pktw-text-[#6b7280] pktw-self-start"
					onClick={() => setExpanded(true)}
				>
					See {remaining} more ↓
				</Button>
			)}
		</div>
	);
};
