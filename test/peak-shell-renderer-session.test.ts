import assert from 'node:assert/strict';

import { claimPeakShellLoadKind } from '../src/app/composition/PeakShellRendererSession';

const rendererSession = {};

assert.equal(claimPeakShellLoadKind(rendererSession), 'cold-start');
assert.equal(claimPeakShellLoadKind(rendererSession), 'hot-reload');
assert.equal(claimPeakShellLoadKind(rendererSession), 'hot-reload');
assert.deepEqual(
	Object.keys(rendererSession),
	[],
	'the renderer-session marker should not leak into enumerable window properties',
);

assert.equal(
	claimPeakShellLoadKind({}),
	'cold-start',
	'a full renderer replacement must restore the guarded cold-start path',
);
assert.equal(
	claimPeakShellLoadKind({}, true),
	'hot-reload',
	'enabling the plugin in an already-ready workspace must not enter the startup gate',
);

console.log('peak-shell-renderer-session: passed');
