import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { applyPeakSheetPatch, validatePeakSheetSnapshot } from '@/core/sheet';
import type { PeakSheetCommitEvent, PeakSheetDatasetSnapshot } from '@/core/sheet';
import type { PeakSheetCommitResult, PeakSheetRepository } from '@/service/sheet/PeakSheetRepository';

const DATASET_OUTPUT_ID = 'peak-sheet.dataset';
const EVENT_OUTPUT_ID = 'peak-sheet.events';

export class AppPeakSheetRepository implements PeakSheetRepository {
	constructor(private readonly outputs: GeneratedOutputPersistenceRuntime) {}

	async listDatasetIds(): Promise<readonly string[]> {
		const snapshotIds = await this.listPartitionIds(DATASET_OUTPUT_ID, '/dataset.json', 'snapshot');
		const eventIds = await this.listPartitionIds(EVENT_OUTPUT_ID, '/events.jsonl', 'event');
		return [...new Set([...snapshotIds, ...eventIds])].sort();
	}

	private async listPartitionIds(
		outputId: string,
		filenameSuffix: string,
		carrier: 'snapshot' | 'event',
	): Promise<readonly string[]> {
		const sample = this.outputs.resolvePath(outputId, { datasetId: '__sample__' });
		const marker = '/__sample__/';
		const markerIndex = sample.indexOf(marker);
		if (markerIndex < 0) throw new Error('Peak Sheet snapshot path has no dataset partition.');
		const root = sample.slice(0, markerIndex);
		const files = carrier === 'snapshot'
			? await this.outputs.snapshots.listSnapshotFilesRecursive(root)
			: await this.outputs.events.listFilesRecursiveAt(root);
		return [...new Set(files.filter((path) => path.endsWith(filenameSuffix)).map((path) => {
			const segments = path.split('/');
			return segments[segments.length - 2] ?? '';
		}).filter(Boolean))];
	}

	async load(datasetId: string): Promise<PeakSheetDatasetSnapshot | null> {
		const result = await this.outputs.snapshots.readSnapshot<PeakSheetDatasetSnapshot>({
			outputId: DATASET_OUTPUT_ID,
			recordKey: datasetId,
			pathVariables: { datasetId },
		});
		const events = await this.readEvents(datasetId);
		let snapshot = result?.envelope.payload ?? events.find((event) => event.kind === 'create')?.snapshot ?? null;
		if (!snapshot) return null;
		validatePeakSheetSnapshot(snapshot);
		for (const event of events) {
			if (!event.patch || event.nextRevision <= snapshot.revision) continue;
			if (event.baseRevision !== snapshot.revision) {
				throw new Error(`Peak Sheet ${datasetId} event stream has a revision gap at ${event.eventId}.`);
			}
			snapshot = applyPeakSheetPatch(snapshot, event.patch).snapshot;
		}
		return snapshot;
	}

	async readEvents(datasetId: string): Promise<readonly PeakSheetCommitEvent[]> {
		const result = await this.outputs.events.readEvents<PeakSheetCommitEvent>({
			outputId: EVENT_OUTPUT_ID,
			streamKey: datasetId,
			pathVariables: { datasetId },
		});
		if (result.corruption) {
			throw new Error(`Peak Sheet ${datasetId} event stream is corrupt at line ${result.corruption.lineNumber}.`);
		}
		return result.events.map((event) => event.payload);
	}

	create(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		return this.persist(snapshot, event);
	}

	commit(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		return this.persist(snapshot, event);
	}

	private async persist(
		snapshot: PeakSheetDatasetSnapshot,
		event: PeakSheetCommitEvent,
	): Promise<PeakSheetCommitResult> {
		validatePeakSheetSnapshot(snapshot);
		await this.outputs.events.appendEvent({
			outputId: EVENT_OUTPUT_ID,
			streamKey: snapshot.datasetId,
			pathVariables: { datasetId: snapshot.datasetId },
			eventId: event.eventId,
			payload: event,
		});
		try {
			await this.outputs.snapshots.writeSnapshot({
				outputId: DATASET_OUTPUT_ID,
				recordKey: snapshot.datasetId,
				pathVariables: { datasetId: snapshot.datasetId },
				payload: snapshot,
			});
			return { snapshotLag: false };
		} catch (error) {
			console.error('[Peak Sheet] Snapshot write lagged behind the durable event stream.', error);
			return { snapshotLag: true };
		}
	}
}
