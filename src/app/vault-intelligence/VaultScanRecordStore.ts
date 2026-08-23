import type { GeneratedArtifactRef, GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { VAULT_SCAN_RUN_ARTIFACTS_OUTPUT_ID, VAULT_SCAN_RUN_CHECKPOINT_OUTPUT_ID, VAULT_SCAN_RUN_EVENTS_OUTPUT_ID } from '@/core/storage/generated-output/catalog/vaultIntelligenceOutputs';
import type { VaultScanCheckpoint, VaultScanDomainEvent } from '@/core/types/vault-scan';

export class VaultScanRecordStore {
	constructor(private readonly outputs: GeneratedOutputPersistenceRuntime) {}

	async appendEvent(event: VaultScanDomainEvent): Promise<boolean> {
		return this.outputs.events.appendEvent({ outputId: VAULT_SCAN_RUN_EVENTS_OUTPUT_ID, streamKey: event.scanRunId, pathVariables: { runId: event.scanRunId }, eventId: event.eventId, payload: event });
	}

	async listEvents(scanRunId: string): Promise<VaultScanDomainEvent[]> {
		const result = await this.outputs.events.readEvents<VaultScanDomainEvent>({ outputId: VAULT_SCAN_RUN_EVENTS_OUTPUT_ID, streamKey: scanRunId, pathVariables: { runId: scanRunId } });
		if (result.corruption) throw new Error(`Vault Scan events are corrupt at line ${result.corruption.lineNumber}: ${result.corruption.reason}`);
		return result.events.map((event) => event.payload).sort((left, right) => left.sequence - right.sequence);
	}

	async saveCheckpoint(checkpoint: VaultScanCheckpoint): Promise<void> {
		await this.outputs.snapshots.writeSnapshot({ outputId: VAULT_SCAN_RUN_CHECKPOINT_OUTPUT_ID, recordKey: checkpoint.state.scanRunId, pathVariables: { runId: checkpoint.state.scanRunId }, payload: checkpoint });
	}

	async loadCheckpoint(scanRunId: string): Promise<VaultScanCheckpoint | null> {
		const result = await this.outputs.snapshots.readSnapshot<VaultScanCheckpoint>({ outputId: VAULT_SCAN_RUN_CHECKPOINT_OUTPUT_ID, recordKey: scanRunId, pathVariables: { runId: scanRunId } });
		return result?.envelope.payload ?? null;
	}

	async putArtifact(scanRunId: string, artifactId: string, value: unknown): Promise<GeneratedArtifactRef> {
		return this.outputs.artifactBodies.putTextBody({ outputId: VAULT_SCAN_RUN_ARTIFACTS_OUTPUT_ID, filename: `${artifactId}.json`, pathVariables: { runId: scanRunId }, contentType: 'application/json', body: `${JSON.stringify(value)}\n` });
	}

	async readArtifact<T>(ref: GeneratedArtifactRef): Promise<T> {
		return JSON.parse(new TextDecoder().decode(await this.outputs.artifactBodies.getBody(ref))) as T;
	}
}
