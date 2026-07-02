// B6 ArtifactPort — Vault-backed implementation.
//
// Companion to `InMemoryArtifactStore` (which is test-only). Persists
// artifact bodies as vault files so runs survive plugin reloads and so
// review-before-write UIs can diff against a stable reference.
//
// Layout under a configurable root (default `.peak/artifacts`):
//
//   <root>/artifact-index.json          — aggregate registry mapping
//                                          artifactId → { runId, filename,
//                                          kind, contentType?, title?,
//                                          uri?, createdAt } and byRun
//                                          reverse index
//   <root>/<runId>/<artifactId>.<ext>   — one file per artifact body
//
// Extension selection follows content-type: markdown → `.md`, trace
// JSON → `.trace.json`, other JSON → `.json`, text/* → `.txt`, unknown
// falls back to `.json` (objects) or `.txt` (strings). Bodies that are
// not strings are `JSON.stringify`'d.
//
// Boundary discipline: this file lives in `service/run-envelope/` and
// uses `VaultWriterPort` for all vault IO — no direct `obsidian` import
// so tests can inject a fake writer.

import type {
	ArtifactPort,
	ArtifactRefShape,
	PutArtifactInput,
} from '@/core/ports/ArtifactPort';
import type { VaultWriterPort } from '@/core/ports/VaultWriterPort';
import { normalizeVaultPath } from '@/core/utils/path-utils';
import { defaultClock, defaultIdFactory } from './helpers';
import type { RunClock, RunIdFactory } from './types';

const DEFAULT_ARTIFACTS_ROOT = '.peak/artifacts';
const INDEX_FILENAME = 'artifact-index.json';

interface IndexEntry {
	readonly runId: string;
	readonly kind: ArtifactRefShape['kind'];
	readonly filename: string; // relative to `<root>/<runId>/`
	readonly createdAt: number;
	readonly title?: string;
	readonly uri?: string;
	readonly contentType?: string;
}

interface IndexShape {
	readonly artifacts: Record<string, IndexEntry>;
	readonly byRun: Record<string, string[]>;
}

export interface VaultArtifactStoreOptions {
	readonly vaultWriter: VaultWriterPort;
	readonly artifactsRoot?: string;
	readonly clock?: RunClock;
	readonly idFactory?: RunIdFactory;
}

export class VaultArtifactStore implements ArtifactPort {
	private readonly vault: VaultWriterPort;
	private readonly artifactsRoot: string;
	private readonly clock: RunClock;
	private readonly idFactory: RunIdFactory;
	private index: IndexShape | null = null;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(opts: VaultArtifactStoreOptions) {
		this.vault = opts.vaultWriter;
		this.artifactsRoot = normalizeVaultPath(opts.artifactsRoot ?? DEFAULT_ARTIFACTS_ROOT);
		this.clock = opts.clock ?? defaultClock();
		this.idFactory = opts.idFactory ?? defaultIdFactory('artifact');
	}

	async putArtifact<TBody = unknown>(input: PutArtifactInput<TBody>): Promise<ArtifactRefShape> {
		const artifactId = this.idFactory.next();
		const createdAt = this.clock.now();
		const ext = pickExtension(input.contentType, input.body);
		const filename = `${artifactId}.${ext}`;
		const runFolder = normalizeVaultPath(`${this.artifactsRoot}/${input.runId}`);
		const filePath = normalizeVaultPath(`${runFolder}/${filename}`);

		// Serialize onto queue so concurrent puts don't clobber the index.
		await this.enqueue(async () => {
			await this.ensureIndexLoaded();
			await this.vault.ensureFolder(runFolder);
			const body = serializeBody(input.body, input.contentType);
			await this.vault.create(filePath, body);

			const entry: IndexEntry = {
				runId: input.runId,
				kind: input.kind,
				filename,
				createdAt,
				...(input.title !== undefined ? { title: input.title } : {}),
				...(input.uri !== undefined ? { uri: input.uri } : {}),
				...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
			};
			const next = mergeIndex(this.index!, artifactId, entry);
			this.index = next;
			await this.persistIndex(next);
		});

		return {
			artifactId,
			runId: input.runId,
			kind: input.kind,
			...(input.title !== undefined ? { title: input.title } : {}),
			...(input.uri !== undefined ? { uri: input.uri } : {}),
			...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
			createdAt,
		};
	}

