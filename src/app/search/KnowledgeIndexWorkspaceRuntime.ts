import type { AppContext } from '@/app/context/AppContext';
import type { IndexLevel } from '@/core/search/indexTypes';
import type { IndexRunOutputs, KnowledgeIndexWorkspacePort, KnowledgeIndexWorkspaceSnapshot } from '@/core/ports/KnowledgeIndexWorkspacePort';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { INDEXABLE_FILE_TYPES } from '@/core/settings/peakSettingsContract';
import type { DocumentType } from '@/core/document/types';

export class KnowledgeIndexWorkspaceRuntime implements KnowledgeIndexWorkspacePort {
	private lastRun: { level: IndexLevel; outputs: IndexRunOutputs } | null = null;

	constructor(private readonly appContext: AppContext) {}

	async getSnapshot(): Promise<KnowledgeIndexWorkspaceSnapshot> {
		const coordinator = this.appContext.runtimeRegistry.getIndexRunCoordinator();
		const progress = coordinator.getSnapshot();
		const reportedProgress = this.appContext.progressReporter.getSnapshot();
		let indexReady = false;
		let indexedDocuments = 0;
		let lastBuiltAt: number | null = null;
		try {
			const status = await this.appContext.runtimeRegistry.getIndexService().getIndexStatus();
			indexReady = status.isReady;
			indexedDocuments = status.indexedDocs ?? 0;
			lastBuiltAt = status.indexBuiltAt;
		} catch {
			// The workspace still opens before SQLite is repaired.
		}
		const loaderManager = DocumentLoaderManager.getInstance();
		const files = this.appContext.app.vault.getFiles()
			.map((file) => ({ path: file.path, type: loaderManager.getTypeForPath(file.path) }))
			.filter((file): file is { path: string; type: DocumentType } => !!file.type)
			.filter((file) => loaderManager.shouldIndexDocument({ type: file.type, sourceFileInfo: { path: file.path } } as any))
			.sort((a, b) => a.path.localeCompare(b.path));
		const totalDocuments = files.length;
		const status = progress.status === 'failed'
			? 'error'
			: progress.status === 'idle' && indexReady
				? 'complete'
				: progress.status;
		const currentPath = progress.message.split('\n')[1]?.trim() ?? '';
		const currentIndex = currentPath ? files.findIndex((file) => file.path === currentPath) : -1;
		const queueStart = Math.max(0, currentIndex >= 0 ? currentIndex - 6 : 0);
		const typeCounts = new Map<DocumentType, number>();
		for (const file of files) typeCounts.set(file.type, (typeCounts.get(file.type) ?? 0) + 1);
		return {
			status,
			message: progress.message,
			startedAt: progress.startedAt,
			updatedAt: progress.updatedAt,
			indexReady,
			indexedDocuments,
			totalDocuments,
			lastBuiltAt,
			fileTypes: INDEXABLE_FILE_TYPES
				.map((entry) => ({ type: entry.type, label: entry.label, count: typeCounts.get(entry.type) ?? 0 }))
				.filter((entry) => entry.count > 0),
			queue: files.slice(queueStart, queueStart + 24).map((file, index) => ({ position: queueStart + index + 1, path: file.path })),
			failures: reportedProgress.failures,
		};
	}

	subscribe(listener: () => void): () => void {
		return this.appContext.runtimeRegistry.getIndexRunCoordinator().subscribe(() => listener());
	}

	async start(options: { level: IndexLevel; outputs: IndexRunOutputs }): Promise<void> {
		this.lastRun = options;
		const coordinator = this.appContext.runtimeRegistry.getIndexRunCoordinator();
		const start = await coordinator.startOrAttach({ level: options.level, outputs: {
			includeEmbeddings: options.outputs.embeddings,
			includeLlmTags: options.outputs.aiTags,
			includeLlmSummary: options.outputs.markdownSummaries,
			includeGraphMaintenance: options.outputs.searchRankingSignals,
		} });
		await coordinator.waitFor(start.runId);
	}

	pause(): void {
		const coordinator = this.appContext.runtimeRegistry.getIndexRunCoordinator();
		const runId = coordinator.getSnapshot().runId;
		if (runId) coordinator.pause(runId);
	}

	resume(): void {
		const coordinator = this.appContext.runtimeRegistry.getIndexRunCoordinator();
		const runId = coordinator.getSnapshot().runId;
		if (runId) coordinator.resume(runId);
	}

	cancel(): void {
		const coordinator = this.appContext.runtimeRegistry.getIndexRunCoordinator();
		const runId = coordinator.getSnapshot().runId;
		if (runId) coordinator.cancel(runId);
	}

	async retry(): Promise<void> {
		if (!this.lastRun) return;
		await this.start(this.lastRun);
	}

	async openVaultSearch(): Promise<void> {
		const { QuickSearchModal } = await import('@/app/ui-host/modals/QuickSearchModal');
		new QuickSearchModal(this.appContext).open();
	}

}
