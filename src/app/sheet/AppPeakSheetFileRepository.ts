import type { App, EventRef, TAbstractFile } from 'obsidian';
import { normalizePath, TFile } from 'obsidian';

import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import {
	PEAK_SHEET_FILE_EXTENSION,
	parsePeakSheetFileOrLegacy,
	serializePeakSheetFile,
	validatePeakSheetSnapshot,
} from '@/core/sheet';
import type { PeakSheetCommitEvent, PeakSheetDatasetSnapshot } from '@/core/sheet';
import type {
	PeakSheetCommitResult,
	PeakSheetFileChange,
	PeakSheetFileRepository,
} from '@/service/sheet/PeakSheetRepository';
import { AppPeakSheetRepository } from './AppPeakSheetRepository';

const EVENT_OUTPUT_ID = 'peak-sheet.events';

/**
 * File-native Peak Sheet persistence.
 *
 * The visible `.peaksheet` file is canonical current truth. JSONL stays a
 * recovery/Undo carrier only and is intentionally never replayed past the
 * revision stored in the visible file.
 */
export class AppPeakSheetFileRepository implements PeakSheetFileRepository {
	private readonly legacy: AppPeakSheetRepository;
	private readonly pathsByDatasetId = new Map<string, string>();
	private readonly datasetIdsByPath = new Map<string, string>();
	private readonly contentsByPath = new Map<string, string>();
	private readonly listeners = new Set<(change: PeakSheetFileChange) => void>();
	private readonly eventRefs: EventRef[] = [];
	private indexed = false;

	constructor(
		private readonly app: App,
		private readonly outputs: GeneratedOutputPersistenceRuntime,
	) {
		this.legacy = new AppPeakSheetRepository(outputs);
		this.eventRefs.push(
			app.vault.on('create', (file) => void this.handleCreateOrModify(file, 'create')),
			app.vault.on('modify', (file) => void this.handleCreateOrModify(file, 'modify')),
			app.vault.on('rename', (file, oldPath) => void this.handleRename(file, oldPath)),
			app.vault.on('delete', (file) => this.handleDelete(file)),
		);
	}

	async listDatasetIds(): Promise<readonly string[]> {
		await this.ensureIndex();
		return [...this.pathsByDatasetId.keys()].sort();
	}

	async load(datasetId: string): Promise<PeakSheetDatasetSnapshot | null> {
		await this.ensureIndex();
		const path = this.pathsByDatasetId.get(datasetId);
		if (!path) return null;
		return this.loadPath(path);
	}

	async loadPath(path: string): Promise<PeakSheetDatasetSnapshot> {
		const file = this.requirePeakSheetFile(path);
		const text = await this.app.vault.read(file);
		const snapshot = parsePeakSheetFileOrLegacy(text, file.path);
		this.bindPath(snapshot.datasetId, file.path);
		this.contentsByPath.set(file.path, text);
		return snapshot;
	}

	getPath(datasetId: string): string | null {
		return this.pathsByDatasetId.get(datasetId) ?? null;
	}

	readEvents(datasetId: string): Promise<readonly PeakSheetCommitEvent[]> {
		return this.legacy.readEvents(datasetId);
	}

	create(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		return this.createAt(`${safeFileName(snapshot.name)}.${PEAK_SHEET_FILE_EXTENSION}`, snapshot, event);
	}

	async createAt(path: string, snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		validatePeakSheetSnapshot(snapshot);
		const targetPath = await this.availablePath(path);
		await this.appendEvent(snapshot.datasetId, event);
		const text = serializePeakSheetFile(snapshot);
		await this.app.vault.create(targetPath, text);
		this.bindPath(snapshot.datasetId, targetPath);
		this.contentsByPath.set(targetPath, text);
		return { snapshotLag: false };
	}

