import assert from 'node:assert/strict';
import { generatedLensGraphToCreateRequest } from '../src/service/ai-graph';

const graph = {
	nodes: [
		{ label: 'Vault note', path: 'Notes/a.md' },
		{ label: 'Web source', path: 'https://example.com/source' },
	],
	edges: [{
		source: 'Notes/a.md',
		target: 'https://example.com/source',
		kind: 'references' as const,
		directionality: 'directed' as const,
	}],
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
assert.equal(first.sources.some((source) => source.kind === 'web-page'), true);
assert.equal(atlasCreated.createdFrom.surface, 'file-atlas');
assert.equal(atlasCreated.createdFrom.contextRefs[0].locator, 'Notes/a.md');
assert.equal(
	first.relations[0].reviewStatus,
	'suggested',
	'a relation without captured evidence must never be auto-accepted',
);

console.log('ai graph generated import tests passed');
