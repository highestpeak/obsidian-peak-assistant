import React, { useRef } from 'react';
import { ClipboardCopy, ClipboardPaste, Copy, Paperclip, Trash2 } from 'lucide-react';

import {
	buildPeakSheetPasteOperations,
	computeSelectionStats,
	displayValue,
	peakSheetCellKey,
	projectPeakSheetRows,
	serializePeakSheetSelection,
	stableSortRows,
} from '@/core/sheet';
import type {
	PeakSheetCellValue,
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
	PeakSheetFileRef,
	PeakSheetPatchOperation,
	PeakSheetRow,
	PeakSheetTableViewDefinition,
} from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';
import { ResourcePreviewHover } from '@/ui/component/mine/resource-preview-hover';

interface PeakSheetTableProps {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetTableViewDefinition;
	readonly selectedRows: ReadonlySet<string>;
	readonly selectedCells: ReadonlySet<string>;
	onSelectRows(rows: ReadonlySet<string>): void;
	onSelectCells(cells: ReadonlySet<string>): void;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onCopyExternalFile(file: { readonly name: string; readonly type: string; readonly buffer: ArrayBuffer }): Promise<PeakSheetFileRef>;
	onCopyRow(row: PeakSheetRow): void;
	onDeleteRow(rowId: string): void;
	onPasteCells(operations: readonly PeakSheetPatchOperation[]): void;
	onClipboardError(message: string): void;
}

export function PeakSheetTable(props: PeakSheetTableProps): React.ReactElement {
	const selectionAnchor = useRef<{ row: number; field: number } | null>(null);
	const fields = props.snapshot.fields.filter((field) => !field.hidden && !props.view.hiddenFieldIds?.includes(field.id));
	const rows = stableSortRows(projectPeakSheetRows(props.snapshot, props.view.filters), props.snapshot.fields, props.view.sorts ?? []);
	const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
	const groups = groupRows(rows, props.view.groupBy);
	const selectedValues = props.selectedCells.size > 0
		? rows.flatMap((row) => fields.filter((field) => props.selectedCells.has(peakSheetCellKey(row.id, field.id))).map((field) => row.cells[field.id] ?? null))
		: rows.filter((row) => props.selectedRows.has(row.id)).flatMap((row) => fields.map((field) => row.cells[field.id] ?? null));
	const stats = computeSelectionStats(selectedValues);
	return (
		<div className="peak-sheet-table-shell">
			<div className="peak-sheet-table-scroll">
				<table className="peak-sheet-table">
					<colgroup>
						<col className="peak-sheet-select-column" />
						{fields.map((field) => <col key={field.id} style={{ width: field.width ?? 160 }} />)}
						<col className="peak-sheet-actions-column" />
					</colgroup>
					<thead>
						<tr>
							<th>
								<input
									type="checkbox"
									aria-label="Select all visible rows"
									checked={rows.length > 0 && rows.every((row) => props.selectedRows.has(row.id))}
									onChange={(event) => props.onSelectRows(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())}
								/>
							</th>
							{fields.map((field) => <th key={field.id} title={field.formula ?? field.type}>{field.name}{field.formula ? ' ƒ' : ''}</th>)}
							<th aria-label="Row actions" />
						</tr>
					</thead>
					<tbody>
						{groups.map((group) => (
							<React.Fragment key={group.key}>
								{props.view.groupBy && <tr className="peak-sheet-group-row"><td colSpan={fields.length + 2}>{group.key} <span>{group.rows.length}</span></td></tr>}
								{group.rows.map((row) => (
									<tr key={row.id} data-row-id={row.id}>
										<td><input type="checkbox" aria-label={`Select row ${row.id}`} checked={props.selectedRows.has(row.id)} onChange={(event) => toggleRow(props, row.id, event.target.checked)} /></td>
										{fields.map((field, fieldIndex) => {
											const key = peakSheetCellKey(row.id, field.id);
							return <td key={field.id} className={props.selectedCells.has(key) ? 'is-selected-cell' : ''} onPointerDown={(event) => selectCell(props, rows, fields, rowIndexById.get(row.id) ?? 0, fieldIndex, event, selectionAnchor)}><PeakSheetCell row={row} field={field} onSetCell={props.onSetCell} onCopyExternalFile={props.onCopyExternalFile} /></td>;
										})}
										<td className="peak-sheet-row-actions">
											<Button variant="unstyled" size="xs" aria-label="Copy row" onClick={() => props.onCopyRow(row)}><Copy size={14} /></Button>
											<Button variant="unstyled" size="xs" aria-label="Delete row" onClick={() => props.onDeleteRow(row.id)}><Trash2 size={14} /></Button>
										</td>
									</tr>
								))}
							</React.Fragment>
						))}
					</tbody>
				</table>
				{rows.length === 0 && <div className="peak-sheet-empty-inline">No rows match this view.</div>}
			</div>
			{(props.selectedRows.size > 0 || props.selectedCells.size > 0) && (
				<div className="peak-sheet-selection-stats">
					<span>{props.selectedCells.size > 0 ? `${props.selectedCells.size} cells selected` : `${props.selectedRows.size} rows selected`}</span>
					<Button variant="unstyled" size="xs" onClick={() => void copySelection(props, rows, fields)}><ClipboardCopy size={12} /> Copy</Button>
					<Button variant="unstyled" size="xs" disabled={props.selectedCells.size === 0} onClick={() => void pasteSelection(props, rows, fields)}><ClipboardPaste size={12} /> Paste</Button>
					<span>Count {stats.count}</span>
					{stats.numericCount > 0 && <><span>Sum {formatNumber(stats.sum)}</span><span>Avg {formatNumber(stats.average)}</span><span>Min {formatNumber(stats.min)}</span><span>Max {formatNumber(stats.max)}</span></>}
				</div>
			)}
		</div>
	);
}

