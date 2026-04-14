/**
 * Concurrency limiter — like p-limit but zero dependencies.
 * Usage: const limit = pLimit(3); await Promise.all(tasks.map(t => limit(() => t())));
 */
export function pLimit(concurrency: number) {
	let active = 0;
	const queue: (() => void)[] = [];
	const next = () => {
		while (queue.length > 0 && active < concurrency) {
			active++;
			queue.shift()!();
		}
	};
	return <T>(fn: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			queue.push(() =>
				fn()
					.then(resolve, reject)
					.finally(() => {
						active--;
						next();
					}),
			);
			next();
		});
}

/**
 * Detect repetitive text in a string.
 * Returns the index to truncate at, or -1 if no repetition found.
 *
 * Algorithm: in the last `windowSize` chars, check if any substring of
 * length `minLen..windowSize/3` appears 3+ times consecutively from the end.
 */
export function detectRepetition(
	text: string,
	windowSize = 500,
	minLen = 10,
): number {
	if (text.length < windowSize) return -1;
	const window = text.slice(-windowSize);

	for (let len = minLen; len <= Math.floor(windowSize / 3); len++) {
		const pattern = window.slice(window.length - len);
		let count = 0;
		let pos = window.length;
		while (pos >= len) {
			if (window.slice(pos - len, pos) === pattern) {
				count++;
				pos -= len;
			} else {
				break;
			}
		}
		if (count >= 3) {
			return text.length - (count * len);
		}
	}
	return -1;
}

/**
 * Stream text with automatic repetition detection.
 * Returns { fullText, aborted }.
 * Calls `onChunk` for each streamed chunk.
 * Automatically aborts via AbortController if repetition detected.
 */
export async function streamWithRepetitionGuard(
	textStream: AsyncIterable<string>,
	abortController: AbortController,
	onChunk: (chunk: string) => void,
): Promise<{ fullText: string; aborted: boolean }> {
	let fullText = '';
	let lastCheckLen = 0;
	let aborted = false;

	for await (const chunk of textStream) {
		fullText += chunk;
		onChunk(chunk);

		if (fullText.length - lastCheckLen > 200) {
			lastCheckLen = fullText.length;
			const truncAt = detectRepetition(fullText);
			if (truncAt > 0) {
				fullText = fullText.slice(0, truncAt);
				aborted = true;
				abortController.abort();
				break;
			}
		}
	}

	return { fullText, aborted };
}
