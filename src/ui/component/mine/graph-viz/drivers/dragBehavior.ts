/**
 * D3 drag behavior for graph nodes. Isolates d3-drag dependency.
 */

import * as d3 from 'd3-force';
import * as d3Drag from 'd3-drag';
import type { D3DragEvent } from 'd3-drag';
import type { GraphVizNode, GraphVizLink } from '../types';

export type CreateDragBehaviorOptions = {
	simulation: d3.Simulation<GraphVizNode, GraphVizLink>;
	/** Set to true during drag; cleared on drag end. */
	isDraggingRef?: { current: boolean };
	/** Invoked when drag ends; use to recompute hub/community overlay. */
	onDragEnd?: () => void;
};

/**
 * Returns a D3 drag behavior bound to the given force simulation.
 * On drag start/end, fixes node position (fx/fy); during drag, updates fx/fy and restarts alpha.
 */
export function createDragBehavior(
	simulationOrOpts: d3.Simulation<GraphVizNode, GraphVizLink> | CreateDragBehaviorOptions
): d3Drag.DragBehavior<SVGGElement, GraphVizNode, GraphVizNode> {
	const simulation =
		'simulation' in simulationOrOpts ? simulationOrOpts.simulation : (simulationOrOpts as d3.Simulation<GraphVizNode, GraphVizLink>);
	const opts = 'simulation' in simulationOrOpts ? simulationOrOpts : null;

	function dragstarted(event: D3DragEvent<SVGGElement, GraphVizNode, GraphVizNode>, d: GraphVizNode) {
		opts?.isDraggingRef && (opts.isDraggingRef.current = true);
		if (!event.active) simulation.alphaTarget(0.02).restart();
		d.fx = d.x ?? 0;
		d.fy = d.y ?? 0;
	}

	function dragged(event: D3DragEvent<SVGGElement, GraphVizNode, GraphVizNode>, d: GraphVizNode) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function dragended(event: D3DragEvent<SVGGElement, GraphVizNode, GraphVizNode>, d: GraphVizNode) {
		opts?.isDraggingRef && (opts.isDraggingRef.current = false);
		opts?.onDragEnd?.();
		if (!event.active) simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}

	return d3Drag
		.drag<SVGGElement, GraphVizNode, GraphVizNode>()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended);
}
