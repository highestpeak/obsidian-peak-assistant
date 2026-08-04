import React from 'react';
import { ArrowRight, GitBranch, Layers, Network } from 'lucide-react';
import type { DocumentGraphContext } from '@/core/ports/ContextualGraphPort';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { isFileAtlasHubDocument } from '../documentContextPolicy';

export interface FileAtlasDocumentContextProps {
	filePath: string;
	onOpenLocalGraph(): void;
}

function statusLabel(status: DocumentGraphContext['orphanStatus']): string {
	if (status === 'connected') return 'Connected';
	if (status === 'soft-orphan') return 'Soft orphan';
	return 'Orphan';
}

/** Document-level hubs and link provenance owned by File Atlas. */
export const FileAtlasDocumentContext: React.FC<FileAtlasDocumentContextProps> = ({
	filePath,
	onOpenLocalGraph,
}) => {
	const { contextualGraph, settings, vaultNavigation } = useServiceContext();
	const [context, setContext] = React.useState<DocumentGraphContext | null>(null);
	const [loading, setLoading] = React.useState(true);
	const isHubDocument = isFileAtlasHubDocument(filePath, settings.ai.rootFolder);

	React.useEffect(() => {
		let cancelled = false;
		setLoading(true);
		if (!contextualGraph || isHubDocument) {
			setContext(null);
			setLoading(false);
			return;
		}
		contextualGraph.loadDocumentContext(filePath).then((value) => {
			if (cancelled) return;
			setContext(value);
			setLoading(false);
		}).catch(() => {
			if (cancelled) return;
			setContext(null);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [contextualGraph, filePath, isHubDocument]);

	if (isHubDocument) return null;
	if (loading) {
		return <div className="pkfa-document-context is-loading">Loading document relationships…</div>;
	}
	if (!context) return null;

	const primaryHubs = context.hubs.filter((hub) => hub.status === 'primary');
	const candidateHubs = context.hubs.filter((hub) => hub.status === 'candidate');
	const inbound = context.sources.filter((source) => source.direction === 'source');
	const outgoing = context.sources.filter((source) => source.direction === 'outgoing');

	return (
		<section className="pkfa-document-context" aria-label="File Atlas document relationships">
			<div className="pkfa-context-group">
				<span className="pkfa-context-label"><Layers aria-hidden="true" /> Hubs</span>
				<div className="pkfa-context-values">
					{primaryHubs.map((hub) => (
						<Button
							key={hub.path}
							variant="unstyled"
							className="pkfa-context-chip is-primary"
							title={hub.path}
							onClick={() => void vaultNavigation.openLink(hub.path)}
						>
							{hub.label}
						</Button>
					))}
					{candidateHubs.slice(0, 2).map((hub) => (
						<Button
							key={hub.path}
							variant="unstyled"
							className="pkfa-context-chip is-candidate"
							title={`${hub.path} · ${Math.round((hub.confidence ?? 0) * 100)}%`}
							onClick={() => void vaultNavigation.openLink(hub.path)}
						>
							{hub.label} · candidate
						</Button>
					))}
					{context.hubs.length === 0 ? <span>{statusLabel(context.orphanStatus)}</span> : null}
				</div>
			</div>

			<div className="pkfa-context-group">
				<span className="pkfa-context-label"><GitBranch aria-hidden="true" /> Links</span>
				<div className="pkfa-context-values">
					<span>{inbound.length} inbound</span>
					<ArrowRight aria-hidden="true" />
					<span>{outgoing.length} outgoing</span>
				</div>
			</div>

			<Button variant="outline" size="sm" className="pkfa-context-graph-action" onClick={onOpenLocalGraph}>
				<Network aria-hidden="true" />
				Open local graph · {context.nodes.length} nodes
			</Button>
		</section>
	);
};
