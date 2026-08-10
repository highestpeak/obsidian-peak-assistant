import assert from 'node:assert/strict';
import { packDetachedGraphNodes } from '@/ui/component/graph/detachedGraphLayout';

const placements = packDetachedGraphNodes([
	{ id: 'long-a', width: 360, height: 34 },
	{ id: 'long-b', width: 340, height: 42 },
	{ id: 'short', width: 90, height: 30 },
	{ id: 'long-c', width: 380, height: 36 },
], {
	availableWidth: 760,
	horizontalGap: 34,
	verticalGap: 26,
});

assert.equal(placements.length, 4);
for (let index = 0; index < placements.length; index += 1) {
	for (let otherIndex = index + 1; otherIndex < placements.length; otherIndex += 1) {
		const left = placements[index]!;
		const right = placements[otherIndex]!;
		const separatedX = left.x + left.width / 2 <= right.x - right.width / 2
			|| right.x + right.width / 2 <= left.x - left.width / 2;
		const separatedY = left.y + left.height / 2 <= right.y - right.height / 2
			|| right.y + right.height / 2 <= left.y - left.height / 2;
		assert.ok(separatedX || separatedY, `${left.id} and ${right.id} must not overlap`);
	}
}
assert.ok(
	placements.some((placement) => placement.y > placements[0]!.y),
	'long labels wrap into another row instead of being squeezed into fixed cells',
);
assert.deepEqual(
	packDetachedGraphNodes([
		{ id: 'a', width: 100, height: 30 },
		{ id: 'b', width: 100, height: 30 },
	], { availableWidth: 240, horizontalGap: 20, verticalGap: 20 }),
	[
		{ id: 'a', x: 50, y: 15, width: 100, height: 30 },
		{ id: 'b', x: 170, y: 15, width: 100, height: 30 },
	],
	'packing is stable for the same sorted input',
);

console.log('result-graph-detached-layout: passed');