	async getArtifactBody<TBody = unknown>(artifactId: string): Promise<TBody | undefined> {
		await this.ensureIndexLoaded();
		const entry = this.index!.artifacts[artifactId];
		if (!entry) return undefined;
		const filePath = normalizeVaultPath(`${this.artifactsRoot}/${entry.runId}/${entry.filename}`);
		let raw: string;
		try {
			raw = await this.vault.read(filePath);
		} catch {
			return undefined;
		}
		return deserializeBody<TBody>(raw, entry.filename, entry.contentType);
	}

	async listByRun(runId: string): Promise<ArtifactRefShape[]> {
		await this.ensureIndexLoaded();
		const ids = this.index!.byRun[runId] ?? [];
		return ids
			.map((id) => {
				const entry = this.index!.artifacts[id];
				if (!entry) return undefined;
				return {
					artifactId: id,
					runId: entry.runId,
					kind: entry.kind,
					...(entry.title !== undefined ? { title: entry.title } : {}),
					...(entry.uri !== undefined ? { uri: entry.uri } : {}),
					...(entry.contentType !== undefined ? { contentType: entry.contentType } : {}),
					createdAt: entry.createdAt,
				} satisfies ArtifactRefShape;
			})
			.filter((ref): ref is ArtifactRefShape => ref !== undefined);
	}

	private enqueue(work: () => Promise<void>): Promise<void> {
		const next = this.writeQueue.then(work, work);
		// Keep the chain alive even if a step throws, so later puts still queue.
		this.writeQueue = next.catch(() => undefined);
		return next;
	}

	private async ensureIndexLoaded(): Promise<void> {
		if (this.index !== null) return;
		await this.vault.ensureFolder(this.artifactsRoot);
		const indexPath = normalizeVaultPath(`${this.artifactsRoot}/${INDEX_FILENAME}`);
		let raw: string | null = null;
		try {
			raw = await this.vault.read(indexPath);
		} catch {
			raw = null;
		}
		this.index = raw ? parseIndex(raw) : { artifacts: {}, byRun: {} };
	}

	private async persistIndex(index: IndexShape): Promise<void> {
		const indexPath = normalizeVaultPath(`${this.artifactsRoot}/${INDEX_FILENAME}`);
		const payload = JSON.stringify(index, null, 2);
		try {
			await this.vault.modify(indexPath, payload);
		} catch {
			// File probably does not exist yet — create it.
			await this.vault.create(indexPath, payload);
		}
	}
}

function pickExtension(contentType: string | undefined, body: unknown): string {
	if (contentType) {
		const ct = contentType.toLowerCase();
		if (ct === 'application/x.peak.trace+json' || ct.endsWith('/x.peak.trace+json')) {
			return 'trace.json';
		}
		if (ct.includes('markdown')) return 'md';
		if (ct.includes('json')) return 'json';
		if (ct.startsWith('text/')) return 'txt';
	}
	if (typeof body === 'string') return 'txt';
	return 'json';
}

function serializeBody(body: unknown, contentType: string | undefined): string {
	if (typeof body === 'string') return body;
	if (body === null || body === undefined) return '';
	if (contentType && !contentType.toLowerCase().includes('json')) {
		// Non-JSON content but non-string body — best-effort string coerce.
		return String(body);
	}
	return JSON.stringify(body);
}

function deserializeBody<TBody>(raw: string, filename: string, contentType: string | undefined): TBody {
	const looksJson = filename.endsWith('.json') || filename.endsWith('.trace.json')
		|| (contentType?.toLowerCase().includes('json') ?? false);
	if (!looksJson) return raw as unknown as TBody;
	if (raw === '') return null as unknown as TBody;
	try {
		return JSON.parse(raw) as TBody;
	} catch {
		return raw as unknown as TBody;
	}
}

function parseIndex(raw: string): IndexShape {
	try {
		const parsed = JSON.parse(raw) as Partial<IndexShape>;
		return {
			artifacts: (parsed.artifacts ?? {}) as Record<string, IndexEntry>,
			byRun: (parsed.byRun ?? {}) as Record<string, string[]>,
		};
	} catch {
		return { artifacts: {}, byRun: {} };
	}
}

function mergeIndex(current: IndexShape, artifactId: string, entry: IndexEntry): IndexShape {
	const nextArtifacts = { ...current.artifacts, [artifactId]: entry };
	const list = current.byRun[entry.runId] ?? [];
	const nextByRun = { ...current.byRun, [entry.runId]: [...list, artifactId] };
	return { artifacts: nextArtifacts, byRun: nextByRun };
}
