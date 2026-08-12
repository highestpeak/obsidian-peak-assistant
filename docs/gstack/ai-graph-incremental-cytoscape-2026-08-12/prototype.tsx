import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
	ArrowDown,
	ArrowRight,
	Check,
	CircleDotDashed,
	CirclePause,
	CirclePlay,
	Clock3,
	GitBranch,
	History,
	LayoutGrid,
	LocateFixed,
	Network,
	Pause,
	Play,
	Plus,
	RotateCcw,
	Search,
	ShieldCheck,
	Sparkles,
	Square,
	Trash2,
	Waypoints,
	Workflow,
	X,
} from 'lucide-react';
import {
	AtlasGraphCanvas,
} from '../../../src/ui/component/graph/AtlasGraphCanvas';
import type {
	AtlasGraphPreset,
} from '../../../src/ui/component/graph/AtlasGraphCanvas';
import type {
	ResultSubgraphOutput,
} from '../../../src/service/search/graph/resultSubgraph';

type RunMode = 'idle' | 'running' | 'paused' | 'layouting' | 'review' | 'accepted';
type PatchKind = 'inspect' | 'add-node' | 'focus' | 'add-relation' | 'update' | 'remove-relation' | 'remove-node' | 'validate' | 'auto-layout';
type LensId = 'topology' | 'thinking-tree' | 'bridge' | 'timeline' | 'gap-analysis';
type LensGenerationState = 'stable' | 'building' | 'ready' | 'refining';

interface PatchEvent {
	id: string;
	kind: PatchKind;
	title: string;
	detail: string;
	object: string;
}

const PATCHES: PatchEvent[] = [
	{
		id: 'inspect-sources',
		kind: 'inspect',
		title: 'Inspected changed sources',
		detail: '11 evidence anchors resolved against the frozen v12 source set.',
		object: '11 sources · hashes locked',
	},
	{
		id: 'add-provenance',
		kind: 'add-node',
		title: 'Added Claim provenance',
		detail: 'Placed in the nearest open upper-right slot without creating a relation.',
		object: '+ node · unlinked',
	},
	{
		id: 'add-benchmark',
		kind: 'add-node',
		title: 'Added Evaluation benchmark',
		detail: 'Reserved a separate upper slot; the Agent is still collecting concepts.',
		object: '+ node · unlinked',
	},
	{
		id: 'add-contradiction',
		kind: 'add-node',
		title: 'Added Contradiction check',
		detail: 'Placed left of the current topology, outside every occupied node box.',
		object: '+ node · unlinked',
	},
	{
		id: 'add-control-pair',
		kind: 'add-node',
		title: 'Placed two control nodes',
		detail: 'Source lineage and Human review loop occupy two clear lower slots.',
		object: '+ 2 nodes · still unlinked',
	},
	{
		id: 'add-orphan-hypothesis',
		kind: 'add-node',
		title: 'Added Orphan hypothesis',
		detail: 'The Agent deliberately keeps this candidate disconnected while checking evidence.',
		object: '+ node · no relation by design',
	},
	{
		id: 'add-observability',
		kind: 'add-node',
		title: 'Added Agent observability',
		detail: 'The next collision-free slot lies beyond the current right viewport.',
		object: '+ node · outside viewport',
	},
	{
		id: 'focus-observability',
		kind: 'focus',
		title: 'Focused the off-canvas node',
		detail: 'The camera pans without changing node coordinates or running layout.',
		object: 'focus · Agent observability',
	},
	{
		id: 'connect-evidence',
		kind: 'add-relation',
		title: 'Connected the evidence cluster',
		detail: 'Only now does the Agent draw provenance relations to validated endpoints.',
		object: '+ 2 relations',
	},
	{
		id: 'connect-evaluation',
		kind: 'add-relation',
		title: 'Connected the evaluation cluster',
		detail: 'Benchmark and contradiction nodes gain three directed relations.',
		object: '+ 3 relations',
	},
	{
		id: 'connect-controls',
		kind: 'add-relation',
		title: 'Connected control and observability',
		detail: 'Five relations connect lineage, review, provenance, observability, and GraphRAG.',
		object: '+ 5 relations',
	},
	{
		id: 'update-relation',
		kind: 'update',
		title: 'Refined a relation predicate',
		detail: '“supports” became “grounds” after comparing the source quotation.',
		object: '~ relation · predicate changed',
	},
	{
		id: 'remove-orphan',
		kind: 'remove-node',
		title: 'Removed the ungrounded hypothesis',
		detail: 'The disconnected candidate never entered the semantic diff.',
		object: '− transient node · reversible',
	},
	{
		id: 'remove-stale-path',
		kind: 'remove-relation',
		title: 'Detached the stale keyword path',
		detail: 'Two legacy relations and their node become a reviewable tombstone.',
		object: '− node · − 2 relations',
	},
	{
		id: 'validate-diff',
		kind: 'validate',
		title: 'Validated the five-view graph package',
		detail: 'Topology, tree, bridges, timeline, and gaps resolve against the same frozen sources.',
		object: '5 graphs · one run boundary',
	},
	{
		id: 'auto-layout',
		kind: 'auto-layout',
		title: 'Refined all generated views',
		detail: 'All five graph outputs are complete, so each can perform one intentional final layout.',
		object: '5 views · final refinement',
	},
];

const CURSOR_POINTS = [
	{ left: '24%', top: '32%' },
	{ left: '68%', top: '20%' },
	{ left: '44%', top: '17%' },
	{ left: '23%', top: '27%' },
	{ left: '76%', top: '75%' },
	{ left: '38%', top: '77%' },
	{ left: '106%', top: '28%' },
	{ left: '88%', top: '28%' },
	{ left: '64%', top: '38%' },
	{ left: '39%', top: '34%' },
	{ left: '85%', top: '59%' },
	{ left: '48%', top: '54%' },
	{ left: '38%', top: '77%' },
	{ left: '51%', top: '48%' },
	{ left: '78%', top: '18%' },
	{ left: '50%', top: '50%' },
];

const RUN_START_DELAY_MS = 650;
const DEFAULT_PATCH_DWELL_MS = 1100;
const RELATION_PATCH_DWELL_MS = 2200;
const EDGE_DRAW_DURATION_MS = 1050;
const EDGE_STAGGER_MS = 190;
const NODE_CORNER_PATCH_KINDS = new Set<PatchKind>(['add-node', 'remove-node', 'focus']);
const LENS_READY_STEPS: Record<LensId, number> = {
	topology: 11,
	'thinking-tree': 12,
	bridge: 13,
	timeline: 14,
	'gap-analysis': 15,
};

function lensGenerationProgress(lensId: LensId, step: number, mode: RunMode): number {
	if (mode === 'idle') return 100;
	if (mode === 'layouting' || mode === 'review' || mode === 'accepted') return 100;
	const readyAt = LENS_READY_STEPS[lensId];
	if (step >= readyAt) return 100;
	return Math.max(4, Math.round((Math.max(0, step) / readyAt) * 100));
}

function lensGenerationState(progress: number, mode: RunMode): LensGenerationState {
	if (mode === 'idle') return 'stable';
	if (mode === 'layouting') return 'refining';
	if (progress >= 100) return 'ready';
	return 'building';
}

