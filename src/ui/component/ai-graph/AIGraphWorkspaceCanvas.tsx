import React, { useEffect, useMemo, useState } from 'react';
import type { LensGraphData, LensType } from '@/core/types/lens-graph';
import { AtlasGraphCanvas } from '@/ui/component/graph/AtlasGraphCanvas';
import { aiLensToAtlasModel } from '@/ui/component/graph/adapters/aiLensToAtlasModel';
import {
	GraphWorkspace,
	resolveGraphWorkspaceManifest,
} from '@/ui/component/graph-workspace';

export interface AIGraphWorkspaceCanvasProps {
	graphData: LensGraphData;
	lens?: LensType;
	onLensChange?: (lens: LensType) => void;
	onNodeClick?: (path: string) => void;
	onEdgeClick?: (edge: {
		relationId: string | null;
		source: string;
		target: string;
		accessibleLabel: string | null;
	}) => void;
	showWorkspaceControl?: boolean;
	className?: string;
}

export const AIGraphWorkspaceCanvas: React.FC<AIGraphWorkspaceCanvasProps> = ({
	graphData,
	lens,
	onLensChange,
	onNodeClick,
	onEdgeClick,
	showWorkspaceControl = true,
	className,
}) => {
	const availableLenses = graphData.availableLenses.length ? graphData.availableLenses : ['topology'];
	const [internalLens, setInternalLens] = useState<LensType>(lens ?? availableLenses[0] ?? 'topology');
	const [evidenceVisible, setEvidenceVisible] = useState(true);
	const activeLens = availableLenses.includes(lens ?? internalLens)
		? (lens ?? internalLens)
		: (availableLenses[0] ?? 'topology');
	useEffect(() => {
		if (lens) setInternalLens(lens);
	}, [lens]);
	const selectLens = (next: LensType): void => {
		setInternalLens(next);
		onLensChange?.(next);
	};
	const fullModel = useMemo(
		() => aiLensToAtlasModel(graphData, activeLens),
		[activeLens, graphData],
	);
	const model = useMemo(
		() => evidenceVisible ? fullModel : { ...fullModel, edges: [] },
		[evidenceVisible, fullModel],
	);
	const canvas = (
		<AtlasGraphCanvas
			model={model}
			preset="constellation"
			showSemantic={evidenceVisible}
			onShowSemanticChange={setEvidenceVisible}
			layerLabel="Evidence links"
			showMiniMap
			onNodeTap={(node) => onNodeClick?.(node.path)}
			onNodeDblTap={(node) => onNodeClick?.(node.path)}
			onEdgeTap={onEdgeClick}
			emptyLabel="No relations found for this lens."
		/>
	);
	if (!showWorkspaceControl) return <div className={className}>{canvas}</div>;
	const baseManifest = resolveGraphWorkspaceManifest('ai-graph-artifact');
	const manifest = { ...baseManifest, aiLenses: availableLenses };
	return (
		<GraphWorkspace
			manifest={manifest}
			view="graph"
			onViewChange={() => undefined}
			scope="ai"
			onScopeChange={() => undefined}
			physicalProjection="constellation"
			onPhysicalProjectionChange={() => undefined}
			aiLens={activeLens}
			onAILensChange={selectLens}
			className={className}
		>
			{canvas}
		</GraphWorkspace>
	);
};
