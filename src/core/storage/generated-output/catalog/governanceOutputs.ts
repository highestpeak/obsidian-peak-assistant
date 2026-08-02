import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, outputPath } from './helpers';

export const GOVERNANCE_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	durableRecord({
		documentationId: 'DR-17',
		id: 'migration.journal',
		owner: 'generated-output-governance',
		carrier: 'jsonl',
		path: outputPath('data-store', 'records/system/generated-output-migrations.jsonl'),
		writerEvidence: ['src/core/storage/generated-output/GeneratedOutputMigrationJournal.ts'],
	}),
];
