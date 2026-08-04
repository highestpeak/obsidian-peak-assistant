import assert from 'node:assert/strict';
import type { ConnectedLink, DiscoveredConnection } from '../src/service/search/inspectorService';
import { buildFileAtlasNeighborhood } from '../src/app/file-atlas/buildFileAtlasNeighborhood';

const CURRENT = 'ideas/AI-peak-assistant-obsidian.md';
const PROCESSING = 'A-2-processing.md';
const OUTGOING = 'ideas/Outgoing.md';
const BOTH = 'ideas/Both.md';
const TWO_HOP_IN = 'ideas/Two-hop-in.md';
const TWO_HOP_OUT = 'ideas/Two-hop-out.md';
const SEMANTIC = 'ideas/Semantic.md';

function link(path: string, direction: 'out' | 'in'): ConnectedLink {
	return {
		path,
		label: path,
		direction,
		contextSnippet: null,
		convergenceCount: 0,
		relevanceScore: null,
	};
}

const connectedByPath = new Map<string, ConnectedLink[]>([
	[CURRENT, [
		link(PROCESSING, 'in'),
		link(OUTGOING, 'out'),
		link(BOTH, 'in'),
		link(BOTH, 'out'),
	]],
	[PROCESSING, [
		link(CURRENT, 'out'),
		link(TWO_HOP_IN, 'in'),
		link(TWO_HOP_OUT, 'out'),
	]],
	[OUTGOING, []],
	[BOTH, []],
]);

const semantic: DiscoveredConnection = {
	path: SEMANTIC,
	label: 'Semantic',
	type: 'SEM',
	score: 0.9,
	whyText: 'Content similarity',
};

async function run(): Promise<void> {
	const graph = await buildFileAtlasNeighborhood(
		CURRENT,
		{ hops: 2, semantic: true },
		{
			getConnectedLinks: async (path) => connectedByPath.get(path) ?? [],
			getDiscoveredConnections: async (path) => path === CURRENT ? [semantic] : [],
		},
	);

	const edges = graph.edges.map((edge) => (
		`${edge.from}|${edge.to}|${edge.kind}|${edge.directionality}`
	)).sort();

	assert.deepEqual(edges, [
		`${BOTH}|${CURRENT}|reference|bidirectional`,
		`${CURRENT}|${OUTGOING}|reference|directed`,
		`${CURRENT}|${SEMANTIC}|semantic|undirected`,
		`${PROCESSING}|${CURRENT}|reference|directed`,
		`${PROCESSING}|${TWO_HOP_OUT}|reference|directed`,
		`${TWO_HOP_IN}|${PROCESSING}|reference|directed`,
	].sort());

	assert.equal(
		graph.nodes.filter((node) => node.path === BOTH).length,
		1,
		'bidirectional first-ring note should only be expanded once',
	);
	assert.deepEqual(graph.hubAnchors, [], 'pure neighborhood builder leaves Hub enrichment to app composition');

	console.log('PASS: File Atlas preserves incoming, outgoing, bidirectional, two-hop, and semantic directionality');
}

void run();