const BASE_NODES: ResultSubgraphOutput['resultNodes'] = [
	{ id: 'graphrag', path: 'AI Graph/Concepts/GraphRAG.md', title: 'GraphRAG', score: 1, communityId: 'core', folder: 'Concepts', preview: 'Root concept · accepted', incomingLinks: 2, outgoingLinks: 3 },
	{ id: 'retrieval', path: 'AI Graph/Concepts/Retrieval augmented generation.md', title: 'Retrieval-augmented generation', score: .9, communityId: 'core', folder: 'Concepts', preview: 'Foundation · accepted', incomingLinks: 1, outgoingLinks: 2 },
	{ id: 'community', path: 'AI Graph/Methods/Community summarization.md', title: 'Community summarization', score: .82, communityId: 'methods', folder: 'Methods', preview: 'Method · accepted', incomingLinks: 1, outgoingLinks: 1 },
	{ id: 'global-search', path: 'AI Graph/Methods/Global search.md', title: 'Global search', score: .8, communityId: 'methods', folder: 'Methods', preview: 'Capability · accepted', incomingLinks: 2, outgoingLinks: 1 },
	{ id: 'evidence', path: 'AI Graph/Evidence/Evidence-linked graph.md', title: 'Evidence-linked graph', score: .78, communityId: 'evidence', folder: 'Evidence', preview: 'Evidence pattern · accepted', incomingLinks: 1, outgoingLinks: 2 },
	{ id: 'citations', path: 'AI Graph/Evidence/Citation-aware retrieval.md', title: 'Citation-aware retrieval', score: .7, communityId: 'evidence', folder: 'Evidence', preview: 'Claim · accepted', incomingLinks: 1, outgoingLinks: 0 },
	{ id: 'keyword', path: 'AI Graph/Legacy/Keyword-only clustering.md', title: 'Keyword-only clustering', score: .34, communityId: 'legacy', folder: 'Legacy', preview: 'Legacy branch · removal candidate', incomingLinks: 1, outgoingLinks: 1 },
];

const BASE_EDGES: ResultSubgraphOutput['edges'] = [
	{ from: 'graphrag', to: 'retrieval', kind: 'reference', directionality: 'directed' },
	{ from: 'graphrag', to: 'community', kind: 'reference', directionality: 'directed' },
	{ from: 'community', to: 'global-search', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'evidence', kind: 'reference', directionality: 'directed' },
	{ from: 'evidence', to: 'citations', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'keyword', kind: 'semantic', directionality: 'undirected', weight: .58 },
	{ from: 'keyword', to: 'community', kind: 'semantic', directionality: 'undirected', weight: .42 },
];

const STABLE_SUBGRAPH: ResultSubgraphOutput = {
	resultNodes: BASE_NODES.map((node) => ({ ...node })),
	hubAnchors: [],
	edges: BASE_EDGES.map((edge) => ({ ...edge })),
	isolatedDocIds: [],
	overflowCount: 0,
};

const FINAL_SUBGRAPH: ResultSubgraphOutput = {
	resultNodes: [
		...BASE_NODES.filter((node) => node.id !== 'keyword').map((node) => ({ ...node })),
		{
			id: 'provenance',
			path: 'AI Graph/Evidence/Claim provenance.md',
			title: 'Claim provenance',
			score: .92,
			communityId: 'evidence',
			folder: 'Evidence',
			preview: 'Accepted evidence concept',
			incomingLinks: 1,
			outgoingLinks: 3,
		},
		{
			id: 'benchmark',
			path: 'AI Graph/Evaluation/Evaluation benchmark.md',
			title: 'Evaluation benchmark',
			score: .88,
			communityId: 'evaluation',
			folder: 'Evaluation',
			preview: 'Accepted evaluation concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'contradiction',
			path: 'AI Graph/Evaluation/Contradiction check.md',
			title: 'Contradiction check',
			score: .84,
			communityId: 'evaluation',
			folder: 'Evaluation',
			preview: 'Accepted validation concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'source-lineage',
			path: 'AI Graph/Evidence/Source lineage.md',
			title: 'Source lineage',
			score: .9,
			communityId: 'evidence',
			folder: 'Evidence',
			preview: 'Accepted lineage concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'human-review',
			path: 'AI Graph/Controls/Human review loop.md',
			title: 'Human review loop',
			score: .86,
			communityId: 'controls',
			folder: 'Controls',
			preview: 'Accepted review control',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
		{
			id: 'agent-observability',
			path: 'AI Graph/Controls/Agent observability.md',
			title: 'Agent observability',
			score: .82,
			communityId: 'controls',
			folder: 'Controls',
			preview: 'Accepted observability concept',
			incomingLinks: 1,
			outgoingLinks: 1,
		},
	],
	hubAnchors: [],
	edges: [
		...BASE_EDGES.filter((edge) => edge.from !== 'keyword' && edge.to !== 'keyword').map((edge) => ({ ...edge })),
		{ from: 'evidence', to: 'provenance', kind: 'reference', directionality: 'directed' },
		{ from: 'provenance', to: 'citations', kind: 'reference', directionality: 'directed' },
		{ from: 'global-search', to: 'benchmark', kind: 'reference', directionality: 'directed' },
		{ from: 'benchmark', to: 'contradiction', kind: 'reference', directionality: 'directed' },
		{ from: 'contradiction', to: 'retrieval', kind: 'reference', directionality: 'directed' },
		{ from: 'evidence', to: 'source-lineage', kind: 'reference', directionality: 'directed' },
		{ from: 'source-lineage', to: 'provenance', kind: 'reference', directionality: 'directed' },
		{ from: 'provenance', to: 'human-review', kind: 'reference', directionality: 'directed' },
		{ from: 'human-review', to: 'agent-observability', kind: 'reference', directionality: 'directed' },
		{ from: 'agent-observability', to: 'graphrag', kind: 'reference', directionality: 'directed' },
	],
	isolatedDocIds: [],
	overflowCount: 0,
};

const COMMUNITY_SUMMARIES: NonNullable<ResultSubgraphOutput['communities']> = [
	{ id: 'core', displayLabel: 'Core model', fingerprint: 'mock-core', memberCount: 2, visibleMemberIds: ['graphrag', 'retrieval'], descriptors: [], internalReferenceCount: 1, analysisVersion: 1, analysisMode: 'exact', analyzedNodeCount: 2, totalNodeCount: 2, representativeNotes: [] },
	{ id: 'methods', displayLabel: 'Search methods', fingerprint: 'mock-methods', memberCount: 2, visibleMemberIds: ['community', 'global-search'], descriptors: [], internalReferenceCount: 1, analysisVersion: 1, analysisMode: 'exact', analyzedNodeCount: 2, totalNodeCount: 2, representativeNotes: [] },
	{ id: 'evidence', displayLabel: 'Evidence system', fingerprint: 'mock-evidence', memberCount: 4, visibleMemberIds: ['evidence', 'citations', 'provenance', 'source-lineage'], descriptors: [], internalReferenceCount: 3, analysisVersion: 1, analysisMode: 'exact', analyzedNodeCount: 4, totalNodeCount: 4, representativeNotes: [] },
	{ id: 'evaluation', displayLabel: 'Evaluation', fingerprint: 'mock-evaluation', memberCount: 2, visibleMemberIds: ['benchmark', 'contradiction'], descriptors: [], internalReferenceCount: 1, analysisVersion: 1, analysisMode: 'exact', analyzedNodeCount: 2, totalNodeCount: 2, representativeNotes: [] },
	{ id: 'controls', displayLabel: 'Human control', fingerprint: 'mock-controls', memberCount: 2, visibleMemberIds: ['human-review', 'agent-observability'], descriptors: [], internalReferenceCount: 1, analysisVersion: 1, analysisMode: 'exact', analyzedNodeCount: 2, totalNodeCount: 2, representativeNotes: [] },
];

const ALL_NODE_IDS = FINAL_SUBGRAPH.resultNodes.map((node) => node.id);

function buildLensSubgraph(
	edges: ResultSubgraphOutput['edges'],
	options: {
		nodeIds?: string[];
		titlePrefixById?: Record<string, string>;
		previewById?: Record<string, string>;
	} = {},
): ResultSubgraphOutput {
	const nodeIds = options.nodeIds ?? ALL_NODE_IDS;
	const visibleIds = new Set(nodeIds);
	const visibleEdges = edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
	const connectedIds = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]));
	const resultNodes = FINAL_SUBGRAPH.resultNodes
		.filter((node) => visibleIds.has(node.id))
		.map((node) => ({
			...node,
			title: `${options.titlePrefixById?.[node.id] ?? ''}${node.title}`,
			preview: options.previewById?.[node.id] ?? node.preview,
		}));
	const communities = COMMUNITY_SUMMARIES
		.map((community) => ({
			...community,
			visibleMemberIds: community.visibleMemberIds.filter((id) => visibleIds.has(id)),
		}))
		.filter((community) => community.visibleMemberIds.length > 0);
	return {
		resultNodes,
		hubAnchors: [],
		edges: visibleEdges,
		isolatedDocIds: nodeIds.filter((id) => !connectedIds.has(id)),
		overflowCount: 0,
		communities,
	};
}