	async commit(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		validatePeakSheetSnapshot(snapshot);
		await this.ensureIndex();
		const path = this.pathsByDatasetId.get(snapshot.datasetId);
		if (!path) throw new Error(`Peak Sheet file for ${snapshot.datasetId} is missing.`);
		const file = this.requirePeakSheetFile(path);
		const expectedContent = this.contentsByPath.get(path);
		await this.appendEvent(snapshot.datasetId, event);
		const nextText = await this.app.vault.process(file, (currentText) => {
			if (expectedContent !== undefined && currentText !== expectedContent) {
				throw new Error('Peak Sheet file changed externally before save. Reload the file and try again.');
			}
			const current = parsePeakSheetFileOrLegacy(currentText, file.path);
			if (current.datasetId !== snapshot.datasetId) {
				throw new Error('Peak Sheet file identity changed before save. Reload the file and try again.');
			}
			if (current.revision !== event.baseRevision) {
				throw new Error(`Peak Sheet file changed externally at revision ${current.revision}; expected ${event.baseRevision}.`);
			}
			return serializePeakSheetFile({ ...snapshot, name: current.name });
		});
		this.contentsByPath.set(path, nextText);
		return { snapshotLag: false };
	}

	async renameFile(datasetId: string, title: string): Promise<string> {
		await this.ensureIndex();
		const currentPath = this.pathsByDatasetId.get(datasetId);
		if (!currentPath) throw new Error(`Peak Sheet file for ${datasetId} is missing.`);
		const folder = parentPath(currentPath);
		const targetPath = await this.availablePath(joinPath(folder, `${safeFileName(title)}.${PEAK_SHEET_FILE_EXTENSION}`), currentPath);
		const file = this.requirePeakSheetFile(currentPath);
		const content = this.contentsByPath.get(currentPath);
		await this.app.fileManager.renameFile(file, targetPath);
		this.unbindPath(currentPath);
		this.bindPath(datasetId, targetPath);
		if (content !== undefined) this.contentsByPath.set(targetPath, content);
		return targetPath;
	}

	async trashFile(datasetId: string): Promise<void> {
		await this.ensureIndex();
		const path = this.pathsByDatasetId.get(datasetId);
		if (!path) return;
		const file = this.requirePeakSheetFile(path);
		await this.app.fileManager.trashFile(file);
		this.unbindPath(path);
	}

	async listLegacyDatasetIds(): Promise<readonly string[]> {
		const visible = new Set(await this.listDatasetIds());
		return (await this.legacy.listDatasetIds()).filter((datasetId) => !visible.has(datasetId));
	}

	loadLegacyDataset(datasetId: string): Promise<PeakSheetDatasetSnapshot | null> {
		return this.legacy.load(datasetId);
	}

	subscribeFiles(listener: (change: PeakSheetFileChange) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): void {
		for (const eventRef of this.eventRefs) this.app.vault.offref(eventRef);
		this.eventRefs.length = 0;
		this.listeners.clear();
	}

	private async ensureIndex(): Promise<void> {
		if (this.indexed) return;
		this.pathsByDatasetId.clear();
		this.datasetIdsByPath.clear();
		this.contentsByPath.clear();
		for (const file of this.app.vault.getFiles()) {
			if (file.extension.toLocaleLowerCase() !== PEAK_SHEET_FILE_EXTENSION) continue;
			try {
				const snapshot = parsePeakSheetFileOrLegacy(await this.app.vault.read(file), file.path);
				this.bindPath(snapshot.datasetId, file.path);
			} catch (error) {
				console.error(`[Peak Sheet] Could not index ${file.path}.`, error);
			}
		}
		this.indexed = true;
	}

	private bindPath(datasetId: string, path: string): void {
		const normalized = normalizePath(path);
		const existing = this.pathsByDatasetId.get(datasetId);
		if (existing && existing !== normalized) {
			throw new Error(`Duplicate Peak Sheet identity ${datasetId} in “${existing}” and “${normalized}”.`);
		}
		this.pathsByDatasetId.set(datasetId, normalized);
		this.datasetIdsByPath.set(normalized, datasetId);
	}

