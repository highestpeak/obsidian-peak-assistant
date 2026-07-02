// T2 ArtifactPort — in-memory implementation.
//
// Zero-dependency reference implementation. Uses the same clock +
// idFactory injection convention as `InMemoryRunRecorder` so tests can
// pin `createdAt` + `artifactId` deterministically. In production this
// store can be substituted with a Vault-backed / sqlite-backed impl
// without any downstream code change.

import type { ArtifactPort, ArtifactRefShape, PutArtifactInput } from '@/core/ports/ArtifactPort';
import { defaultClock, defaultIdFactory } from './helpers';
import type { RunClock, RunIdFactory } from './types';

interface StoredArtifact {
	readonly ref: ArtifactRefShape;
	readonly body: unknown;
}

export interface InMemoryArtifactStoreOptions {
	readonly clock?: RunClock;
	readonly idFactory?: RunIdFactory;
}

export class InMemoryArtifactStore implements ArtifactPort {
	private readonly clock: RunClock;
	private readonly idFactory: RunIdFactory;
	private readonly byId = new Map<string, StoredArtifact>();
	private readonly byRun = new Map<string, string[]>();

	constructor(opts?: InMemoryArtifactStoreOptions) {
		this.clock = opts?.clock ?? defaultClock();
		this.idFactory = opts?.idFactory ?? defaultIdFactory('artifact');
	}

	async putArtifact<TBody>(input: PutArtifactInput<TBody>): Promise<ArtifactRefShape> {
		const ref: ArtifactRefShape = {
			artifactId: this.idFactory.next(),
			runId: input.runId,
			kind: input.kind,
			...(input.title !== undefined ? { title: input.title } : {}),
			...(input.uri !== undefined ? { uri: input.uri } : {}),
			...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
			createdAt: this.clock.now(),
		};
		this.byId.set(ref.artifactId, { ref, body: input.body });
		const list = this.byRun.get(input.runId) ?? [];
		list.push(ref.artifactId);
		this.byRun.set(input.runId, list);
		return ref;
	}

	async getArtifactBody<TBody>(artifactId: string): Promise<TBody | undefined> {
		const rec = this.byId.get(artifactId);
		return rec ? (rec.body as TBody) : undefined;
	}

	async listByRun(runId: string): Promise<ArtifactRefShape[]> {
		const ids = this.byRun.get(runId) ?? [];
		return ids
			.map((id) => this.byId.get(id))
			.filter((rec): rec is StoredArtifact => rec !== undefined)
			.map((rec) => rec.ref);
	}
}
