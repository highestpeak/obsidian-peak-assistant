// T11: binding-completeness checks for the Copilot action surface
// registry. The service action layer now only ships `iconId` + `id`;
// the UI surface registry must resolve both to a real component for
// every registered built-in action AND for any `custom-*` id.
//
// The registry exposes a `_internal` shape so tests can read the maps
// without exporting them as public API.

import assert from 'assert';
import { CopilotActionRegistry } from '@/service/copilot/CopilotActionRegistry';
import { registerAllCopilotActions } from '@/service/copilot/actions';
import {
	_internal,
	getCopilotActionIcon,
	getCopilotResultPanel,
	hasCopilotResultPanel,
} from '@/ui/view/copilot/copilot-action-surfaces';

// Avoid a hard dependency on a global `AppContext` for this purely
// surface-layer test. Registering built-in actions only mutates the
// in-memory registry — `loadCustomPromptActions` runs as a fire-and-
// forget async path and will fail without AppContext, which is fine
// since this test only inspects the synchronously-registered set.

function safeRegister(): void {
	try {
		registerAllCopilotActions();
	} catch (e) {
		// Custom-prompt loading touches AppContext; that's OK to fail
		// in the unit-test sandbox. We only need the synchronous
		// built-in registration which completes before the throw.
	}
}

function testEveryBuiltInActionHasAnIconBinding(): void {
	safeRegister();
	const registry = CopilotActionRegistry.getInstance();
	const actions = registry.getAll();
	assert.ok(actions.length >= 25, `expected the built-in set to register; got ${actions.length}`);

	const missing: string[] = [];
	for (const action of actions) {
		const iconId = action.iconId;
		if (typeof iconId !== 'string' || iconId.length === 0) {
			missing.push(`${action.id} (no iconId)`);
			continue;
		}
		// `getCopilotActionIcon` always returns something (fallback is
		// HelpCircle), so we instead check the underlying map directly
		// to verify the slug was explicitly registered.
		if (!_internal.ICON_MAP[iconId]) {
			missing.push(`${action.id} (iconId='${iconId}' not in ICON_MAP)`);
		}
	}
	if (missing.length > 0) {
		assert.fail(`T11 surface binding gap: actions without an explicit icon mapping:\n  ${missing.join('\n  ')}`);
	}
	console.log(`PASS: everyBuiltInActionHasAnIconBinding (${actions.length} actions)`);
}

function testEveryBuiltInActionHasAResultPanelBinding(): void {
	safeRegister();
	const registry = CopilotActionRegistry.getInstance();
	const missing: string[] = [];
	for (const action of registry.getAll()) {
		if (action.id.startsWith('custom-')) continue;
		if (!hasCopilotResultPanel(action.id)) {
			missing.push(action.id);
		}
	}
	if (missing.length > 0) {
		assert.fail(`T11 surface binding gap: built-in actions without a panel binding:\n  ${missing.join('\n  ')}`);
	}
	console.log('PASS: everyBuiltInActionHasAResultPanelBinding');
}

function testCustomPromptIdsResolveToDefaultPanel(): void {
	// Custom prompts produced by CustomPromptRegistry use ids of shape
	// `custom-<slug>`. The surface registry must return the default
	// panel for any such id, even ones it has never seen.
	const probes = ['custom-arbitrary-slug', 'custom-rewrite-v2', 'custom-x'];
	for (const id of probes) {
		assert.strictEqual(
			hasCopilotResultPanel(id),
			true,
			`expected custom-* id ${id} to report a default panel binding`,
		);
		const panel = getCopilotResultPanel(id);
		assert.strictEqual(
			panel,
			_internal.CUSTOM_PROMPT_DEFAULT_PANEL,
			`expected ${id} to resolve to the WritingPlanPanel default`,
		);
	}
	console.log('PASS: customPromptIdsResolveToDefaultPanel');
}

function testUnknownIdResolvesToVisibleFallback(): void {
	// Unknown ids must NOT crash and must NOT silently return nothing
	// — they must return a visible fallback so a wiring bug surfaces.
	const panel = getCopilotResultPanel('totally-not-an-action');
	assert.strictEqual(typeof panel, 'function', 'fallback must be a renderable component');
	assert.strictEqual(
		hasCopilotResultPanel('totally-not-an-action'),
		false,
		'unknown id must report no explicit binding',
	);
	console.log('PASS: unknownIdResolvesToVisibleFallback');
}

function testUnknownIconIdResolvesToFallbackIcon(): void {
	const icon = getCopilotActionIcon('this-icon-does-not-exist');
	assert.strictEqual(typeof icon, 'object', 'Lucide icons are forwardRef components');
	assert.strictEqual(
		icon,
		_internal.FallbackIcon,
		'unknown iconId must resolve to the documented fallback',
	);
	console.log('PASS: unknownIconIdResolvesToFallbackIcon');
}

function main(): void {
	testEveryBuiltInActionHasAnIconBinding();
	testEveryBuiltInActionHasAResultPanelBinding();
	testCustomPromptIdsResolveToDefaultPanel();
	testUnknownIdResolvesToVisibleFallback();
	testUnknownIconIdResolvesToFallbackIcon();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
