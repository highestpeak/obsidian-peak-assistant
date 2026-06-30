import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	VAULT_LINT_CAPABILITY_ID,
	VAULT_LINT_CURRENT_DEPENDENCIES,
	type VaultLintCapabilityInput,
	type VaultLintProgressEvent,
} from '@/service/lint/VaultLintContract';

const CONTRACT_SOURCE_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/VaultLintContract.ts',
);

const ALLOWED_IMPORT_SPECIFIERS = new Set<string>(['./types']);

const FORBIDDEN_IMPORT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /^obsidian(\/.*)?$/, reason: 'contract must not import Obsidian' },
	{ pattern: /^@\/app\//, reason: 'contract must not depend on the app shell (AppContext, settings, commands)' },
	{ pattern: /^@\/ui\//, reason: 'contract must not depend on the UI layer (React, zustand stores, panels)' },
	{ pattern: /^@\/core\/storage\//, reason: 'contract must not depend on storage adapters (SqliteStoreManager, repos)' },
	{ pattern: /^@\/core\/.*\/SqliteStoreManager$/, reason: 'contract must not depend on SqliteStoreManager' },
	{ pattern: /^@\/service\/lint\/SignalRegistry$/, reason: 'contract must not depend on the SignalRegistry singleton' },
	{ pattern: /^@\/service\/lint\/HealthScoreEngine$/, reason: 'contract must not depend on the HealthScoreEngine' },
	{ pattern: /^\.\/SignalRegistry$/, reason: 'contract must not depend on the SignalRegistry singleton' },
	{ pattern: /^\.\/HealthScoreEngine$/, reason: 'contract must not depend on the HealthScoreEngine' },
	{ pattern: /^zustand(\/.*)?$/, reason: 'contract must not depend on zustand' },
	{ pattern: /^react(\/.*)?$/, reason: 'contract must not depend on React' },
	{ pattern: /^better-sqlite3$/, reason: 'contract must not depend on the SQLite driver' },
];

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function testCapabilityIdIsStable(): void {
	assert.strictEqual(VAULT_LINT_CAPABILITY_ID, 'vault.lint.scan');
	assert.strictEqual(VAULT_LINT_CURRENT_DEPENDENCIES.capabilityId, VAULT_LINT_CAPABILITY_ID);
	console.log('PASS: capabilityIdIsStable');
}

function testContractFileImportsAreDependencyLight(): void {
	const source = fs.readFileSync(CONTRACT_SOURCE_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	assert.ok(specifiers.length > 0, 'contract source should have at least one import (for ./types)');

	for (const spec of specifiers) {
		for (const { pattern, reason } of FORBIDDEN_IMPORT_PATTERNS) {
			if (pattern.test(spec)) {
				assert.fail(`forbidden import '${spec}' in VaultLintContract.ts: ${reason}`);
			}
		}
		if (!ALLOWED_IMPORT_SPECIFIERS.has(spec)) {
			assert.fail(
				`unexpected import '${spec}' in VaultLintContract.ts; allowed: ${[...ALLOWED_IMPORT_SPECIFIERS].join(', ')}`,
			);
		}
	}
	console.log(`PASS: contractFileImportsAreDependencyLight (${specifiers.length} import(s) checked)`);
}

function testInputShapeMatchesCurrentRuntime(): void {
	const valid: VaultLintCapabilityInput = { scanType: 'full', trigger: 'manual' };
	assert.strictEqual(valid.scanType, 'full');
	assert.strictEqual(valid.trigger, 'manual');
	console.log('PASS: inputShapeMatchesCurrentRuntime');
}

function testProgressEventOnlyHasThreePhases(): void {
	const phases: Array<VaultLintProgressEvent['phase']> = ['init', 'scanning', 'cleared'];
	// Compile-time assertion: any extra phase would widen the union; spot-check
	// the runtime values too.
	assert.deepStrictEqual([...new Set(phases)].sort(), ['cleared', 'init', 'scanning']);
	const sample: VaultLintProgressEvent = { phase: 'scanning', detector: 'init', processed: 0, total: 5 };
	assert.strictEqual(sample.phase, 'scanning');
	console.log('PASS: progressEventOnlyHasThreePhases');
}

function testDependencyInventoryCoversAllResolutionSites(): void {
	const inv = VAULT_LINT_CURRENT_DEPENDENCIES;
	// T6: the engine no longer resolves AppContext itself.
	// T7: detectors no longer resolve AppContext either. All remaining
	// AppContext resolutions live in app-layer adapters
	// (`src/app/lint/Obsidian*Adapter.ts`), so the inventory still
	// records them but every site must point at the app layer.
	assert.ok(
		inv.appContextResolutions.length >= 3,
		`expect at least 3 AppContext resolutions across app-layer adapters, found ${inv.appContextResolutions.length}`,
	);
	for (const resolution of inv.appContextResolutions) {
		assert.ok(
			resolution.site.startsWith('src/app/lint/'),
			`T6/T7 closure: AppContext resolution must live in src/app/lint/, found '${resolution.site}'`,
		);
	}
	assert.ok(
		inv.appContextResolutions.some((r) => r.access.includes('getTemplateManager')),
		'inventory must include TemplateManager resolution (now in ObsidianVaultLintConfigAdapter)',
	);
	assert.ok(
		inv.appContextResolutions.some((r) => r.access.includes('app.vault.getMarkdownFiles')),
		'inventory must include vault resolution (now in ObsidianVaultLintVaultAdapter)',
	);
	assert.ok(
		inv.appContextResolutions.some((r) =>
			r.site.endsWith('ObsidianVaultLintDetectorContextAdapter.ts'),
		),
		'T7: inventory must include the detector-context adapter as an AppContext resolution site',
	);

	const singletonNames = inv.singletonResolutions.map((r) => r.singleton);
	// T6 closure proof: the engine's old service-locator exits are
	// gone from the inventory. Nothing should still list them.
	for (const retired of [
		'VaultLintService.getInstance()',
		'SignalRegistry.getInstance()',
		'useVaultLintStore.getState()',
	]) {
		assert.ok(
			!singletonNames.includes(retired),
			`T6 closure: inventory must no longer list singleton '${retired}'`,
		);
	}
	// T6R closure proof: the previous service-layer runtime binding
	// (`getVaultLintRuntime` / `setVaultLintRuntime` exported from
	// `src/service/lint/VaultLintRuntime.ts`) must not be inventoried
	// any more — the binding moved to `AppRuntimeRegistry`.
	for (const resolution of inv.singletonResolutions) {
		assert.ok(
			!resolution.site.startsWith('src/service/lint/VaultLintRuntime'),
			`T6R closure: inventory must not list bindings sited in service-layer VaultLintRuntime.ts (found '${resolution.site}')`,
		);
	}
	// `sqliteStoreManager.getVaultLintRepo()` is still listed but its
	// site moved to `composeVaultLintRuntime` (one-shot at boot, not a
	// per-scan resolution). The new app-owned runtime binding is also
	// listed.
	assert.ok(
		singletonNames.includes('sqliteStoreManager.getVaultLintRepo()'),
		'inventory must still list the one-shot sqlite repo handoff in composeVaultLintRuntime',
	);
	assert.ok(
		inv.singletonResolutions.some(
			(r) => r.singleton === 'sqliteStoreManager.getVaultLintRepo()' && r.site.includes('composeVaultLintRuntime'),
		),
		'T6 closure: the sqlite repo resolution must live in composeVaultLintRuntime, not the engine',
	);
	assert.ok(
		inv.singletonResolutions.some(
			(r) =>
				r.site === 'src/app/runtime/AppRuntimeRegistry.ts' &&
				/AppRuntimeRegistry/.test(r.singleton),
		),
		'T6R: the app-owned runtime registry binding must be inventoried',
	);

	const sideEffectKinds = new Set(inv.sideEffects.map((s) => s.kind));
	for (const kind of ['vault.read', 'sqlite.write', 'crypto.random'] as const) {
		assert.ok(sideEffectKinds.has(kind), `inventory must record side effect '${kind}'`);
	}
	assert.ok(
		!sideEffectKinds.has('ui.store.write'),
		'T5 closure: inventory must no longer record ui.store.write side effects',
	);
	assert.ok(
		!inv.sideEffects.some((s) => s.target.includes('loadTrendHistory')),
		'T5 closure: inventory must no longer reference VaultLintRepo.loadTrendHistory',
	);
	assert.ok(
		!inv.stateOwner.includes('useVaultLintStore'),
		'T5 closure: stateOwner must not mention useVaultLintStore any more',
	);
	// T6 closure: every side effect site must point at the adapter or
	// the engine, NOT a top-level VaultLintService call (which would
	// imply the engine still owns the side effect).
	for (const sideEffect of inv.sideEffects) {
		assert.ok(
			!/VaultLintService\.runFullScan: app\.|VaultLintService\.runFullScan: VaultLintRepo|VaultLintService\.loadConfig/.test(
				`${sideEffect.site}: ${sideEffect.target}`,
			),
			`T6 closure: side effect '${sideEffect.target}' should be attributed to its adapter, not the engine`,
		);
	}

	const consumerSites = inv.consumers.map((c) => c.site);
	for (const expected of [
		// T11Y-1 / T11Y-4a: X-Ray standalone surface retired. Remaining
		// consumers are the Vault Review digest builder (loadLatestScan),
		// the Vault Review runtime composer (binds the lint runtime), and
		// the Copilot Picker Vault tab (runManualScan).
		'src/service/copilot/vault/VaultDigestBuilder.ts',
		'src/app/copilot/vault/composeVaultReviewRuntime.ts',
		'src/ui/view/copilot/CopilotPickerContent.tsx',
	]) {
		assert.ok(
			consumerSites.includes(expected),
			`inventory must list consumer site '${expected}'`,
		);
	}

	assert.deepStrictEqual(
		[...inv.knownDimensions].sort(),
		['content', 'semantic', 'structural', 'tags', 'temporal'],
	);
	console.log('PASS: dependencyInventoryCoversAllResolutionSites');
}

try {
	testCapabilityIdIsStable();
	testContractFileImportsAreDependencyLight();
	testInputShapeMatchesCurrentRuntime();
	testProgressEventOnlyHasThreePhases();
	testDependencyInventoryCoversAllResolutionSites();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
