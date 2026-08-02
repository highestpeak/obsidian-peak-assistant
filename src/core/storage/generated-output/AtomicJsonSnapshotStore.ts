import type { GeneratedOutputDataAdapter } from './GeneratedOutputDataAdapter';
import { canonicalJson, sha256Text } from './GeneratedOutputIntegrity';
import { generatedOutputDirectory, generatedOutputRecoverySuffix } from './GeneratedOutputPath';
import type { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
import type { GeneratedOutputPathRoots, GeneratedOutputPathVariables } from './types';

export interface JsonSnapshotEnvelope<T> {
	readonly schemaVersion: number;
	readonly outputId: string;
	readonly recordKey: string;
	readonly updatedAt: string;
	readonly payload: T;
	readonly checksum: string;
}
export interface JsonSnapshotWriteInput<T> {
	readonly outputId: string;
	readonly recordKey: string;
	readonly pathVariables?: GeneratedOutputPathVariables;
	readonly payload: T;
}

export interface JsonSnapshotReadInput {
	readonly outputId: string;
	readonly recordKey: string;
	readonly pathVariables?: GeneratedOutputPathVariables;
}

export interface JsonSnapshotReadResult<T> {
	readonly envelope: JsonSnapshotEnvelope<T>;
	readonly recoveredFromBackup: boolean;
	readonly quarantinedPath?: string;
}

export class CorruptGeneratedOutputError extends Error {
	constructor(
		message: string,
		public readonly outputPath: string,
		public readonly quarantinedPath?: string,
	) {
		super(message);
		this.name = 'CorruptGeneratedOutputError';
	}
}

export class AtomicJsonSnapshotStore {
	private readonly pendingWrites = new Map<string, Promise<void>>();
	private recoverySequence = 0;

	constructor(
		private readonly adapter: GeneratedOutputDataAdapter,
		private readonly registry: GeneratedOutputRegistry,
		private readonly roots: GeneratedOutputPathRoots,
		private readonly now: () => string = () => new Date().toISOString(),
	) {}

	async writeSnapshot<T>(input: JsonSnapshotWriteInput<T>): Promise<JsonSnapshotEnvelope<T>> {
		const path = this.resolveJsonPath(input.outputId, input.pathVariables);
		const envelope = this.createEnvelope(input);
		const content = `${canonicalJson(envelope)}\n`;
		await this.enqueue(path, () => this.replaceVerified(path, content, (candidate) => {
			this.parseEnvelope<T>(candidate, input.outputId, input.recordKey);
		}));
		return envelope;
	}

	async readSnapshot<T>(input: JsonSnapshotReadInput): Promise<JsonSnapshotReadResult<T> | null> {
		const path = this.resolveJsonPath(input.outputId, input.pathVariables);
		await this.recoverInterruptedReplace(path);
		if (!(await this.adapter.exists(path))) {
			return this.restoreBackupIfPresent<T>(path, input);
		}
		try {
			const envelope = this.parseEnvelope<T>(await this.adapter.readText(path), input.outputId, input.recordKey);
			return { envelope, recoveredFromBackup: false };
		} catch (error) {
			return this.quarantineAndRestore<T>(path, input, error);
		}
	}

	private createEnvelope<T>(input: JsonSnapshotWriteInput<T>): JsonSnapshotEnvelope<T> {
		const descriptor = this.registry.require(input.outputId);
		if (descriptor.carrier !== 'json' || descriptor.lifecycle === 'migration-source') {
			throw new Error(`AtomicJsonSnapshotStore: output "${input.outputId}" is not an active JSON output.`);
		}
		const withoutChecksum = {
			schemaVersion: descriptor.schemaVersion!,
			outputId: input.outputId,
			recordKey: input.recordKey,
			updatedAt: this.now(),
			payload: input.payload,
		};
		return { ...withoutChecksum, checksum: sha256Text(canonicalJson(withoutChecksum)) };
	}

	private parseEnvelope<T>(content: string, outputId: string, recordKey: string): JsonSnapshotEnvelope<T> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch (error) {
			throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (!isSnapshotEnvelope(parsed)) throw new Error('snapshot envelope shape is invalid');
		const descriptor = this.registry.require(outputId);
		if (parsed.outputId !== outputId || parsed.recordKey !== recordKey) {
			throw new Error('snapshot identity does not match the requested output');
		}
		if (parsed.schemaVersion !== descriptor.schemaVersion) {
			throw new Error(`unsupported schema version ${parsed.schemaVersion}`);
		}
		const { checksum, ...withoutChecksum } = parsed;
		const actual = sha256Text(canonicalJson(withoutChecksum));
		if (checksum !== actual) throw new Error('snapshot checksum mismatch');
		return parsed as JsonSnapshotEnvelope<T>;
	}

	private resolveJsonPath(outputId: string, variables: GeneratedOutputPathVariables = {}): string {
		const descriptor = this.registry.require(outputId);
		if (descriptor.carrier !== 'json' || descriptor.lifecycle === 'migration-source') {
			throw new Error(`AtomicJsonSnapshotStore: output "${outputId}" is not an active JSON output.`);
		}
		return this.registry.resolvePath(outputId, this.roots, variables);
	}

	private async enqueue(path: string, operation: () => Promise<void>): Promise<void> {
		const previous = this.pendingWrites.get(path) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(operation);
		this.pendingWrites.set(path, current);
		try {
			await current;
		} finally {
			if (this.pendingWrites.get(path) === current) this.pendingWrites.delete(path);
		}
	}

	private async replaceVerified(
		path: string,
		content: string,
		verify: (candidate: string) => void,
	): Promise<void> {
		await this.recoverInterruptedReplace(path);
		const directory = generatedOutputDirectory(path);
		if (directory) await this.adapter.ensureDirectory(directory);
		const tempPath = `${path}.tmp`;
		const backupTempPath = `${path}.backup.tmp`;
		const backupPath = `${path}.backup`;
		const replacePath = `${path}.replace`;
		await this.adapter.writeText(tempPath, content);
		verify(await this.adapter.readText(tempPath));

		const hasCurrent = await this.adapter.exists(path);
		if (hasCurrent) {
			const previous = await this.adapter.readText(path);
			await this.adapter.writeText(backupTempPath, previous);
			if ((await this.adapter.readText(backupTempPath)) !== previous) {
				throw new Error(`AtomicJsonSnapshotStore: backup verification failed for ${path}.`);
			}
			if (await this.adapter.exists(backupPath)) await this.adapter.remove(backupPath);
			await this.adapter.rename(backupTempPath, backupPath);
			if (await this.adapter.exists(replacePath)) {
				await this.quarantinePath(replacePath, 'stale-replace');
			}
			await this.adapter.rename(path, replacePath);
		}

		try {
			await this.adapter.rename(tempPath, path);
			verify(await this.adapter.readText(path));
			if (await this.adapter.exists(replacePath)) await this.adapter.remove(replacePath);
		} catch (error) {
			if (!(await this.adapter.exists(path)) && await this.adapter.exists(replacePath)) {
				await this.adapter.rename(replacePath, path);
			}
			throw error;
		}
	}

	private async recoverInterruptedReplace(path: string): Promise<void> {
		const replacePath = `${path}.replace`;
		if (await this.adapter.exists(path)) return;
		if (await this.adapter.exists(replacePath)) await this.adapter.rename(replacePath, path);
	}

	private async restoreBackupIfPresent<T>(
		path: string,
		input: JsonSnapshotReadInput,
	): Promise<JsonSnapshotReadResult<T> | null> {
		const backupPath = `${path}.backup`;
		if (!(await this.adapter.exists(backupPath))) return null;
		const envelope = this.parseEnvelope<T>(await this.adapter.readText(backupPath), input.outputId, input.recordKey);
		await this.adapter.rename(backupPath, path);
		return { envelope, recoveredFromBackup: true };
	}

	private async quarantineAndRestore<T>(
		path: string,
		input: JsonSnapshotReadInput,
		cause: unknown,
	): Promise<JsonSnapshotReadResult<T>> {
		const quarantinedPath = await this.quarantinePath(path, 'corrupt');
		const restored = await this.restoreBackupIfPresent<T>(path, input);
		if (restored) return { ...restored, quarantinedPath };
		const message = cause instanceof Error ? cause.message : String(cause);
		throw new CorruptGeneratedOutputError(
			`AtomicJsonSnapshotStore: ${path} is corrupt and no valid backup exists (${message}).`,
			path,
			quarantinedPath,
		);
	}

	private async quarantinePath(path: string, reason: string): Promise<string> {
		const suffix = generatedOutputRecoverySuffix(this.now(), ++this.recoverySequence);
		const target = `${path}.${reason}-${suffix}`;
		await this.adapter.rename(path, target);
		return target;
	}
}

function isSnapshotEnvelope(value: unknown): value is JsonSnapshotEnvelope<unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return Number.isInteger(record.schemaVersion)
		&& typeof record.outputId === 'string'
		&& typeof record.recordKey === 'string'
		&& typeof record.updatedAt === 'string'
		&& 'payload' in record
		&& typeof record.checksum === 'string';
}
