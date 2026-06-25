// T11E (2026-06-25): boundary guards for the Curator Push runtime split.
//
// These tests guarantee the service-layer `src/service/usage/curator/*`
// runtime files never reach `@/app/*`, `@/ui/*`, `obsidian`,
// `EventBus`, or `AppContext`. They also lock in the absence of the
// retired `CuratorRuntimePushService.getInstance` singleton path and
// confirm `main.ts` boots through the composer rather than the legacy
// service.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const SERVICE_CURATOR_ROOT = abs('src/service/usage/curator');
const SERVICE_USAGE_ROOT = abs('src/service/usage');
const APP_RUNTIME_REGISTRY = abs('src/app/runtime/AppRuntimeRegistry.ts');
const APP_CONTEXT = abs('src/app/context/AppContext.ts');
const APP_COMPOSE = abs('src/app/usage/composeCuratorPushRuntime.ts');
const MAIN_TS = abs('main.ts');

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

function testServiceCuratorTreeIsNonEmpty(): void {
	const files = listTypeScriptFiles(SERVICE_CURATOR_ROOT);
	assert.ok(
		files.length >= 3,
		`expected src/service/usage/curator to contain at least 3 .ts files, found ${files.length}`,
	);
	console.log(`PASS: serviceCuratorTreeIsNonEmpty (${files.length} files)`);
}

