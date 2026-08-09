/**
 * Controlled Graph projection for the shared Result Browser.
 *
 * Accepts an *already-built* `ResultSubgraphOutput` and renders it through the
 * shared cytoscape canvas (`AtlasGraphCanvas`). Per plan §C it must never call
 * SearchClient or build a second graph — the host adapter owns subgraph
 * construction, telemetry and open/reveal policy and passes the frozen
 * subgraph + neutral node callbacks in.
 *
 * Extracted from `src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx`.
 */
import React from 'react';
import {
	AtlasGraphCanvas,
	type AtlasGraphKeyTipKeys,
	type AtlasGraphNodeTap,
	type AtlasGraphPreset,
} from '@/ui/component/graph/AtlasGraphCanvas';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import type { ResultBrowserGraphPreset } from '../model/types';

/** Node cap the graph projection trims to (root + selection stay pinned). */
export const RESULT_BROWSER_GRAPH_NODE_CAP = 100;

export interface ResultBrowserGraphProps {
	/** Frozen, host-built subgraph. `null` while the host is still computing it. */
	subgraph: ResultSubgraphOutput | null;
	preset: ResultBrowserGraphPreset;
	semantic: boolean;
	nodeCap?: number;
	onNodeTap?: (node: AtlasGraphNodeTap) => void;
	onNodeDblTap?: (node: { id: string; path: string }) => void;
	onNodeHover?: (node: { id: string; path: string } | null) => void;
	keyTipKeys?: AtlasGraphKeyTipKeys;
}

export const ResultBrowserGraph: React.FC<ResultBrowserGraphProps> = ({
	subgraph,
	preset,
	semantic,
	nodeCap = RESULT_BROWSER_GRAPH_NODE_CAP,
	onNodeTap,
	onNodeDblTap,
	onNodeHover,
	keyTipKeys = PEAK_CONTROL_KEY_TIP_KEYS.search.graphCanvas,
}) => (
	<AtlasGraphCanvas
		subgraph={subgraph}
		preset={preset as AtlasGraphPreset}
		showSemantic={semantic}
		keyTipKeys={keyTipKeys}
		nodeCap={nodeCap}
		onNodeTap={onNodeTap}
		onNodeDblTap={onNodeDblTap}
		onNodeHover={onNodeHover}
	/>
);
