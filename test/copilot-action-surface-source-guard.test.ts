// T11 Copilot action surface boundary guards.
//
// One test file, several rules — all aimed at preventing the
// service-layer Copilot action registry from re-acquiring the UI
// component dependencies it carried before T11:
//
//   1. `src/service/copilot/actions/index.ts` may not import any
//      panel from `@/ui/view/copilot/panels` or anything from
//      `lucide-react`.
//   2. `src/service/copilot/CopilotActionRegistry.ts` may not import
//      `lucide-react` and may not name `React.ComponentType` in live
//      code.
//   3. `src/service/copilot/CustomPromptRegistry.ts` may not import
//      `lucide-react` or set `ResultPanel`.
//   4. No production code under `src/` may write `.ResultPanel =`
//      onto a Copilot action.
//   5. No `.ts`/`.tsx` file under `src/service/**` may name the
//      `ResultPanel` property in live code.
//   6. The Copilot result panel map lives under `src/ui/`, NOT under
//      `src/service/`.
//
// Comment-only references are stripped before scanning, so historical
// breadcrumbs in module-level doc comments are allowed.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const SERVICE_ACTIONS_INDEX = path.resolve(
	process.cwd(),
	'src/service/copilot/actions/index.ts',
);
const COPILOT_ACTION_REGISTRY = path.resolve(
	process.cwd(),
	'src/service/copilot/CopilotActionRegistry.ts',
);
const CUSTOM_PROMPT_REGISTRY = path.resolve(
	process.cwd(),
	'src/service/copilot/CustomPromptRegistry.ts',
);
const SURFACE_REGISTRY = path.resolve(
	process.cwd(),
	'src/ui/view/copilot/copilot-action-surfaces.tsx',
);

