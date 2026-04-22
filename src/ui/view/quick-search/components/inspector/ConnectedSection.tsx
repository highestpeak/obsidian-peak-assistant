import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { getConnectedLinks, filterLinksByQuery, type ConnectedLink } from '@/service/search/inspectorService';

const INITIAL_VISIBLE = 3;

export interface ConnectedSectionProps {
	currentPath: string;
	searchQuery: string;
	onNavigate: (notePath: string) => void;
}

export const ConnectedSection: React.FC<ConnectedSectionProps> = ({
	currentPath,
	searchQuery,
	onNavigate,
}) => {
	const [links, setLinks] = useState<ConnectedLink[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setExpanded(false);

		getConnectedLinks(currentPath)
			.then((raw) => (searchQuery ? filterLinksByQuery(raw, searchQuery) : raw))
			.then((result) => {
				if (!cancelled) {
					setLinks(result);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setLinks([]);
					setLoading(false);
				}
			});

		return () => { cancelled = true; };
	}, [currentPath, searchQuery]);

	if (loading) {
		return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Loading...</span>;
	}

	if (links.length === 0) {
		return <span className="pktw-text-xs pktw-text-pk-foreground-muted">No connections found.</span>;
	}

	const visible = expanded ? links : links.slice(0, INITIAL_VISIBLE);
	const remaining = links.length - INITIAL_VISIBLE;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
			{visible.map((link, i) => {
				const hasQuery = searchQuery.trim().length > 0;
				const score = link.relevanceScore;
				const isRelevant = !hasQuery || score === null || score > 0.3;
				const scorePercent = score !== null ? Math.round(score * 100) : null;
				const showBadge = hasQuery && score !== null && score > 0.3 && scorePercent !== null;

				return (
					<div
						key={`${link.path}-${link.direction}-${i}`}
						className={cn(
							'pktw-flex pktw-flex-col pktw-gap-0.5',
							!isRelevant && 'pktw-opacity-35',
						)}
					>
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-min-w-0">
							{link.direction === 'out'
								? <ArrowRight className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />
								: <ArrowLeft className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0" />}

							<span
								className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-cursor-pointer hover:pktw-text-pk-accent"
								onClick={() => onNavigate(link.path)}
								title={link.path}
							>
								{link.label}
							</span>

							{showBadge && (
								<span className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-text-[10px] pktw-text-[#16a34a] pktw-shrink-0">
									<Check className="pktw-w-2.5 pktw-h-2.5" />
									{scorePercent}%
								</span>
							)}

							{link.convergenceCount > 3 && (
								<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-bg-[#f3f4f6] pktw-px-1 pktw-rounded pktw-shrink-0">
									{link.convergenceCount} refs
								</span>
							)}
						</div>

						{link.contextSnippet && (
							<span className="pktw-text-[10px] pktw-text-pk-foreground-muted pktw-pl-5 pktw-leading-tight pktw-line-clamp-1">
								{link.contextSnippet}
							</span>
						)}
					</div>
				);
			})}

			{!expanded && remaining > 0 && (
				<Button
					variant="ghost"
					size="xs"
					className="pktw-shadow-none pktw-h-5 pktw-px-0 pktw-text-[10px] pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground-muted pktw-self-start"
					onClick={() => setExpanded(true)}
				>
					See {remaining} more ↓
				</Button>
			)}
		</div>
	);
};
