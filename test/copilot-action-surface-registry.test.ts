// T11 + T11B (2026-06-14): binding-completeness checks for the Copilot
// action surface registry.
//
// The service action layer only ships `iconId` + `id`; the UI surface
// registry must resolve both to a real component for every registered
// built-in action AND for any `custom-*` id.
//
// T11B replaced the singleton `CopilotActionRegistry` with the app-owned
// {@link CopilotActionRuntime}. This test now constructs a runtime with
// the *built-in* action catalog (no custom prompts) using fake ports —
// no AppContext / sqlite / Obsidian is required.

import assert from 'assert';
import { createBuiltInCopilotActions } from '@/service/copilot/actions';
import type { CopilotActionPorts } from '@/service/copilot/actions/CopilotActionPorts';
import {
	_internal,
	getCopilotActionIcon,
	getCopilotResultPanel,
	hasCopilotResultPanel,
} from '@/ui/view/copilot/copilot-action-surfaces';

function noopPorts(): CopilotActionPorts {
	const unreachable = (name: string) => () => {
		throw new Error(`fake port ${name} should not be invoked by binding test`);
	};
	return {
		ai: {
			renderPrompt: unreachable('ai.renderPrompt') as any,
			queryStructured: unreachable('ai.queryStructured') as any,
			queryTextStream: unreachable('ai.queryTextStream') as any,
		},
		vault: {
			getMarkdownFiles: () => [],
			cachedRead: unreachable('vault.cachedRead') as any,
			getFileCache: () => null,
			getResolvedLinks: () => ({}),
			getFirstLinkpathDest: () => null,
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
}

function testEveryBuiltInActionHasAnIconBinding(): void {
	const actions = createBuiltInCopilotActions(noopPorts());
	assert.ok(actions.length >= 25, `expected the built-in set; got ${actions.length}`);

	const missing: string[] = [];
	for (const action of actions) {
		const iconId = action.iconId;
		if (typeof iconId !== 'string' || iconId.length === 0) {
			missing.push(`${action.id} (no iconId)`);
			continue;
		}
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
	const actions = createBuiltInCopilotActions(noopPorts());
	const missing: string[] = [];
	for (const action of actions) {
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