function listTypeScriptFiles(root: string): string[] {
	const out: string[] = [];
	function walk(dir: string): void {
		if (!fs.existsSync(dir)) return;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
				out.push(full);
			}
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

function testServiceActionsIndexHasNoUiPanelOrLucideImports(): void {
	assert.ok(fs.existsSync(SERVICE_ACTIONS_INDEX), 'service actions index must exist');
	const source = fs.readFileSync(SERVICE_ACTIONS_INDEX, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	const panelImports = specifiers.filter(s => /^@\/ui\/view\/copilot\/panels\b/.test(s));
	const lucideImports = specifiers.filter(s => s === 'lucide-react');
	if (panelImports.length > 0 || lucideImports.length > 0) {
		assert.fail(
			'T11 closure violated: src/service/copilot/actions/index.ts must not import UI panels or lucide-react.\n' +
			`  panel imports: ${JSON.stringify(panelImports)}\n` +
			`  lucide imports: ${JSON.stringify(lucideImports)}`,
		);
	}
	console.log('PASS: serviceActionsIndexHasNoUiPanelOrLucideImports');
}

function testActionsIndexLiveCodeHasNoResultPanelOrPanelMap(): void {
	const code = stripComments(fs.readFileSync(SERVICE_ACTIONS_INDEX, 'utf8'));
	if (/\bResultPanel\b/.test(code)) {
		assert.fail('T11 closure violated: actions/index.ts still names ResultPanel in live code.');
	}
	if (/\bPANEL_MAP\b/.test(code)) {
		assert.fail('T11 closure violated: actions/index.ts still defines PANEL_MAP in live code.');
	}
	console.log('PASS: actionsIndexLiveCodeHasNoResultPanelOrPanelMap');
}

function testCopilotActionRegistryHasNoReactOrLucide(): void {
	const source = fs.readFileSync(COPILOT_ACTION_REGISTRY, 'utf8');
	const code = stripComments(source);
	const specifiers = extractImportSpecifiers(source);
	if (specifiers.includes('lucide-react')) {
		assert.fail('T11 closure violated: CopilotActionRegistry.ts must not import lucide-react.');
	}
	if (/\bReact\.ComponentType\b/.test(code)) {
		assert.fail('T11 closure violated: CopilotActionRegistry.ts must not name React.ComponentType in live code.');
	}
	if (/\bLucideIcon\b/.test(code)) {
		assert.fail('T11 closure violated: CopilotActionRegistry.ts must not name LucideIcon in live code.');
	}
	if (/\bResultPanel\b/.test(code)) {
		assert.fail('T11 closure violated: CopilotActionRegistry.ts must not name ResultPanel in live code.');
	}
	console.log('PASS: copilotActionRegistryHasNoReactOrLucide');
}

function testCustomPromptRegistryHasNoLucideOrResultPanel(): void {
	const source = fs.readFileSync(CUSTOM_PROMPT_REGISTRY, 'utf8');
	const code = stripComments(source);
	const specifiers = extractImportSpecifiers(source);
	if (specifiers.includes('lucide-react')) {
		assert.fail('T11 closure violated: CustomPromptRegistry.ts must not import lucide-react.');
	}
	if (/\bResultPanel\b/.test(code)) {
		assert.fail('T11 closure violated: CustomPromptRegistry.ts must not name ResultPanel in live code.');
	}
	console.log('PASS: customPromptRegistryHasNoLucideOrResultPanel');
}

function testNoProductionCodeWritesResultPanelAssignment(): void {
	// Catch `action.ResultPanel = X` / `<action>.ResultPanel = X` writes
	// in live src/ code. The surface registry is keyed by `action.id` —
	// no production code should mutate the action object back into a
	// view-model carrier.
	const writes: string[] = [];
	const srcRoot = path.resolve(process.cwd(), 'src');
	for (const abs of listTypeScriptFiles(srcRoot)) {
		const code = stripComments(fs.readFileSync(abs, 'utf8'));
		if (/\.\s*ResultPanel\s*=/.test(code)) {
			writes.push(path.relative(process.cwd(), abs));
		}
	}
	if (writes.length > 0) {
		assert.fail(`T11 closure violated: live ResultPanel assignment in production code:\n  ${writes.join('\n  ')}`);
	}
	console.log('PASS: noProductionCodeWritesResultPanelAssignment');
}

function testServiceCopilotHasNoResultPanelMentions(): void {
	// Sweep every .ts/.tsx in src/service/copilot/ for live `ResultPanel`
	// references; comments are allowed because they help the next
	// reader find the T11 split.
	const serviceCopilotRoot = path.resolve(process.cwd(), 'src/service/copilot');
	const mentions: string[] = [];
	for (const abs of listTypeScriptFiles(serviceCopilotRoot)) {
		const code = stripComments(fs.readFileSync(abs, 'utf8'));
		if (/\bResultPanel\b/.test(code)) {
			mentions.push(path.relative(process.cwd(), abs));
		}
	}
	if (mentions.length > 0) {
		assert.fail(`T11 closure violated: ResultPanel still named in live code under src/service/copilot:\n  ${mentions.join('\n  ')}`);
	}
	console.log('PASS: serviceCopilotHasNoResultPanelMentions');
}

function testPanelMapLivesOutsideServiceLayer(): void {
	// The panel map (action.id → React panel) must live under src/ui/
	// or src/app/. We assert by file location instead of content: the
	// surface registry exists at the expected path AND src/service/**
	// declares no `PANEL_MAP` const.
	assert.ok(fs.existsSync(SURFACE_REGISTRY), 'Copilot surface registry must exist at src/ui/view/copilot/copilot-action-surfaces.tsx');
	const serviceRoot = path.resolve(process.cwd(), 'src/service');
	const offenders: string[] = [];
	for (const abs of listTypeScriptFiles(serviceRoot)) {
		const code = stripComments(fs.readFileSync(abs, 'utf8'));
		if (/\bPANEL_MAP\b/.test(code) || /\bCOPILOT_PANEL_MAP\b/.test(code)) {
			offenders.push(path.relative(process.cwd(), abs));
		}
	}
	if (offenders.length > 0) {
		assert.fail(`T11 closure violated: panel map lives under src/service/ in:\n  ${offenders.join('\n  ')}`);
	}
	console.log('PASS: panelMapLivesOutsideServiceLayer');
}

function main(): void {
	testServiceActionsIndexHasNoUiPanelOrLucideImports();
	testActionsIndexLiveCodeHasNoResultPanelOrPanelMap();
	testCopilotActionRegistryHasNoReactOrLucide();
	testCustomPromptRegistryHasNoLucideOrResultPanel();
	testNoProductionCodeWritesResultPanelAssignment();
	testServiceCopilotHasNoResultPanelMentions();
	testPanelMapLivesOutsideServiceLayer();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
