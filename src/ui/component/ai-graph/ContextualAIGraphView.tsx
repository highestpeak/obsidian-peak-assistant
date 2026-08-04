import * as React from 'react';
import { AlertTriangle, ExternalLink, Loader2, Network, Plus } from 'lucide-react';
import type { QuickSearchGraphCreateOrigin } from '@/core/ports/QuickSearchLauncherPort';
import type { AIGraphArtifactView, AIGraphHistoryRow } from '@/service/ai-graph';
import { Button } from '@/ui/component/shared-ui/button';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { canonicalAIGraphData } from './aiGraphPresentation';

export interface ContextualAIGraphViewProps {
	contextRefs: readonly string[];
	selectedVaultPaths: readonly string[];
	createOrigin: QuickSearchGraphCreateOrigin;
}

async function matchContextRows(
	rows: readonly AIGraphHistoryRow[],
	refs: ReadonlySet<string>,
	peek: (graphId: string, versionId?: string) => Promise<AIGraphArtifactView | null>,
): Promise<AIGraphHistoryRow[]> {
	const matches = await Promise.all(rows.map(async (row) => {
		const createdHere = row.createdFrom.contextRefs.some((contextRef) =>
			refs.has(contextRef.ref) || Boolean(contextRef.locator && refs.has(contextRef.locator)));
		if (createdHere) return row;
		const view = await peek(row.graphId, row.versionId);
		const updatedHere = view?.version.updateProvenance?.contextRefs.some((contextRef) =>
			refs.has(contextRef.ref) || Boolean(contextRef.locator && refs.has(contextRef.locator)));
		return updatedHere ? row : null;
	}));
	return matches.filter((row): row is AIGraphHistoryRow => row !== null);
}

export function ContextualAIGraphView({
	contextRefs,
	selectedVaultPaths,
	createOrigin,
}: ContextualAIGraphViewProps): React.ReactElement {
	const { quickSearchHost, quickSearchLauncher } = useServiceContext();
	const [status, setStatus] = React.useState<'loading' | 'empty' | 'ready' | 'error'>('loading');
	const [row, setRow] = React.useState<AIGraphHistoryRow | null>(null);
	const [view, setView] = React.useState<AIGraphArtifactView | null>(null);
	const contextKey = React.useMemo(
		() => [...new Set(contextRefs.filter(Boolean))].sort().join('\u0000'),
		[contextRefs],
	);

	React.useEffect(() => {
		let active = true;
		setStatus('loading');
		setRow(null);
		setView(null);
		const refs = new Set(contextKey ? contextKey.split('\u0000') : []);
		void quickSearchHost.listAIGraphArtifacts()
			.then((rows) => matchContextRows(
				rows,
				refs,
				(graphId, versionId) => quickSearchHost.peekAIGraphArtifact(graphId, versionId),
			))
			.then(async (matches) => {
				if (!active) return;
				const nextRow = matches[0] ?? null;
				if (!nextRow) {
					setStatus('empty');
					return;
				}
				const nextView = await quickSearchHost.peekAIGraphArtifact(
					nextRow.graphId,
					nextRow.versionId,
				);
				if (!active) return;
				if (!nextView) {
					setStatus('error');
					return;
				}
				setRow(nextRow);
				setView(nextView);
				setStatus('ready');
			})
			.catch(() => {
				if (active) setStatus('error');
			});
		return () => {
			active = false;
		};
	}, [contextKey, quickSearchHost]);

	const createGraph = (): void => {
		quickSearchLauncher?.open({
			aiMode: 'graph',
			selectedVaultPaths: [...selectedVaultPaths],
			graphCreateOrigin: createOrigin,
		});
	};

	if (status === 'loading') {
		return (
			<div className="pk-context-ai-graph-state" role="status">
				<Loader2 className="pk-context-ai-graph-spinner" aria-hidden />
				<span>Finding AI Graphs for this context…</span>
			</div>
		);
	}

	if (status === 'error') {
		return (
			<div className="pk-context-ai-graph-state" role="alert">
				<AlertTriangle aria-hidden />
				<span>AI Graph history could not be loaded.</span>
				{quickSearchLauncher && <Button variant="outline" geometry="action" onClick={createGraph}>Open AI Graph workspace</Button>}
			</div>
		);
	}

	if (status === 'empty' || !view || !row) {
		return (
			<div className="pk-context-ai-graph-state">
				<Network aria-hidden />
				<strong>No AI Graph for this context yet</strong>
				<span>Create one from the current files. The result will be stored in the shared AI Graph history.</span>
				{quickSearchLauncher && (
					<Button variant="default" geometry="action" onClick={createGraph}>
						<Plus aria-hidden />
						Create AI Graph
					</Button>
				)}
			</div>
		);
	}

	return (
		<div className="pk-context-ai-graph">
			<div className="pk-context-ai-graph-head">
				<span>
					<strong>{view.manifest.title}</strong>
					<small>
						{view.version.stats.nodeCount} nodes · {view.version.stats.relationCount} relations · v{row.versionNumber}
						{row.changedSourceCount > 0 ? ` · ${row.changedSourceCount} source changed` : ''}
					</small>
				</span>
				{quickSearchLauncher && (
					<Button
						variant="outline"
						geometry="action"
						onClick={() => quickSearchLauncher.open({
							aiMode: 'graph',
							graphId: row.graphId,
							graphVersionId: row.versionId,
						})}
					>
						<ExternalLink aria-hidden />
						Open details
					</Button>
				)}
			</div>
			<div className="pk-context-ai-graph-canvas">
				<MultiLensGraph
					graphData={canonicalAIGraphData(view)}
					defaultLens="topology"
					showControls
					className="pktw-h-full"
					onNodeClick={(path) => {
						if (selectedVaultPaths.includes(path)) void quickSearchHost.openVaultPath(path);
					}}
				/>
			</div>
		</div>
	);
}