const TOPOLOGY_SUBGRAPH = buildLensSubgraph(FINAL_SUBGRAPH.edges);

const THINKING_TREE_SUBGRAPH = buildLensSubgraph([
	{ from: 'graphrag', to: 'retrieval', kind: 'reference', directionality: 'directed' },
	{ from: 'graphrag', to: 'community', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'evidence', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'benchmark', kind: 'reference', directionality: 'directed' },
	{ from: 'community', to: 'global-search', kind: 'reference', directionality: 'directed' },
	{ from: 'evidence', to: 'provenance', kind: 'reference', directionality: 'directed' },
	{ from: 'evidence', to: 'source-lineage', kind: 'reference', directionality: 'directed' },
	{ from: 'provenance', to: 'citations', kind: 'reference', directionality: 'directed' },
	{ from: 'provenance', to: 'human-review', kind: 'reference', directionality: 'directed' },
	{ from: 'benchmark', to: 'contradiction', kind: 'reference', directionality: 'directed' },
	{ from: 'human-review', to: 'agent-observability', kind: 'reference', directionality: 'directed' },
]);

const BRIDGE_SUBGRAPH = buildLensSubgraph([
	{ from: 'graphrag', to: 'retrieval', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'evidence', kind: 'semantic', directionality: 'directed', weight: .84 },
	{ from: 'community', to: 'global-search', kind: 'reference', directionality: 'directed' },
	{ from: 'global-search', to: 'benchmark', kind: 'semantic', directionality: 'directed', weight: .68 },
	{ from: 'source-lineage', to: 'provenance', kind: 'reference', directionality: 'directed' },
	{ from: 'provenance', to: 'human-review', kind: 'semantic', directionality: 'directed', weight: .79 },
	{ from: 'human-review', to: 'agent-observability', kind: 'reference', directionality: 'directed' },
], {
	nodeIds: ['graphrag', 'retrieval', 'evidence', 'community', 'global-search', 'benchmark', 'source-lineage', 'provenance', 'human-review', 'agent-observability'],
	titlePrefixById: {
		'global-search': 'Bridge · ',
		provenance: 'Bridge · ',
		retrieval: 'Bridge · ',
	},
	previewById: {
		'global-search': 'Bridge · Methods → Evaluation',
		provenance: 'Bridge · Evidence → Control',
		'retrieval': 'Bridge · Core → Evidence',
	},
});

const TIMELINE_SUBGRAPH = buildLensSubgraph([
	{ from: 'graphrag', to: 'retrieval', kind: 'reference', directionality: 'directed' },
	{ from: 'retrieval', to: 'community', kind: 'reference', directionality: 'directed' },
	{ from: 'community', to: 'global-search', kind: 'reference', directionality: 'directed' },
	{ from: 'evidence', to: 'citations', kind: 'reference', directionality: 'directed' },
	{ from: 'citations', to: 'source-lineage', kind: 'reference', directionality: 'directed' },
	{ from: 'source-lineage', to: 'provenance', kind: 'reference', directionality: 'directed' },
	{ from: 'benchmark', to: 'contradiction', kind: 'reference', directionality: 'directed' },
	{ from: 'contradiction', to: 'human-review', kind: 'reference', directionality: 'directed' },
	{ from: 'human-review', to: 'agent-observability', kind: 'reference', directionality: 'directed' },
], {
	titlePrefixById: {
		graphrag: 'Jan · ', retrieval: 'Feb · ', community: 'Mar · ', 'global-search': 'Apr · ',
		evidence: 'May · ', citations: 'Jun · ', 'source-lineage': 'Jul · ', provenance: 'Aug · ',
		benchmark: 'Sep · ', contradiction: 'Oct · ', 'human-review': 'Nov · ', 'agent-observability': 'Dec · ',
	},
});

const GAP_SUBGRAPH: ResultSubgraphOutput = {
	resultNodes: [
		{ id: 'gap-core', path: 'ai-graph://community/core', title: 'Core model · 2 concepts', score: .66, communityId: null, folder: '', preview: 'Source community' },
		{ id: 'gap-core-evaluation', path: 'ai-graph://gap/core-evaluation', title: 'Missing bridge · 0.82', score: 1, communityId: null, folder: '', preview: 'No direct relation despite strong semantic potential' },
		{ id: 'gap-evaluation', path: 'ai-graph://community/evaluation', title: 'Evaluation · 2 concepts', score: .66, communityId: null, folder: '', preview: 'Target community' },
		{ id: 'gap-evidence', path: 'ai-graph://community/evidence', title: 'Evidence system · 4 concepts', score: .66, communityId: null, folder: '', preview: 'Source community' },
		{ id: 'gap-evidence-control', path: 'ai-graph://gap/evidence-control', title: 'Weak bridge · 0.67', score: .82, communityId: null, folder: '', preview: 'One fragile relation needs stronger evidence' },
		{ id: 'gap-control', path: 'ai-graph://community/control', title: 'Human control · 2 concepts', score: .66, communityId: null, folder: '', preview: 'Target community' },
		{ id: 'gap-methods', path: 'ai-graph://community/methods', title: 'Search methods · 2 concepts', score: .66, communityId: null, folder: '', preview: 'Source community' },
		{ id: 'gap-methods-evidence', path: 'ai-graph://gap/methods-evidence', title: 'Latent connection · 0.58', score: .71, communityId: null, folder: '', preview: 'Related evidence exists but no relationship is modeled' },
		{ id: 'gap-evidence-target', path: 'ai-graph://community/evidence', title: 'Evidence system · 4 concepts', score: .66, communityId: null, folder: '', preview: 'Target community' },
	],
	hubAnchors: [],
	edges: [
		{ from: 'gap-core', to: 'gap-core-evaluation', kind: 'semantic', directionality: 'undirected', weight: .82 },
		{ from: 'gap-core-evaluation', to: 'gap-evaluation', kind: 'semantic', directionality: 'undirected', weight: .82 },
		{ from: 'gap-evidence', to: 'gap-evidence-control', kind: 'semantic', directionality: 'undirected', weight: .67 },
		{ from: 'gap-evidence-control', to: 'gap-control', kind: 'semantic', directionality: 'undirected', weight: .67 },
		{ from: 'gap-methods', to: 'gap-methods-evidence', kind: 'semantic', directionality: 'undirected', weight: .58 },
		{ from: 'gap-methods-evidence', to: 'gap-evidence-target', kind: 'semantic', directionality: 'undirected', weight: .58 },
	],
	isolatedDocIds: [],
	overflowCount: 0,
};

