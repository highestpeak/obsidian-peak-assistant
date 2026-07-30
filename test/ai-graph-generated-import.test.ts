import assert from 'node:assert/strict';
import {
	generatedLensGraphToCreateRequest,
	requestsSelectedAIGraphRemoval,
} from '../src/service/ai-graph';

const graph = {
	nodes: [
		{ label: 'Vault note', path: 'Notes/a.md' },
		{ label: 'Web source', path: 'https://example.com/source' },
		{
			label: 'Ada Lovelace',
			path: 'person://ada-lovelace',
			artifactKind: 'person' as const,
			aliases: ['Augusta Ada King'],
			evidenceQuotes: [{
				sourcePath: 'Notes/a.md',
				quote: 'Ada designed an algorithm for the Analytical Engine.',
			}],
		},
	],
	edges: [
		{
			source: 'Notes/a.md',
			target: 'https://example.com/source',
			kind: 'references' as const,
			directionality: 'directed' as const,
		},
		{
			source: 'person://ada-lovelace',
			target: 'Notes/a.md',
			kind: 'references' as const,
			predicate: 'described-by',
			relationFamily: 'attribution' as const,
			directionality: 'directed' as const,
			evidenceQuotes: [{
				sourcePath: 'Notes/a.md',
				quote: 'Ada designed an algorithm for the Analytical Engine.',
			}],
		},
	],
	availableLenses: ['topology' as const],
};

const first = generatedLensGraphToCreateRequest({
	title: 'Mixed graph',
	query: 'compare sources',
	graphData: graph,
	webResearch: {
		query: 'compare sources',
		answer: 'Cited [source](https://example.com/source).',
		sources: [{ id: 'web-1', url: 'https://example.com/source', title: 'Source' }],
	},
	capturedAt: 10,
});
const second = generatedLensGraphToCreateRequest({
	title: 'Mixed graph',
	query: 'compare sources',
	graphData: graph,
	webResearch: {
		query: 'compare sources',
		answer: 'Cited [source](https://example.com/source).',
		sources: [{ id: 'web-1', url: 'https://example.com/source', title: 'Source' }],
	},
	capturedAt: 20,
});
const atlasCreated = generatedLensGraphToCreateRequest({
	title: 'Atlas graph',
	query: 'Map this document',
	graphData: graph,
	selectedPaths: ['Notes/a.md'],
	createdFrom: {
		surface: 'file-atlas',
		contextRefs: [{
			kind: 'atlas-file',
			ref: 'Notes/a.md',
			label: 'a.md',
			locator: 'Notes/a.md',
		}],
	},
	capturedAt: 30,
});

assert.deepEqual(
	first.nodes.map((node) => node.nodeId),
	second.nodes.map((node) => node.nodeId),
	'node identities must not churn across regenerated versions',
);
assert.deepEqual(
	first.relations.map((relation) => relation.relationId),
	second.relations.map((relation) => relation.relationId),
	'relation identities must remain stable for semantic diffing',
);
assert.equal(first.nodes[1].kind, 'web-resource');
assert.equal(first.nodes[2].kind, 'person');
assert.deepEqual(first.nodes[2].aliases, ['Augusta Ada King']);
assert.equal(first.sources.some((source) => source.kind === 'web-page'), true);
assert.equal(first.sources.some((source) => source.kind === 'vault-file'), true);
assert.equal(
	first.evidence.some((evidence) =>
		evidence.quote === 'Ada designed an algorithm for the Analytical Engine.'
		&& evidence.selector.kind === 'text-quote'),
	true,
);
assert.equal(first.relations[1].predicate, 'described-by');
assert.equal(first.relations[1].evidenceIds.length > 0, true);
assert.equal(atlasCreated.createdFrom.surface, 'file-atlas');
assert.equal(atlasCreated.createdFrom.contextRefs[0].locator, 'Notes/a.md');
assert.equal(
	first.relations[0].reviewStatus,
	'suggested',
	'a relation without captured evidence must never be auto-accepted',
);
const mergedEntityGraph = generatedLensGraphToCreateRequest({
	title: 'Entity resolution',
	query: 'Resolve aliases',
	graphData: {
		nodes: [
			{
				label: 'Ada Lovelace',
				path: 'person://ada',
				canonicalRef: 'person:wikidata:Q7259',
				artifactKind: 'person' as const,
				aliases: ['Ada'],
			},
			{
				label: 'Augusta Ada King',
				path: 'person://augusta',
				canonicalRef: 'person:wikidata:Q7259',
				artifactKind: 'person' as const,
				aliases: ['Countess of Lovelace'],
			},
		],
		edges: [],
		availableLenses: ['topology' as const],
	},
	capturedAt: 40,
});
assert.equal(mergedEntityGraph.nodes.length, 1, 'canonical entity refs must merge aliases');
assert.deepEqual(
	new Set(mergedEntityGraph.nodes[0].aliases),
	new Set(['Ada', 'Augusta Ada King', 'Countess of Lovelace']),
);
assert.equal(requestsSelectedAIGraphRemoval('Split this person into two records'), true);
assert.equal(requestsSelectedAIGraphRemoval('合并这两个实体'), true);

console.log('ai graph generated import tests passed');
