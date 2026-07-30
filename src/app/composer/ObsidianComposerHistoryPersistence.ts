import type { App } from 'obsidian';
import type {
	ComposerDocumentHistoryEvent,
	ComposerHistoryPersistencePort,
	CopilotSessionStateSnapshot,
} from '@/service/composer';
import {
	ensureAdapterDirectory,
	joinAdapterPath,
} from './ObsidianComposerDataStore';

interface DocumentIdentityRecord {
	recordId: string;
	documentId: string;
	currentPath: string;
	aliases: string[];
	ctime?: number;
}

interface DocumentIdentityIndex {
	schemaVersion: 1;
	documents: DocumentIdentityRecord[];
}

interface CopilotSnapshotEvent {
	type: 'copilot.session.snapshot';
	eventId: string;
	at: number;
	state: CopilotSessionStateSnapshot;
}

const EMPTY_IDENTITY_INDEX: DocumentIdentityIndex = {
	schemaVersion: 1,
	documents: [],
};

/**
 * App-owned JSONL repository for committed document History and Copilot
 * receipts. A small DataStore index maps mutable Vault paths to opaque record
 * ids; internal ids never enter Markdown/frontmatter.
 */
export class ObsidianComposerHistoryPersistence
	implements ComposerHistoryPersistencePort
{
	private queue: Promise<unknown> = Promise.resolve();
	private identityIndex: DocumentIdentityIndex | null = null;
	private sequence = 0;

	constructor(
		private readonly app: App,
		private readonly documentHistoryDir: string,
		private readonly copilotSessionDir: string,
		private readonly options: {
			identityFile: string;
			copilotCompactionEventThreshold: number;
		},
	) {}

	loadDocumentHistory(
		documentId: string,
		filePath: string,
	): Promise<readonly ComposerDocumentHistoryEvent[]> {
		return this.enqueue(async () => {
			const identity = await this.resolveIdentity(documentId, filePath, true);
			if (!identity) return [];
			return this.readDocumentEvents(identity.recordId);
		});
	}

	appendDocumentHistory(
		documentId: string,
		filePath: string,
		event: ComposerDocumentHistoryEvent,
	): Promise<void> {
		return this.enqueue(async () => {
			const identity = await this.resolveIdentity(documentId, filePath, true);
			if (!identity) return;
			const existing = await this.readDocumentEvents(identity.recordId);
			if (existing.some((record) => record.eventId === event.eventId)) return;
			await this.appendLine(
				this.documentHistoryDir,
				this.documentStreamPath(identity.recordId),
				event,
			);
		});
	}

	loadCopilotSession(
		documentId: string,
		filePath: string,
	): Promise<CopilotSessionStateSnapshot | null> {
		return this.enqueue(async () => {
			const identity = await this.resolveIdentity(documentId, filePath, true);
			if (!identity) return null;
			const events = await this.readCopilotEvents(identity.recordId);
			return events.at(-1)?.state ?? null;
		});
	}

	appendCopilotSession(
		documentId: string,
		filePath: string,
		state: CopilotSessionStateSnapshot,
	): Promise<void> {
		return this.enqueue(async () => {
			const identity = await this.resolveIdentity(documentId, filePath, true);
			if (!identity) return;
			const event: CopilotSnapshotEvent = {
				type: 'copilot.session.snapshot',
				eventId: this.nextEventId(state.activeRunId),
				at: Date.now(),
				state,
			};
			const events = await this.readCopilotEvents(identity.recordId);
			const filePathForRecord = this.copilotStreamPath(identity.recordId);
			if (events.length + 1 >= this.options.copilotCompactionEventThreshold) {
				await ensureAdapterDirectory(this.app, this.copilotSessionDir);
				await this.app.vault.adapter.write(
					filePathForRecord,
					`${JSON.stringify(event)}\n`,
				);
				return;
			}
			await this.appendLine(this.copilotSessionDir, filePathForRecord, event);
		});
	}

	renameDocument(
		documentId: string,
		oldPath: string,
		newPath: string,
	): Promise<void> {
		return this.enqueue(async () => {
			if (!newPath || oldPath === newPath) return;
			const index = await this.loadIdentityIndex();
			const identity = index.documents.find((item) =>
				item.documentId === documentId || item.currentPath === oldPath,
			);
			if (!identity) return;
			identity.aliases = [...new Set([
				...identity.aliases,
				identity.currentPath,
				oldPath,
			].filter(Boolean))];
			identity.currentPath = newPath;
			identity.ctime = this.fileCtime(newPath) ?? identity.ctime;
			await this.saveIdentityIndex();
		});
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task, task);
		this.queue = next.then(() => undefined, () => undefined);
		return next;
	}

	private async resolveIdentity(
		documentId: string,
		filePath: string,
		create: boolean,
	): Promise<DocumentIdentityRecord | null> {
		const index = await this.loadIdentityIndex();
		const byDocumentId = index.documents.find((item) => item.documentId === documentId);
		if (
			byDocumentId
			&& byDocumentId.currentPath === filePath
			&& this.sameFileGeneration(byDocumentId, filePath)
		) {
			return byDocumentId;
		}

		const pathMatches = index.documents.filter((item) => item.currentPath === filePath);
		if (pathMatches.length > 1) {
			throw new Error(`Composer document identity collision: ${filePath}`);
		}
		const pathMatch = pathMatches[0];
		if (pathMatch && this.sameFileGeneration(pathMatch, filePath)) return pathMatch;
		if (!create) return null;

		const identity: DocumentIdentityRecord = {
			recordId: this.nextRecordId(documentId),
			documentId,
			currentPath: filePath,
			aliases: [],
			...(this.fileCtime(filePath) !== undefined
				? { ctime: this.fileCtime(filePath) }
				: {}),
		};
		index.documents.push(identity);
		await this.saveIdentityIndex();
		return identity;
	}

	private async loadIdentityIndex(): Promise<DocumentIdentityIndex> {
		if (this.identityIndex) return this.identityIndex;
		const path = this.identityPath();
		try {
			if (!(await this.app.vault.adapter.exists(path))) {
				this.identityIndex = cloneIdentityIndex(EMPTY_IDENTITY_INDEX);
				return this.identityIndex;
			}
			const parsed = JSON.parse(await this.app.vault.adapter.read(path)) as Partial<DocumentIdentityIndex>;
			if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.documents)) {
				this.identityIndex = cloneIdentityIndex(EMPTY_IDENTITY_INDEX);
				return this.identityIndex;
			}
			this.identityIndex = {
				schemaVersion: 1,
				documents: parsed.documents
					.filter(isIdentityRecord)
					.map((item) => ({ ...item, aliases: [...item.aliases] })),
			};
			return this.identityIndex;
		} catch (error) {
			console.warn('[Peak Composer] document identity index load failed:', error);
			this.identityIndex = cloneIdentityIndex(EMPTY_IDENTITY_INDEX);
			return this.identityIndex;
		}
	}

	private async saveIdentityIndex(): Promise<void> {
		if (!this.identityIndex) return;
		await ensureAdapterDirectory(this.app, this.documentHistoryDir);
		await this.app.vault.adapter.write(
			this.identityPath(),
			JSON.stringify(this.identityIndex, null, 2),
		);
	}

	private async readDocumentEvents(recordId: string): Promise<ComposerDocumentHistoryEvent[]> {
		const values = await this.readJsonLines(this.documentStreamPath(recordId));
		const events = values.filter(isDocumentHistoryEvent);
		const byId = new Map(events.map((event) => [event.eventId, event]));
		return [...byId.values()];
	}

	private async readCopilotEvents(recordId: string): Promise<CopilotSnapshotEvent[]> {
		const values = await this.readJsonLines(this.copilotStreamPath(recordId));
		return values.filter(isCopilotSnapshotEvent);
	}

	private async readJsonLines(path: string): Promise<unknown[]> {
		if (!(await this.app.vault.adapter.exists(path))) return [];
		const text = await this.app.vault.adapter.read(path);
		const lines = text.split(/\r?\n/).filter((line) => line.trim());
		const values: unknown[] = [];
		for (let index = 0; index < lines.length; index += 1) {
			try {
				values.push(JSON.parse(lines[index]));
			} catch {
				const position = index === lines.length - 1 ? 'tail' : `record ${index + 1}`;
				console.warn(`[Peak Composer] ignored corrupt History ${position}: ${path}`);
			}
		}
		return values;
	}

	private async appendLine(
		directory: string,
		path: string,
		value: unknown,
	): Promise<void> {
		await ensureAdapterDirectory(this.app, directory);
		const line = `${JSON.stringify(value)}\n`;
		if (!(await this.app.vault.adapter.exists(path))) {
			await this.app.vault.adapter.write(path, line);
			return;
		}
		await this.app.vault.adapter.append(path, line);
	}

	private sameFileGeneration(identity: DocumentIdentityRecord, filePath: string): boolean {
		const ctime = this.fileCtime(filePath);
		if (ctime === undefined || identity.ctime === undefined) return true;
		return ctime === identity.ctime;
	}

	private fileCtime(filePath: string): number | undefined {
		const file = this.app.vault.getAbstractFileByPath?.(filePath) as {
			stat?: { ctime?: number };
		} | null;
		const ctime = file?.stat?.ctime;
		return typeof ctime === 'number' && Number.isFinite(ctime) ? ctime : undefined;
	}

	private identityPath(): string {
		return joinAdapterPath(this.documentHistoryDir, this.options.identityFile);
	}

	private documentStreamPath(recordId: string): string {
		return joinAdapterPath(this.documentHistoryDir, `${recordId}.jsonl`);
	}

	private copilotStreamPath(recordId: string): string {
		return joinAdapterPath(this.copilotSessionDir, `${recordId}.jsonl`);
	}

	private nextRecordId(documentId: string): string {
		this.sequence += 1;
		const seed = `${documentId}:${Date.now()}:${this.sequence}:${Math.random()}`;
		return `cmp-doc-${fnv1a(seed)}`;
	}

	private nextEventId(activeRunId: string | null): string {
		this.sequence += 1;
		return `copilot:${activeRunId ?? 'session'}:${Date.now().toString(36)}:${this.sequence.toString(36)}`;
	}
}

