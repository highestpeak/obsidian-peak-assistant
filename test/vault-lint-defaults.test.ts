// T6R: Vault Lint config defaults governance tests.
//
// These tests prove the rule documented in
// `docs/superpowers/refactor-ops/config-defaults-governance.md`:
//
//   - The engine file (`VaultLintService.ts`) does NOT define the
//     compiled fallback config table inline.
//   - The compiled fallback lives in `VaultLintDefaults.ts` and
//     declares it mirrors `templates/config/vault-lint-config.json`.
//   - Every key present in the compiled fallback has the same value
//     as the JSON template (drift guard).
//
// The JSON template may contain additional keys that the typed
// `VaultLintConfig` does not expose yet (e.g. detector-specific
// thresholds reserved for T7+). Those extra keys are tolerated — the
// rule is "compiled subset must agree with the JSON", not
// "JSON must equal compiled".

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	DEFAULT_VAULT_LINT_CONFIG,
	mergeVaultLintConfig,
} from '@/service/lint/config/VaultLintDefaults';

const TEMPLATE_PATH = path.resolve(
	process.cwd(),
	'templates/config/vault-lint-config.json',
);
const DEFAULTS_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/config/VaultLintDefaults.ts',
);
const SERVICE_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/VaultLintService.ts',
);

interface JsonShape {
	dimensionWeights?: Record<string, number>;
	thresholds?: Record<string, number>;
	scan?: Record<string, number>;
}

function readTemplate(): JsonShape {
	return JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8')) as JsonShape;
}

function testTemplateFileExists(): void {
	assert.ok(
		fs.existsSync(TEMPLATE_PATH),
		`templates/config/vault-lint-config.json must exist (governance rule expects editable JSON)`,
	);
	console.log('PASS: templateFileExists');
}

function testDefaultsFileExistsAtGovernancePath(): void {
	assert.ok(
		fs.existsSync(DEFAULTS_PATH),
		`src/service/lint/config/VaultLintDefaults.ts must exist per config defaults governance`,
	);
	console.log('PASS: defaultsFileExistsAtGovernancePath');
}

function testDefaultsFileDocumentsTemplateMirror(): void {
	const source = fs.readFileSync(DEFAULTS_PATH, 'utf8');
	assert.ok(
		source.includes('templates/config/vault-lint-config.json'),
		'VaultLintDefaults.ts must reference its editable JSON source by path so future readers know the two must agree',
	);
	console.log('PASS: defaultsFileDocumentsTemplateMirror');
}

function testServiceFileNoLongerOwnsDefaults(): void {
	const source = fs.readFileSync(SERVICE_PATH, 'utf8');
	const code = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	assert.ok(
		!/export\s+const\s+DEFAULT_VAULT_LINT_CONFIG\b/.test(code),
		'VaultLintService.ts must not export DEFAULT_VAULT_LINT_CONFIG (moved to VaultLintDefaults.ts)',
	);
	assert.ok(
		!/dimensionWeights\s*:\s*\{\s*structural/.test(code),
		'VaultLintService.ts must not contain an inline dimensionWeights default object',
	);
	assert.ok(
		!/thresholds\s*:\s*\{\s*stubMaxChars/.test(code),
		'VaultLintService.ts must not contain an inline thresholds default object',
	);
	console.log('PASS: serviceFileNoLongerOwnsDefaults');
}

function testDimensionWeightsDoNotDriftFromTemplate(): void {
	const json = readTemplate();
	assert.ok(json.dimensionWeights, 'template must have dimensionWeights block');
	for (const [key, value] of Object.entries(DEFAULT_VAULT_LINT_CONFIG.dimensionWeights)) {
		assert.strictEqual(
			json.dimensionWeights[key],
			value,
			`dimensionWeights.${key} differs between compiled fallback (${value}) and template (${json.dimensionWeights[key]})`,
		);
	}
	console.log('PASS: dimensionWeightsDoNotDriftFromTemplate');
}

function testThresholdsDoNotDriftFromTemplate(): void {
	const json = readTemplate();
	assert.ok(json.thresholds, 'template must have thresholds block');
	for (const [key, value] of Object.entries(DEFAULT_VAULT_LINT_CONFIG.thresholds)) {
		assert.strictEqual(
			json.thresholds[key],
			value,
			`thresholds.${key} differs between compiled fallback (${value}) and template (${json.thresholds[key]})`,
		);
	}
	console.log('PASS: thresholdsDoNotDriftFromTemplate');
}

function testScanSettingsDoNotDriftFromTemplate(): void {
	const json = readTemplate();
	assert.ok(json.scan, 'template must have scan block');
	for (const [key, value] of Object.entries(DEFAULT_VAULT_LINT_CONFIG.scan)) {
		assert.strictEqual(
			json.scan[key],
			value,
			`scan.${key} differs between compiled fallback (${value}) and template (${json.scan[key]})`,
		);
	}
	console.log('PASS: scanSettingsDoNotDriftFromTemplate');
}

function testMergeReturnsCompiledFallbackOnNull(): void {
	const merged = mergeVaultLintConfig(null);
	assert.deepStrictEqual(
		merged.dimensionWeights,
		DEFAULT_VAULT_LINT_CONFIG.dimensionWeights,
	);
	assert.deepStrictEqual(
		merged.thresholds,
		DEFAULT_VAULT_LINT_CONFIG.thresholds,
	);
	assert.deepStrictEqual(merged.scan, DEFAULT_VAULT_LINT_CONFIG.scan);
	console.log('PASS: mergeReturnsCompiledFallbackOnNull');
}

function testMergeOverlaysPartialOnTopOfFallback(): void {
	const merged = mergeVaultLintConfig({
		thresholds: {
			...DEFAULT_VAULT_LINT_CONFIG.thresholds,
			stubMaxChars: 999,
		},
	});
	assert.strictEqual(merged.thresholds.stubMaxChars, 999);
	// Other fallback keys preserved.
	assert.strictEqual(
		merged.thresholds.oversizedMinWords,
		DEFAULT_VAULT_LINT_CONFIG.thresholds.oversizedMinWords,
	);
	assert.deepStrictEqual(
		merged.dimensionWeights,
		DEFAULT_VAULT_LINT_CONFIG.dimensionWeights,
	);
	console.log('PASS: mergeOverlaysPartialOnTopOfFallback');
}

function main(): void {
	testTemplateFileExists();
	testDefaultsFileExistsAtGovernancePath();
	testDefaultsFileDocumentsTemplateMirror();
	testServiceFileNoLongerOwnsDefaults();
	testDimensionWeightsDoNotDriftFromTemplate();
	testThresholdsDoNotDriftFromTemplate();
	testScanSettingsDoNotDriftFromTemplate();
	testMergeReturnsCompiledFallbackOnNull();
	testMergeOverlaysPartialOnTopOfFallback();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
