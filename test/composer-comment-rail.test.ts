import assert from 'node:assert/strict';
import {
	commentConnectorPath,
	resolveCommentRailMode,
	stackCommentCards,
} from '@/ui/view/composer/chrome/commentLayout';

assert.equal(resolveCommentRailMode(1119, 1120), 'drawer');
assert.equal(resolveCommentRailMode(1120, 1120), 'rail');

const stacked = stackCommentCards([
	{ id: 'later', desiredTop: 112, height: 80 },
	{ id: 'first', desiredTop: 100, height: 96 },
	{ id: 'same-anchor', desiredTop: 100, height: 60 },
], 12);

assert.deepEqual(stacked.map((card) => card.id), ['first', 'same-anchor', 'later']);
assert.equal(stacked[0].top, 100);
assert.equal(stacked[1].top, 208);
assert.equal(stacked[2].top, 280);
assert.ok(stacked.every((card, index) =>
	index === 0 || card.top >= stacked[index - 1].top + stacked[index - 1].height + 12));

assert.equal(
	commentConnectorPath({ sourceX: 420, sourceY: 96, cardX: 610, cardY: 132 }),
	'M 420 96 H 588 V 132 H 610',
);
assert.equal(
	commentConnectorPath({ sourceX: 590, sourceY: 120, cardX: 610, cardY: 120 }),
	'M 590 120 H 602 V 120 H 610',
);

console.log('OK composer-comment-rail');
