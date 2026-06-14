import assert from 'assert';
import { planCopilotAutoRun } from '../src/service/copilot/CopilotAutoPlanner';
import type { CopilotAction, DocumentContext } from '../src/service/copilot/CopilotActionRegistry';

function makeCtx(overrides: Partial<DocumentContext> = {}): DocumentContext {
	return {
		file: { path: 'Strategy Direction.md', basename: 'Strategy Direction' } as any,
		title: 'Strategy Direction',
		content: 'This is a long note about knowledge work, evidence, related notes, tasks, and product strategy. '.repeat(40),
		scope: 'full',
		wordCount: 420,
		tags: [],
		links: [],
		backlinks: 0,
		headingCount: 4,
		isOrphan: true,
		frontmatter: {},
		...overrides,
	};
}

function action(
	id: string,
	category: CopilotAction['category'],
	score: number,
	guard?: CopilotAction['guard'],
): CopilotAction {
	return {
		id,
		label: id,
		description: id,
		iconId: 'sparkles',
		category,
		relevance: () => score,
		guard,
		execute: (async function* () { return { type: 'structured' as const, data: {} }; }) as any,
	};
}

const actions = [
	action('suggest-links', 'document', 0.9),
	action('add-evidence', 'writing', 0.8),
	action('polish', 'document', 0.7),
	action('format-polish', 'document', 0.6),
	action('correct-content', 'document', 0.5),
	action('rewrite-selection', 'writing', 0.45),
	action('suggest-tags', 'document', 0.4),
	action('vault-health', 'vault', 0.95),
	action('smart-connections', 'vault', 0.85),
	action('prompt-audit', 'vault', 1),
	action('translate', 'document', 0.1),
];

const documentPlan = planCopilotAutoRun({
	tab: 'document',
	ctx: makeCtx({ selection: 'selected claim', scope: 'selection' }),
	actions,
});

assert.equal(documentPlan.tab, 'document');
assert.deepStrictEqual(documentPlan.selectedActions.map(item => item.action.id), [
	'suggest-links',
	'add-evidence',
	'polish',
	'format-polish',
]);
assert.ok(documentPlan.analysisSummary.includes('selection'));
assert.ok(documentPlan.selectedActions[0].reason.includes('weak connection signals'));
assert.deepStrictEqual(documentPlan.signals, [
	'selection active',
	'orphan note',
	'few outgoing links',
	'missing tags',
	'no backlinks',
	'long enough for review',
	'structured note',
]);

assert.deepStrictEqual(
	documentPlan.skippedActions.map(item => item.action.id),
	['correct-content', 'rewrite-selection', 'suggest-tags', 'translate'],
);
assert.equal(
	documentPlan.skippedActions.find(item => item.action.id === 'translate')?.reason,
	'Low relevance for the current context.',
);

const vaultPlan = planCopilotAutoRun({ tab: 'vault', ctx: makeCtx({}), actions });
assert.deepStrictEqual(vaultPlan.selectedActions.map(item => item.action.id), ['vault-health', 'smart-connections']);

const settingPlan = planCopilotAutoRun({ tab: 'setting', ctx: makeCtx({}), actions });
assert.deepStrictEqual(settingPlan.selectedActions.map(item => item.action.id), ['prompt-audit']);

const riskById = new Map(documentPlan.selectedActions.map(item => [item.action.id, item.risk]));
assert.equal(riskById.get('suggest-links'), 'suggests-change');
assert.equal(riskById.get('add-evidence'), 'mutates-after-review');
assert.equal(riskById.get('polish'), 'mutates-after-review');
assert.equal(vaultPlan.selectedActions.find(item => item.action.id === 'smart-connections')?.risk, 'suggests-change');
assert.equal(settingPlan.selectedActions[0].risk, 'read-only');

const currentNotePlan = planCopilotAutoRun({
	tab: 'document',
	ctx: makeCtx({
		tags: ['strategy'],
		links: ['A', 'B', 'C'],
		backlinks: 2,
		headingCount: 1,
		isOrphan: false,
		wordCount: 120,
	}),
	actions: [action('polish', 'document', 0.4)],
});

assert.deepStrictEqual(currentNotePlan.signals, ['current note']);
assert.ok(currentNotePlan.analysisSummary.includes('current note'));

const guardedPlan = planCopilotAutoRun({
	tab: 'document',
	ctx: makeCtx(),
	actions: [
		action('guarded-high-score', 'document', 0.99, () => 'Selection required.'),
		action('suggest-links', 'document', 0.9),
		action('polish', 'document', 0.7),
	],
});

assert.deepStrictEqual(guardedPlan.selectedActions.map(item => item.action.id), ['suggest-links', 'polish']);
assert.equal(
	guardedPlan.skippedActions.find(item => item.action.id === 'guarded-high-score')?.reason,
	'Selection required.',
);
