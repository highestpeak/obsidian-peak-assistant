import React from 'react';
import { ArrowRight, CircleDot, GitBranch, Layers, Network } from 'lucide-react';
import type { DocumentGraphContext } from '@/core/ports/ContextualGraphPort';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface DocumentContextGraphStripProps {
	filePath: string;
}

function statusLabel(status: DocumentGraphContext['orphanStatus']): string {
	if (status === 'connected') return 'Connected';
	if (status === 'soft-orphan') return 'Soft orphan';
	return 'Orphan';
}

export const DocumentContextGraphStrip: React.FC<DocumentContextGraphStripProps> = ({
	filePath,
}) => {
	const { contextualGraph, vaultNavigation } = useServiceContext();
	const [context, setContext] = React.useState<DocumentGraphContext | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		let cancelled = false;
		setLoading(true);
		if (!contextualGraph) {
			setContext(null);
			setLoading(false);
			return;
		}
		contextualGraph.loadDocumentContext(filePath)
			.then((value) => {
				if (cancelled) return;
				setContext(value);
				setLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setContext(null);
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [contextualGraph, filePath]);

	if (loading) {
		return (
			<div className="pk-context-graph-strip is-loading">
				<span>Loading document context…</span>
			</div>
		);
	}
	if (!context) return null;

	const primaryHubs = context.hubs.filter((hub) => hub.status === 'primary');
	const candidateHubs = context.hubs.filter((hub) => hub.status === 'candidate');
	const neighbors = context.nodes.filter((node) => node.role === 'neighbor').slice(0, 4);

	return (
		<section className="pk-context-graph-strip" aria-label="Current document graph context">
			<div className="pk-context-graph-group">
				<span className="pk-context-graph-heading">
					<Layers aria-hidden="true" />
					Current note hubs
				</span>
				<div className="pk-context-graph-items">
					{primaryHubs.map((hub) => (
						<Button
							key={hub.path}
							variant="unstyled"
							className="pk-context-graph-chip is-primary"
							title={hub.path}
							onClick={() => void vaultNavigation.openVaultPath(hub.path)}
						>
							{hub.label}
						</Button>
					))}
					{primaryHubs.length === 0 && (
						<span className="pk-context-graph-empty">{statusLabel(context.orphanStatus)}</span>
					)}
					{candidateHubs.map((hub) => (
						<Button
							key={hub.path}
							variant="unstyled"
							className="pk-context-graph-chip is-candidate"
							title={`${hub.path} · candidate ${Math.round((hub.confidence ?? 0) * 100)}%`}
							onClick={() => void vaultNavigation.openVaultPath(hub.path)}
						>
							{hub.label} · candidate
						</Button>
					))}
				</div>
			</div>

			<div className="pk-context-graph-group">
				<span className="pk-context-graph-heading">
					<GitBranch aria-hidden="true" />
					Source chain
				</span>
				<div className="pk-context-source-chain">
					{context.sources.slice(0, 4).map((source) => (
						<Button
							key={`${source.direction}:${source.path}`}
							variant="unstyled"
							className="pk-context-source-link"
							title={source.path}
							onClick={() => void vaultNavigation.openVaultPath(source.path)}
						>
							{source.label}
							<ArrowRight aria-hidden="true" />
							<span>{source.direction === 'source' ? 'current note' : 'outgoing'}</span>
						</Button>
					))}
					{context.sources.length === 0 && (
						<span className="pk-context-graph-empty">No indexed source chain</span>
					)}
				</div>
			</div>

			<div className="pk-context-graph-group">
				<span className="pk-context-graph-heading">
					<Network aria-hidden="true" />
					Local graph
				</span>
				<div className="pk-context-local-graph" aria-label={`${context.nodes.length} local graph nodes`}>
					<span className="pk-context-local-node is-current">
						<CircleDot aria-hidden="true" />
						Current
					</span>
					{neighbors.map((node) => (
						<Button
							key={node.id}
							variant="unstyled"
							className="pk-context-local-node"
							title={node.path ?? node.label}
							onClick={() => {
								if (node.path) void vaultNavigation.openVaultPath(node.path);
							}}
						>
							{node.label}
						</Button>
					))}
					{context.nodes.length > neighbors.length + 1 && (
						<span className="pk-context-graph-empty">
							+{context.nodes.length - neighbors.length - 1}
						</span>
					)}
				</div>
			</div>
		</section>
	);
};
