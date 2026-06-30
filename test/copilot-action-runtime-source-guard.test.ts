// T11B (2026-06-14): boundary guards for the Copilot manual-action
// runtime split. These tests guarantee the service-layer
// `src/service/copilot/actions/*` and the supporting
// `TagSuggestionEngine` / `CustomPromptRegistry` files never re-acquire
// the hidden `AppContext.getInstance()` / `SqliteStoreManager.getInstance()`
// / `ProfileRegistry.getInstance()` / `CopilotActionRegistry.getInstance()`
// / `CustomPromptRegistry.getInstance()` lookups that T11B retired.
//
// Comment-only references are stripped before scanning, so historical
// breadcrumbs in module-level doc comments are allowed.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const SERVICE_ACTIONS_INDEX = abs('src/service/copilot/actions/index.ts');
const SERVICE_AGENT_ACTIONS = abs('src/service/copilot/actions/agent-actions.ts');
const SERVICE_TAG_ENGINE = abs('src/service/copilot/TagSuggestionEngine.ts');
const SERVICE_CUSTOM_PROMPT = abs('src/service/copilot/CustomPromptRegistry.ts');
const SERVICE_ACTION_REGISTRY = abs('src/service/copilot/CopilotActionRegistry.ts');
const UI_PICKER_MODAL = abs('src/ui/view/copilot/CopilotPickerContent.tsx'); // CopilotPickerModal.tsx was renamed to CopilotPickerContent.tsx
const APP_COMMANDS_REGISTER = abs('src/app/commands/Register.ts');
const APP_RUNTIME_REGISTRY = abs('src/app/context/AppRuntimeRegistry.ts');

function abs(rel: string): string {
	return path.resolve(process.cwd(), rel);
}

function listTypeScriptFiles(root: string): string[] {
	const out: string[] = [];
	function walk(dir: string): void {
		if (!fs.existsSync(dir)) return;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) out.push(full);
		}
	}
	walk(root);
	return out;
}

function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
}

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function readLive(file: string): { source: string; code: string; specifiers: string[] } {
	const source = fs.readFileSync(file, 'utf8');
	return { source, code: stripComments(source), specifiers: extractImportSpecifiers(source) };
}

