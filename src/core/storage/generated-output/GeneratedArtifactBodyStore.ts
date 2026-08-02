import type { GeneratedOutputDataAdapter } from './GeneratedOutputDataAdapter';
import { sha256Bytes } from './GeneratedOutputIntegrity';
import { assertSafeGeneratedOutputFilename, generatedOutputRecoverySuffix } from './GeneratedOutputPath';
import type { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
import type { GeneratedOutputPathRoots, GeneratedOutputPathVariables } from './types';

export interface GeneratedArtifactRef {
	readonly outputId: string;
	readonly path: string;
	readonly checksum: string;
	readonly checksumAlgorithm: 'sha256';
	readonly sizeBytes: number;
	readonly contentType: string;
}
export interface GeneratedArtifactBodyInput {
	readonly outputId: string;
	readonly filename: string;
	readonly pathVariables?: GeneratedOutputPathVariables;
	readonly contentType: string;
	readonly body: Uint8Array;
}

export class GeneratedArtifactBodyStore {
	private recoverySequence = 0;

	constructor(
		private readonly adapter: GeneratedOutputDataAdapter,
		private readonly registry: GeneratedOutputRegistry,
		private readonly roots: GeneratedOutputPathRoots,
		private readonly now: () => string = () => new Date().toISOString(),
	) {}

	async putBody(input: GeneratedArtifactBodyInput): Promise<GeneratedArtifactRef> {
		const path = this.resolveBodyPath(input);
		const checksum = sha256Bytes(input.body);
		const ref = this.createRef(input, path, checksum);
		if (await this.adapter.exists(path)) {
			const existing = await this.adapter.readBinary(path);
			if (sha256Bytes(existing) === checksum) return ref;
			throw new Error(`GeneratedArtifactBodyStore: immutable body already exists with different bytes (${path}).`);
		}

		const basePath = path.slice(0, path.lastIndexOf('/'));
		if (basePath) await this.adapter.ensureDirectory(basePath);
		const suffix = generatedOutputRecoverySuffix(this.now(), ++this.recoverySequence);
		const tempPath = `${path}.tmp-${suffix}`;
		await this.adapter.writeBinary(tempPath, input.body);
		const persisted = await this.adapter.readBinary(tempPath);
		if (sha256Bytes(persisted) !== checksum) {
			throw new Error(`GeneratedArtifactBodyStore: temporary body verification failed (${path}).`);
		}
		await this.adapter.rename(tempPath, path);
		const committed = await this.adapter.readBinary(path);
		if (sha256Bytes(committed) !== checksum) {
			throw new Error(`GeneratedArtifactBodyStore: committed body verification failed (${path}).`);
		}
		return ref;
	}

	async getBody(ref: GeneratedArtifactRef): Promise<Uint8Array> {
		const body = await this.adapter.readBinary(ref.path);
		const checksum = sha256Bytes(body);
		if (checksum !== ref.checksum) {
			throw new Error(`GeneratedArtifactBodyStore: checksum mismatch for ${ref.path}.`);
		}
		return body;
	}

	async putTextBody(input: Omit<GeneratedArtifactBodyInput, 'body'> & { readonly body: string }): Promise<GeneratedArtifactRef> {
		return this.putBody({ ...input, body: new TextEncoder().encode(input.body) });
	}

	private resolveBodyPath(input: GeneratedArtifactBodyInput): string {
		const descriptor = this.registry.require(input.outputId);
		if (descriptor.lifecycle === 'migration-source' || !['native', 'binary'].includes(descriptor.carrier)) {
			throw new Error(`GeneratedArtifactBodyStore: output "${input.outputId}" is not an active artifact body output.`);
		}
		const basePath = this.registry.resolvePath(input.outputId, this.roots, input.pathVariables ?? {});
		return `${basePath}/${assertSafeGeneratedOutputFilename(input.filename, 'artifact filename')}`;
	}

	private createRef(
		input: GeneratedArtifactBodyInput,
		path: string,
		checksum: string,
	): GeneratedArtifactRef {
		return {
			outputId: input.outputId,
			path,
			checksum,
			checksumAlgorithm: 'sha256',
			sizeBytes: input.body.byteLength,
			contentType: input.contentType,
		};
	}
}
