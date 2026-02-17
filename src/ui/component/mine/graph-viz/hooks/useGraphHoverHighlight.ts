/**
 * Applies hover dimming: hovered node + direct neighbors (and their links) at full opacity, rest dimmed.
 */

import { useEffect } from 'react';
import * as d3Selection from 'd3-selection';
import type { GraphVizNode, GraphVizLink } from '../types';
import type { GraphConfig } from '../config';
import { getVisibleGraph } from '../utils/visibleGraph';
import { linkKey } from '../utils/link-key';
import { HOVER_DIM_OPACITY } from '../core/constants';
import type { LayerRefs, GraphDataRefs } from './useGraphEngine';

export type UseGraphHoverHighlightParams = {
	hoveredNodeId: string | null;
	version: number;
	config: GraphConfig;
	foldedSet: Set<string>;
	normalizeNodeId: (id: string) => string;
	getEdgeStyle: (edge: { kind: string; weight: number }) => { strokeOpacity?: number };
	layerRefs: LayerRefs;
	graphDataRefs: GraphDataRefs;
	renderBackend?: 'canvas' | 'svg';
};

export function useGraphHoverHighlight({
	hoveredNodeId,
	version,
	config,
	foldedSet,
	normalizeNodeId,
	getEdgeStyle,
	layerRefs,
	graphDataRefs,
	renderBackend = 'svg',
}: UseGraphHoverHighlightParams): void {
	const { linkSelRef, nodeSelRef, labelSelRef } = layerRefs;
	const { nodesRef, linksRef } = graphDataRefs;
	useEffect(() => {
		if (renderBackend === 'canvas') return;
		const nodeSel = nodeSelRef.current;
		const labelSel = labelSelRef.current;
		const linkSel = linkSelRef.current;
		if (!nodeSel || !labelSel || !linkSel) return;

		const strokeOpacityDefault = (d: GraphVizLink) =>
			d.kind === 'semantic'
				? config.semanticEdgeOpacity
				: d.kind === 'physical' || d.kind === 'path'
					? config.physicalEdgeOpacity
					: (getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeOpacity ?? 0.4);

		if (hoveredNodeId == null) {
			nodeSel.attr('opacity', 1);
			labelSel.attr('opacity', 1);
			linkSel.attr('opacity', 1).attr('stroke-opacity', strokeOpacityDefault);
			return;
		}

		const { visibleLinkKeys } = getVisibleGraph(
			nodesRef.current,
			linksRef.current,
			{ showTags: config.showTags, showSemanticEdges: config.showSemanticEdges },
			foldedSet,
			normalizeNodeId
		);
		const neighborIds = new Set<string>([hoveredNodeId]);
		for (const link of linksRef.current) {
			if (!visibleLinkKeys.has(linkKey(link, normalizeNodeId))) continue;
			const s = (link.source as GraphVizNode).id;
			const t = (link.target as GraphVizNode).id;
			if (s === hoveredNodeId) neighborIds.add(t);
			if (t === hoveredNodeId) neighborIds.add(s);
		}

		const isLinkHighlighted = (d: GraphVizLink) => {
			const s = (d.source as GraphVizNode).id;
			const t = (d.target as GraphVizNode).id;
			return s === hoveredNodeId || t === hoveredNodeId;
		};
		nodeSel.attr('opacity', (d) => (neighborIds.has(d.id) ? 1 : HOVER_DIM_OPACITY));
		labelSel.attr('opacity', (d) => (neighborIds.has(d.id) ? 1 : HOVER_DIM_OPACITY));
		linkSel
			.attr('opacity', (d) => (isLinkHighlighted(d) ? 1 : HOVER_DIM_OPACITY))
			.attr('stroke-opacity', (d) => (isLinkHighlighted(d) ? 1 : strokeOpacityDefault(d)));
		// Refs omitted from deps; we read .current inside effect.
	}, [
		renderBackend,
		hoveredNodeId,
		version,
		config.showTags,
		config.showSemanticEdges,
		config.semanticEdgeOpacity,
		config.physicalEdgeOpacity,
		foldedSet,
		normalizeNodeId,
		getEdgeStyle,
	]);
}