function testServiceActionsIndexHasNoServiceLocatorLookups(): void {
	const { code, specifiers } = readLive(SERVICE_ACTIONS_INDEX);
	const violations: string[] = [];
	if (/\bAppContext\.getInstance\b/.test(code)) violations.push('AppContext.getInstance');
	if (/\bSqliteStoreManager\.getInstance\b/.test(code)) violations.push('SqliteStoreManager.getInstance');
	if (/\bProfileRegistry\.getInstance\b/.test(code)) violations.push('ProfileRegistry.getInstance');
	if (/\bCopilotActionRegistry\.getInstance\b/.test(code)) violations.push('CopilotActionRegistry.getInstance');
	if (/\bCustomPromptRegistry\.getInstance\b/.test(code)) violations.push('CustomPromptRegistry.getInstance');
	if (specifiers.includes('@/app/context/AppContext')) violations.push('imports @/app/context/AppContext');
	if (violations.length > 0) {
		assert.fail(`T11B closure violated: service actions/index.ts still reaches:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceActionsIndexHasNoServiceLocatorLookups');
}

function testServiceAgentActionsHasNoServiceLocatorLookups(): void {
	const { code, specifiers } = readLive(SERVICE_AGENT_ACTIONS);
	const violations: string[] = [];
	if (/\bAppContext\.getInstance\b/.test(code)) violations.push('AppContext.getInstance');
	if (/\bProfileRegistry\.getInstance\b/.test(code)) violations.push('ProfileRegistry.getInstance');
	if (specifiers.includes('@/app/context/AppContext')) violations.push('imports @/app/context/AppContext');
	if (specifiers.includes('@/core/profiles/ProfileRegistry')) violations.push('imports @/core/profiles/ProfileRegistry');
	if (violations.length > 0) {
		assert.fail(`T11B closure violated: service agent-actions.ts still reaches:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceAgentActionsHasNoServiceLocatorLookups');
}

function testServiceTagEngineHasNoSqliteSingleton(): void {
	const { code, specifiers } = readLive(SERVICE_TAG_ENGINE);
	const violations: string[] = [];
	if (/\bSqliteStoreManager\.getInstance\b/.test(code)) violations.push('SqliteStoreManager.getInstance');
	if (/\bsqliteStoreManager\.(getMobiusNodeRepo|getMobiusEdgeRepo|getIndexContext|getTagSuggestionRepo)/.test(code)) {
		violations.push('direct sqliteStoreManager use');
	}
	if (specifiers.includes('@/core/storage/sqlite/SqliteStoreManager')) {
		violations.push('imports @/core/storage/sqlite/SqliteStoreManager');
	}
	if (violations.length > 0) {
		assert.fail(`T11B closure violated: TagSuggestionEngine still reaches sqlite singleton:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceTagEngineHasNoSqliteSingleton');
}

function testServiceCustomPromptRegistryIsPlainParser(): void {
	const { code, specifiers } = readLive(SERVICE_CUSTOM_PROMPT);
	const violations: string[] = [];
	if (/\bAppContext\b/.test(code)) violations.push('AppContext value reference');
	if (specifiers.includes('@/app/context/AppContext')) violations.push('imports @/app/context/AppContext');
	if (specifiers.includes('obsidian')) violations.push('imports obsidian (should live behind an app adapter)');
	if (/static\s+getInstance\s*\(/.test(code)) violations.push('static getInstance(');
	if (/private\s+static\s+instance\b/.test(code)) violations.push('private static instance');
	if (violations.length > 0) {
		assert.fail(`T11B closure violated: CustomPromptRegistry must be a plain parser:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceCustomPromptRegistryIsPlainParser');
}

function testServiceCopilotActionRegistryHasNoSingleton(): void {
	const { code } = readLive(SERVICE_ACTION_REGISTRY);
	const violations: string[] = [];
	if (/private\s+static\s+instance\b/.test(code)) violations.push('private static instance');
	if (/static\s+getInstance\s*\(/.test(code)) violations.push('static getInstance(');
	if (violations.length > 0) {
		assert.fail(`T11B closure violated: CopilotActionRegistry must drop its singleton:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceCopilotActionRegistryHasNoSingleton');
}

function testUiPickerModalUsesRuntime(): void {
	const { code } = readLive(UI_PICKER_MODAL);
	if (/\bCopilotActionRegistry\.getInstance\b/.test(code)) {
		assert.fail('T11B closure violated: CopilotPickerModal must not call CopilotActionRegistry.getInstance().');
	}
	console.log('PASS: uiPickerModalUsesRuntime');
}

function testCommandsRegisterDoesNotBootstrapActions(): void {
	const { code, specifiers } = readLive(APP_COMMANDS_REGISTER);
	if (/\bregisterAllCopilotActions\b/.test(code)) {
		assert.fail('T11B closure violated: buildCoreCommands must not call registerAllCopilotActions.');
	}
	if (specifiers.includes('@/service/copilot/actions')) {
		assert.fail('T11B closure violated: Register.ts must not import @/service/copilot/actions.');
	}
	console.log('PASS: commandsRegisterDoesNotBootstrapActions');
}

function testAppRuntimeRegistryOwnsCopilotActionRuntime(): void {
	const { code } = readLive(APP_RUNTIME_REGISTRY);
	const required = [
		/setCopilotActionRuntime\s*\(/,
		/getCopilotActionRuntime\s*\(/,
		/tryGetCopilotActionRuntime\s*\(/,
		/clearCopilotActionRuntime\s*\(/,
	];
	for (const re of required) {
		if (!re.test(code)) {
			assert.fail(`T11B closure violated: AppRuntimeRegistry must expose ${re}.`);
		}
	}
	console.log('PASS: appRuntimeRegistryOwnsCopilotActionRuntime');
}

function testMainBindsCopilotRuntimeBeforeInitSqlite(): void {
	// T11B-R closure: the Copilot manual-action catalog must be
	// available even when initSqlite() defers or fails (mobile, native
	// module download pending, ABI mismatch). The guard scans main.ts
	// and asserts that `setCopilotActionRuntime(...)` appears at an
	// offset before the first `initSqlite(` call site — i.e. the bind
	// is NOT nested inside the SQLite success path.
	const mainPath = path.resolve(process.cwd(), 'main.ts');
	const source = stripComments(fs.readFileSync(mainPath, 'utf8'));
	const setIdx = source.indexOf('setCopilotActionRuntime(');
	const initIdx = source.indexOf('initSqlite(');
	if (setIdx < 0) {
		assert.fail('T11B-R closure violated: main.ts does not call setCopilotActionRuntime.');
	}
	if (initIdx < 0) {
		assert.fail('T11B-R guard pre-req missing: main.ts does not call initSqlite — guard cannot verify boot order.');
	}
	if (setIdx > initIdx) {
		assert.fail('T11B-R closure violated: setCopilotActionRuntime must appear before the first initSqlite() call site in main.ts onload — the catalog must bind before SQLite init runs.');
	}
	// Belt-and-braces: ensure the call is not still nested in the
	// `if (this.sqliteInitPromise)` / `initSqlite` inner block by
	// requiring at least one occurrence outside that block. The
	// simplest check: there must be exactly one `setCopilotActionRuntime`
	// call site.
	const occurrences = source.split('setCopilotActionRuntime(').length - 1;
	assert.strictEqual(occurrences, 1, `T11B-R closure violated: expected exactly one setCopilotActionRuntime() call in main.ts, found ${occurrences}.`);
	console.log('PASS: mainBindsCopilotRuntimeBeforeInitSqlite');
}

function testNoNewServiceLayerRuntimeSingleton(): void {
	// Sweep src/service/copilot for module-level mutable runtime bindings
	// that would reintroduce the pattern T11B is closing.
	const offenders: string[] = [];
	const serviceCopilotRoot = path.resolve(process.cwd(), 'src/service/copilot');
	for (const file of listTypeScriptFiles(serviceCopilotRoot)) {
		const code = stripComments(fs.readFileSync(file, 'utf8'));
		// `let currentRuntime = null` / `let current... = null` etc.
		if (/^\s*let\s+\w*[Rr]untime\w*\s*[:=][^;]*null\s*;/m.test(code)) {
			offenders.push(path.relative(process.cwd(), file));
		}
		if (/^\s*let\s+current\w*\s*[:=][^;]*null\s*;/m.test(code)) {
			offenders.push(path.relative(process.cwd(), file));
		}
	}
	if (offenders.length > 0) {
		assert.fail(`T11B closure violated: service-layer module runtime singleton in:\n  ${offenders.join('\n  ')}`);
	}
	console.log('PASS: noNewServiceLayerRuntimeSingleton');
}

function main(): void {
	testServiceActionsIndexHasNoServiceLocatorLookups();
	testServiceAgentActionsHasNoServiceLocatorLookups();
	testServiceTagEngineHasNoSqliteSingleton();
	testServiceCustomPromptRegistryIsPlainParser();
	testServiceCopilotActionRegistryHasNoSingleton();
	testUiPickerModalUsesRuntime();
	testCommandsRegisterDoesNotBootstrapActions();
	testAppRuntimeRegistryOwnsCopilotActionRuntime();
	testMainBindsCopilotRuntimeBeforeInitSqlite();
	testNoNewServiceLayerRuntimeSingleton();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
