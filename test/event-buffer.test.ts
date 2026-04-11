import assert from 'assert';
import { EventBuffer } from '@/core/utils/event-buffer';
import { mergeAsyncGenerators } from '@/core/utils/event-merge';
import { mapWithConcurrency } from '@/core/utils/concurrent-utils';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const item of iterable) {
		out.push(item);
	}
	return out;
}

async function testPushConsumeClose(): Promise<void> {
	const buffer = new EventBuffer<number>();
	const consumer = collect(buffer);
	await buffer.push(1);
	await buffer.push(2);
	buffer.close();
	const items = await consumer;
	assert.deepStrictEqual(items, [1, 2]);
}

async function testBackpressure(): Promise<void> {
	const buffer = new EventBuffer<string>({ highWaterMark: 1 });
	let resolved = false;
	const pushPromise = buffer.push('A').then(() => {
		resolved = true;
	});

	await sleep(10);
	assert.strictEqual(resolved, false, 'push should block when queue reaches highWaterMark');

	const iterator = buffer[Symbol.asyncIterator]();
	const first = await iterator.next();
	assert.strictEqual(first.value, 'A');

	await pushPromise;
	assert.strictEqual(resolved, true, 'push should resume after queue drains');

	buffer.close();
	const done = await iterator.next();
	assert.strictEqual(done.done, true);
}

async function testErrorPropagation(): Promise<void> {
	const buffer = new EventBuffer<number>();
	await buffer.push(42);
	buffer.error(new Error('boom'));

	const iterator = buffer[Symbol.asyncIterator]();
	const first = await iterator.next();
	assert.strictEqual(first.value, 42);

	let threw = false;
	try {
		await iterator.next();
	} catch (error) {
		threw = true;
		assert.ok((error as Error).message.includes('boom'));
	}
	assert.strictEqual(threw, true);
}

async function* source(prefix: string, delays: number[]): AsyncGenerator<string> {
	for (let i = 0; i < delays.length; i++) {
		await sleep(delays[i]!);
		yield `${prefix}${i}`;
	}
}

async function testMergeAsyncGenerators(): Promise<void> {
	const merged = mergeAsyncGenerators<string>([
		source('A', [5, 40]),
		source('B', [10, 10]),
		source('C', [1]),
	]);

	const values = await collect(merged);
	assert.strictEqual(values.length, 5);
	assert.deepStrictEqual(new Set(values), new Set(['A0', 'A1', 'B0', 'B1', 'C0']));
}

async function testMapWithConcurrencyProgressEvents(): Promise<void> {
	const eventBuffer = new EventBuffer<any>();
	const consumeEvents = collect(eventBuffer);

	const results = await mapWithConcurrency(
		[1, 2, 3, 4],
		{ limit: 2, eventBuffer },
		async (item) => {
			await sleep(5);
			return item * 2;
		},
	);

	const events = await consumeEvents;
	assert.deepStrictEqual(results, [2, 4, 6, 8]);
	assert.strictEqual(events.filter((e) => e.type === 'task-start').length, 4);
	assert.strictEqual(events.filter((e) => e.type === 'task-complete').length, 4);
	assert.strictEqual(events.filter((e) => e.type === 'task-error').length, 0);
}

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => Promise<void> }> = [
		{ name: 'EventBuffer push/consume/close', fn: testPushConsumeClose },
		{ name: 'EventBuffer backpressure', fn: testBackpressure },
		{ name: 'EventBuffer error propagation', fn: testErrorPropagation },
		{ name: 'mergeAsyncGenerators with 3 sources', fn: testMergeAsyncGenerators },
		{ name: 'mapWithConcurrency event stream', fn: testMapWithConcurrencyProgressEvents },
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed += 1;
		} catch (error) {
			failed += 1;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(error);
		}
	}

	console.log(`\nEventBuffer tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
