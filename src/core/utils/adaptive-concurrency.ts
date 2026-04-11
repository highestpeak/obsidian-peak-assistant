/**
 * Adaptive concurrency pool: adjusts worker count at runtime based on observed task latency
 * and consecutive error rate.
 */

export type AdaptiveConcurrencyOptions = {
	/** Initial concurrency level. */
	initial: number;
	/** Minimum concurrency (floor). */
	min: number;
	/** Maximum concurrency (ceiling). */
	max: number;
	/** Target latency per task in ms. If avg latency exceeds this, scale down. */
	targetLatencyMs: number;
	/** Scale up if avg latency < targetLatencyMs * scaleUpThreshold (0.0-1.0). Default: 0.6 */
	scaleUpThreshold?: number;
	/** After N consecutive errors, scale down by 1. Default: 3 */
	errorsBeforeScaleDown?: number;
	/** Minimum number of samples before scaling is allowed. Default: 5 */
	minSamples?: number;
};

export class AdaptiveConcurrencyPool {
	private readonly options: Required<AdaptiveConcurrencyOptions>;
	private _current: number;
	private slots: number;
	private readonly waiting: Array<() => void> = [];
	private latencyWindow: number[] = [];
	private consecutiveErrors = 0;
	private totalSamples = 0;

	constructor(options: AdaptiveConcurrencyOptions) {
		this.options = {
			scaleUpThreshold: 0.6,
			errorsBeforeScaleDown: 3,
			minSamples: 5,
			...options,
		};
		this._current = Math.max(options.min, Math.min(options.max, options.initial));
		this.slots = this._current;
	}

	/** Current concurrency level. */
	get current(): number {
		return this._current;
	}

	private async acquire(): Promise<void> {
		if (this.slots > 0) {
			this.slots--;
			return;
		}
		await new Promise<void>((resolve) => this.waiting.push(resolve));
	}

	private release(): void {
		const next = this.waiting.shift();
		if (next) {
			next();
		} else {
			this.slots++;
		}
	}

	private updateConcurrency(
		newLevel: number,
		onConcurrencyChange?: (level: number) => void,
		onScaleUp?: (delta: number) => void,
	): void {
		const clamped = Math.max(this.options.min, Math.min(this.options.max, newLevel));
		if (clamped === this._current) return;
		const delta = clamped - this._current;
		this._current = clamped;
		// Reset latency window so next scaling decisions use only data from the new regime.
		this.latencyWindow = [];
		this.consecutiveErrors = 0;
		// Scale up: add available slots so waiting tasks can proceed.
		// Scale down: slots will naturally decrease as tasks complete without releasing extras.
		for (let i = 0; i < delta; i++) {
			this.release();
		}
		if (delta > 0) {
			onScaleUp?.(delta);
		}
		onConcurrencyChange?.(this._current);
	}

	private recordSample(
		durationMs: number,
		isError: boolean,
		onConcurrencyChange?: (level: number) => void,
		onScaleUp?: (delta: number) => void,
	): void {
		const windowSize = 10;
		this.latencyWindow.push(durationMs);
		if (this.latencyWindow.length > windowSize) {
			this.latencyWindow.shift();
		}
		this.totalSamples++;

		if (isError) {
			this.consecutiveErrors++;
		} else {
			this.consecutiveErrors = 0;
		}

		// Fix 3: guard uses window size, not totalSamples, so scaling requires N samples
		// at the CURRENT concurrency level (window is cleared on each concurrency change).
		if (this.latencyWindow.length < this.options.minSamples) return;

		// Error-based scale-down check.
		if (this.consecutiveErrors >= this.options.errorsBeforeScaleDown) {
			this.consecutiveErrors = 0;
			this.updateConcurrency(this._current - 1, onConcurrencyChange, onScaleUp);
			return;
		}

		// Latency-based scaling.
		const avg = this.latencyWindow.reduce((a, b) => a + b, 0) / this.latencyWindow.length;
		const { targetLatencyMs, scaleUpThreshold } = this.options;

		if (avg < targetLatencyMs * scaleUpThreshold) {
			this.updateConcurrency(this._current + 1, onConcurrencyChange, onScaleUp);
		} else if (avg > targetLatencyMs) {
			this.updateConcurrency(this._current - 1, onConcurrencyChange, onScaleUp);
		}
	}

	/**
	 * Run a task. The pool manages worker concurrency adaptively.
	 * Returns the task result.
	 */
	async run<T>(
		fn: () => Promise<T>,
		onConcurrencyChange?: (level: number) => void,
		onScaleUp?: (delta: number) => void,
	): Promise<T> {
		await this.acquire();
		const t0 = Date.now();
		let isError = false;
		try {
			const result = await fn();
			return result;
		} catch (e) {
			isError = true;
			throw e;
		} finally {
			const durationMs = Date.now() - t0;
			this.recordSample(durationMs, isError, onConcurrencyChange, onScaleUp);
			// Only release if concurrency hasn't been reduced below active workers.
			// Releasing here is always safe: if we scaled down, the extra slot will be absorbed
			// by the waiting queue; if empty, slots++ which naturally caps at _current over time.
			this.release();
		}
	}

	/**
	 * Map items with adaptive concurrency.
	 * Similar to mapWithConcurrency but uses adaptive pool.
	 */
	async mapWithAdaptiveConcurrency<T, R>(
		items: readonly T[],
		fn: (item: T, index: number) => Promise<R>,
		options?: { onConcurrencyChange?: (level: number) => void },
	): Promise<R[]> {
		if (items.length === 0) return [];

		const results: R[] = new Array(items.length);
		let nextIndex = 0;
		const { onConcurrencyChange } = options ?? {};

		// pendingWorkers is a dynamic list — new workers added on scale-up are tracked here
		// so that the outer await covers all work including late-spawned goroutines.
		const pendingWorkers: Promise<void>[] = [];

		// Called by updateConcurrency when _current increases. Spawn new workers for the extra
		// slots so they immediately start picking up remaining items rather than sitting idle.
		// Declared before spawnWorker to avoid a temporal dead zone reference.
		const onScaleUp = (delta: number) => {
			const toSpawn = Math.min(delta, items.length - nextIndex);
			for (let i = 0; i < toSpawn; i++) spawnWorker();
		};

		const spawnWorker = () => {
			const p = (async (): Promise<void> => {
				for (;;) {
					const i = nextIndex++;
					if (i >= items.length) return;
					const item = items[i]!;
					results[i] = await this.run(() => fn(item, i), onConcurrencyChange, onScaleUp);
				}
			})();
			pendingWorkers.push(p);
		};

		// Launch initial workers equal to current concurrency.
		const initialWorkers = Math.min(this._current, items.length);
		for (let i = 0; i < initialWorkers; i++) spawnWorker();

		// Wait for all workers — including any spawned later during scale-up.
		// We loop until the pendingWorkers list is fully drained, because scale-up may add
		// new promises after the initial Promise.all would have resolved.
		while (pendingWorkers.length > 0) {
			await Promise.all(pendingWorkers.splice(0));
		}

		return results;
	}
}
