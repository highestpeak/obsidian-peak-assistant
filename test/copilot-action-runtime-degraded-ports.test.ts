// T11B-R (2026-06-14): proves the Copilot action runtime stays usable
// when its underlying dependencies are not ready (mobile mode + the
// SQLite-deferred window on desktop). Each test exercises one adapter
// directly with the kind of failure that ships in those modes.

import assert from 'assert';
import { AppCopilotActionSearchAdapter } from '@/app/copilot/actions/AppCopilotActionSearchAdapter';
import { SqliteSemanticLinkReadAdapter } from '@/app/adapters/copilot/SqliteSemanticLinkReadAdapter';
import { SemanticLinkSuggestionService } from '@/service/copilot/SemanticLinkSuggestionService';
import { SmartConnectionService } from '@/service/copilot/SmartConnectionService';
import { SqliteCopilotActionTagsAdapter } from '@/app/copilot/actions/SqliteCopilotActionTagsAdapter';

async function testSearchAdapterReturnsEmptyWithoutClient(): Promise<void> {
	const adapter = new AppCopilotActionSearchAdapter(() => null);
	const res = await adapter.vectorSearch({ text: 'anything', scopeMode: 'vault', topK: 5 });
	assert.deepStrictEqual(res, { items: [] }, 'search adapter must return {items:[]} when SearchClient is null');
	console.log('PASS: searchAdapterReturnsEmptyWithoutClient');
}

async function testSearchAdapterToleratesUndefinedResolver(): Promise<void> {
	const adapter = new AppCopilotActionSearchAdapter(() => undefined);
	const res = await adapter.vectorSearch({ text: 'q', scopeMode: 'vault', topK: 5 });
	assert.deepStrictEqual(res, { items: [] });
	console.log('PASS: searchAdapterToleratesUndefinedResolver');
}

async function testSemanticGraphReportsNotIndexedOnFailure(): Promise<void> {
	// In the SQLite-deferred / mobile window, calls into
	// `sqliteStoreManager.getMobiusNodeRepo()` throw before any init has
	// run. The services translate this into `indexed: false` so the
	// action body surfaces the standard "not indexed" message — the
	// read adapter itself remains a pure read surface.
	// T11Y-4b: exercises SemanticLink{Suggestion,SmartConnection}Service
	// over the live sqlite read adapter, replacing the unified
	// SqliteCopilotActionSemanticGraphAdapter.
	const reads = new SqliteSemanticLinkReadAdapter();
	const links = new SemanticLinkSuggestionService(reads);
	const smart = new SmartConnectionService(reads);

	const a = await links.findSemanticLinkNeighbors('Notes/Strategy.md', new Set());
	assert.strictEqual(a.indexed, false, 'findSemanticLinkNeighbors must report indexed=false when sqlite is not ready');
	assert.deepStrictEqual(a.suggestions, []);
	assert.strictEqual(a.totalNeighbors, 0);

	const b = await smart.findSmartConnections('Notes/Strategy.md', new Set());
	assert.strictEqual(b.indexed, false, 'findSmartConnections must report indexed=false when sqlite is not ready');
	assert.deepStrictEqual(b.connections, []);
	console.log('PASS: semanticGraphReportsNotIndexedOnFailure');
}

async function testTagsPersistenceBecomesNoOpWithoutSqlite(): Promise<void> {
	// The tags adapter wraps the engine + the suggestion-batch repo. We
	// only verify the persistence side here — without sqlite it should
	// resolve to undefined rather than throw, so the action's
	// suggestion stream still completes.
	const adapter = new SqliteCopilotActionTagsAdapter(/* aiManager unused for persist */ null as any);
	await assert.doesNotReject(
		adapter.persistSuggestionBatch({
			docPath: 'Notes/A.md',
			batchId: 'batch-1',
			suggestions: [],
		}),
		'persistSuggestionBatch must swallow sqlite-not-ready errors',
	);
	console.log('PASS: tagsPersistenceBecomesNoOpWithoutSqlite');
}

async function main(): Promise<void> {
	await testSearchAdapterReturnsEmptyWithoutClient();
	await testSearchAdapterToleratesUndefinedResolver();
	await testSemanticGraphReportsNotIndexedOnFailure();
	await testTagsPersistenceBecomesNoOpWithoutSqlite();
}

main().then(() => process.exit(0)).catch(err => {
	console.error(err);
	process.exit(1);
});
