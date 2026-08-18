import type { AppContext } from '@/app/context/AppContext';
import type {
	IndexReadinessProjection,
	IndexRunCoordinatorPort,
	IndexRunPlan,
	IndexRunResult,
	IndexRunSnapshot,
} from '@/core/ports/IndexRunCoordinatorPort';
import { IndexInitializer, IndexRunControl } from '@/service/search/index/indexInitializer';

function fingerprint(plan: IndexRunPlan): string {
	return JSON.stringify({ level: plan.level, outputs: plan.outputs ?? null });
}

export class IndexRunCoordinator implements IndexRunCoordinatorPort {
	private sequence = 0;
	private control: IndexRunControl | null = null;
	private completion: Promise<IndexRunResult> | null = null;
	private snapshot: IndexRunSnapshot = {
		runId: null,
		planFingerprint: null,
		status: 'idle',
		message: '',
		startedAt: null,
		updatedAt: null,
		result: null,
	};
	private readonly listeners = new Set<(snapshot: IndexRunSnapshot) => void>();
	private readonly unsubscribeProgress: () => void;

	constructor(
		private readonly appContext: AppContext,
		private readonly dependencies?: {
			runPlan: (plan: IndexRunPlan, control: IndexRunControl) => Promise<IndexRunResult>;
			readIndexStatus: () => Promise<{ isReady: boolean; indexedDocs?: number }>;
		},
	) {
		this.unsubscribeProgress = appContext.progressReporter.subscribe((progress) => {
			if (this.snapshot.status !== 'running' && this.snapshot.status !== 'paused') return;
			this.publish({ message: progress.message, updatedAt: progress.updatedAt });
		});
	}

	async startOrAttach(plan: IndexRunPlan): Promise<{ runId: string; disposition: 'started' | 'attached' }> {
		const planFingerprint = fingerprint(plan);
		if ((this.snapshot.status === 'running' || this.snapshot.status === 'paused') && this.snapshot.runId) {
			return { runId: this.snapshot.runId, disposition: 'attached' };
		}

		const runId = `index-${Date.now()}-${++this.sequence}`;
		this.control = new IndexRunControl();
		this.publish({
			runId,
			planFingerprint,
			status: 'running',
			message: 'Preparing full-text index…',
			startedAt: Date.now(),
			updatedAt: Date.now(),
			result: null,
		});
		const runPlan = this.dependencies?.runPlan ?? ((nextPlan: IndexRunPlan, control: IndexRunControl) => {
			const initializer = new IndexInitializer(
				this.appContext.app,
				this.appContext.plugin.settings.search,
				this.appContext.plugin.settings.dataStorageFolder ?? '',
				this.appContext.progressReporter,
				this.appContext.runtimeRegistry.getIndexService(),
			);
			return initializer.performStagedFullIndexing(true, nextPlan.level, undefined, nextPlan.outputs, control);
		});
		this.completion = runPlan(plan, this.control)
			.then((result) => {
				const status = result.status === 'complete' ? 'complete' : result.status;
				this.publish({ status, message: result.message, updatedAt: Date.now(), result });
				return result;
			})
			.catch((error) => {
				const result: IndexRunResult = {
					status: 'failed', indexedCount: 0, failureCount: 1, totalDocuments: 0,
					message: error instanceof Error ? error.message : String(error),
				};
				this.publish({ status: 'failed', message: result.message, updatedAt: Date.now(), result });
				return result;
			});
		return { runId, disposition: 'started' };
	}

	async waitFor(runId: string): Promise<IndexRunResult> {
		if (runId !== this.snapshot.runId || !this.completion) throw new Error(`Unknown index run: ${runId}`);
		return this.completion;
	}

	getSnapshot(): IndexRunSnapshot {
		return { ...this.snapshot, result: this.snapshot.result ? { ...this.snapshot.result } : null };
	}

	async getReadiness(): Promise<IndexReadinessProjection> {
		const current = this.getSnapshot();
		const status = await (this.dependencies?.readIndexStatus
			? this.dependencies.readIndexStatus()
			: this.appContext.runtimeRegistry.getIndexService().getIndexStatus());
		const active = current.status === 'running' || current.status === 'paused';
		return {
			fullText: active ? 'building' : current.status === 'failed' ? 'failed' : status.isReady ? 'ready' : 'missing',
			activeRunId: active ? current.runId : null,
			indexedDocuments: status.indexedDocs ?? 0,
			failures: current.result?.failureCount ?? 0,
		};
	}

	subscribe(listener: (snapshot: IndexRunSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.getSnapshot());
		return () => this.listeners.delete(listener);
	}

	pause(runId: string): void {
		if (runId !== this.snapshot.runId || this.snapshot.status !== 'running') return;
		this.control?.pause();
		this.publish({ status: 'paused', updatedAt: Date.now() });
	}

	resume(runId: string): void {
		if (runId !== this.snapshot.runId || this.snapshot.status !== 'paused') return;
		this.control?.resume();
		this.publish({ status: 'running', updatedAt: Date.now() });
	}

	cancel(runId: string): void {
		if (runId !== this.snapshot.runId) return;
		this.control?.cancel();
	}

	dispose(): void {
		this.control?.cancel();
		this.unsubscribeProgress();
		this.listeners.clear();
	}

	private publish(patch: Partial<IndexRunSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...patch };
		const next = this.getSnapshot();
		for (const listener of this.listeners) listener(next);
	}
}
