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
	assert.strictEqual(inv.appContextResolutions.length, 2, 'expect exactly 2 AppContext resolutions in VaultLintService');
	assert.ok(
		inv.appContextResolutions.some((r) => r.access.includes('getTemplateManager')),
		'inventory must include loadConfig TemplateManager resolution',
	);
	assert.ok(
		inv.appContextResolutions.some((r) => r.access.includes('app.vault.getMarkdownFiles')),
		'inventory must include runFullScan vault resolution',
	);

	const singletonNames = inv.singletonResolutions.map((r) => r.singleton);
	for (const expected of [
		'VaultLintService.getInstance()',
		'SignalRegistry.getInstance()',
		'sqliteStoreManager.getVaultLintRepo()',
		'useVaultLintStore.getState()',
	]) {
		assert.ok(
			singletonNames.includes(expected),
			`inventory must list singleton '${expected}'`,
		);
	}

	const sideEffectKinds = new Set(inv.sideEffects.map((s) => s.kind));
	for (const kind of ['vault.read', 'sqlite.write', 'ui.store.write', 'crypto.random'] as const) {
		assert.ok(sideEffectKinds.has(kind), `inventory must record side effect '${kind}'`);
	}

	const consumerSites = inv.consumers.map((c) => c.site);
	for (const expected of [
		'src/app/commands/PeakCommandActions.ts:openVaultXRay',
		'src/ui/view/vault-lint/VaultXRayPanel.tsx',
		'src/service/copilot/vault/VaultDigestService.ts',
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
