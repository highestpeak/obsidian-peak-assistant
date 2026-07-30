import assert from 'node:assert/strict';
import {
	isSourcesDensityVisible,
	resolveSourcesKeyboardIntent,
} from '../src/ui/view/quick-search/components/v2SourcesInteraction';

const baseContext = {
	view: 'list' as const,
	insideWorkspace: true,
	editableTarget: false,
	inspectorOpen: false,
	hasSelection: true,
	resultCount: 6,
};

assert.deepEqual(
	resolveSourcesKeyboardIntent({ ...baseContext, key: 'ArrowRight' }),
	{ type: 'open-inspector' },
	'Right Arrow opens the selected source inspector anywhere in the active Sources workspace',
);
assert.deepEqual(
	resolveSourcesKeyboardIntent({
		...baseContext,
		view: 'graph',
		key: 'ArrowRight',
	}),
	{ type: 'open-inspector' },
	'Graph shares the same Right Arrow inspector contract',
);
assert.deepEqual(
	resolveSourcesKeyboardIntent({
		...baseContext,
		key: 'ArrowRight',
		editableTarget: true,
	}),
	{ type: 'open-inspector' },
	'Right Arrow opens the inspector even when the AI query editor still owns focus',
);
assert.deepEqual(
	resolveSourcesKeyboardIntent({
		...baseContext,
		key: 'ArrowRight',
		insideWorkspace: false,
	}),
	{ type: 'open-inspector' },
	'the mounted Sources view owns its Inspector shortcut beyond the projection DOM',
);
assert.deepEqual(
	resolveSourcesKeyboardIntent({
		...baseContext,
		key: 'ArrowLeft',
		inspectorOpen: true,
	}),
	{ type: 'close-inspector' },
	'Left Arrow closes an open inspector',
);
assert.equal(
	resolveSourcesKeyboardIntent({
		...baseContext,
		view: 'tree',
		key: 'ArrowRight',
	}),
	null,
	'the shared Tree projection remains authoritative for expand-before-inspect behavior',
);
assert.deepEqual(
	resolveSourcesKeyboardIntent({
		...baseContext,
		view: 'tree',
		key: 'ArrowRight',
		insideWorkspace: false,
	}),
	{ type: 'open-inspector' },
	'Tree can still open the inspector when focus remains outside its projection',
);
assert.equal(
	resolveSourcesKeyboardIntent({
		...baseContext,
		key: 'ArrowDown',
		insideWorkspace: false,
	}),
	null,
	'only Inspector shortcuts escape the projection; result navigation stays scoped',
);

assert.equal(isSourcesDensityVisible('list'), true);
assert.equal(isSourcesDensityVisible('tree'), true);
assert.equal(isSourcesDensityVisible('graph'), false);

console.log('PASS: AI Search Sources interaction contract');
