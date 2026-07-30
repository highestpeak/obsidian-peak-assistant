import * as React from 'react';
import { Network } from 'lucide-react';
import type { AIGraphHistoryRow } from '@/service/ai-graph';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Button } from '@/ui/component/shared-ui/button';

export interface AIGraphContextArtifactsProps {
	contextRefs: readonly string[];
	label?: string;
	limit?: number;
	className?: string;
}

/**
 * Thin cross-surface adapter over the one app-owned AI Graph runtime. Consumers
 * provide only their stable context refs and receive exact graph/version links.
 */
export function AIGraphContextArtifacts({
	contextRefs,
	label = 'Related AI Graphs',
	limit = 3,
	className,
}: AIGraphContextArtifactsProps): React.ReactElement | null {
	const { quickSearchHost, quickSearchLauncher } = useServiceContext();
	const [rows, setRows] = React.useState<readonly AIGraphHistoryRow[]>([]);
	const contextKey = React.useMemo(
		() => [...new Set(contextRefs.filter(Boolean))].sort().join('\u0000'),
		[contextRefs],
	);

	React.useEffect(() => {
		let active = true;
		const refs = new Set(contextKey ? contextKey.split('\u0000') : []);
		if (refs.size === 0) {
			setRows([]);
			return () => {
				active = false;
			};
		}
		void quickSearchHost.listAIGraphArtifacts().then(async (allRows) => {
			if (!active) return;
			const matches = await Promise.all(allRows.map(async (row) => {
				const createdHere = row.createdFrom.contextRefs.some((contextRef) =>
					refs.has(contextRef.ref)
					|| Boolean(contextRef.locator && refs.has(contextRef.locator)));
				if (createdHere) return row;
				const view = await quickSearchHost.peekAIGraphArtifact(row.graphId, row.versionId);
				const updatedHere = view?.version.updateProvenance?.contextRefs.some((contextRef) =>
					refs.has(contextRef.ref)
					|| Boolean(contextRef.locator && refs.has(contextRef.locator)));
				if (updatedHere) return row;
				const versions = await quickSearchHost.listAIGraphVersions(row.graphId);
				const versionIndex = versions.findIndex((version) =>
					version.updateProvenance?.contextRefs.some((contextRef) =>
						refs.has(contextRef.ref)
						|| Boolean(contextRef.locator && refs.has(contextRef.locator))));
				if (versionIndex < 0) return null;
				return {
					...row,
					versionId: versions[versionIndex].versionId,
					versionNumber: versions.length - versionIndex,
				};
			}));
			if (!active) return;
			setRows(matches.filter((row): row is AIGraphHistoryRow => row !== null).slice(0, limit));
		});
		return () => {
			active = false;
		};
	}, [contextKey, limit, quickSearchHost]);

	if (!quickSearchLauncher || rows.length === 0) return null;
	return (
		<section className={className ?? 'pk-ai-graph-context-artifacts'} aria-label={label}>
			<span className="pk-ai-graph-context-artifacts__title">
				<Network aria-hidden />
				<strong>{label}</strong>
			</span>
			{rows.map((row) => (
				<Button
					key={row.graphId}
					variant="ghost"
					type="button"
					className="pk-ai-graph-context-artifacts__row"
					onClick={() => quickSearchLauncher.open({
						aiMode: 'graph',
						graphId: row.graphId,
						graphVersionId: row.versionId,
					})}
				>
					<span>{row.title}</span>
					<small>v{row.versionNumber} · {row.versionId}</small>
				</Button>
			))}
		</section>
	);
}
