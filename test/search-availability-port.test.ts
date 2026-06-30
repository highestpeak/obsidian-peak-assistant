// T11Y-7c: SearchAvailabilityPort + AppCopilotActionSearchAdapter must
// distinguish "search subsystem not ready" from "search ran and returned
// zero hits". The adapter now emits a discriminated result; the
// find-related action threads `searchUnavailable` through so panels can
// render a distinct empty state.

import assert from 'assert';
import { AppCopilotActionSearchAdapter } from '@/app/copilot/actions/AppCopilotActionSearchAdapter';
import { createBuiltInCopilotActions, type FindRelatedResult } from '@/service/copilot/actions';
import type { CopilotActionPorts } from '@/service/copilot/actions/CopilotActionPorts';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

function fakeDoc(): DocumentContext {
	return {
		file: { path: 'Notes/A.md', basename: 'A' } as any,
		title: 'A',
		content: 'Some content body. '.repeat(20),
		scope: 'full',
		wordCount: 200,
		tags: [],
		links: [],
		backlinks: 0,
		headingCount: 1,
		isOrphan: false,
		frontmatter: {},
	};
}

function basePorts(overrides: Partial<CopilotActionPorts> = {}): CopilotActionPorts {
	const unreachable = (name: string) => () => { throw new Error(`fake ${name} should not run`); };
	const base: CopilotActionPorts = {
		ai: {
			renderPrompt: unreachable('renderPrompt') as any,
			queryStructured: unreachable('queryStructured') as any,
			queryStream: unreachable('queryStream') as any,
			queryText: unreachable('queryText') as any,
		} as any,
		vaultReader: {
			getFile: () => null,
			getFolder: () => null,
			listFiles: () => [],
			listFolderChildren: () => ({ files: [], folders: [] }),
			readText: unreachable('vaultReader.readText') as any,
			readBinary: unreachable('vaultReader.readBinary') as any,
		},
		linkResolver: { resolveLinkPath: () => null },
		vaultMetadataCache: { getFileCache: () => null, getResolvedLinks: () => ({}) },
		search: { vectorSearch: unreachable('search.vectorSearch') as any },
		semanticGraph: {
			findSemanticLinkNeighbors: unreachable('semanticGraph.findSemanticLinkNeighbors') as any,
			findSmartConnections: unreachable('semanticGraph.findSmartConnections') as any,
		},
		tags: {
			suggestTags: unreachable('tags.suggestTags') as any,
			persistSuggestionBatch: unreachable('tags.persistSuggestionBatch') as any,
		},
		agent: { runAgentStream: unreachable('agent.runAgentStream') as any },
		customPrompts: { loadAll: async () => [] },
	};
	return { ...base, ...overrides };
}

async function drainGenerator<T, R>(gen: AsyncGenerator<T, R, any>) {
	const events: T[] = [];
	let result: R | undefined;
	while (true) {
		const next = await gen.next();
		if (next.done) { result = next.value as R; break; }
		events.push(next.value);
	}
	return { events, result };
}

async function testAdapterEmitsUnavailableWhenNoClient(): Promise<void> {
	const adapter = new AppCopilotActionSearchAdapter(() => null);
	const r = await adapter.vectorSearch({ text: 'q', scopeMode: 'vault', topK: 5 });
	assert.strictEqual(r.available, false);
	if (r.available === false) {
		assert.strictEqual(r.reason, 'search-client-unavailable');
	}
	console.log('PASS: adapterEmitsUnavailableWhenNoClient');
}

async function testAdapterEmitsAvailableWhenClientPresent(): Promise<void> {
	const fakeClient = {
		vectorSearch: async () => ({ items: [{ path: 'Other.md', title: 'Other', score: 0.9 }] }),
	};
	const adapter = new AppCopilotActionSearchAdapter(() => fakeClient as any);
	const r = await adapter.vectorSearch({ text: 'q', scopeMode: 'vault', topK: 5 });
	assert.strictEqual(r.available, true);
	if (r.available === true) {
		assert.strictEqual(r.items.length, 1);
		assert.strictEqual(r.items[0].path, 'Other.md');
	}
	console.log('PASS: adapterEmitsAvailableWhenClientPresent');
}

async function testFindRelatedActionSurfacesUnavailableFlag(): Promise<void> {
	const actions = createBuiltInCopilotActions(basePorts({
		search: {
			async vectorSearch() {
				return { available: false, reason: 'search-client-unavailable' };
			},
		},
	}));
	const action = actions.find(a => a.id === 'find-related');
	assert.ok(action, 'find-related must exist');
	const { result } = await drainGenerator(action!.execute(fakeDoc(), undefined));
	assert.strictEqual((result as any).type, 'structured');
	const data = (result as any).data as FindRelatedResult;
	assert.deepStrictEqual(data.items, []);
	assert.ok(data.searchUnavailable, 'searchUnavailable flag must be set');
	assert.strictEqual(data.searchUnavailable!.reason, 'search-client-unavailable');
	console.log('PASS: findRelatedActionSurfacesUnavailableFlag');
}

async function testFindRelatedActionDoesNotSetFlagWhenAvailable(): Promise<void> {
	const actions = createBuiltInCopilotActions(basePorts({
		search: {
			async vectorSearch() {
				return {
					available: true,
					items: [{ path: 'Other.md', title: 'Other', score: 0.9, content: 'body' }],
				};
			},
		},
	}));
	const action = actions.find(a => a.id === 'find-related');
	const { result } = await drainGenerator(action!.execute(fakeDoc(), undefined));
	const data = (result as any).data as FindRelatedResult;
	assert.strictEqual(data.searchUnavailable, undefined);
	assert.strictEqual(data.items.length, 1);
	console.log('PASS: findRelatedActionDoesNotSetFlagWhenAvailable');
}

async function main(): Promise<void> {
	await testAdapterEmitsUnavailableWhenNoClient();
	await testAdapterEmitsAvailableWhenClientPresent();
	await testFindRelatedActionSurfacesUnavailableFlag();
	await testFindRelatedActionDoesNotSetFlagWhenAvailable();
}

main().then(() => process.exit(0)).catch(err => {
	console.error(err);
	process.exit(1);
});
