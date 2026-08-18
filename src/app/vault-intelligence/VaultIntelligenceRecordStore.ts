import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import {
	VAULT_INTELLIGENCE_EVENTS_OUTPUT_ID,
	VAULT_INTELLIGENCE_STATE_OUTPUT_ID,
} from '@/core/storage/generated-output/catalog/vaultIntelligenceOutputs';
import type {
	VaultIntelligenceEvent,
	VaultIntelligencePersistedState,
} from '@/core/types/vault-intelligence';

const STATE_RECORD_KEY = 'current';
const EVENT_STREAM_KEY = 'vault-intelligence';

export class VaultIntelligenceRecordStore {
	constructor(private readonly outputs: GeneratedOutputPersistenceRuntime) {}

	async load(): Promise<VaultIntelligencePersistedState | null> {
		const result = await this.outputs.snapshots.readSnapshot<VaultIntelligencePersistedState>({
			outputId: VAULT_INTELLIGENCE_STATE_OUTPUT_ID,
			recordKey: STATE_RECORD_KEY,
		});
		return result?.envelope.payload ?? null;
	}

	async save(state: VaultIntelligencePersistedState): Promise<void> {
		await this.outputs.snapshots.writeSnapshot({
			outputId: VAULT_INTELLIGENCE_STATE_OUTPUT_ID,
			recordKey: STATE_RECORD_KEY,
			payload: state,
		});
	}

	async append(event: VaultIntelligenceEvent): Promise<void> {
		await this.outputs.events.appendEvent({
			outputId: VAULT_INTELLIGENCE_EVENTS_OUTPUT_ID,
			streamKey: EVENT_STREAM_KEY,
			eventId: event.id,
			payload: event,
		});
	}

	async listEvents(): Promise<VaultIntelligenceEvent[]> {
		const result = await this.outputs.events.readEvents<VaultIntelligenceEvent>({
			outputId: VAULT_INTELLIGENCE_EVENTS_OUTPUT_ID,
			streamKey: EVENT_STREAM_KEY,
		});
		if (result.corruption) {
			throw new Error(`Vault Intelligence events are corrupt at line ${result.corruption.lineNumber}.`);
		}
		return result.events.map((event) => event.payload);
	}
}
