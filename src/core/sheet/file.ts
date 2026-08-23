import type {
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
	PeakSheetRow,
	PeakSheetViewDefinition,
} from './types';
import { validatePeakSheetSnapshot } from './patch';

export const PEAK_SHEET_FILE_EXTENSION = 'peaksheet';
export const PEAK_SHEET_FILE_FORMAT = 'peak-sheet';
export const PEAK_SHEET_FILE_SCHEMA_VERSION = 2;

/** User-owned, file-native carrier. The filename owns the display title. */
export interface PeakSheetFileDocument {
	readonly format: typeof PEAK_SHEET_FILE_FORMAT;
	readonly schemaVersion: typeof PEAK_SHEET_FILE_SCHEMA_VERSION;
	readonly datasetId: string;
	readonly revision: number;
	readonly fields: readonly PeakSheetFieldDefinition[];
	readonly rows: readonly PeakSheetRow[];
	readonly views: readonly PeakSheetViewDefinition[];
	readonly scripts?: PeakSheetDatasetSnapshot['scripts'];
	readonly scriptRuns?: PeakSheetDatasetSnapshot['scriptRuns'];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export function serializePeakSheetFile(snapshot: PeakSheetDatasetSnapshot): string {
	validatePeakSheetSnapshot(snapshot);
	const document: PeakSheetFileDocument = {
		format: PEAK_SHEET_FILE_FORMAT,
		schemaVersion: PEAK_SHEET_FILE_SCHEMA_VERSION,
		datasetId: snapshot.datasetId,
		revision: snapshot.revision,
		fields: snapshot.fields,
		rows: snapshot.rows,
		views: snapshot.views,
		scripts: snapshot.scripts,
		scriptRuns: snapshot.scriptRuns,
		createdAt: snapshot.createdAt,
		updatedAt: snapshot.updatedAt,
	};
	return `${JSON.stringify(document, null, 2)}\n`;
}

export function parsePeakSheetFile(text: string, filePath: string): PeakSheetDatasetSnapshot {
	let source: unknown;
	try {
		source = JSON.parse(text);
	} catch (error) {
		throw new Error(`Peak Sheet file is not valid JSON: ${message(error)}`);
	}
	const document = requireFileDocument(source);
	const snapshot: PeakSheetDatasetSnapshot = {
		schemaVersion: 1,
		datasetId: document.datasetId,
		name: peakSheetTitleFromPath(filePath),
		revision: document.revision,
		fields: document.fields,
		rows: document.rows,
		views: document.views,
		scripts: document.scripts,
		scriptRuns: document.scriptRuns,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
	};
	validatePeakSheetSnapshot(snapshot);
	return snapshot;
}

/** Reads legacy schema-v1 snapshots when a user has manually materialized one. */
export function parsePeakSheetFileOrLegacy(text: string, filePath: string): PeakSheetDatasetSnapshot {
	let source: unknown;
	try {
		source = JSON.parse(text);
	} catch (error) {
		throw new Error(`Peak Sheet file is not valid JSON: ${message(error)}`);
	}
	if (isRecord(source) && source.format === PEAK_SHEET_FILE_FORMAT) {
		return parsePeakSheetFile(text, filePath);
	}
	const legacy = source as PeakSheetDatasetSnapshot;
	validatePeakSheetSnapshot(legacy);
	return { ...legacy, name: peakSheetTitleFromPath(filePath), deletedAt: undefined };
}

export function peakSheetTitleFromPath(filePath: string): string {
	const normalized = filePath.replace(/\\/g, '/');
	const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
	const suffix = `.${PEAK_SHEET_FILE_EXTENSION}`;
	if (filename.toLocaleLowerCase().endsWith(suffix)) return filename.slice(0, -suffix.length) || 'Untitled Peak Sheet';
	return filename || 'Untitled Peak Sheet';
}

export async function fingerprintPeakSheetContent(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function requireFileDocument(value: unknown): PeakSheetFileDocument {
	if (!isRecord(value)) throw new Error('Peak Sheet file root must be an object.');
	if (value.format !== PEAK_SHEET_FILE_FORMAT) throw new Error('Peak Sheet file has an unknown format.');
	if (value.schemaVersion !== PEAK_SHEET_FILE_SCHEMA_VERSION) {
		throw new Error(`Unsupported Peak Sheet file schema ${String(value.schemaVersion)}.`);
	}
	return value as unknown as PeakSheetFileDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