interface LensDefinition {
	id: LensId;
	label: string;
	defaultPreset: AtlasGraphPreset;
	layouts: AtlasGraphPreset[];
	fixedViewLabel?: string;
	summary: string;
	description: string;
	question: string;
	subgraph: ResultSubgraphOutput;
}

const LENSES: LensDefinition[] = [
	{ id: 'topology', label: 'Topology', defaultPreset: 'constellation', layouts: ['constellation', 'flow-lr', 'flow-tb'], summary: '12 nodes · 15 relations', description: 'Complete relation structure · switch between spatial and directional readings', question: 'How is this knowledge connected?', subgraph: TOPOLOGY_SUBGRAPH },
	{ id: 'thinking-tree', label: 'Thinking Tree', defaultPreset: 'flow-lr', layouts: ['flow-lr'], summary: '12 concepts · 11 branches', description: 'Derivation hierarchy · one horizontal reasoning tree', question: 'How did the reasoning branch?', subgraph: THINKING_TREE_SUBGRAPH },
	{ id: 'bridge', label: 'Bridges', defaultPreset: 'flow-lr', layouts: ['flow-lr', 'constellation'], summary: '3 bridges · 7 relations', description: 'Cross-domain paths · every highlighted concept joins two named knowledge areas', question: 'Which concepts connect otherwise separate domains?', subgraph: BRIDGE_SUBGRAPH },
	{ id: 'timeline', label: 'Timeline', defaultPreset: 'flow-lr', layouts: ['flow-lr'], summary: '3 lanes · 12 dated concepts', description: 'Chronological wrappers follow three left-to-right Cytoscape chains', question: 'How did the model evolve over time?', subgraph: TIMELINE_SUBGRAPH },
	{ id: 'gap-analysis', label: 'Gaps', defaultPreset: 'flow-lr', layouts: ['flow-lr'], fixedViewLabel: 'Gap map', summary: '3 structural gaps', description: 'Missing or fragile relationships with enough semantic potential to investigate', question: 'Where is knowledge missing or weakly connected?', subgraph: GAP_SUBGRAPH },
];

const LAYOUT_OPTIONS: Array<{ id: AtlasGraphPreset; label: string; detail: string }> = [
	{ id: 'constellation', label: 'Constellation', detail: 'Force cluster' },
	{ id: 'flow-lr', label: 'Flow →', detail: 'Left to right' },
	{ id: 'flow-tb', label: 'Flow ↓', detail: 'Top to bottom' },
];

function LensGlyph({ id }: { id: LensId }): React.ReactElement {
	if (id === 'thinking-tree') return <GitBranch aria-hidden />;
	if (id === 'bridge') return <Waypoints aria-hidden />;
	if (id === 'timeline') return <Clock3 aria-hidden />;
	if (id === 'gap-analysis') return <CircleDotDashed aria-hidden />;
	return <Network aria-hidden />;
}

function LayoutGlyph({ id }: { id: AtlasGraphPreset }): React.ReactElement {
	if (id === 'flow-tb') return <ArrowDown aria-hidden />;
	if (id === 'flow-lr') return <ArrowRight aria-hidden />;
	return <LayoutGrid aria-hidden />;
}

const TIMELINE_LANES = [
	{ label: 'Foundation', range: 'Jan – Apr', tone: 'violet' },
	{ label: 'Evidence', range: 'May – Aug', tone: 'blue' },
	{ label: 'Control', range: 'Sep – Dec', tone: 'green' },
] as const;

function TimelineBackdrop(): React.ReactElement {
	return (
		<div className="aig-timeline-backdrop" aria-hidden>
			<div className="aig-projection-note"><Clock3 /><span><strong>2026 · knowledge evolution</strong><small>The graph edge is the timeline; each wrapper follows one dated chain.</small></span></div>
			{TIMELINE_LANES.map((lane) => (
				<div key={lane.label} className={`aig-timeline-lane is-${lane.tone}`}>
					<div className="aig-timeline-lane__label"><strong>{lane.label}</strong><span>{lane.range}</span></div>
				</div>
			))}
		</div>
	);
}

const BRIDGE_LANES = [
	{ label: 'Core → Evidence', detail: 'Retrieval carries the model into grounded evidence' },
	{ label: 'Methods → Evaluation', detail: 'Global search connects a method to its benchmark' },
	{ label: 'Evidence → Control', detail: 'Claim provenance creates a reviewable control path' },
] as const;

function BridgeBackdrop(): React.ReactElement {
	return (
		<div className="aig-bridge-backdrop" aria-hidden>
			<div className="aig-projection-note"><Waypoints /><span><strong>3 bridge concepts</strong><small>A bridge is the middle concept that joins two otherwise separate domains.</small></span></div>
			{BRIDGE_LANES.map((lane) => <div key={lane.label} className="aig-bridge-lane"><strong>{lane.label}</strong><span>{lane.detail}</span></div>)}
		</div>
	);
}

const GAP_LANES = [
	{ label: 'Missing bridge', detail: '0 direct links · semantic potential 0.82', tone: 'missing' },
	{ label: 'Weak bridge', detail: '1 fragile link · confidence 0.67', tone: 'weak' },
	{ label: 'Latent connection', detail: 'Related evidence exists · score 0.58', tone: 'latent' },
] as const;

function GapBackdrop(): React.ReactElement {
	return (
		<div className="aig-gap-backdrop" aria-hidden>
			<div className="aig-projection-note"><CircleDotDashed /><span><strong>3 structural gaps</strong><small>A gap is a meaningful missing or fragile relationship—not empty canvas space.</small></span></div>
			{GAP_LANES.map((lane) => <div key={lane.label} className={`aig-gap-lane is-${lane.tone}`}><strong>{lane.label}</strong><span>{lane.detail}</span></div>)}
		</div>
	);
}

interface LensProjectionCanvasProps {
	lens: LensDefinition;
	preset: AtlasGraphPreset;
	progress?: number;
	variant: 'stable' | 'live' | 'final';
	onNodeTap: (nodeId: string) => void;
}

