import type {
	PeakSheetCellValue,
	PeakSheetFieldDefinition,
	PeakSheetPatchOperation,
	PeakSheetRow,
} from './types';

export function peakSheetCellKey(rowId: string, fieldId: string): string {
	return `${rowId}\u0000${fieldId}`;
}

export function serializePeakSheetSelection(
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
	selectedCells: ReadonlySet<string>,
	selectedRows: ReadonlySet<string>,
): string {
	if (selectedCells.size === 0) {
		return rows
			.filter((row) => selectedRows.has(row.id))
			.map((row) => fields.map((field) => clipboardText(row.cells[field.id] ?? null)).join('\t'))
			.join('\n');
	}
	const coordinates = selectedCoordinates(rows, fields, selectedCells);
	if (coordinates.length === 0) return '';
	const rowIndexes = coordinates.map(({ row }) => row);
	const fieldIndexes = coordinates.map(({ field }) => field);
	const lines: string[] = [];
	for (let rowIndex = Math.min(...rowIndexes); rowIndex <= Math.max(...rowIndexes); rowIndex++) {
		const values: string[] = [];
		for (let fieldIndex = Math.min(...fieldIndexes); fieldIndex <= Math.max(...fieldIndexes); fieldIndex++) {
			const row = rows[rowIndex];
			const field = fields[fieldIndex];
			values.push(selectedCells.has(peakSheetCellKey(row.id, field.id))
				? clipboardText(row.cells[field.id] ?? null)
				: '');
		}
		lines.push(values.join('\t'));
	}
	return lines.join('\n');
}

export function buildPeakSheetPasteOperations(
	text: string,
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
	startRowIndex: number,
	startFieldIndex: number,
): PeakSheetPatchOperation[] {
	const matrix = parseClipboardMatrix(text);
	const operations: PeakSheetPatchOperation[] = [];
	for (let rowOffset = 0; rowOffset < matrix.length; rowOffset++) {
		const row = rows[startRowIndex + rowOffset];
		if (!row) break;
		for (let fieldOffset = 0; fieldOffset < matrix[rowOffset].length; fieldOffset++) {
			const field = fields[startFieldIndex + fieldOffset];
			if (!field || field.formula) continue;
			operations.push({
				type: 'setCell',
				rowId: row.id,
				fieldId: field.id,
				value: normalizeClipboardValue(matrix[rowOffset][fieldOffset], field),
			});
		}
	}
	return operations;
}

function selectedCoordinates(
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
	selectedCells: ReadonlySet<string>,
): { row: number; field: number }[] {
	const coordinates: { row: number; field: number }[] = [];
	for (let row = 0; row < rows.length; row++) {
		for (let field = 0; field < fields.length; field++) {
			if (selectedCells.has(peakSheetCellKey(rows[row].id, fields[field].id))) coordinates.push({ row, field });
		}
	}
	return coordinates;
}

function parseClipboardMatrix(text: string): string[][] {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines.length === 0 ? [] : lines.map((line) => line.split('\t'));
}

function clipboardText(value: PeakSheetCellValue): string {
	const raw = value && typeof value === 'object' ? value.vaultPath : value === null ? '' : String(value);
	return raw.replace(/[\t\r\n]+/g, ' ');
}

function normalizeClipboardValue(raw: string, field: PeakSheetFieldDefinition): PeakSheetCellValue {
	const value = raw.trim();
	if (!value) return null;
	if (field.type === 'text' || field.type === 'link') return raw;
	if (field.type === 'file') return { kind: 'vault', vaultPath: value };
	if (field.type === 'date') {
		if (Number.isNaN(Date.parse(value))) throw new Error(`Cannot paste “${raw}” into date field ${field.name}.`);
		return value;
	}
	if (field.type === 'number') {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) throw new Error(`Cannot paste “${raw}” into number field ${field.name}.`);
		return parsed;
	}
	if (field.type === 'checkbox') {
		if (/^(true|yes|1|x|checked)$/i.test(value)) return true;
		if (/^(false|no|0|unchecked)$/i.test(value)) return false;
		throw new Error(`Cannot paste “${raw}” into checkbox field ${field.name}.`);
	}
	const option = field.options?.find((candidate) => candidate.id.toLocaleLowerCase() === value.toLocaleLowerCase()
		|| candidate.label.toLocaleLowerCase() === value.toLocaleLowerCase());
	if (!option) throw new Error(`Unknown option “${raw}” for field ${field.name}.`);
	return option.id;
}
