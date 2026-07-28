import assert from 'assert';
import {
	createStreamingTextFrameBuffer,
	type AnimationFrameScheduler,
} from '@/ui/view/composer/candidates/streamFrameCoalescer';

const pending = new Map<number, FrameRequestCallback>();
let nextHandle = 1;
const scheduler: AnimationFrameScheduler = {
	request(callback) {
		const handle = nextHandle++;
		pending.set(handle, callback);
		return handle;
	},
	cancel(handle) {
		pending.delete(handle);
	},
};

function paint(): void {
	const frame = [...pending.entries()];
	pending.clear();
	for (const [, callback] of frame) callback(0);
}

const committed: Array<string | null> = [];
const buffer = createStreamingTextFrameBuffer((text) => committed.push(text), scheduler);

buffer.push('第');
buffer.push('第一');
buffer.push('第一段');
assert.equal(pending.size, 1, 'bursty provider chunks must schedule one paint');
assert.deepEqual(committed, [], 'no text should commit before the browser paint');
paint();
assert.deepEqual(committed, ['第一段'], 'the paint commits the newest accumulated text only');

buffer.push('第一段，继续');
buffer.finish();
assert.equal(pending.size, 0, 'terminal event cancels a pending paint');
assert.deepEqual(committed, ['第一段', null], 'terminal event immediately switches to the ready/error review state');

buffer.push('ignored');
paint();
assert.deepEqual(committed, ['第一段', null, 'ignored'], 'a later run can schedule a fresh frame');
buffer.dispose();
assert.equal(pending.size, 0, 'dispose removes an outstanding frame');

console.log('composer-stream-frame-coalescer: passed');
