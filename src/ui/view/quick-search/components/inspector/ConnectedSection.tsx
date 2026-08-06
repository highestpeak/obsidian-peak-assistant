import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, ArrowLeftRight, Eye } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { getConnectedLinks, filterLinksByQuery, type ConnectedLink } from '@/service/search/inspectorService';
import { mergeConnectedLinks, type MergedConnectedLink } from './mergeConnectedLinks';

const INITIAL_VISIBLE = 5;

export interface ConnectedSectionProps {
	currentPath: string;
	searchQuery: string;
	onOpenDocument: (notePath: string) => void;
	onInspectInPanel: (notePath: string) => void;
}

export const ConnectedSection: React.FC<ConnectedSectionProps> = ({
	currentPath,
	searchQuery,
	onOpenDocument,
	onInspectInPanel,
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

	const mergedLinks = useMemo(() => mergeConnectedLinks(links), [links]);

	if (loading) {
		return <span className="pktw-text-xs pktw-text-pk-foreground-muted">Loading...</span>;
	}

	if (mergedLinks.length === 0) {
		return <span className="pktw-text-xs pktw-text-pk-foreground-muted">No connections found.</span>;
	}

	const visible = expanded ? mergedLinks : mergedLinks.slice(0, INITIAL_VISIBLE);
	const remaining = mergedLinks.length - INITIAL_VISIBLE;

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
							<DirectionIcon direction={link.direction} />

							<span
								className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-cursor-pointer hover:pktw-text-pk-accent"
								onClick={() => onOpenDocument(link.path)}
								title={link.path}
							>
								{link.label}
							</span>

							{showBadge && (
								<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted pktw-shrink-0">
									{scorePercent}%
								</span>
							)}

							{link.convergenceCount > 3 && (
								<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted pktw-bg-pk-surface-sunken pktw-px-1 pktw-rounded pktw-shrink-0">
									{link.convergenceCount} refs
								</span>
							)}

							<Button
								variant="unstyled"
								size="xs"
								className="pk-inspector-mini-icon-button pktw-ml-auto pktw-shrink-0"
								title="Inspect in panel"
								aria-label={`Inspect ${link.label} in panel`}
								onClick={(e) => {
									e.stopPropagation();
									onInspectInPanel(link.path);
								}}
							>
								<Eye className="pktw-w-3 pktw-h-3" />
							</Button>
						</div>

						{link.contextSnippet && (
							<span className="pktw-text-pk-xs pktw-text-pk-foreground-muted pktw-pl-5 pktw-leading-tight pktw-line-clamp-1">
								{link.contextSnippet}
							</span>
						)}
					</div>
				);
			})}

			{!expanded && remaining > 0 && (
				<Button
					variant="unstyled"
					size="xs"
					className="pk-inspector-text-button pktw-self-start"
					onClick={() => setExpanded(true)}
				>
					See {remaining} more ↓
				</Button>
			)}
		</div>
	);
};

const DirectionIcon: React.FC<{ direction: MergedConnectedLink['direction'] }> = ({ direction }) => {
	if (direction === 'both') {
		return (
			<ArrowLeftRight
				className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0"
				aria-label="Linked in both directions"
			/>
		);
	}
	if (direction === 'out') {
		return (
			<ArrowRight
				className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0"
				aria-label="Outgoing link"
			/>
		);
	}
	return (
		<ArrowLeft
			className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-muted pktw-shrink-0"
			aria-label="Incoming link (backlink)"
		/>
	);
};