function isDocumentHistoryEvent(value: unknown): value is ComposerDocumentHistoryEvent {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	if (
		record.type !== 'document.transaction.committed'
		&& record.type !== 'document.transaction.rolled-back'
	) {
		return false;
	}
	return (
		typeof record.eventId === 'string'
		&& typeof record.at === 'number'
		&& Boolean(record.transaction)
	);
}

function isCopilotSnapshotEvent(value: unknown): value is CopilotSnapshotEvent {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	const state = record.state as Record<string, unknown> | undefined;
	return (
		record.type === 'copilot.session.snapshot'
		&& typeof record.eventId === 'string'
		&& typeof record.at === 'number'
		&& state?.schemaVersion === 1
	);
}

function isIdentityRecord(value: unknown): value is DocumentIdentityRecord {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.recordId === 'string'
		&& typeof record.documentId === 'string'
		&& typeof record.currentPath === 'string'
		&& Array.isArray(record.aliases)
		&& record.aliases.every((alias) => typeof alias === 'string')
	);
}

function cloneIdentityIndex(value: DocumentIdentityIndex): DocumentIdentityIndex {
	return {
		schemaVersion: 1,
		documents: value.documents.map((item) => ({ ...item, aliases: [...item.aliases] })),
	};
}

function fnv1a(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}
