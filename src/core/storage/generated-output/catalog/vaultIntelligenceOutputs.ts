import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, outputPath } from './helpers';

export const VAULT_INTELLIGENCE_STATE_OUTPUT_ID = 'vault-intelligence.state';
export const VAULT_INTELLIGENCE_EVENTS_OUTPUT_ID = 'vault-intelligence.events';

export const VAULT_INTELLIGENCE_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	durableRecord({
		documentationId: 'DR-26',
		id: VAULT_INTELLIGENCE_STATE_OUTPUT_ID,
		owner: 'vault-intelligence',
		carrier: 'json',
		path: outputPath('data-store', 'records/vault-intelligence/state.json'),
		writerEvidence: ['src/app/vault-intelligence/VaultIntelligenceRecordStore.ts'],
		lifecycle: 'active',
	}),
	durableRecord({
		documentationId: 'DR-27',
		id: VAULT_INTELLIGENCE_EVENTS_OUTPUT_ID,
		owner: 'vault-intelligence',
		carrier: 'jsonl',
		path: outputPath('data-store', 'records/vault-intelligence/events.jsonl'),
		writerEvidence: ['src/app/vault-intelligence/VaultIntelligenceRecordStore.ts'],
		lifecycle: 'active',
	}),
];
