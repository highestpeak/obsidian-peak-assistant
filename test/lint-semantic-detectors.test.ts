// Wave 5 · six `M-*` semantic detectors register in
// `InMemoryDetectorRegistry` but carry `requiresLlm: true`. The engine
// today runs only `getNonLlm()`, so this test proves both halves:
//
//   1. All six ids are present in `getAll()` after boot;
//   2. None of them appear in `getNonLlm()` — the scan surface
//      excludes them until the LLM budget helper flips their flag.

import assert from 'assert';
import { InMemoryDetectorRegistry } from '@/service/lint/runtime/InMemoryDetectorRegistry';
import { DEFAULT_VAULT_LINT_CONFIG } from '@/service/lint/config/VaultLintDefaults';
import type { LintSignalId } from '@/core/types/lint';

const SEMANTIC_IDS: LintSignalId[] = [
	'M-COVERAGE-GAP',
	'M-LOW-COHESION',
	'M-CONTRADICTION',
	'M-PHANTOM-NODE',
	'M-SEMANTIC-ISOLATION',
	'M-REDUNDANT-HUBS',
];

async function main() {
	const registry = new InMemoryDetectorRegistry();
	registry.ensureInitialized(DEFAULT_VAULT_LINT_CONFIG);

	const allIds = new Set(registry.getAll().map((d) => d.id));
	for (const id of SEMANTIC_IDS) {
		assert.ok(
			allIds.has(id),
			`expected ${id} registered in InMemoryDetectorRegistry`,
		);
	}

	const nonLlm = registry.getNonLlm();
	for (const detector of nonLlm) {
		assert.ok(
			!SEMANTIC_IDS.includes(detector.id),
			`expected ${detector.id} to be excluded from getNonLlm()`,
		);
		assert.strictEqual(
			detector.requiresLlm,
			false,
			`getNonLlm() returned an LLM detector: ${detector.id}`,
		);
	}

	// All six stubs must resolve to empty findings — the runtime is not
	// yet wired to invoke an LLM helper, so they behave as no-ops.
	const semanticStubs = registry
		.getAll()
		.filter((d) => SEMANTIC_IDS.includes(d.id));
	assert.strictEqual(semanticStubs.length, SEMANTIC_IDS.length);
	for (const detector of semanticStubs) {
		assert.strictEqual(detector.requiresLlm, true);
		const result = await detector.detect({
			totalNotes: 0,
			allNodeIds: [],
			lastScanTimestamp: null,
			dismissals: new Map(),
			detectorContext: {} as never,
		});
		assert.deepStrictEqual(result, []);
	}

	// Idempotency: `ensureInitialized` twice does not double-register.
	registry.ensureInitialized(DEFAULT_VAULT_LINT_CONFIG);
	const countAfterSecondBoot = registry.getAll().length;
	assert.strictEqual(countAfterSecondBoot, allIds.size);

	console.log('lint-semantic-detectors: ok');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
