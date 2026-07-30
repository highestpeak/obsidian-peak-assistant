import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/search/composeContextualGraphPort.ts', 'utf8');

assert.match(
	source,
	/if \(!nodes\.some\(\(node\) => node\.id === currentNodeId\)\)/,
	'contextual graph must materialize the current document when the neighborhood is empty',
);
assert.match(
	source,
	/primaryHubNodeIds\.set\(hub\.path, existing\.id\)/,
	'hub edges must reuse the canonical neighborhood node id',
);
assert.match(
	source,
	/if \(!hubNodeId \|\| hubNodeId === currentNodeId\) continue/,
	'contextual graph must not emit dangling or self hub edges',
);

console.log('contextual graph port contract tests passed');
