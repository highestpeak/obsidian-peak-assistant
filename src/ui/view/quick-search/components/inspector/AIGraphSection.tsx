import React, { useEffect, useState } from 'react';
import { Network } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { AIGraphHistoryRow } from '@/service/ai-graph';
import { useSharedStore } from '../../store';
import { useQuickSearchHost } from '../../hooks/useQuickSearchHost';

export interface AIGraphSectionProps {
	currentPath: string;
	searchQuery: string;
}

/**
 * Vault Search adapter for the canonical AI Graph artifact platform. It opens
 * the exact graph/version inside the existing Quick Search modal; it never
 * recreates a legacy Markdown graph or owns a second library.
 */
export const AIGraphSection: React.FC<AIGraphSectionProps> = ({
	currentPath,
	searchQuery,
}) => {
	const host = useQuickSearchHost();
	const [rows, setRows] = useState<AIGraphHistoryRow[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		setLoading(true);
		void host.listAIGraphArtifacts()
			.then((allRows) => {
				if (!active) return;
				const normalizedQuery = searchQuery.trim().toLowerCase();
				setRows(allRows.filter((row) => row.createdFrom.contextRefs.some((contextRef) =>
					contextRef.ref === currentPath
					|| contextRef.locator === currentPath
					|| (
						normalizedQuery.length > 0
						&& contextRef.kind === 'search-query'
						&& contextRef.ref.toLowerCase() === normalizedQuery
					))).slice(0, 5));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [currentPath, host, searchQuery]);

	const openRow = (row: AIGraphHistoryRow): void => {
		useSharedStore.getState().beginIntentOpen(
			'graph',
			row.graphId,
			row.versionId,
		);
	};

	const createForCurrentSearch = (): void => {
		const store = useSharedStore.getState();
		store.setAIWorkspaceMode('graph');
		store.setSearchQuery(searchQuery);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{loading && (
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">Loading…</span>
			)}
			{!loading && rows.length === 0 && (
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">
					No persisted graph is linked to this file or query.
				</span>
			)}
			{rows.map((row) => (
				<Button
					key={row.graphId}
					variant="unstyled"
					type="button"
					className="pk-inspector-row-button pktw-flex-col pktw-items-start pktw-gap-0.5"
					onClick={() => openRow(row)}
				>
					<span className="pktw-text-xs pktw-font-medium">{row.title}</span>
					<small className="pktw-text-pk-xs pktw-text-pk-foreground-muted">
						{row.stats.nodeCount} nodes · {row.stats.relationCount} relations ·
						v{row.versionNumber}
					</small>
				</Button>
			))}
			<Button
				variant="unstyled"
				size="sm"
				className="pk-inspector-action-button pktw-justify-start pktw-gap-1.5"
				onClick={createForCurrentSearch}
			>
				<Network className="pktw-w-3.5 pktw-h-3.5" />
				Create AI Graph from this search
			</Button>
		</div>
	);
};
