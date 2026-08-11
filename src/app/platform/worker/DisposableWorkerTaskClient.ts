import { Worker } from 'node:worker_threads';

export type DisposableWorkerResponse<T> =
	| { readonly ok: true; readonly value: T }
	| {
		readonly ok: false;
		readonly error: { readonly name: string; readonly message: string; readonly stack?: string };
	};

/**
 * Owns disposable Node Worker isolates. Every task resolves only after its
 * Worker terminates, so bundled parser libraries cannot remain live in the
 * renderer isolate or in a reusable worker module cache.
 */
export class DisposableWorkerTaskClient {
	private readonly activeWorkers = new Set<Worker>();
	private taskTail: Promise<void> = Promise.resolve();
	private peakActiveWorkers = 0;
	private disposed = false;

	get activeWorkerCount(): number {
		return this.activeWorkers.size;
	}

	get peakActiveWorkerCount(): number {
		return this.peakActiveWorkers;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const worker of this.activeWorkers) void worker.terminate().catch(() => undefined);
		this.activeWorkers.clear();
	}

	protected runWorkerTask<Request, Value>(
		workerScriptPath: string,
		request: Request,
		transferList: ArrayBuffer[] = [],
	): Promise<Value> {
		if (this.disposed) return Promise.reject(new Error('Disposable worker client has been disposed.'));
		const task = this.taskTail.then(() => {
			if (this.disposed) throw new Error('Disposable worker client has been disposed.');
			return this.executeWorkerTask<Request, Value>(workerScriptPath, request, transferList);
		});
		this.taskTail = task.then(() => undefined, () => undefined);
		return task;
	}

	private executeWorkerTask<Request, Value>(
		workerScriptPath: string,
		request: Request,
		transferList: ArrayBuffer[],
	): Promise<Value> {
		const worker = new Worker(workerScriptPath);
		this.activeWorkers.add(worker);
		this.peakActiveWorkers = Math.max(this.peakActiveWorkers, this.activeWorkers.size);
		return new Promise<Value>((resolve, reject) => {
			let settled = false;
			const finish = (response: DisposableWorkerResponse<Value>) => {
				if (settled) return;
				settled = true;
				this.activeWorkers.delete(worker);
				void worker.terminate().then(
					() => settleResponse(response, resolve, reject),
					(error) => reject(normalizeWorkerError(error)),
				);
			};
			worker.once('message', finish);
			worker.once('error', (error) => finish(errorResponse(error)));
			worker.once('exit', (code) => {
				if (settled) return;
				settled = true;
				this.activeWorkers.delete(worker);
				reject(new Error(`Disposable worker exited before completing (code ${code}).`));
			});
			try {
				worker.postMessage(request, transferList);
			} catch (error) {
				finish(errorResponse(error));
			}
		});
	}
}

function settleResponse<T>(
	response: DisposableWorkerResponse<T>,
	resolve: (value: T) => void,
	reject: (error: Error) => void,
): void {
	if (response.ok) {
		resolve(response.value);
		return;
	}
	const error = new Error(response.error.message);
	error.name = response.error.name;
	if (response.error.stack) error.stack = response.error.stack;
	reject(error);
}

function errorResponse(error: unknown): DisposableWorkerResponse<never> {
	const normalized = normalizeWorkerError(error);
	return { ok: false, error: { name: normalized.name, message: normalized.message, stack: normalized.stack } };
}

function normalizeWorkerError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