	private unbindPath(path: string): string | undefined {
		const normalized = normalizePath(path);
		const datasetId = this.datasetIdsByPath.get(normalized);
		this.datasetIdsByPath.delete(normalized);
		this.contentsByPath.delete(normalized);
		if (datasetId && this.pathsByDatasetId.get(datasetId) === normalized) this.pathsByDatasetId.delete(datasetId);
		return datasetId;
	}

	private async handleCreateOrModify(file: TAbstractFile, type: 'create' | 'modify'): Promise<void> {
		if (!isPeakSheetFile(file)) return;
		try {
			const snapshot = parsePeakSheetFileOrLegacy(await this.app.vault.read(file), file.path);
			const previousId = this.unbindPath(file.path);
			if (previousId && previousId !== snapshot.datasetId) this.pathsByDatasetId.delete(previousId);
			this.bindPath(snapshot.datasetId, file.path);
			this.emit({ type, path: file.path });
		} catch (error) {
			console.error(`[Peak Sheet] Could not index ${file.path}.`, error);
			this.emit({ type, path: file.path });
		}
	}

	private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
		const oldWasSheet = oldPath.toLocaleLowerCase().endsWith(`.${PEAK_SHEET_FILE_EXTENSION}`);
		if (!oldWasSheet && !isPeakSheetFile(file)) return;
		const datasetId = this.unbindPath(oldPath);
		if (isPeakSheetFile(file)) {
			try {
				const snapshot = parsePeakSheetFileOrLegacy(await this.app.vault.read(file), file.path);
				this.bindPath(snapshot.datasetId, file.path);
			} catch (error) {
				console.error(`[Peak Sheet] Could not index renamed file ${file.path}.`, error);
			}
		}
		if (datasetId && !isPeakSheetFile(file)) this.pathsByDatasetId.delete(datasetId);
		this.emit({ type: 'rename', path: file.path, oldPath, datasetId });
	}

	private handleDelete(file: TAbstractFile): void {
		if (!file.path.toLocaleLowerCase().endsWith(`.${PEAK_SHEET_FILE_EXTENSION}`)) return;
		const datasetId = this.unbindPath(file.path);
		this.emit({ type: 'delete', path: file.path, datasetId });
	}

	private emit(change: PeakSheetFileChange): void {
		for (const listener of this.listeners) listener(change);
	}

	private requirePeakSheetFile(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!isPeakSheetFile(file)) throw new Error(`Peak Sheet file “${path}” does not exist.`);
		return file;
	}

	private async availablePath(path: string, allowExistingPath?: string): Promise<string> {
		const normalized = normalizePath(path);
		if (normalized === allowExistingPath || !this.app.vault.getAbstractFileByPath(normalized)) return normalized;
		const folder = parentPath(normalized);
		const filename = normalized.slice(folder ? folder.length + 1 : 0);
		const dot = filename.lastIndexOf('.');
		const stem = dot > 0 ? filename.slice(0, dot) : filename;
		const extension = dot > 0 ? filename.slice(dot) : '';
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(joinPath(folder, `${stem} ${suffix}${extension}`))) suffix++;
		return joinPath(folder, `${stem} ${suffix}${extension}`);
	}

	private appendEvent(datasetId: string, event: PeakSheetCommitEvent): Promise<unknown> {
		return this.outputs.events.appendEvent({
			outputId: EVENT_OUTPUT_ID,
			streamKey: datasetId,
			pathVariables: { datasetId },
			eventId: event.eventId,
			payload: event,
		});
	}
}

function isPeakSheetFile(file: TAbstractFile | null): file is TFile {
	return file instanceof TFile && file.extension.toLocaleLowerCase() === PEAK_SHEET_FILE_EXTENSION;
}

function safeFileName(title: string): string {
	const cleaned = title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
	return cleaned || 'Untitled sheet';
}

function parentPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index < 0 ? '' : path.slice(0, index);
}

function joinPath(folder: string, name: string): string {
	return normalizePath(folder ? `${folder}/${name}` : name);
}
