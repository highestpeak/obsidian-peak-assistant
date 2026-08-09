import { PEAK_SHEET_DEFAULTS } from './PeakSheetDefaults';
import type {
	PeakSheetCellValue,
	PeakSheetDatasetDraft,
	PeakSheetFieldDefinition,
	PeakSheetFieldType,
	PeakSheetRow,
} from './types';

export interface PeakSheetImportOptions {
	readonly maxRows?: number;
	readonly maxColumns?: number;
	readonly idFactory?: () => string;
}

export function parsePeakSheetCsv(
	text: string,
	name = 'Imported CSV',
	options: PeakSheetImportOptions = {},
): PeakSheetDatasetDraft {
	const matrix = parseCsvMatrix(text);
	return datasetDraftFromMatrix(matrix, name, 'csv', text, options);
}

export function parsePeakSheetJson(
	text: string,
	name = 'Imported JSON',
	options: PeakSheetImportOptions = {},
): PeakSheetDatasetDraft {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!Array.isArray(parsed)) throw new Error('Peak Sheet JSON import requires a flat array of objects.');
	const records = parsed as unknown[];
	const keys: string[] = [];
	const keySet = new Set<string>();
	for (const record of records) {
		if (!isFlatRecord(record)) throw new Error('Peak Sheet JSON import only supports flat objects with scalar values.');
		for (const key of Object.keys(record)) {
			if (keySet.has(key)) continue;
			keySet.add(key);
			keys.push(key);
		}
	}
	const matrix: unknown[][] = [keys];
	for (const record of records as Record<string, unknown>[]) matrix.push(keys.map((key) => record[key] ?? null));
	return datasetDraftFromMatrix(matrix, name, 'json', text, options);
}

export function datasetDraftFromMatrix(
	matrix: readonly (readonly unknown[])[],
	name: string,
	source: PeakSheetDatasetDraft['source'],
	sourceText = '',
	options: PeakSheetImportOptions = {},
): PeakSheetDatasetDraft {
	if (matrix.length === 0) throw new Error('Imported data is empty.');
	const maxRows = options.maxRows ?? PEAK_SHEET_DEFAULTS.limits.maxImportRows;
	const maxColumns = options.maxColumns ?? PEAK_SHEET_DEFAULTS.limits.maxImportColumns;
	const idFactory = options.idFactory ?? defaultIdFactory;
	const headers = matrix[0].map((value, index) => normalizeHeader(value, index));
	if (headers.length === 0) throw new Error('Imported data has no columns.');
	if (headers.length > maxColumns) throw new Error(`Import exceeds the ${maxColumns}-column limit.`);
	if (matrix.length - 1 > maxRows) throw new Error(`Import exceeds the ${maxRows}-row limit.`);
	const uniqueHeaders = uniquifyHeaders(headers);
	const columns = uniqueHeaders.map((_, columnIndex) => matrix.slice(1).map((row) => row[columnIndex] ?? null));
	const fields: PeakSheetFieldDefinition[] = uniqueHeaders.map((header, index) => ({
		id: `field-${idFactory()}`,
		name: header,
		type: inferFieldType(columns[index]),
		width: PEAK_SHEET_DEFAULTS.field.defaultWidth,
	}));
	const diagnostics: string[] = [];
	if (headers.some((header, index) => header !== uniqueHeaders[index])) diagnostics.push('Duplicate column names were renamed.');
	const rows: PeakSheetRow[] = matrix.slice(1).map((sourceRow) => {
		const cells: Record<string, PeakSheetCellValue> = {};
		for (let index = 0; index < fields.length; index++) {
			cells[fields[index].id] = coerceImportedValue(sourceRow[index] ?? null, fields[index].type, diagnostics);
		}
		return { id: `row-${idFactory()}`, cells };
	});
	return {
		name: name.trim() || 'Imported data',
		fields,
		rows,
		diagnostics: uniqueStrings(diagnostics),
		source,
		sourceHash: sourceText ? stableTextHash(sourceText) : undefined,
	};
}

export function parseCsvMatrix(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		if (quoted) {
			if (char === '"' && text[index + 1] === '"') {
				cell += '"';
				index++;
				continue;
			}
			if (char === '"') {
				quoted = false;
				continue;
			}
			cell += char;
			continue;
		}
		if (char === '"') {
			quoted = true;
			continue;
		}
		if (char === ',') {
			row.push(cell);
			cell = '';
			continue;
		}
		if (char === '\n' || char === '\r') {
			if (char === '\r' && text[index + 1] === '\n') index++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
			continue;
		}
		cell += char;
	}
	if (quoted) throw new Error('CSV contains an unterminated quoted field.');
	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((candidate, index) => index === 0 || candidate.some((value) => value.trim() !== ''));
}

function inferFieldType(values: readonly unknown[]): PeakSheetFieldType {
	const present = values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
	if (present.length === 0) return 'text';
	if (present.every(isBooleanLike)) return 'checkbox';
	if (present.every(isNumberLike)) return 'number';
	if (present.every(isDateLike)) return 'date';
	if (present.every((value) => isLinkLike(String(value)))) return 'link';
	return 'text';
}

function coerceImportedValue(
	value: unknown,
	type: PeakSheetFieldType,
	diagnostics: string[],
): PeakSheetCellValue {
	if (value === null || value === undefined || String(value).trim() === '') return null;
	if (type === 'number') {
		const parsed = typeof value === 'number' ? value : Number(String(value).trim());
		if (Number.isFinite(parsed)) return parsed;
		diagnostics.push('At least one numeric value could not be converted and was left empty.');
		return null;
	}
	if (type === 'checkbox') return booleanValue(value);
	if (type === 'date') {
		if (value instanceof Date) return value.toISOString();
		const parsed = Date.parse(String(value));
		return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
	}
	return String(value);
}

function normalizeHeader(value: unknown, index: number): string {
	const text = String(value ?? '').trim();
	return text || `Field ${index + 1}`;
}

function uniquifyHeaders(headers: readonly string[]): string[] {
	const counts = new Map<string, number>();
	return headers.map((header) => {
		const normalized = header.toLocaleLowerCase();
		const count = (counts.get(normalized) ?? 0) + 1;
		counts.set(normalized, count);
		return count === 1 ? header : `${header} ${count}`;
	});
}

function isFlatRecord(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value).every((item) => item === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof item));
}

function isBooleanLike(value: unknown): boolean {
	if (typeof value === 'boolean') return true;
	return ['true', 'false', 'yes', 'no', '1', '0'].includes(String(value).trim().toLocaleLowerCase());
}

function booleanValue(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	return ['true', 'yes', '1'].includes(String(value).trim().toLocaleLowerCase());
}

function isNumberLike(value: unknown): boolean {
	if (typeof value === 'number') return Number.isFinite(value);
	const text = String(value).trim();
	return text !== '' && Number.isFinite(Number(text));
}

function isDateLike(value: unknown): boolean {
	if (value instanceof Date) return Number.isFinite(value.getTime());
	const text = String(value).trim();
	if (!/[\-/T:]/.test(text)) return false;
	return Number.isFinite(Date.parse(text));
}

function isLinkLike(value: string): boolean {
	return /^(https?:\/\/|obsidian:\/\/|\[\[).+/i.test(value.trim());
}

function stableTextHash(text: string): string {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function defaultIdFactory(): string {
	return crypto.randomUUID();
}