function selectCell(
	props: PeakSheetTableProps,
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
	rowIndex: number,
	fieldIndex: number,
	event: React.PointerEvent<HTMLTableCellElement>,
	anchor: React.MutableRefObject<{ row: number; field: number } | null>,
): void {
	if (event.shiftKey && anchor.current) {
		const next = new Set<string>();
		for (let row = Math.min(anchor.current.row, rowIndex); row <= Math.max(anchor.current.row, rowIndex); row++) {
			for (let field = Math.min(anchor.current.field, fieldIndex); field <= Math.max(anchor.current.field, fieldIndex); field++) next.add(peakSheetCellKey(rows[row].id, fields[field].id));
		}
		props.onSelectCells(next);
		return;
	}
	const key = peakSheetCellKey(rows[rowIndex].id, fields[fieldIndex].id);
	if (event.metaKey || event.ctrlKey) {
		const next = new Set(props.selectedCells);
		if (next.has(key)) next.delete(key); else next.add(key);
		props.onSelectCells(next);
		anchor.current = { row: rowIndex, field: fieldIndex };
		return;
	}
	props.onSelectCells(new Set([key]));
	anchor.current = { row: rowIndex, field: fieldIndex };
}

function PeakSheetCell({ row, field, onSetCell, onCopyExternalFile }: {
	readonly row: PeakSheetRow;
	readonly field: PeakSheetFieldDefinition;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onCopyExternalFile(file: { readonly name: string; readonly type: string; readonly buffer: ArrayBuffer }): Promise<PeakSheetFileRef>;
}): React.ReactElement {
	const value = row.cells[field.id] ?? null;
	if (field.formula) return <span className="peak-sheet-formula-value">{displayValue(value)}</span>;
	if (field.type === 'checkbox') {
		return <input type="checkbox" aria-label={`${field.name} for row ${row.id}`} checked={value === true} onChange={(event) => onSetCell(row.id, field.id, event.target.checked)} />;
	}
	if (field.type === 'singleSelect') {
		return (
			<select value={typeof value === 'string' ? value : ''} aria-label={`${field.name} for row ${row.id}`} onChange={(event) => onSetCell(row.id, field.id, event.target.value || null)}>
				<option value="">—</option>
				{field.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
			</select>
		);
	}
	if (field.type === 'file') {
		const file = isFileRef(value) ? value : null;
		return (
			<div className="peak-sheet-file-cell">
				<ResourcePreviewHover filePath={file?.vaultPath} fileType={detectFileType(file?.vaultPath)} enabled={Boolean(file)}>
					<input
						key={`${row.id}-${field.id}-${file?.vaultPath ?? ''}`}
						defaultValue={file?.vaultPath ?? ''}
						placeholder="Vault path"
						onBlur={(event) => onSetCell(row.id, field.id, event.target.value.trim() ? { kind: 'vault', vaultPath: event.target.value.trim() } : null)}
					/>
				</ResourcePreviewHover>
				<label className="peak-sheet-file-copy" title="Copy external file into Peak attachments">
					<Paperclip size={13} />
					<input type="file" aria-label={`Copy external file for ${field.name}`} onChange={(event) => void copyExternal(event, row.id, field.id, onCopyExternalFile, onSetCell)} />
				</label>
			</div>
		);
	}
	const text = value === null ? '' : String(value);
	return (
		<input
			key={`${row.id}-${field.id}-${text}`}
			type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'link' ? 'url' : 'text'}
			defaultValue={field.type === 'date' ? text.slice(0, 10) : text}
			aria-label={`${field.name} for row ${row.id}`}
			onBlur={(event) => onSetCell(row.id, field.id, normalizeInput(event.target.value, field))}
		/>
	);
}

