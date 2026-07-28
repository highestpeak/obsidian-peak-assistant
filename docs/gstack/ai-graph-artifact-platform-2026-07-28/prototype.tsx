import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
	MultiLensGraph,
} from '../../../src/ui/component/mine/multi-lens-graph/MultiLensGraph';
import type {
	LensGraphData,
	LensType,
} from '../../../src/core/types/lens-graph';

type GraphMeta = {
	graphId: string;
	title: string;
	type: string;
};

const INITIAL_META: GraphMeta = {
	graphId: 'graphrag',
	title: 'GraphRAG 概念与方法',
	type: 'Concept',
};

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);

function graphPath(graphId: string, nodeId: string): string {
	return `ai-graph://${graphId}/${nodeId}`;
}

function buildGraphData(meta: GraphMeta): LensGraphData {
	const prefix = (nodeId: string) => graphPath(meta.graphId, nodeId);
	const labels = meta.graphId === 'editors'
		? {
			root: 'AI-native editor',
			foundation: 'Code editor',
			web: 'Cursor product overview',
			claim: 'Agentic editing reduces context switching',
			vault: 'AI 编辑器格局调研.md',
			process: 'Agentic edit loop',
			bridge: 'Human review',
			outcome: 'Accepted change set',
		}
		: meta.graphId === 'pkm'
			? {
				root: 'Personal knowledge management',
				foundation: 'Active recall',
				web: 'Retrieval practice study',
				claim: 'Evidence-linked notes improve synthesis',
				vault: 'PKM 工作流研究.md',
				process: 'Capture → connect → synthesize',
				bridge: 'Source evidence',
				outcome: 'Durable knowledge',
			}
			: meta.graphId === 'agent-timeline'
				? {
					root: 'Tool use',
					foundation: 'ReAct',
					web: 'Agentic systems report',
					claim: 'Control planes make agents auditable',
					vault: 'Agent Runtime 演化.md',
					process: 'AI Capability Gateway',
					bridge: 'Run Envelope',
					outcome: 'Reviewable agent run',
				}
				: {
					root: meta.title,
					foundation: 'Retrieval-Augmented Generation',
					web: 'Microsoft GraphRAG Overview',
					claim: 'Global search answers corpus-level questions',
					vault: 'GraphRAG 调研笔记.md',
					process: 'Community summarization',
					bridge: 'Evidence assertion',
					outcome: 'Reviewable knowledge graph',
				};

	return {
		nodes: [
			{
				label: labels.root,
				path: prefix('root'),
				role: 'root',
				clusterId: 'knowledge',
				importance: 0.98,
				level: 0,
				summary: `${meta.type} graph root`,
				createdAt: START,
			},
			{
				label: labels.foundation,
				path: prefix('foundation'),
				role: 'hub',
				clusterId: 'knowledge',
				importance: 0.82,
				level: 1,
				parentId: prefix('root'),
				createdAt: START + DAY * 12,
			},
			{
				label: labels.web,
				path: prefix('web'),
				role: 'leaf',
				clusterId: 'evidence',
				importance: 0.66,
				level: 1,
				parentId: prefix('root'),
				createdAt: START + DAY * 25,
			},
			{
				label: labels.claim,
				path: prefix('claim'),
				role: 'hub',
				clusterId: 'evidence',
				importance: 0.78,
				level: 2,
				parentId: prefix('web'),
				createdAt: START + DAY * 42,
			},
			{
				label: labels.vault,
				path: prefix('vault'),
				role: 'leaf',
				clusterId: 'evidence',
				importance: 0.6,
				level: 2,
				parentId: prefix('root'),
				createdAt: START + DAY * 58,
			},
			{
				label: labels.process,
				path: prefix('process'),
				role: 'leaf',
				clusterId: 'knowledge',
				importance: 0.7,
				level: 2,
				parentId: prefix('root'),
				createdAt: START + DAY * 75,
			},
		],
		edges: [
			{ source: prefix('foundation'), target: prefix('root'), kind: 'builds_on', weight: 0.92, label: 'foundation of' },
			{ source: prefix('web'), target: prefix('root'), kind: 'references', weight: 0.88, label: 'defines' },
			{ source: prefix('web'), target: prefix('claim'), kind: 'derives', weight: 0.86, label: 'supports' },
			{ source: prefix('root'), target: prefix('vault'), kind: 'derives', weight: 0.8, label: 'explained in' },
			{ source: prefix('root'), target: prefix('process'), kind: 'applies', weight: 0.78, label: 'implemented by' },
			{ source: prefix('claim'), target: prefix('process'), kind: 'cross-domain', weight: 0.36, label: 'requires review' },
			{ source: prefix('foundation'), target: prefix('web'), kind: 'temporal', weight: 0.32, label: 'precedes' },
			{ source: prefix('web'), target: prefix('vault'), kind: 'temporal', weight: 0.32, label: 'precedes' },
			{ source: prefix('vault'), target: prefix('process'), kind: 'temporal', weight: 0.32, label: 'precedes' },
		],
		availableLenses: ['topology', 'thinking-tree', 'bridge', 'timeline'],
		clusters: [
			{ id: 'knowledge', name: 'Knowledge & methods', description: 'Concepts, methods, and processes' },
			{ id: 'evidence', name: 'Sources & evidence', description: 'Vault, Web, and source-backed assertions' },
		],
		bridges: [
			{
				node_path: prefix('claim'),
				connects: ['knowledge', 'evidence'],
				explanation: 'Review evidence before promoting an inferred relation',
			},
		],
		evolutionChains: [
			{
				chain: [
					prefix('foundation'),
					prefix('web'),
					prefix('vault'),
					prefix('process'),
				],
				theme: 'Knowledge evolution',
			},
		],
		insights: {
			topology: 'Production MultiLensGraph topology: drag nodes, pan the canvas, zoom, and select a node.',
			bridges: 'Bridge lens uses the production swimlane and cross-domain layout.',
			timeline: 'Timeline lens uses the production temporal layout and axis.',
		},
	};
}