function LensProjectionCanvas({ lens, preset, progress = 100, variant, onNodeTap }: LensProjectionCanvasProps): React.ReactElement {
	const generationState = variant === 'live' ? lensGenerationState(progress, 'running') : 'stable';
	const projectionClass = `${lens.id === 'timeline' ? ' is-timeline-projection' : ''}${lens.id === 'bridge' && preset === 'flow-lr' ? ' is-bridge-projection' : ''}${lens.id === 'gap-analysis' ? ' is-gap-projection' : ''}`;
	const summary = variant === 'live' ? `${progress}% · ${lens.summary}` : variant === 'stable' ? `v12 · ${lens.summary}` : lens.summary;
	const radialGeneration = preset === 'constellation';
	const style = {
		'--aig-generation-progress': `${progress}%`,
		'--aig-generation-radius': `${Math.max(10, Math.round(progress * .7))}%`,
	} as React.CSSProperties;
	return (
		<div
			className={`aig-graph-layer aig-graph-layer--${variant}${projectionClass}${variant === 'live' && progress < 100 ? ' is-building' : ''}`}
			style={style}
		>
			{lens.id === 'timeline' && <TimelineBackdrop />}
			{lens.id === 'bridge' && preset === 'flow-lr' && <BridgeBackdrop />}
			{lens.id === 'gap-analysis' && <GapBackdrop />}
			<AtlasGraphCanvas
				subgraph={lens.subgraph}
				preset={preset}
				showSemantic
				summary={summary}
				emptyLabel="No graph objects"
				buildingLabel={`Building ${lens.label}…`}
				onNodeTap={(node) => onNodeTap(node.id)}
			/>
			{variant === 'live' && (
				<>
					<div className={`aig-projection-run-chip is-${generationState}`} role="status" aria-live="polite">
						{generationState === 'ready' ? <Check aria-hidden /> : <span className="aig-projection-run-chip__pulse" />}
						<span>
							<strong>{generationState === 'ready' ? `${lens.label} draft ready` : `Generating ${lens.label} · ${progress}%`}</strong>
							<small>{generationState === 'ready' ? 'This graph is ready; the same run continues building the other views.' : 'One run is building all 5 graphs · coordinates stay fixed while content appears.'}</small>
						</span>
					</div>
					{progress < 100 && <div className={`aig-projection-pending-mask${radialGeneration ? ' is-radial' : ''}`} aria-hidden />}
					{progress < 100 && !radialGeneration && <div className="aig-projection-front" aria-hidden><span /></div>}
				</>
			)}
		</div>
	);
}

interface WorkingOverlayProps {
	hidden: boolean;
	step: number;
}

interface AddedEdgeProps {
	d: string;
	delayMs?: number;
}

function AddedEdge({ d, delayMs = 0 }: AddedEdgeProps): React.ReactElement {
	const bodyRef = useRef<SVGPathElement | null>(null);
	const headRef = useRef<SVGPathElement | null>(null);

	useLayoutEffect(() => {
		const body = bodyRef.current;
		const head = headRef.current;
		if (!body || !head) return;

		const pathLength = head.getTotalLength();
		const sampleCount = Math.max(32, Math.ceil(pathLength / 4));
		const sampledPoints = Array.from({ length: sampleCount + 1 }, (_, index) => (
			head.getPointAtLength((pathLength * index) / sampleCount)
		));
		const startPoint = sampledPoints[0];
		body.removeAttribute('stroke-dasharray');
		body.removeAttribute('stroke-dashoffset');
		body.setAttribute('d', `M ${startPoint.x} ${startPoint.y}`);
		body.style.opacity = '0';
		head.style.opacity = '0';

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			body.setAttribute('d', d);
			body.style.opacity = '1';
			head.style.opacity = '1';
			return;
		}

		const startAt = performance.now() + delayMs;
		let frameId = 0;
		const drawFrame = (now: number): void => {
			if (now < startAt) {
				frameId = window.requestAnimationFrame(drawFrame);
				return;
			}

			const progress = Math.min(1, (now - startAt) / EDGE_DRAW_DURATION_MS);
			const easedProgress = progress * progress * (3 - (2 * progress));
			const completedSampleCount = Math.max(1, Math.floor(easedProgress * sampleCount));
			const partialPoints = sampledPoints.slice(0, completedSampleCount + 1);
			const partialPath = partialPoints
				.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
				.join(' ');
			body.setAttribute('d', partialPath);
			body.style.opacity = `${Math.min(1, .22 + (progress * 3))}`;

			if (progress < 1) {
				frameId = window.requestAnimationFrame(drawFrame);
				return;
			}

			body.setAttribute('d', d);
			body.style.opacity = '1';
			head.style.opacity = '1';
		};
		frameId = window.requestAnimationFrame(drawFrame);

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	}, [d, delayMs]);

	return (
		<>
			<path ref={bodyRef} className="aig-overlay-edge is-added" d={d} />
			<path ref={headRef} className="aig-overlay-edge-head" d={d} />
		</>
	);
}

interface ProposalNodeProps {
	className: string;
	connected: boolean;
	meta: string;
	title: string;
	tombstone?: boolean;
}

function ProposalNode({ className, connected, meta, title, tombstone = false }: ProposalNodeProps): React.ReactElement {
	return (
		<div className={`aig-overlay-node ${className}${connected ? ' is-linked' : ' is-unlinked'}${tombstone ? ' is-tombstone' : ''}`}>
			<span>{tombstone ? 'REMOVAL PROPOSED' : connected ? 'CONNECTED NODE' : 'PLACED · UNLINKED'}</span>
			<strong>{title}</strong>
			<small>{tombstone ? 'Transient candidate · excluded from diff' : meta}</small>
		</div>
	);
}

