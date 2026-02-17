/**
 * Pure interaction handlers for canvas graph: click, double-click, context menu, path selection.
 * Extracted from D3 selection events for reuse in canvas hit-test flow.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { GraphConfig } from '../../config';
import type { GraphVizLink, GraphVizNode, GraphVizNodeInfo } from '../../types';

export type NodeInfoFn = (d: GraphVizNode) => GraphVizNodeInfo;

export type GraphInteractionContext = {
	configRef: { current: GraphConfig };
	foldedSetRef: { current: Set<string> };
	pathStartIdRef: { current: string | null };
	pathSelectModeRef?: { current: boolean };
	nodesRef: { current: GraphVizNode[] };
	linksRef: { current: GraphVizLink[] };
	normalizeNodeId: (id: string) => string;
	setPathResult: (r: { pathNodeIds: string[]; pathLinkKeys: Set<string> } | null) => void;
	setFoldedSet: Dispatch<SetStateAction<Set<string>>>;
	setContextMenu: Dispatch<
		SetStateAction<{ open: boolean; clientX: number; clientY: number; node: GraphVizNodeInfo | null }>
	>;
	nodeContextMenu: { onOpenSource?: (path: string) => void } | null | undefined;
	onNodeContextMenu?: (pos: { x: number; y: number }, node: GraphVizNodeInfo) => void;
	onNodeClick?: (node: GraphVizNodeInfo) => void | Promise<void>;
	scheduleRenderJoin: (source?: string) => void;
	onSetPathStartNode?: (nodeId: string) => void;
	onSetPathEndNode?: (nodeId: string) => void;
	exitPathSelectMode?: () => void;
};

/** Handle normal node click. When pathSelectMode, first click = start, second = end; otherwise onNodeClick. */
export async function handleNodeClick(
	evt: MouseEvent,
	node: GraphVizNode,
	ctx: GraphInteractionContext,
	nodeInfo: NodeInfoFn
): Promise<void> {
	const inPathSelectMode = ctx.pathSelectModeRef?.current ?? false;
	if (inPathSelectMode && ctx.onSetPathStartNode && ctx.onSetPathEndNode) {
		const start = ctx.pathStartIdRef.current;
		if (start == null) {
			ctx.onSetPathStartNode(node.id);
			console.debug('[GraphViz:Path] Click 1/2: start set', { nodeId: node.id });
		} else if (start !== node.id) {
			ctx.onSetPathEndNode(node.id);
			console.debug('[GraphViz:Path] Click 2/2: end set', { start, end: node.id });
		} else {
			console.debug('[GraphViz:Path] Click same node as start, ignored');
		}
		return;
	}
	if (ctx.onNodeClick) await ctx.onNodeClick(nodeInfo(node));
}

/** Handle double-click: no-op (fold is via context menu only). */
export function handleNodeDoubleClick(
	_evt: MouseEvent,
	_node: GraphVizNode,
	_ctx: GraphInteractionContext
): void {
	// Fold/unfold is via right-click context menu only
}

/** Handle context menu: internal menu or external callback. */
export function handleNodeContextMenu(
	evt: MouseEvent,
	node: GraphVizNode,
	ctx: GraphInteractionContext,
	nodeInfo: NodeInfoFn
): void {
	const info = nodeInfo(node);
	console.debug('[GraphViz:Path] handleNodeContextMenu', { nodeId: node.id, hasNodeContextMenu: !!ctx.nodeContextMenu });
	if (ctx.nodeContextMenu) {
		evt.preventDefault?.();
		const gap = 4;
		const menuW = 210;
		const menuH = 320;
		const left = Math.max(8, Math.min(evt.clientX, window.innerWidth - menuW - 8));
		const top = Math.max(8, Math.min(evt.clientY + gap, window.innerHeight - menuH - 8));
		ctx.setContextMenu({ open: true, clientX: left, clientY: top, node: info });
	} else {
		ctx.onNodeContextMenu?.({ x: evt.clientX, y: evt.clientY }, info);
		evt.preventDefault?.();
	}
}