function projectGraphDataForLens(graphData: LensGraphData, lens: LensType): LensGraphData {
	if (lens === 'thinking-tree') {
		const nodePaths = new Set(graphData.nodes.map((node) => node.path));
		const hierarchyEdges: LensGraphData['edges'] = graphData.nodes.flatMap((node) => {
			if (!node.parentId || !nodePaths.has(node.parentId)) return [];
			return [{
				source: node.parentId,
				target: node.path,
				kind: 'derives' as const,
				weight: 0.94,
			}];
		});
		return {
			...graphData,
			edges: hierarchyEdges,
		};
	}

	if (lens === 'timeline') {
		const pathsById = new Map(
			graphData.nodes.map((node) => [node.path.split('/').pop(), node.path]),
		);
		const buildChain = (ids: string[]) => ids
			.map((id) => pathsById.get(id))
			.filter((path): path is string => Boolean(path));
		return {
			...graphData,
			edges: graphData.edges.filter((edge) => edge.kind !== 'temporal'),
			evolutionChains: [
				{ chain: buildChain(['root', 'foundation', 'process']), theme: 'Concept and method evolution' },
				{ chain: buildChain(['web', 'claim', 'vault']), theme: 'Evidence and assertion evolution' },
			],
		};
	}

	return graphData;
}

function RealGraphPrototype() {
	const [meta, setMeta] = useState<GraphMeta>(INITIAL_META);
	const [activeLens, setActiveLens] = useState<LensType>('topology');
	const [viewportEpoch, setViewportEpoch] = useState(0);
	const sourceGraphData = useMemo(() => buildGraphData(meta), [meta]);
	const graphData = useMemo(
		() => projectGraphDataForLens(sourceGraphData, activeLens),
		[sourceGraphData, activeLens],
	);

	useEffect(() => {
		const onSetGraph = (event: Event) => {
			const detail = (event as CustomEvent<GraphMeta>).detail;
			if (!detail?.graphId) return;
			setMeta(detail);
			setActiveLens('topology');
		};
		const onRefit = () => setViewportEpoch((epoch) => epoch + 1);
		window.addEventListener('peak-prototype:set-graph', onSetGraph);
		window.addEventListener('peak-prototype:refit', onRefit);
		return () => {
			window.removeEventListener('peak-prototype:set-graph', onSetGraph);
			window.removeEventListener('peak-prototype:refit', onRefit);
		};
	}, []);

	const onNodeClick = (path: string) => {
		window.dispatchEvent(new CustomEvent('peak-prototype:node-click', {
			detail: { path },
		}));
	};

	const onLensChange = (lens: LensType) => {
		setActiveLens(lens);
		window.dispatchEvent(new CustomEvent('peak-prototype:lens-change', {
			detail: { lens },
		}));
	};

	return (
		<MultiLensGraph
			key={`${meta.graphId}-${viewportEpoch}`}
			graphData={graphData}
			defaultLens={activeLens}
			onNodeClick={onNodeClick}
			onLensChange={onLensChange}
			className={`prototype-real-multi-lens prototype-lens-${activeLens} pktw-h-full`}
			showControls
		/>
	);
}

const rootElement = document.getElementById('real-graph-root');
if (!rootElement) {
	throw new Error('Missing #real-graph-root mount point');
}

createRoot(rootElement).render(<RealGraphPrototype />);