function WorkingOverlay({ hidden, step }: WorkingOverlayProps): React.ReactElement {
	const showProvenance = step >= 2;
	const showBenchmark = step >= 3;
	const showContradiction = step >= 4;
	const showControlPair = step >= 5;
	const showOrphan = step >= 6;
	const showObservability = step >= 7;
	const showFocus = step >= 8;
	const showEvidenceRelations = step >= 9;
	const showEvaluationRelations = step >= 10;
	const showControlRelations = step >= 11;
	const showRelationUpdate = step >= 12;
	const removeOrphan = step >= 13;
	const removeKeyword = step >= 14;
	const stagedNodeCount = Math.min(7, Math.max(0, step - 1));

	return (
		<div className={`aig-working-overlay${hidden ? ' is-refined-away' : ''}`} aria-hidden="true">
			<svg className="aig-overlay-edges" viewBox="0 0 1000 620" preserveAspectRatio="none">
				<defs>
					<marker id="aig-arrow-added" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
						<path d="M0,0 L7,3.5 L0,7 Z" />
					</marker>
				</defs>
				{showEvidenceRelations && (
					<>
						<AddedEdge d="M555 332 C585 270 620 205 642 151" />
						<AddedEdge d="M756 124 C800 178 805 270 760 332" delayMs={EDGE_STAGGER_MS} />
					</>
				)}
				{showEvaluationRelations && (
					<>
						<AddedEdge d="M920 305 C785 190 625 118 516 106" />
						<AddedEdge d="M364 106 C344 122 325 145 306 159" delayMs={EDGE_STAGGER_MS} />
						<AddedEdge d="M232 194 C238 245 255 286 275 326" delayMs={EDGE_STAGGER_MS * 2} />
					</>
				)}
				{showControlRelations && (
					<>
						<AddedEdge d="M555 350 C600 396 625 440 644 465" />
						<AddedEdge d="M720 438 C720 324 710 230 700 151" delayMs={EDGE_STAGGER_MS} />
						<AddedEdge d="M720 151 C800 225 850 332 875 412" delayMs={EDGE_STAGGER_MS * 2} />
						<AddedEdge d="M956 440 C995 345 1005 250 984 190" delayMs={EDGE_STAGGER_MS * 3} />
						<AddedEdge d="M984 174 C835 65 330 72 92 306" delayMs={EDGE_STAGGER_MS * 4} />
					</>
				)}
				{removeKeyword && (
					<>
						<path className="aig-overlay-edge is-removing" d="M360 318 C400 316 430 306 460 300" />
						<path className="aig-overlay-edge is-removing is-delay" d="M555 299 C595 298 630 291 655 286" />
					</>
				)}
			</svg>

			{showProvenance && (
				<ProposalNode className="aig-overlay-node--provenance" connected={showEvidenceRelations} title="Claim provenance" meta="Evidence · confidence 0.92" />
			)}
			{showBenchmark && (
				<ProposalNode className="aig-overlay-node--benchmark" connected={showEvaluationRelations} title="Evaluation benchmark" meta="Evaluation · confidence 0.88" />
			)}
			{showContradiction && (
				<ProposalNode className="aig-overlay-node--contradiction" connected={showEvaluationRelations} title="Contradiction check" meta="Validation · confidence 0.84" />
			)}
			{showControlPair && (
				<>
					<ProposalNode className="aig-overlay-node--lineage" connected={showControlRelations} title="Source lineage" meta="Evidence · confidence 0.90" />
					<ProposalNode className="aig-overlay-node--review" connected={showControlRelations} title="Human review loop" meta="Control · confidence 0.86" />
				</>
			)}
			{showOrphan && (
				<ProposalNode className="aig-overlay-node--orphan" connected={false} tombstone={removeOrphan} title="Orphan hypothesis" meta="Hypothesis · evidence pending" />
			)}
			{showObservability && (
				<ProposalNode className="aig-overlay-node--observability" connected={showControlRelations} title="Agent observability" meta="Control · confidence 0.82" />
			)}
			{showRelationUpdate && (
				<div className="aig-relation-update"><GitBranch aria-hidden /><span>supports</span><b>grounds</b></div>
			)}
			{showProvenance && !showEvidenceRelations && (
				<div className="aig-placement-batch"><Plus aria-hidden /><span><strong>{stagedNodeCount} staged nodes</strong><small>0 relations · placement first</small></span></div>
			)}
			{showFocus && (
				<div className="aig-focus-chip"><LocateFixed aria-hidden /><span>Focused · Agent observability</span></div>
			)}
			{removeKeyword && (
				<div className="aig-tombstone is-node-removal">
					<Trash2 aria-hidden />
					<span><strong>Keyword-only clustering</strong><small>Node + 2 relations · original position retained</small></span>
				</div>
			)}
		</div>
	);
}

function patchIcon(kind: PatchKind): React.ReactNode {
	if (kind === 'add-node' || kind === 'add-relation') return <Plus aria-hidden />;
	if (kind === 'remove-node' || kind === 'remove-relation') return <Trash2 aria-hidden />;
	if (kind === 'focus') return <LocateFixed aria-hidden />;
	if (kind === 'auto-layout') return <Workflow aria-hidden />;
	if (kind === 'validate') return <ShieldCheck aria-hidden />;
	if (kind === 'update') return <GitBranch aria-hidden />;
	return <Search aria-hidden />;
}

function modeLabel(mode: RunMode, readyViewCount: number): string {
	if (mode === 'running') return `${readyViewCount}/5 graph views ready · generating`;
	if (mode === 'paused') return `${readyViewCount}/5 graph views ready · paused`;
	if (mode === 'layouting') return 'Refining 5 generated graph views';
	if (mode === 'review') return '5 graph views ready for review';
	if (mode === 'accepted') return 'Version v13 created · 5 graph views';
	return 'Version v12 · 5 graph views';
}

