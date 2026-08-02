import type { PartitionedJsonlStore, JsonlEventEnvelope } from './PartitionedJsonlStore';

export type GeneratedOutputMigrationStatus =
	| 'discovered'
	| 'imported'
	| 'validated'
	| 'read-cutover'
	| 'write-retired'
	| 'failed';

export interface GeneratedOutputMigrationEvent {
	readonly migrationId: string;
	readonly sourceOutputId: string;
	readonly targetOutputId: string;
	readonly sourcePath: string;
	readonly targetPath?: string;
	readonly status: GeneratedOutputMigrationStatus;
	readonly sourceChecksum?: string;
	readonly targetChecksum?: string;
	readonly detail?: string;
}
export class GeneratedOutputMigrationJournal {
	static readonly OUTPUT_ID = 'migration.journal';
	static readonly STREAM_KEY = 'generated-output-migrations';

	constructor(private readonly events: PartitionedJsonlStore) {}

	append(event: GeneratedOutputMigrationEvent): Promise<boolean> {
		return this.events.appendEvent({
			outputId: GeneratedOutputMigrationJournal.OUTPUT_ID,
			streamKey: GeneratedOutputMigrationJournal.STREAM_KEY,
			eventId: `${event.migrationId}:${event.sourcePath}:${event.status}`,
			payload: event,
		});
	}

	async list(): Promise<readonly JsonlEventEnvelope<GeneratedOutputMigrationEvent>[]> {
		const result = await this.events.readEvents<GeneratedOutputMigrationEvent>({
			outputId: GeneratedOutputMigrationJournal.OUTPUT_ID,
			streamKey: GeneratedOutputMigrationJournal.STREAM_KEY,
		});
		if (result.corruption) {
			throw new Error(
				`GeneratedOutputMigrationJournal: journal is corrupt at line ${result.corruption.lineNumber}.`,
			);
		}
		return result.events;
	}
}
