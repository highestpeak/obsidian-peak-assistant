import assert from 'assert';
import { buildCopilotCommandModel } from '../src/ui/view/copilot/copilot-command-model';
import type { CopilotAction, DocumentContext } from '../src/service/copilot/CopilotActionRegistry';

function makeCtx(overrides: Partial<DocumentContext> = {}): DocumentContext {
	return {
		file: { path: 'A.md', basename: 'A' } as any,
		title: 'A',
		content: 'hello world '.repeat(50),
		scope: 'full',
		wordCount: 100,
		tags: [],
		links: [],
		backlinks: 0,
		headingCount: 1,
		isOrphan: true,
		frontmatter: {},
		...overrides,
	};
}

function action(params: {
	id: string;
	label: string;
	category: CopilotAction['category'];
	score: number;
	description?: string;
	guard?: CopilotAction['guard'];
	intentTab?: CopilotAction['intentTab'];
	requiresDocument?: boolean;
}): CopilotAction {
	return {
		id: params.id,
		label: params.label,
		description: params.description ?? `${params.label} description`,
		icon: (() => null) as any,
		category: params.category,
		intentTab: params.intentTab,
		requiresDocument: params.requiresDocument,
		relevance: () => params.score,
		guard: params.guard,
		execute: (async function* () { return { type: 'structured' as const, data: {} }; }) as any,
		ResultPanel: (() => null) as any,
	};
}

const actions = [
	action({ id: 'suggest-links', label: 'Suggest Links', category: 'document', score: 0.9 }),
	action({ id: 'polish', label: 'Polish Document', category: 'document', score: 0.7 }),
	action({ id: 'rewrite-selection', label: 'Rewrite Selection', category: 'writing', score: 0.68 }),
	action({ id: 'suggest-tags', label: 'Suggest Tags', category: 'document', score: 0.64 }),
	action({ id: 'format-polish', label: 'Format Polish', category: 'document', score: 0.8 }),
	action({ id: 'correct-content', label: 'Correct Content', category: 'document', score: 0.75 }),
	action({
		id: 'guarded-review',
		label: 'Guarded Review',
		category: 'document',
		score: 0.95,
		guard: () => 'Selection required.',
	}),
	action({ id: 'vault-health', label: 'Vault Health', category: 'vault', score: 0.85 }),
	action({ id: 'prompt-audit', label: 'Prompt Audit', category: 'vault', score: 0.95 }),
	action({
		id: 'context-free-setting',
		label: 'Context Free Setting',
		category: 'vault',
		intentTab: 'setting',
		score: 0.4,
		requiresDocument: false,
	}),
];

const queryModel = buildCopilotCommandModel({
	ctx: makeCtx(),
	activeTab: 'document',
	query: 'link',
	actions,
});

assert.equal(queryModel.activeTab.id, 'document');
assert.deepStrictEqual(queryModel.visibleActions.map(item => item.action.id), ['suggest-links']);
assert.deepStrictEqual(
	queryModel.recommendedActions.map(item => item.action.id),
	['suggest-links', 'format-polish', 'correct-content', 'polish'],
);

const selectionModel = buildCopilotCommandModel({
	ctx: makeCtx({ file: { path: 'Folder/B.md', basename: 'B' } as any, scope: 'selection', selection: 'selected claim', wordCount: 12 }),
	activeTab: 'document',
	query: '',
	actions,
});

assert.ok(selectionModel.contextLine.includes('Folder/B.md'));
assert.ok(selectionModel.contextLine.includes('selection'));
assert.ok(selectionModel.contextLine.includes('12 words'));

const currentNoteModel = buildCopilotCommandModel({
	ctx: makeCtx({ file: { path: 'C.md', basename: 'C' } as any, scope: 'full', wordCount: 240 }),
	activeTab: 'document',
	query: '',
	actions: [actions[0]],
});

assert.ok(currentNoteModel.contextLine.includes('C.md'));
assert.ok(currentNoteModel.contextLine.includes('current note'));
assert.ok(currentNoteModel.contextLine.includes('240 words'));

const noContextModel = buildCopilotCommandModel({
	ctx: null,
	activeTab: 'document',
	query: '',
	actions,
});

assert.ok(noContextModel.contextLine.includes('No active document'));
assert.ok(noContextModel.contextLine.includes('context-required actions disabled'));
assert.equal(
	noContextModel.visibleActions.find(item => item.action.id === 'suggest-links')?.disabledReason,
	'Open a document first.',
);
assert.equal(
	noContextModel.visibleActions.find(item => item.action.id === 'rewrite-selection')?.disabledReason,
	'Open a document first.',
);
assert.deepStrictEqual(noContextModel.recommendedActions, []);

const guardModel = buildCopilotCommandModel({
	ctx: makeCtx(),
	activeTab: 'document',
	query: 'guarded',
	actions,
});

assert.equal(guardModel.visibleActions[0].disabledReason, 'Selection required.');
assert.equal(guardModel.visibleActions[0].recommended, true);
assert.deepStrictEqual(
	guardModel.recommendedActions.map(item => item.action.id),
	['suggest-links', 'format-polish', 'correct-content', 'polish'],
);

const settingModel = buildCopilotCommandModel({
	ctx: null,
	activeTab: 'setting',
	query: 'prompt',
	actions,
});

assert.deepStrictEqual(settingModel.visibleActions.map(item => item.action.id), ['prompt-audit']);
assert.equal(settingModel.visibleActions[0].disabledReason, 'Open a document first.');

const contextFreeModel = buildCopilotCommandModel({
	ctx: null,
	activeTab: 'setting',
	query: 'context free',
	actions,
});

assert.deepStrictEqual(contextFreeModel.visibleActions.map(item => item.action.id), ['context-free-setting']);
assert.equal(contextFreeModel.visibleActions[0].disabledReason, 'Open a document first.');
