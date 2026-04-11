import { EventBuffer } from './event-buffer';

/**
 * Interleave multiple async generators into one output stream.
 * Items are yielded as soon as any upstream source produces them.
 */
export async function* mergeAsyncGenerators<T>(
	sources: Array<AsyncIterable<T>>,
	options?: { highWaterMark?: number },
): AsyncGenerator<T> {
	if (sources.length === 0) {
		return;
	}

	const buffer = new EventBuffer<T>({ highWaterMark: options?.highWaterMark });
	let active = sources.length;

	for (const source of sources) {
		void (async () => {
			try {
				for await (const item of source) {
					await buffer.push(item);
				}
			} catch (error) {
				buffer.error(error);
				return;
			}

			active -= 1;
			if (active === 0) {
				buffer.close();
			}
		})();
	}

	for await (const item of buffer) {
		yield item;
	}
}
