/**
 * Result Graph View — the Vault Search surface over the shared graph canvas.
 *
 * Reads search results from the store, builds a result subgraph (baseline synth
 * → enriched via buildResultSubgraph), and renders it through the shared
 * {@link AtlasGraphCanvas} — the single cytoscape renderer used by both this
 * view and File Atlas. Search-specific behavior (AI-Suggest recorder, hub-graph
 * subview, inspector selection, open-on-double-click) lives here.
 */
import React, { useEffect, useRef, useState } from 'react';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { useVaultSearchStore } from '../../store';
import { buildResultSubgraph, type ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { AtlasGraphCanvas, type AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { SearchResultItem } from '@/core/search/searchTypes';

const NODE_CAP = 100;

/** Numeric match score of a raw search result. */
function scoreOf(r: SearchResultItem): number {
	const s = r.finalScore ?? r.score ?? 0;
	return Number.isFinite(s) ? s : 0;
}

interface ResultGraphViewProps {
	onClose?: () => void;
	onOpenHubGraphSubview?: (hubNodeId: string) => void;
	onSelectForInspector?: (path: string) => void;
}

export const ResultGraphView: React.FC<ResultGraphViewProps> = ({ onClose, onOpenHubGraphSubview, onSelectForInspector }) => {
	const results = useVaultSearchStore((s) => s.lastSearchResults);
	const preset = useVaultSearchStore((s) => s.graphPreset) as AtlasGraphPreset;
	const showSemantic = useVaultSearchStore((s) => s.graphShowSemantic);
	const { vaultNavigation, resultSubgraph: resultSubgraphDeps } = useServiceContext();

	const [subgraph, setSubgraph] = useState<ResultSubgraphOutput | null>(null);
	const recorderHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Rebuild subgraph when results change. Baseline synth (from raw results)
	// runs first so the graph is never blank; enrichment refines it.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!results.length) {
				setSubgraph({ resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0 });
				return;
			}
			const scoreById = new Map<string, number>();
			const baselineNodes: ResultSubgraphOutput['resultNodes'] = [];
			const baselineIds: string[] = [];
			for (const r of results) {
				const id = r.docId ?? r.path ?? r.id;
				if (!id) continue;
				if (scoreById.has(id)) {
					scoreById.set(id, Math.max(scoreById.get(id)!, scoreOf(r)));
					continue;
				}
				scoreById.set(id, scoreOf(r));
				baselineIds.push(id);
				baselineNodes.push({ id, path: r.path ?? '', title: r.title || r.path || id, score: scoreOf(r), communityId: null, folder: r.path ? (r.path.split('/')[0] ?? '') : '' });
			}
			const baseline: ResultSubgraphOutput = { resultNodes: baselineNodes, hubAnchors: [], edges: [], isolatedDocIds: baselineIds, overflowCount: 0 };
			if (!cancelled) setSubgraph(baseline);
			if (!resultSubgraphDeps) return;
			try {
				const sub = await buildResultSubgraph(resultSubgraphDeps, { resultDocIds: baselineIds, matchScores: scoreById, nodeCap: NODE_CAP });
				const byId = new Map(baselineNodes.map((n) => [n.id, n]));
				const enriched: ResultSubgraphOutput = {
					...sub,
					resultNodes: sub.resultNodes.map((n) => {
						const src = byId.get(n.id);
						return { ...n, title: n.title || src?.title || src?.path || n.id, path: n.path || src?.path || '', folder: n.folder || src?.folder || '' };
					}),
				};
				if (!cancelled) setSubgraph(enriched);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn('[ResultGraphView] buildResultSubgraph failed, keeping baseline', err);
			}
		})();
		return () => { cancelled = true; };
	}, [results, resultSubgraphDeps]);

	useEffect(() => () => { if (recorderHoverTimer.current) clearTimeout(recorderHoverTimer.current); }, []);

	return (
		<AtlasGraphCanvas
			subgraph={subgraph}
			preset={preset}
			showSemantic={showSemantic}
			nodeCap={NODE_CAP}
			onNodeTap={({ id, path, isHub, modKey }) => {
				if (modKey && isHub) { onOpenHubGraphSubview?.(id); return; }
				if (isHub) {
					const hub = subgraph?.hubAnchors.find((h) => h.id === id);
					const target = hub?.path || path;
					if (target) void vaultNavigation.openLink(target, { newLeaf: 'tab' });
					return;
				}
				if (path) {
					behaviorRecorder.push('focusedFile', { path });
					onSelectForInspector?.(path);
				}
			}}
			onNodeDblTap={({ id, path }) => {
				const found = results.find((r) => (r.docId ?? r.path ?? r.id) === id) ?? results.find((r) => r.path === path);
				if (!found) return;
				behaviorRecorder.push('openedFile', { path: found.path });
				void createOpenSourceCallback(onClose, true, vaultNavigation)(found);
			}}
			onNodeHover={(node) => {
				if (recorderHoverTimer.current) { clearTimeout(recorderHoverTimer.current); recorderHoverTimer.current = null; }
				if (!node?.path) return;
				recorderHoverTimer.current = setTimeout(() => {
					behaviorRecorder.push('focusedFile', { path: node.path, durationMs: 800 });
				}, 800);
			}}
		/>
	);
};