async function copyExternal(
	event: React.ChangeEvent<HTMLInputElement>,
	rowId: string,
	fieldId: string,
	copy: PeakSheetTableProps['onCopyExternalFile'],
	setCell: PeakSheetTableProps['onSetCell'],
): Promise<void> {
	const file = event.target.files?.[0];
	if (!file) return;
	try {
		const ref = await copy({ name: file.name, type: file.type, buffer: await file.arrayBuffer() });
		setCell(rowId, fieldId, ref);
	} catch {
		// The owning surface reports the copy error; keep the previous cell value.
	} finally {
		event.target.value = '';
	}
}

function normalizeInput(value: string, field: PeakSheetFieldDefinition): PeakSheetCellValue {
	const text = value.trim();
	if (!text) return null;
	if (field.type === 'number') {
		const parsed = Number(text);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return text;
}

function toggleRow(props: PeakSheetTableProps, rowId: string, checked: boolean): void {
	const next = new Set(props.selectedRows);
	if (checked) next.add(rowId);
	else next.delete(rowId);
	props.onSelectRows(next);
}

function groupRows(rows: readonly PeakSheetRow[], fieldId?: string): { key: string; rows: readonly PeakSheetRow[] }[] {
	if (!fieldId) return [{ key: 'all', rows }];
	const grouped = new Map<string, PeakSheetRow[]>();
	for (const row of rows) {
		const key = displayValue(row.cells[fieldId] ?? null) || 'Unassigned';
		const current = grouped.get(key) ?? [];
		current.push(row);
		grouped.set(key, current);
	}
	return [...grouped.entries()].map(([key, groupRows]) => ({ key, rows: groupRows }));
}

function isFileRef(value: PeakSheetCellValue): value is PeakSheetFileRef {
	return Boolean(value && typeof value === 'object' && 'vaultPath' in value);
}

function detectFileType(path?: string): 'image' | 'markdown' | 'pdf' | 'file' {
	if (!path) return 'file';
	if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return 'image';
	if (/\.md$/i.test(path)) return 'markdown';
	if (/\.pdf$/i.test(path)) return 'pdf';
	return 'file';
}

function formatNumber(value: number | null): string {
	return value === null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

async function copySelection(
	props: PeakSheetTableProps,
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
): Promise<void> {
	try {
		if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this Obsidian window.');
		await navigator.clipboard.writeText(serializePeakSheetSelection(rows, fields, props.selectedCells, props.selectedRows));
	} catch (error) {
		props.onClipboardError(error instanceof Error ? error.message : String(error));
	}
}

async function pasteSelection(
	props: PeakSheetTableProps,
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
): Promise<void> {
	try {
		if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this Obsidian window.');
		const selected = rows.flatMap((row, rowIndex) => fields.flatMap((field, fieldIndex) => props.selectedCells.has(peakSheetCellKey(row.id, field.id)) ? [{ rowIndex, fieldIndex }] : []));
		if (selected.length === 0) return;
		const startRowIndex = Math.min(...selected.map((item) => item.rowIndex));
		const startFieldIndex = Math.min(...selected.map((item) => item.fieldIndex));
		const operations = buildPeakSheetPasteOperations(await navigator.clipboard.readText(), rows, fields, startRowIndex, startFieldIndex);
		if (operations.length > 0) props.onPasteCells(operations);
	} catch (error) {
		props.onClipboardError(error instanceof Error ? error.message : String(error));
	}
}
