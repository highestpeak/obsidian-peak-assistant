// T11B (2026-06-14): fake-port tests prove that manual Copilot action
// execution runs without Obsidian / sqlite / AppContext / real provider
// calls. Each test wires a tiny in-memory port and exercises one action
// family.

import assert from 'assert';
import { createBuiltInCopilotActions } from '@/service/copilot/actions';
import { CopilotActionRuntimeImpl } from '@/service/copilot/actions/CopilotActionRuntimeImpl';
import { AppRuntimeRegistry } from '@/app/runtime/AppRuntimeRegistry';
import type { CopilotActionPorts } from '@/service/copilot/actions/CopilotActionPorts';
import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';

function fakeDoc(overrides: Partial<DocumentContext> = {}): DocumentContext {
	return {
		file: { path: 'Notes/Strategy.md', basename: 'Strategy' } as any,
		title: 'Strategy',
		content: 'A long enough strategy note for content-mode actions. '.repeat(20),
		scope: 'full',
		wordCount: 800,
		tags: [],
		links: ['Related'],
		backlinks: 0,
		headingCount: 3,
		isOrphan: false,
		frontmatter: {},
		...overrides,
	};
}

function basePorts(overrides: Partial<CopilotActionPorts> = {}): CopilotActionPorts {
	const unreachable = (name: string) => () => {
		throw new Error(`fake port ${name} should not be invoked by this test`);
	};
	const base: CopilotActionPorts = {
		ai: {
			renderPrompt: unreachable('ai.renderPrompt') as any,
			queryStructured: unreachable('ai.queryStructured') as any,
			queryStream: unreachable('ai.queryStream') as any,
			queryText: unreachable('ai.queryText') as any,
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
		vaultMetadataCache: {
			getFileCache: () => null,
			getResolvedLinks: () => ({}),
		},
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

function findAction(actions: CopilotAction[], id: string): CopilotAction {
	const a = actions.find(x => x.id === id);
	if (!a) throw new Error(`built-in action ${id} not found`);
	return a;
}

async function testCorrectContentRunsThroughAiPort(): Promise<void> {
	let calledWith: any = null;
	const actions = createBuiltInCopilotActions(basePorts({
		ai: {
			renderPrompt: async () => 'unused',
			queryStructured: async (promptId: any, vars: any, _schema: any, _opts: any) => {
				calledWith = { promptId, vars };
				return { issues: [] };
			},
			queryStream: (() => { throw new Error('not used here'); }) as any,
			queryText: (() => { throw new Error('not used'); }) as any,
		} as any,
	}));
	const action = findAction(actions, 'correct-content');
	const { result } = await drainGenerator(action.execute(fakeDoc(), undefined));
	assert.ok(calledWith, 'ai.queryStructured must have been invoked through the port');
	assert.deepStrictEqual(result, { type: 'structured', data: { issues: [] }, usage: undefined });
	console.log('PASS: correctContentRunsThroughAiPort');
}

async function testPolishStreamsThroughAiPort(): Promise<void> {
	// T11Y-7a: streaming actions now consume IAgentPrompter.queryStream which
	// emits LLMStreamEvent (text-delta + complete with usage).
	const ports = basePorts({
		ai: {
			renderPrompt: async () => 'unused',
			queryStructured: (() => { throw new Error('not used here'); }) as any,
			async *queryStream() {
				yield { type: 'text-delta', text: 'hello ' } as any;
				yield { type: 'text-delta', text: 'world' } as any;
				yield {
					type: 'complete',
					usage: { inputTokens: 5, outputTokens: 2 } as any,
					finishReason: 'stop',
				} as any;
			},
			queryText: (() => { throw new Error('not used'); }) as any,
		} as any,
	});
	const actions = createBuiltInCopilotActions(ports);
	const action = findAction(actions, 'polish');
	const { result } = await drainGenerator(action.execute(fakeDoc(), undefined));
	assert.deepStrictEqual(result, { type: 'stream', text: 'hello world', usage: { inputTokens: 5, outputTokens: 2 } });
	console.log('PASS: polishStreamsThroughAiPort');
}

async function testFindRelatedUsesSearchPort(): Promise<void> {
	let captured: any = null;
	const ports = basePorts({
		search: {
			async vectorSearch(input) {
				captured = input;
				return { items: [
					{ path: 'Other.md', title: 'Other', score: 0.9, content: 'excerpt body' },
					{ path: fakeDoc().file.path, title: 'self', score: 0.5, content: 'self' },
				] };
			},
		},
	});
	const actions = createBuiltInCopilotActions(ports);
	const action = findAction(actions, 'find-related');
	const { result } = await drainGenerator(action.execute(fakeDoc(), undefined));
	assert.strictEqual(captured.scopeMode, 'vault');
	assert.ok(captured.topK > 0);
	assert.strictEqual((result as any).type, 'structured');
	assert.deepStrictEqual(
		((result as any).data.items as any[]).map(i => i.path),
		['Other.md'],
	);
	console.log('PASS: findRelatedUsesSearchPort');
}

async function testSuggestTagsUsesTagsPort(): Promise<void> {
	let persisted: any = null;
	const ports = basePorts({
		tags: {
			async suggestTags(_p, _c, _t) {
				return [{ tag: 'planning', confidence: 0.8, reason: 'why', category: 'topic', sources: ['content'] }];
			},
			async persistSuggestionBatch(batch) { persisted = batch; },
		},
	});
	const actions = createBuiltInCopilotActions(ports);
	const action = findAction(actions, 'suggest-tags');
	const { result } = await drainGenerator(action.execute(fakeDoc(), undefined));
	assert.ok(persisted, 'tags.persistSuggestionBatch must have been called');
	assert.strictEqual((result as any).data.suggestions[0].tag, 'planning');
	console.log('PASS: suggestTagsUsesTagsPort');
}

async function testKnowledgeGapsRunsThroughAgentPort(): Promise<void> {
	let invoked = false;
	const ports = basePorts({
		ai: {
			renderPrompt: async () => 'sys',
			queryStructured: (() => { throw new Error('not used'); }) as any,
			queryStream: (() => { throw new Error('not used'); }) as any,
			queryText: (() => { throw new Error('not used'); }) as any,
		} as any,
		agent: {
			async *runAgentStream(_opts) {
				invoked = true;
				return { type: 'structured' as const, data: { findings: [] } };
			},
		},
	});
	const actions = createBuiltInCopilotActions(ports);
	const action = findAction(actions, 'knowledge-gaps');
	await drainGenerator(action.execute(fakeDoc(), undefined));
	// Agent-driven actions emit events through `yield*`; the generator
	// itself returns undefined — the structured result is delivered by
	// the agent's `submit_result` MCP tool and captured inside the port.
	assert.ok(invoked, 'agent.runAgentStream must have been invoked');
	console.log('PASS: knowledgeGapsRunsThroughAgentPort');
}

async function testSemanticLinksUsesSemanticGraphPort(): Promise<void> {
	let calledWith: any = null;
	const ports = basePorts({
		semanticGraph: {
			async findSemanticLinkNeighbors(filePath, existing) {
				calledWith = { filePath, existing };
				return {
					suggestions: [
						{ path: 'Related.md', title: 'Related', score: 0.7, direction: 'outgoing', snippet: '70%' },
					],
					totalNeighbors: 4,
					indexed: true,
				};
			},
			findSmartConnections: (() => { throw new Error('not used'); }) as any,
		},
	});
	const actions = createBuiltInCopilotActions(ports);
	const action = findAction(actions, 'suggest-semantic-links');
	const { result } = await drainGenerator(action.execute(fakeDoc(), undefined));
	assert.strictEqual(calledWith.filePath, 'Notes/Strategy.md');
	assert.strictEqual((result as any).data.suggestions[0].path, 'Related.md');
	console.log('PASS: semanticLinksUsesSemanticGraphPort');
}

async function testCustomPromptCatalogBuildsThroughRuntime(): Promise<void> {
	let agentCalled = false;
	const ports = basePorts({
		customPrompts: {
			loadAll: async () => [
				{ id: 'rewrite-v2', label: 'Rewrite v2', description: 'Custom rewrite', category: 'document', template: 'sys', filePath: '_prompts/rewrite-v2.md' },
			],
		},
		agent: {
			async *runAgentStream(_opts) {
				agentCalled = true;
				return { type: 'structured' as const, data: {} };
			},
		},
	});
	const runtime = new CopilotActionRuntimeImpl(ports);
	await runtime.refreshCustomPrompts();
	const custom = runtime.get('custom-rewrite-v2');
	assert.ok(custom, 'runtime must register custom-rewrite-v2');
	assert.strictEqual(custom.label, 'Rewrite v2');
	await drainGenerator(custom.execute(fakeDoc(), undefined));
	assert.ok(agentCalled, 'custom prompt action must invoke the injected agent port');
	console.log('PASS: customPromptCatalogBuildsThroughRuntime');
}

async function testRuntimeCatalogShape(): Promise<void> {
	const runtime = new CopilotActionRuntimeImpl(basePorts());
	const all = runtime.getAll();
	assert.ok(all.length >= 25, `expected built-ins; got ${all.length}`);
	const docs = runtime.getByCategory('document');
	const vault = runtime.getByCategory('vault');
	const writing = runtime.getByCategory('writing');
	assert.ok(docs.length > 0 && vault.length > 0 && writing.length > 0, 'all three categories must have actions');
	const ranked = runtime.rank(fakeDoc({ isOrphan: true, links: [], wordCount: 1200 }));
	assert.strictEqual(ranked[0].score >= ranked[ranked.length - 1].score, true, 'ranking must be descending');
	const suggest = runtime.get('suggest-links');
	assert.ok(suggest, 'runtime.get returns a built-in action');
	console.log('PASS: runtimeCatalogShape');
}

function testRuntimeOwnershipBindClearSemantics(): void {
	const registry = new AppRuntimeRegistry();
	assert.strictEqual(registry.tryGetCopilotActionRuntime(), null, 'soft accessor returns null before bind');
	assert.throws(() => registry.getCopilotActionRuntime(), /no runtime is bound/, 'hard accessor fails loud before bind');

	const fake = { getAll: () => [], get: () => undefined, getByCategory: () => [], rank: () => [], refreshCustomPrompts: async () => {} } as any;
	registry.setCopilotActionRuntime(fake);
	assert.strictEqual(registry.getCopilotActionRuntime(), fake, 'hard accessor returns the bound runtime');

	assert.throws(() => registry.setCopilotActionRuntime(fake), /already bound/, 'double bind throws');
	registry.clearCopilotActionRuntime();
	assert.strictEqual(registry.tryGetCopilotActionRuntime(), null, 'soft accessor returns null after clear');

	// idempotent clear
	registry.clearCopilotActionRuntime();
	console.log('PASS: runtimeOwnershipBindClearSemantics');
}

function testRuntimeOwnershipDisposeCalled(): void {
	const registry = new AppRuntimeRegistry();
	let disposed = 0;
	const fake = {
		getAll: () => [], get: () => undefined, getByCategory: () => [], rank: () => [],
		refreshCustomPrompts: async () => {},
		dispose: () => { disposed++; },
	} as any;
	registry.setCopilotActionRuntime(fake);
	registry.clearCopilotActionRuntime();
	assert.strictEqual(disposed, 1, 'clear must invoke runtime.dispose() exactly once');
	console.log('PASS: runtimeOwnershipDisposeCalled');
}

async function main(): Promise<void> {
	await testCorrectContentRunsThroughAiPort();
	await testPolishStreamsThroughAiPort();
	await testFindRelatedUsesSearchPort();
	await testSuggestTagsUsesTagsPort();
	await testKnowledgeGapsRunsThroughAgentPort();
	await testSemanticLinksUsesSemanticGraphPort();
	await testCustomPromptCatalogBuildsThroughRuntime();
	await testRuntimeCatalogShape();
	testRuntimeOwnershipBindClearSemantics();
	testRuntimeOwnershipDisposeCalled();
}

main().then(() => process.exit(0)).catch(err => {
	console.error(err);
	process.exit(1);
});