function testServiceCuratorHasNoForbiddenImports(): void {
	const files = listTypeScriptFiles(SERVICE_CURATOR_ROOT);
	const violations: string[] = [];
	for (const file of files) {
		const { specifiers, code } = readLive(file);
		const rel = path.relative(process.cwd(), file);
		for (const spec of specifiers) {
			if (/^@\/app\//.test(spec)) {
				violations.push(`${rel}: forbidden '@/app/' import '${spec}'`);
			}
			if (/^@\/ui\//.test(spec)) {
				violations.push(`${rel}: forbidden '@/ui/' import '${spec}'`);
			}
			if (spec === 'obsidian') {
				violations.push(`${rel}: forbidden 'obsidian' import`);
			}
			if (/EventBus|eventBus/.test(spec)) {
				violations.push(`${rel}: forbidden EventBus import '${spec}'`);
			}
			if (/AppContext/.test(spec)) {
				violations.push(`${rel}: forbidden AppContext import '${spec}'`);
			}
			if (/zustand/.test(spec)) {
				violations.push(`${rel}: forbidden zustand import '${spec}'`);
			}
		}
		if (/\bAppContext\s*\.\s*(getInstance|tryGet|get|set|clear)\w*\s*\(/.test(code)) {
			violations.push(`${rel}: still calls AppContext.* in live code`);
		}
		if (/\bEventBus\s*\.\s*getInstance\s*\(/.test(code)) {
			violations.push(`${rel}: still calls EventBus.getInstance() in live code`);
		}
	}
	if (violations.length > 0) {
		assert.fail(`T11E closure violated:\n  ${violations.join('\n  ')}`);
	}
	console.log('PASS: serviceCuratorHasNoForbiddenImports');
}

function testRetiredCuratorSingletonIsGone(): void {
	// Sweep src/ + main.ts for live calls to the retired singleton.
	// Comment-only references are stripped out so historical breadcrumbs
	// stay legal.
	const roots = [path.resolve(process.cwd(), 'src'), MAIN_TS];
	const offenders: string[] = [];
	for (const root of roots) {
		const targets = fs.statSync(root).isDirectory()
			? listTypeScriptFiles(root)
			: [root];
		for (const abs of targets) {
			const code = stripComments(fs.readFileSync(abs, 'utf8'));
			if (/CuratorRuntimePushService\s*\.\s*getInstance\s*\(/.test(code)) {
				offenders.push(`${path.relative(process.cwd(), abs)}: live CuratorRuntimePushService.getInstance() call`);
			}
		}
	}
	if (offenders.length > 0) {
		assert.fail(`T11E closure violated:\n  ${offenders.join('\n  ')}`);
	}
	console.log('PASS: retiredCuratorSingletonIsGone');
}

function testServiceUsageDoesNotImportCuratorPushStore(): void {
	const files = listTypeScriptFiles(SERVICE_USAGE_ROOT);
	const offenders: string[] = [];
	for (const file of files) {
		const { specifiers } = readLive(file);
		for (const spec of specifiers) {
			if (/curatorPushStore/.test(spec)) {
				offenders.push(`${path.relative(process.cwd(), file)}: imports '${spec}'`);
			}
		}
	}
	if (offenders.length > 0) {
		assert.fail(`T11E closure violated: service/usage imports the UI store:\n  ${offenders.join('\n  ')}`);
	}
	console.log('PASS: serviceUsageDoesNotImportCuratorPushStore');
}

function testMainTsBootsThroughComposer(): void {
	const { code, specifiers } = readLive(MAIN_TS);
	if (!specifiers.includes('@/app/usage/composeCuratorPushRuntime')) {
		assert.fail('T11E closure violated: main.ts must import composeCuratorPushRuntime from @/app/usage/.');
	}
	if (specifiers.includes('@/service/usage/CuratorRuntimePushService')) {
		assert.fail('T11E closure violated: main.ts must not import the retired CuratorRuntimePushService.');
	}
	if (!/composeCuratorPushRuntime\s*\(/.test(code)) {
		assert.fail('T11E closure violated: main.ts must call composeCuratorPushRuntime().');
	}
	if (!/AppContext\.setCuratorPushRuntime\s*\(/.test(code)) {
		assert.fail('T11E closure violated: main.ts must bind the runtime via AppContext.setCuratorPushRuntime().');
	}
	if (!/AppContext\.clearCuratorPushRuntime\s*\(/.test(code)) {
		assert.fail('T11E closure violated: main.ts onunload must call AppContext.clearCuratorPushRuntime().');
	}
	console.log('PASS: mainTsBootsThroughComposer');
}

function testAppRuntimeRegistryOwnsCuratorPushRuntime(): void {
	const { code } = readLive(APP_RUNTIME_REGISTRY);
	const required = [
		/setCuratorPushRuntime\s*\(/,
		/getCuratorPushRuntime\s*\(/,
		/tryGetCuratorPushRuntime\s*\(/,
		/clearCuratorPushRuntime\s*\(/,
	];
	for (const re of required) {
		if (!re.test(code)) {
			assert.fail(`T11E closure violated: AppRuntimeRegistry must expose ${re}.`);
		}
	}
	console.log('PASS: appRuntimeRegistryOwnsCuratorPushRuntime');
}

function testAppContextDelegatesCuratorPushRuntime(): void {
	const { code } = readLive(APP_CONTEXT);
	const required = [
		/static\s+setCuratorPushRuntime\s*\(/,
		/static\s+tryGetCuratorPushRuntime\s*\(/,
		/static\s+clearCuratorPushRuntime\s*\(/,
	];
	for (const re of required) {
		if (!re.test(code)) {
			assert.fail(`T11E closure violated: AppContext must expose ${re}.`);
		}
	}
	console.log('PASS: appContextDelegatesCuratorPushRuntime');
}

function testComposerIsTheOnlyWiringSite(): void {
	const { specifiers } = readLive(APP_COMPOSE);
	const required = [
		'obsidian',
		'@/core/eventBus',
		'@/ui/view/usage-dashboard/runtime/curatorPushStore',
		'@/ui/view/usage-dashboard/integration/chatBridge',
		'@/service/usage/curator/CuratorPushRuntime',
	];
	for (const spec of required) {
		if (!specifiers.includes(spec)) {
			assert.fail(`T11E closure violated: composer must import '${spec}'.`);
		}
	}
	console.log('PASS: composerIsTheOnlyWiringSite');
}

function testNoNewServiceLayerRuntimeSingleton(): void {
	const offenders: string[] = [];
	for (const file of listTypeScriptFiles(SERVICE_CURATOR_ROOT)) {
		const code = stripComments(fs.readFileSync(file, 'utf8'));
		if (/^\s*let\s+\w*[Rr]untime\w*\s*[:=][^;]*null\s*;/m.test(code)) {
			offenders.push(path.relative(process.cwd(), file));
		}
		if (/^\s*let\s+current\w*\s*[:=][^;]*null\s*;/m.test(code)) {
			offenders.push(path.relative(process.cwd(), file));
		}
		if (/static\s+getInstance\s*\(/.test(code)) {
			offenders.push(`${path.relative(process.cwd(), file)}: static getInstance(`);
		}
	}
	if (offenders.length > 0) {
		assert.fail(`T11E closure violated: service-layer module runtime singleton in:\n  ${offenders.join('\n  ')}`);
	}
	console.log('PASS: noNewServiceLayerRuntimeSingleton');
}

function main(): void {
	testServiceCuratorTreeIsNonEmpty();
	testServiceCuratorHasNoForbiddenImports();
	testRetiredCuratorSingletonIsGone();
	testServiceUsageDoesNotImportCuratorPushStore();
	testMainTsBootsThroughComposer();
	testAppRuntimeRegistryOwnsCuratorPushRuntime();
	testAppContextDelegatesCuratorPushRuntime();
	testComposerIsTheOnlyWiringSite();
	testNoNewServiceLayerRuntimeSingleton();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
