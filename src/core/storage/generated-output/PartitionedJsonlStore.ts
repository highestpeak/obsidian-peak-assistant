import type { GeneratedOutputDataAdapter } from './GeneratedOutputDataAdapter';
import { canonicalJson, sha256Text } from './GeneratedOutputIntegrity';
import {
	assertSafeGeneratedOutputFilename,
	generatedOutputDirectory,
	generatedOutputRecoverySuffix,
} from './GeneratedOutputPath';
import type { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
import type { GeneratedOutputPathRoots, GeneratedOutputPathVariables } from './types';

export interface JsonlEventEnvelope<T> {
	readonly schemaVersion: number;
	readonly outputId: string;
	readonly streamKey: string;
	readonly eventId: string;
	readonly recordedAt: string;
	readonly payload: T;
	readonly checksum: string;
}
export interface JsonlStreamInput {
	readonly outputId: string;
	readonly streamKey: string;
	readonly pathVariables?: GeneratedOutputPathVariables;
	/** Optional filename when the registered output path denotes a partition directory. */
	readonly partitionFilename?: string;
}

export interface JsonlAppendInput<T> extends JsonlStreamInput {
	readonly eventId: string;
	readonly payload: T;
}

export interface JsonlCorruption {
	readonly lineNumber: number;
	readonly reason: string;
	readonly validPrefix: string;
	readonly rawTail: string;
}

export interface JsonlReadResult<T> {
	readonly events: readonly JsonlEventEnvelope<T>[];
	readonly corruption?: JsonlCorruption;
}

export interface JsonlQuarantineResult<T> extends JsonlReadResult<T> {
	readonly quarantinedPath?: string;
}

export class PartitionedJsonlStore {
	private readonly pendingAppends = new Map<string, Promise<void>>();
	private recoverySequence = 0;

	constructor(
		private readonly adapter: GeneratedOutputDataAdapter,
		private readonly registry: GeneratedOutputRegistry,
		private readonly roots: GeneratedOutputPathRoots,
		private readonly now: () => string = () => new Date().toISOString(),
	) {}

	/** Returns false when the stable event ID already exists in this partition. */
	async appendEvent<T>(input: JsonlAppendInput<T>): Promise<boolean> {
		const path = this.resolveJsonlPath(input.outputId, input.pathVariables, input.partitionFilename);
		let appended = false;
		await this.enqueue(path, async () => {
			const current = await this.readEvents<T>(input);
			if (current.corruption) {
				throw new Error(
					`PartitionedJsonlStore: ${path} is corrupt at line ${current.corruption.lineNumber}; quarantine it before appending.`,
				);
			}
			if (current.events.some((event) => event.eventId === input.eventId)) return;
			const directory = generatedOutputDirectory(path);
			if (directory) await this.adapter.ensureDirectory(directory);
			const envelope = this.createEnvelope(input);
			await this.adapter.appendText(path, `${canonicalJson(envelope)}\n`);
			appended = true;
		});
		return appended;
	}

	async readEvents<T>(input: JsonlStreamInput): Promise<JsonlReadResult<T>> {
		const path = this.resolveJsonlPath(input.outputId, input.pathVariables, input.partitionFilename);
		if (!(await this.adapter.exists(path))) return { events: [] };
		const content = await this.adapter.readText(path);
		return this.parseStream<T>(content, input);
	}

	async listPartitionFiles(
		outputId: string,
		pathVariables: GeneratedOutputPathVariables = {},
	): Promise<readonly string[]> {
		const path = this.resolveJsonlPath(outputId, pathVariables);
		return this.adapter.listFiles(path);
	}

	listFilesAt(directoryPath: string): Promise<readonly string[]> {
		return this.adapter.listFiles(directoryPath);
	}

	listFilesRecursiveAt(directoryPath: string): Promise<readonly string[]> {
		return this.adapter.listFilesRecursive(directoryPath);
	}

	/**
	 * Explicit repair boundary. The original corrupt stream is preserved in a
	 * quarantine file, while the canonical path is replaced with its verified
	 * prefix. Nothing is silently deleted.
	 */
	async quarantineCorruptTail<T>(input: JsonlStreamInput): Promise<JsonlQuarantineResult<T>> {
		const path = this.resolveJsonlPath(input.outputId, input.pathVariables, input.partitionFilename);
		const current = await this.readEvents<T>(input);
		if (!current.corruption) return current;
		const suffix = generatedOutputRecoverySuffix(this.now(), ++this.recoverySequence);
		const quarantinedPath = `${path}.corrupt-${suffix}`;
		const tempPath = `${path}.repair.tmp`;
		await this.adapter.writeText(tempPath, current.corruption.validPrefix);
		const verified = this.parseStream<T>(await this.adapter.readText(tempPath), input);
		if (verified.corruption) throw new Error(`PartitionedJsonlStore: repaired prefix for ${path} did not validate.`);
		await this.adapter.rename(path, quarantinedPath);
		try {
			await this.adapter.rename(tempPath, path);
		} catch (error) {
			if (!(await this.adapter.exists(path)) && await this.adapter.exists(quarantinedPath)) {
				await this.adapter.rename(quarantinedPath, path);
			}
			throw error;
		}
		return { ...verified, quarantinedPath };
	}

	private createEnvelope<T>(input: JsonlAppendInput<T>): JsonlEventEnvelope<T> {
		const descriptor = this.requireJsonlDescriptor(input.outputId);
		const withoutChecksum = {
			schemaVersion: descriptor.schemaVersion!,
			outputId: input.outputId,
			streamKey: input.streamKey,
			eventId: input.eventId,
			recordedAt: this.now(),
			payload: input.payload,
		};
		return { ...withoutChecksum, checksum: sha256Text(canonicalJson(withoutChecksum)) };
	}

	private parseStream<T>(content: string, input: JsonlStreamInput): JsonlReadResult<T> {
		const events: JsonlEventEnvelope<T>[] = [];
		let offset = 0;
		let lineNumber = 0;
		while (offset < content.length) {
			const newline = content.indexOf('\n', offset);
			const end = newline < 0 ? content.length : newline;
			const rawLine = content.slice(offset, end);
			lineNumber += 1;
			const nextOffset = newline < 0 ? content.length : newline + 1;
			if (rawLine.trim()) {
				try {
					const event = this.parseEnvelope<T>(rawLine, input);
					if (events.some((candidate) => candidate.eventId === event.eventId)) {
						throw new Error(`duplicate event id "${event.eventId}"`);
					}
					events.push(event);
				} catch (error) {
					return {
						events,
						corruption: {
							lineNumber,
							reason: error instanceof Error ? error.message : String(error),
							validPrefix: content.slice(0, offset),
							rawTail: content.slice(offset),
						},
					};
				}
			}
			offset = nextOffset;
		}
		return { events };
	}

	private parseEnvelope<T>(rawLine: string, input: JsonlStreamInput): JsonlEventEnvelope<T> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawLine);
		} catch (error) {
			throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (!isEventEnvelope(parsed)) throw new Error('event envelope shape is invalid');
		const descriptor = this.requireJsonlDescriptor(input.outputId);
		if (parsed.outputId !== input.outputId || parsed.streamKey !== input.streamKey) {
			throw new Error('event identity does not match the requested stream');
		}
		if (parsed.schemaVersion !== descriptor.schemaVersion) {
			throw new Error(`unsupported schema version ${parsed.schemaVersion}`);
		}
		const { checksum, ...withoutChecksum } = parsed;
		if (checksum !== sha256Text(canonicalJson(withoutChecksum))) throw new Error('event checksum mismatch');
		return parsed as JsonlEventEnvelope<T>;
	}

	private resolveJsonlPath(
		outputId: string,
		variables: GeneratedOutputPathVariables = {},
		partitionFilename?: string,
	): string {
		this.requireJsonlDescriptor(outputId);
		const path = this.registry.resolvePath(outputId, this.roots, variables);
		if (!partitionFilename) return path;
		return `${path}/${assertSafeGeneratedOutputFilename(partitionFilename, 'JSONL partition filename')}`;
	}

	private requireJsonlDescriptor(outputId: string) {
		const descriptor = this.registry.require(outputId);
		if (descriptor.carrier !== 'jsonl' || descriptor.lifecycle === 'migration-source') {
			throw new Error(`PartitionedJsonlStore: output "${outputId}" is not an active JSONL output.`);
		}
		return descriptor;
	}

	private async enqueue(path: string, operation: () => Promise<void>): Promise<void> {
		const previous = this.pendingAppends.get(path) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(operation);
		this.pendingAppends.set(path, current);
		try {
			await current;
		} finally {
			if (this.pendingAppends.get(path) === current) this.pendingAppends.delete(path);
		}
	}
}

function isEventEnvelope(value: unknown): value is JsonlEventEnvelope<unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return Number.isInteger(record.schemaVersion)
		&& typeof record.outputId === 'string'
		&& typeof record.streamKey === 'string'
		&& typeof record.eventId === 'string'
		&& typeof record.recordedAt === 'string'
		&& 'payload' in record
		&& typeof record.checksum === 'string';
}
