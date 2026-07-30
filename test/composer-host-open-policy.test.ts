import assert from 'assert';
import {
	HostOpenConversionRegistry,
	HostOpenSuppressionRegistry,
	selectHostOpenedLeaf,
} from '@/app/composer/ComposerHostOpenPolicy';

const staleActiveLeaf = { id: 'old-composer' };
const openedMarkdownLeaf = { id: 'opened-markdown' };

assert.equal(
	selectHostOpenedLeaf(
		[
			{ leaf: staleActiveLeaf, filePath: 'Old.md', active: true },
			{ leaf: openedMarkdownLeaf, filePath: 'Opened.md', active: false },
		],
		'Opened.md',
	),
	openedMarkdownLeaf,
	'a unique matching Markdown leaf must win even while activeLeaf is stale',
);

const duplicateA = { id: 'duplicate-a' };
const duplicateB = { id: 'duplicate-b' };
assert.equal(
	selectHostOpenedLeaf(
		[
			{ leaf: duplicateA, filePath: 'Same.md', active: false },
			{ leaf: duplicateB, filePath: 'Same.md', active: true },
		],
		'Same.md',
	),
	duplicateB,
	'the active matching leaf must win when the file is open more than once',
);
assert.equal(
	selectHostOpenedLeaf(
		[
			{ leaf: duplicateA, filePath: 'Same.md', active: false },
			{ leaf: duplicateB, filePath: 'Same.md', active: false },
		],
		'Same.md',
	),
	null,
	'an ambiguous background duplicate must fail closed',
);

const suppressions = new HostOpenSuppressionRegistry();
const rollback = suppressions.begin('Rollback.md');
assert.equal(
	suppressions.consume('Rollback.md'),
	true,
	'a delayed file-open caused by rollback must be consumed once',
);
assert.equal(
	suppressions.consume('Rollback.md'),
	false,
	'the rollback token cannot suppress a later owner open',
);
suppressions.release(rollback);

const explicitMarkdown = suppressions.begin('Explicit.md');
suppressions.release(explicitMarkdown);
assert.equal(
	suppressions.consume('Explicit.md'),
	false,
	'an unused suppression must be releasable after the host lifecycle settles',
);

const conversions = new HostOpenConversionRegistry<object>();
const conversionLeaf = { id: 'reused-leaf' };
const first = conversions.begin(conversionLeaf, 'First.md');
assert.equal(conversions.isCurrent(first), true, 'the latest leaf conversion request starts current');
const second = conversions.begin(conversionLeaf, 'Second.md');
assert.equal(
	conversions.isCurrent(first),
	false,
	'a newer file-open on the same leaf must supersede the older conversion',
);
assert.equal(conversions.isCurrent(second), true, 'the newer conversion remains current');
conversions.finish(first);
assert.equal(
	conversions.isCurrent(second),
	true,
	'finishing an obsolete request cannot clear the current leaf conversion',
);
conversions.finish(second);
assert.equal(conversions.isCurrent(second), false, 'finishing the current request releases the leaf');

console.log('composer-host-open-policy: passed');
