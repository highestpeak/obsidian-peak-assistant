type PendingConsumer<T> = {
	resolve: (result: IteratorResult<T>) => void;
	reject: (error: unknown) => void;
};

export type EventBufferOptions = {
	highWaterMark?: number;
};

/**
 * Push-based async iterable buffer.
 * Producers can `await push()` to honor backpressure when queue reaches highWaterMark.
 */
export class EventBuffer<T> implements AsyncIterable<T> {
	private readonly highWaterMark: number;
	private readonly queue: T[] = [];
	private readonly pendingConsumers: PendingConsumer<T>[] = [];
	private readonly pendingPushResolvers: Array<() => void> = [];
	private closed = false;
	private failure: unknown = null;

	constructor(options?: EventBufferOptions) {
		this.highWaterMark = Math.max(1, options?.highWaterMark ?? 128);
	}

	isClosed(): boolean {
		return this.closed;
	}

	async push(item: T): Promise<void> {
		if (this.closed) {
			throw new Error('EventBuffer is closed');
		}

		const consumer = this.pendingConsumers.shift();
		if (consumer) {
			consumer.resolve({ value: item, done: false });
			return;
		}

		this.queue.push(item);
		if (this.queue.length >= this.highWaterMark) {
			await new Promise<void>((resolve) => {
				this.pendingPushResolvers.push(resolve);
			});
		}
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.flushProducerWaiters();
		this.flushConsumersIfFinished();
	}

	error(error: unknown): void {
		if (this.closed) return;
		this.failure = error;
		this.closed = true;
		this.flushProducerWaiters();

		const waiting = this.pendingConsumers.splice(0);
		for (const consumer of waiting) {
			consumer.reject(error);
		}
	}

	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: async (): Promise<IteratorResult<T>> => {
				if (this.queue.length > 0) {
					const value = this.queue.shift() as T;
					this.releaseOneProducer();
					this.flushConsumersIfFinished();
					return { value, done: false };
				}

				if (this.failure !== null) {
					throw this.failure;
				}

				if (this.closed) {
					return { value: undefined as unknown as T, done: true };
				}

				return await new Promise<IteratorResult<T>>((resolve, reject) => {
					this.pendingConsumers.push({ resolve, reject });
				});
			},
		};
	}

	private flushConsumersIfFinished(): void {
		if (!this.closed) return;
		if (this.queue.length > 0) return;
		if (this.failure !== null) return;

		const waiting = this.pendingConsumers.splice(0);
		for (const consumer of waiting) {
			consumer.resolve({ value: undefined as unknown as T, done: true });
		}
	}

	private flushProducerWaiters(): void {
		while (this.pendingPushResolvers.length > 0) {
			const resolve = this.pendingPushResolvers.shift();
			resolve?.();
		}
	}

	private releaseOneProducer(): void {
		if (this.queue.length >= this.highWaterMark) return;
		const resolve = this.pendingPushResolvers.shift();
		resolve?.();
	}
}
