import type { GeneratedOutputDescriptor } from '../types';
import { PLUGIN_COMMAND_GATEWAY_AUDIT_OUTPUT_ID } from '@/core/types/plugin-command-gateway';
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
	durableRecord({
		documentationId: 'DR-20',
		id: PLUGIN_COMMAND_GATEWAY_AUDIT_OUTPUT_ID,
		owner: 'plugin-command-gateway',
		carrier: 'jsonl',
		path: outputPath('data-store', 'records/command-gateway/runs.jsonl'),
		writerEvidence: ['src/app/platform/commands/ObsidianPluginCommandGatewayAudit.ts'],
		lifecycle: 'active',
	}),
];
