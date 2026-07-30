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
assert.equal(
	resolveSourcesKeyboardIntent({
		...baseContext,
		key: 'ArrowRight',
		editableTarget: true,
	}),
	null,
	'editable text keeps ownership of arrow keys',
);
assert.equal(
	resolveSourcesKeyboardIntent({
		...baseContext,
		key: 'ArrowRight',
		insideWorkspace: false,
	}),
	null,
	'keyboard handling stays scoped to the active Sources workspace',
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

assert.equal(isSourcesDensityVisible('list'), true);
assert.equal(isSourcesDensityVisible('tree'), true);
assert.equal(isSourcesDensityVisible('graph'), false);

console.log('PASS: AI Search Sources interaction contract');