function Prototype(): React.ReactElement {
	const [mode, setMode] = useState<RunMode>('idle');
	const [patchIndex, setPatchIndex] = useState(-1);
	const [activityOpen, setActivityOpen] = useState(false);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [activeLensId, setActiveLensId] = useState<LensId>('topology');
	const [layoutOverride, setLayoutOverride] = useState<AtlasGraphPreset | null>(null);
	const startedOnce = useRef(false);
	const currentPatchRef = useRef<HTMLDivElement | null>(null);
	const initialRunTimerRef = useRef<number | null>(null);

	const accepted = mode === 'accepted';
	const refined = mode === 'layouting' || mode === 'review' || accepted;
	const activeLens = LENSES.find((lens) => lens.id === activeLensId) ?? LENSES[0];
	const effectivePreset = layoutOverride ?? activeLens.defaultPreset;
	const activeLayout = LAYOUT_OPTIONS.find((layout) => layout.id === effectivePreset) ?? LAYOUT_OPTIONS[0];
	const availableLayouts = activeLens.layouts
		.map((preset) => LAYOUT_OPTIONS.find((layout) => layout.id === preset))
		.filter((layout): layout is (typeof LAYOUT_OPTIONS)[number] => Boolean(layout));
	const activeLayoutLabel = activeLens.fixedViewLabel ?? activeLayout.label;
	const visibleStep = refined ? PATCHES.length : patchIndex + 1;
	const lensProgressById = Object.fromEntries(LENSES.map((lens) => [
		lens.id,
		lensGenerationProgress(lens.id, visibleStep, mode),
	])) as Record<LensId, number>;
	const activeLensProgress = lensProgressById[activeLens.id];
	const readyViewCount = LENSES.filter((lens) => lensProgressById[lens.id] >= 100).length;
	const liveRun = mode === 'running' || mode === 'paused';
	const activePatch = patchIndex >= 0 ? PATCHES[Math.min(patchIndex, PATCHES.length - 1)] : null;
	const anchorAgentToNodeCorner = activePatch ? NODE_CORNER_PATCH_KINDS.has(activePatch.kind) : false;
	const cursor = CURSOR_POINTS[Math.max(0, Math.min(patchIndex, CURSOR_POINTS.length - 1))] ?? CURSOR_POINTS[0];
	const focusOverflow = visibleStep >= 8 && !refined;
	const visibleNodeCount = BASE_NODES.length
		+ (visibleStep >= 2 ? 1 : 0)
		+ (visibleStep >= 3 ? 1 : 0)
		+ (visibleStep >= 4 ? 1 : 0)
		+ (visibleStep >= 5 ? 2 : 0)
		+ (visibleStep >= 6 ? 1 : 0)
		+ (visibleStep >= 7 ? 1 : 0)
		- (visibleStep >= 13 ? 1 : 0)
		- (visibleStep >= 14 ? 1 : 0);
	const visibleRelationCount = BASE_EDGES.length
		+ (visibleStep >= 9 ? 2 : 0)
		+ (visibleStep >= 10 ? 3 : 0)
		+ (visibleStep >= 11 ? 5 : 0)
		- (visibleStep >= 14 ? 2 : 0);

	const startRun = (): void => {
		setMode('running');
		setPatchIndex(-1);
		setActivityOpen(false);
		setSelectedNode(null);
	};

	useEffect(() => {
		if (startedOnce.current) return;
		startedOnce.current = true;
		initialRunTimerRef.current = window.setTimeout(() => {
			initialRunTimerRef.current = null;
			startRun();
		}, RUN_START_DELAY_MS);
		return () => {
			if (initialRunTimerRef.current !== null) window.clearTimeout(initialRunTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (mode !== 'running') return;
		if (patchIndex >= PATCHES.length - 1) {
			const layoutTimer = window.setTimeout(() => setMode('layouting'), 700);
			return () => window.clearTimeout(layoutTimer);
		}
		let dwellMs = DEFAULT_PATCH_DWELL_MS;
		if (patchIndex < 0) dwellMs = RUN_START_DELAY_MS;
		if (activePatch?.kind === 'add-relation') dwellMs = RELATION_PATCH_DWELL_MS;
		const timer = window.setTimeout(() => setPatchIndex((current) => current + 1), dwellMs);
		return () => window.clearTimeout(timer);
	}, [mode, patchIndex]);

	useEffect(() => {
		if (mode !== 'layouting') return;
		const reviewTimer = window.setTimeout(() => {
			setMode('review');
		}, 1650);
		return () => window.clearTimeout(reviewTimer);
	}, [mode]);

	useEffect(() => {
		currentPatchRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [activityOpen, mode, patchIndex]);

	const togglePause = (): void => {
		setMode((current) => current === 'paused' ? 'running' : 'paused');
	};

	const skipToFinalGraph = (): void => {
		setPatchIndex(PATCHES.length - 1);
		setMode('layouting');
	};

	const discard = (): void => {
		setMode('idle');
		setPatchIndex(-1);
		setActivityOpen(false);
	};

	const selectLens = (lensId: LensId): void => {
		setActiveLensId(lensId);
		setLayoutOverride(null);
		setSelectedNode(null);
	};

	const selectLayout = (preset: AtlasGraphPreset): void => {
		setLayoutOverride(preset);
		setSelectedNode(null);
	};

	const moveLayoutFocus = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		const segments = Array.from(
			event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.aig-layout-segment') ?? [],
		);
		if (segments.length === 0) return;
		event.preventDefault();
		const currentIndex = Math.max(0, segments.indexOf(event.currentTarget));
		let nextIndex = currentIndex;
		if (event.key === 'Home') nextIndex = 0;
		if (event.key === 'End') nextIndex = segments.length - 1;
		if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + segments.length) % segments.length;
		if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % segments.length;
		const next = segments[nextIndex];
		const nextPreset = next?.dataset.layoutId as AtlasGraphPreset | undefined;
		if (!next || !nextPreset) return;
		next.focus();
		selectLayout(nextPreset);
	};

	return (
		<div className="aig-mock peak-design-root">
			<header className="aig-topbar">
				<div className="aig-brand">
					<div className="aig-brandmark"><Sparkles aria-hidden /></div>
					<div>
						<span className="aig-eyebrow">PEAK AI GRAPH</span>
						<span className="aig-title">GraphRAG research map</span>
					</div>
					<span className="aig-version">{accepted ? 'v13' : 'v12'}</span>
				</div>
				<div className={`aig-status aig-status--${mode}`}>
					<span className="aig-status__dot" />
					{modeLabel(mode, readyViewCount)}
				</div>
				<div className="aig-actions">
					<button className="aig-btn aig-btn--ghost" type="button"><History aria-hidden /> History</button>
					<button className={`aig-btn aig-btn--ghost aig-activity-trigger${activityOpen ? ' is-active' : ''}`} type="button" onClick={() => setActivityOpen((current) => !current)}>
						<Workflow aria-hidden /> Activity <span>{Math.max(0, patchIndex + 1)}</span>
					</button>
					<button className="aig-btn aig-btn--primary" type="button" onClick={startRun} disabled={mode === 'running' || mode === 'layouting'}>
						<RotateCcw aria-hidden /> Replay run
					</button>
				</div>
			</header>

			<section className="aig-instruction">
				<div className="aig-instruction__icon"><Sparkles aria-hidden /></div>
				<div className="aig-instruction__copy">
					<span className="aig-instruction__label">Update instruction</span>
					<span>Generate Topology, Thinking Tree, Bridges, Timeline, and Gaps from the same evidence set. Keep uncertain concepts disconnected until grounded.</span>
				</div>
				<div className="aig-context-chip">v12 frozen base</div>
				<div className="aig-context-chip">11 sources</div>
				<div className="aig-context-chip">5 graph views</div>
			</section>

			<main className={`aig-workspace${activityOpen ? ' is-activity-open' : ''}`}>
				<section className="aig-canvas-card">
					<div className="aig-canvas-toolbar">
						<div className="aig-lens-tabs" role="tablist" aria-label="Graph lens">
							{LENSES.map((lens) => (
								<button
									key={lens.id}
									className={`aig-lens-tab${lens.id === activeLens.id ? ' is-active' : ''}`}
									type="button"
									role="tab"
									aria-selected={lens.id === activeLens.id}
									title={lens.question}
									onClick={() => selectLens(lens.id)}
								>
									<LensGlyph id={lens.id} />
									{lens.label}
									{mode !== 'idle' && (
										<span
											className={`aig-lens-run-state is-${lensGenerationState(lensProgressById[lens.id], mode)}`}
											aria-label={`${lens.label} ${lensProgressById[lens.id]} percent generated`}
										>
											{lensProgressById[lens.id] >= 100 ? <Check aria-hidden /> : lensProgressById[lens.id]}
										</span>
									)}
								</button>
							))}
						</div>
						<div className="aig-canvas-toolbar__end">
							{!refined && activeLens.id === 'topology' && (
								<div className="aig-live-legend">
									<span className="aig-spatial-lock">{focusOverflow ? <><LocateFixed aria-hidden /> Following newest</> : <><ShieldCheck aria-hidden /> Spatial lock</>}</span>
									<span><i className="is-existing" /> Existing</span>
									<span><i className="is-added" /> Added</span>
									<span><i className="is-removed" /> Removal</span>
								</div>
							)}
							{liveRun && activeLens.id !== 'topology' && (
								<div className="aig-active-projection-status"><Workflow aria-hidden /><span>{activeLensProgress}% generated</span></div>
							)}
							{availableLayouts.length > 1 ? (
								<div className="aig-layout-switcher">
									<span className="aig-layout-label">Layout</span>
									<div className="aig-layout-segments" role="tablist" aria-label={`${activeLens.label} layout`}>
										{availableLayouts.map((layout) => (
											<button
												key={layout.id}
												className={`aig-layout-segment${effectivePreset === layout.id ? ' is-active' : ''}`}
												type="button"
												role="tab"
												aria-selected={effectivePreset === layout.id}
												tabIndex={effectivePreset === layout.id ? 0 : -1}
												data-layout-id={layout.id}
												title={`${layout.label} · ${layout.detail}`}
												onClick={() => selectLayout(layout.id)}
												onKeyDown={moveLayoutFocus}
											>
												<LayoutGlyph id={layout.id} />
												<span>{layout.label}</span>
											</button>
										))}
									</div>
								</div>
							) : (
								<div className="aig-layout-fixed" aria-label={`${activeLens.label} fixed view: ${activeLayoutLabel}`}>
									{activeLens.id === 'gap-analysis' ? <CircleDotDashed aria-hidden /> : <LayoutGlyph id={effectivePreset} />}
									<span>{activeLayoutLabel}</span>
								</div>
							)}
						</div>
					</div>
					<div className={`aig-canvas aig-canvas--${mode}`}>
						{!refined && activeLens.id === 'topology' && (
							<div className={`aig-working-scene${focusOverflow ? ' is-focus-overflow' : ''}`}>
								<div className="aig-graph-layer aig-graph-layer--working">
									<AtlasGraphCanvas
										subgraph={STABLE_SUBGRAPH}
										preset="flow-lr"
										showSemantic
										summary={`${visibleNodeCount} nodes · ${visibleRelationCount} relations`}
										emptyLabel="No graph objects"
										buildingLabel="Preparing Cytoscape canvas…"
										onNodeTap={(node) => setSelectedNode(node.id)}
									/>
								</div>
								<WorkingOverlay hidden={false} step={visibleStep} />
							</div>
						)}
						{!refined && activeLens.id !== 'topology' && (
							<LensProjectionCanvas
								key={`working:${activeLens.id}:${effectivePreset}`}
								lens={activeLens}
								preset={effectivePreset}
								progress={liveRun ? activeLensProgress : 100}
								variant={liveRun ? 'live' : 'stable'}
								onNodeTap={setSelectedNode}
							/>
						)}
						{refined && (
							<LensProjectionCanvas
								key={`final:${activeLens.id}:${effectivePreset}`}
								lens={activeLens}
								preset={effectivePreset}
								variant="final"
								onNodeTap={setSelectedNode}
							/>
						)}
						{activeLens.id === 'topology' && (mode === 'running' || mode === 'paused' || mode === 'layouting') && activePatch && (
							<div
								className={`aig-agent-cursor aig-agent-cursor--${activePatch.kind}${anchorAgentToNodeCorner ? ' is-node-corner' : ''}`}
								style={cursor}
							>
								<span>{patchIcon(activePatch.kind)}</span>
								<b>{activePatch.object}</b>
							</div>
						)}
						{mode === 'review' && (
							<div className="aig-review-watermark"><ShieldCheck aria-hidden /><span>5 graph views ready · 20 changes</span></div>
						)}
						{mode === 'layouting' && (
							<div className="aig-refine-stage"><Workflow aria-hidden /><span><strong>Refining all 5 graph views</strong><small>Showing {activeLens.label} · {activeLayoutLabel} · one intentional reflow per view</small></span></div>
						)}
						{mode === 'accepted' && (
							<div className="aig-accepted-watermark"><Check aria-hidden /><span>v13 · 5 graph views are now canonical</span></div>
						)}
					</div>
					<footer className="aig-canvas-footer">
						<div className="aig-base-lock"><ShieldCheck aria-hidden /><span><b>{accepted ? 'v13 canonical' : refined ? `${activeLens.label} · ${activeLayoutLabel}` : liveRun && activeLens.id !== 'topology' ? `${activeLens.label} draft · ${activeLensProgress}%` : focusOverflow ? 'Focused newest node · graph positions unchanged' : 'v12 unchanged · occupied slots protected'}</b>{accepted ? ' · immutable five-view version created' : refined ? ` · ${activeLens.description}` : liveRun && activeLens.id !== 'topology' ? ' · one run is generating all 5 graph outputs; switching views does not interrupt it' : ' · Agent changes are not saved yet'}</span></div>
						{selectedNode && <span className="aig-selection">Selected: {selectedNode}</span>}
					</footer>
				</section>

				{activityOpen && (
					<aside className="aig-activity-drawer">
						<div className="aig-activity-drawer__head">
							<div><strong>Agent activity</strong><span>{Math.max(0, patchIndex + 1)} of {PATCHES.length} operations</span></div>
							<button type="button" onClick={() => setActivityOpen(false)} aria-label="Close activity"><X aria-hidden /></button>
						</div>
						<div className="aig-feed">
							<div className="aig-feed-summary">
								<div className="aig-agent-avatar"><Sparkles aria-hidden /></div>
								<div><strong>Graph Generation Agent</strong><span>{mode === 'idle' ? 'Ready to generate 5 views' : mode === 'accepted' ? 'Five-view run accepted' : mode === 'layouting' ? `${PATCHES.length} operations complete · refining 5 views` : `${readyViewCount}/5 views ready · ${Math.max(0, patchIndex + 1)} of ${PATCHES.length} operations`}</span></div>
							</div>
							<div className="aig-progress"><span style={{ width: `${refined ? 100 : Math.max(3, ((patchIndex + 1) / PATCHES.length) * 100)}%` }} /></div>
							<div className="aig-feed-view-statuses" aria-label="Generated graph views">
								{LENSES.map((lens) => <span key={lens.id} className={lensProgressById[lens.id] >= 100 ? 'is-ready' : ''}>{lens.label}<b>{lensProgressById[lens.id] >= 100 ? <Check aria-hidden /> : `${lensProgressById[lens.id]}%`}</b></span>)}
							</div>
							<div className="aig-feed-list">
								{PATCHES.map((patch, index) => {
									const completed = accepted || index <= patchIndex;
									const current = !accepted && index === patchIndex && (mode === 'running' || mode === 'paused' || mode === 'layouting');
									return (
										<div ref={current ? currentPatchRef : undefined} key={patch.id} className={`aig-feed-item${completed ? ' is-complete' : ''}${current ? ' is-current' : ''}`}>
											<div className={`aig-feed-item__icon is-${patch.kind}`}>{completed ? patchIcon(patch.kind) : <Clock3 aria-hidden />}</div>
											<div><strong>{patch.title}</strong><span>{patch.detail}</span><small>{patch.object}</small></div>
										</div>
									);
								})}
							</div>
						</div>
					</aside>
				)}
			</main>

			<footer className="aig-runbar">
				<div className="aig-runbar__state">
					{mode === 'running' && <CirclePlay aria-hidden />}
					{mode === 'paused' && <CirclePause aria-hidden />}
					{mode === 'layouting' && <Workflow aria-hidden />}
					{mode === 'review' && <ShieldCheck aria-hidden />}
					{mode === 'accepted' && <Check aria-hidden />}
					{mode === 'idle' && <Sparkles aria-hidden />}
					<span><strong>{modeLabel(mode, readyViewCount)}</strong><small>{mode === 'accepted' ? 'v12 remains available in History' : 'One run · five graphs · one reversible acceptance boundary'}</small></span>
				</div>
				<div className="aig-runbar__actions">
					{(mode === 'running' || mode === 'paused') && (
						<>
							<button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><Square aria-hidden /> Stop</button>
							<button className="aig-btn aig-btn--ghost" type="button" onClick={togglePause}>{mode === 'paused' ? <Play aria-hidden /> : <Pause aria-hidden />}{mode === 'paused' ? 'Continue' : 'Pause'}</button>
							<button className="aig-btn aig-btn--soft" type="button" onClick={skipToFinalGraph}>Skip to final package</button>
						</>
					)}
					{mode === 'review' && (
						<>
							<button className="aig-btn aig-btn--ghost" type="button" onClick={discard}><X aria-hidden /> Discard</button>
							<button className="aig-btn aig-btn--primary" type="button" onClick={() => setMode('accepted')}><Check aria-hidden /> Accept new version</button>
						</>
					)}
					{(mode === 'idle' || mode === 'accepted') && (
						<button className="aig-btn aig-btn--primary" type="button" onClick={startRun}><RotateCcw aria-hidden /> Replay incremental run</button>
					)}
				</div>
			</footer>
		</div>
	);
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Prototype />);
