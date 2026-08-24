import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';

import { computeSelectionStats, displayValue, projectPeakSheetRows, stableSortRows } from '@/core/sheet';
import type { PeakSheetCellValue, PeakSheetDatasetSnapshot, PeakSheetFieldDefinition, PeakSheetPatchOperation, PeakSheetRow, PeakSheetTableViewDefinition } from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';
import { blankPeakSheetRow, buildPeakSheetMaterializeOperations, buildPeakSheetMatrixPasteOperations, parsePeakSheetClipboardText, peakSheetColumnName, peakSheetFieldWidth, peakSheetGridBounds, visiblePeakSheetColumnCount, visiblePeakSheetRowCount } from './PeakSheetGridState';
import type { PeakSheetGridState } from './PeakSheetGridState';

interface PeakSheetTableProps {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetTableViewDefinition;
	readonly gridState: PeakSheetGridState;
	readonly search: string;
	readonly projectionTargetRowId?: string | null;
	onGridState(state: PeakSheetGridState): void;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onOpenFilter(fieldId?: string): void;
	onOpenSort(fieldId?: string): void;
	onProjectionHandled(): void;
	onMessage(message: string): void;
}

type TableMenu = { readonly kind: 'field'; readonly fieldIndex: number; readonly x: number; readonly y: number } | { readonly kind: 'row'; readonly rowIndex: number; readonly x: number; readonly y: number };
type EditingCell = { readonly rowIndex: number; readonly fieldIndex: number; readonly initial?: string } | null;
type GroupEntry = { readonly kind: 'group'; readonly key: string; readonly label: string; readonly level: number; readonly count: number } | { readonly kind: 'row'; readonly row: PeakSheetRow; readonly rowIndex: number };

export function PeakSheetTable(props: PeakSheetTableProps): React.ReactElement {
	const [menu, setMenu] = useState<TableMenu | null>(null);
	const [editing, setEditing] = useState<EditingCell>(null);
	const [liveWidths, setLiveWidths] = useState<Readonly<Record<string, number>>>({});
	const dragging = useRef(false);
	const fields = props.snapshot.fields.filter((field) => !field.hidden && !props.view.hiddenFieldIds?.includes(field.id));
	const projected = stableSortRows(projectPeakSheetRows(props.snapshot, props.view.filters), props.snapshot.fields, props.view.sorts ?? []);
	const rows = useMemo(() => filterRows(projected, props.search), [projected, props.search]);
	const rowCount = Math.max(visiblePeakSheetRowCount(props.snapshot), rows.length + 1);
	const columnCount = visiblePeakSheetColumnCount(props.snapshot);
	const columns = Array.from({ length: columnCount }, (_, index) => fields[index]);
	const bounds = peakSheetGridBounds(props.gridState);
	const groupFields = props.view.groupByFields?.length ? props.view.groupByFields : props.view.groupBy ? [props.view.groupBy] : [];
	const entries = groupEntries(rows, groupFields, props.snapshot.fields);

	useEffect(() => {
		if (!menu) return;
		const close = () => setMenu(null);
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	}, [menu]);
	useEffect(() => {
		const stop = () => { dragging.current = false; };
		document.addEventListener('pointerup', stop);
		document.addEventListener('pointercancel', stop);
		return () => { document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop); };
	}, []);
	useEffect(() => {
		if (!props.projectionTargetRowId) return;
		const rowIndex = rows.findIndex((row) => row.id === props.projectionTargetRowId);
		if (rowIndex < 0) return;
		props.onGridState({ anchorRow: rowIndex, focusRow: rowIndex, anchorField: 0, focusField: 0, mode: 'navigation' });
		requestAnimationFrame(() => {
			const cell = document.querySelector<HTMLElement>(`.peak-sheet-data-grid td[data-row-index="${rowIndex}"][data-field-index="0"]`);
			cell?.scrollIntoView({ block: 'center', inline: 'nearest' });
			cell?.focus({ preventScroll: true });
		});
		const timer = window.setTimeout(props.onProjectionHandled, 1450);
		return () => window.clearTimeout(timer);
	}, [props.projectionTargetRowId, rows]);

	const placeholders = Array.from({ length: Math.max(0, rowCount - rows.length) }, (_, index) => rows.length + index);
	return (
		<div className="peak-sheet-table-shell" onKeyDown={(event) => handleGridKeyDown(event, props, rows, fields, columnCount, rowCount, setEditing)} onCopy={(event) => copyRange(event, props, rows, fields)} onCut={(event) => { copyRange(event, props, rows, fields); clearRange(props, rows, fields); }} onPaste={(event) => pasteRange(event, props, rows, fields)}>
			<div className="peak-sheet-grid-scroll">
				<table className="peak-sheet-data-grid" style={{ '--grid-width': `${48 + columns.reduce((total, field) => total + peakSheetFieldWidth(field), 0)}px` } as React.CSSProperties}>
					<colgroup><col style={{ width: 48 }} />{columns.map((field, index) => <col key={field?.id ?? `virtual-${index}`} style={{ width: field ? liveWidths[field.id] ?? peakSheetFieldWidth(field) : 160 }} />)}</colgroup>
					<thead><tr><th className="peak-sheet-row-index peak-sheet-corner-cell"><Button variant="unstyled" aria-label="Select all cells" onClick={() => props.onGridState({ anchorRow: 0, focusRow: rowCount - 1, anchorField: 0, focusField: columnCount - 1, mode: 'navigation' })} /></th>{columns.map((field, fieldIndex) => <th key={field?.id ?? `virtual-${fieldIndex}`} className={`peak-sheet-field-head${field ? '' : ' is-virtual'}`} onContextMenu={(event) => openMenu(event, { kind: 'field', fieldIndex }, setMenu)}><div className={bounds.top === 0 && bounds.bottom === rowCount - 1 && fieldIndex >= bounds.left && fieldIndex <= bounds.right ? 'peak-sheet-field-head-shell is-selected' : 'peak-sheet-field-head-shell'}><Button variant="unstyled" className="peak-sheet-field-select" aria-label={`Column ${peakSheetColumnName(fieldIndex)}${field ? `, ${field.name}` : ', empty'}`} onClick={() => props.onGridState({ anchorRow: 0, focusRow: rowCount - 1, anchorField: fieldIndex, focusField: fieldIndex, mode: 'navigation' })}><span>{peakSheetColumnName(fieldIndex)}</span></Button>{field && <span className="peak-sheet-field-resizer" role="separator" tabIndex={0} aria-label={`Resize ${field.name}`} onPointerDown={(event) => startResize(event, field, props.onMutate, setLiveWidths)} />}</div></th>)}</tr></thead>
					<tbody>
						{entries.map((entry) => entry.kind === 'group' ? <tr key={entry.key} className={`peak-sheet-grouped-row peak-sheet-grouped-row-level-${entry.level}`}><td colSpan={columns.length + 1}><span>{entry.label}</span><small>{entry.count} records</small></td></tr> : <GridRow key={entry.row.id} snapshot={props.snapshot} row={entry.row} rowIndex={entry.rowIndex} fields={columns} bounds={bounds} focused={props.gridState} editing={editing} projectionFlash={entry.row.id === props.projectionTargetRowId} onSelect={(rowIndex, fieldIndex, extend) => selectCell(rowIndex, fieldIndex, extend, dragging, props)} onSelectRow={(rowIndex) => props.onGridState({ anchorRow: rowIndex, focusRow: rowIndex, anchorField: 0, focusField: columnCount - 1, mode: 'navigation' })} onExtend={(rowIndex, fieldIndex) => extendSelection(rowIndex, fieldIndex, dragging, props)} onEdit={setEditing} onFinishEdit={() => setEditing(null)} onMutate={props.onMutate} onRowMenu={(event, rowIndex) => openMenu(event, { kind: 'row', rowIndex }, setMenu)} />)}
						{placeholders.map((rowIndex) => <GridRow key={`placeholder-${rowIndex}`} snapshot={props.snapshot} rowIndex={rowIndex} fields={columns} bounds={bounds} focused={props.gridState} editing={editing} projectionFlash={false} onSelect={(nextRow, fieldIndex, extend) => selectCell(nextRow, fieldIndex, extend, dragging, props)} onSelectRow={(nextRow) => props.onGridState({ anchorRow: nextRow, focusRow: nextRow, anchorField: 0, focusField: columnCount - 1, mode: 'navigation' })} onExtend={(nextRow, fieldIndex) => extendSelection(nextRow, fieldIndex, dragging, props)} onEdit={setEditing} onFinishEdit={() => setEditing(null)} onMutate={props.onMutate} onRowMenu={(event, nextRow) => openMenu(event, { kind: 'row', rowIndex: nextRow }, setMenu)} />)}
					</tbody>
				</table>
				<div className="peak-sheet-virtual-grid-note"><span>{rowCount} virtual rows · {columnCount} virtual columns</span><small>Just type or paste — rows and fields materialize only when used</small></div>
			</div>
			{menu?.kind === 'field' && <FieldMenu menu={menu} snapshot={props.snapshot} view={props.view} onMutate={props.onMutate} onFilter={props.onOpenFilter} onSort={props.onOpenSort} onClose={() => setMenu(null)} />}
			{menu?.kind === 'row' && <RowMenu menu={menu} snapshot={props.snapshot} rows={rows} onMutate={props.onMutate} onClose={() => setMenu(null)} />}
		</div>
	);
}

function GridRow(props: { readonly snapshot: PeakSheetDatasetSnapshot; readonly row?: PeakSheetRow; readonly rowIndex: number; readonly fields: readonly (PeakSheetFieldDefinition | undefined)[]; readonly bounds: ReturnType<typeof peakSheetGridBounds>; readonly focused: PeakSheetGridState; readonly editing: EditingCell; readonly projectionFlash: boolean; onSelect(row: number, field: number, extend: boolean): void; onSelectRow(row: number): void; onExtend(row: number, field: number): void; onEdit(cell: EditingCell): void; onFinishEdit(): void; onMutate(operations: readonly PeakSheetPatchOperation[]): void; onRowMenu(event: React.MouseEvent, row: number): void }): React.ReactElement {
	const visibleMaterializedFields = props.fields.filter((field): field is PeakSheetFieldDefinition => Boolean(field)).length;
	return <tr className={`${props.row ? '' : 'is-placeholder-row'}${props.projectionFlash ? ' is-projection-flash' : ''}`} data-row-id={props.row?.id}><td className="peak-sheet-row-index" onContextMenu={(event) => props.onRowMenu(event, props.rowIndex)}><Button variant="unstyled" aria-label={`Select row ${props.rowIndex + 1}`} onClick={() => props.onSelectRow(props.rowIndex)}>{props.rowIndex + 1}</Button></td>{props.fields.map((field, fieldIndex) => {
		const inRange = props.rowIndex >= props.bounds.top && props.rowIndex <= props.bounds.bottom && fieldIndex >= props.bounds.left && fieldIndex <= props.bounds.right;
		const classes = ['peak-sheet-cell', field ? '' : 'is-virtual', inRange ? 'is-in-range' : '', inRange && props.rowIndex === props.bounds.top ? 'is-range-top' : '', inRange && props.rowIndex === props.bounds.bottom ? 'is-range-bottom' : '', inRange && fieldIndex === props.bounds.left ? 'is-range-left' : '', inRange && fieldIndex === props.bounds.right ? 'is-range-right' : '', props.rowIndex === props.focused.focusRow && fieldIndex === props.focused.focusField ? 'is-selected' : ''].filter(Boolean).join(' ');
		const materializeFieldIndex = field ? props.snapshot.fields.findIndex((candidate) => candidate.id === field.id) : props.snapshot.fields.length + Math.max(0, fieldIndex - visibleMaterializedFields);
		return <td key={field?.id ?? `virtual-${fieldIndex}`} className={classes} data-row-index={props.rowIndex} data-field-index={fieldIndex} tabIndex={0} onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.focus({ preventScroll: true }); props.onSelect(props.rowIndex, fieldIndex, event.shiftKey); }} onPointerEnter={() => props.onExtend(props.rowIndex, fieldIndex)} onDoubleClick={() => props.onEdit({ rowIndex: props.rowIndex, fieldIndex })}><PeakSheetCell snapshot={props.snapshot} row={props.row} rowIndex={props.rowIndex} field={field} fieldIndex={materializeFieldIndex} editing={props.editing?.rowIndex === props.rowIndex && props.editing.fieldIndex === fieldIndex} initial={props.editing?.rowIndex === props.rowIndex && props.editing.fieldIndex === fieldIndex ? props.editing.initial : undefined} onFinish={props.onFinishEdit} onMutate={props.onMutate} /></td>;
	})}</tr>;
}

function PeakSheetCell({ snapshot, row, rowIndex, field, fieldIndex, editing, initial, onFinish, onMutate }: { readonly snapshot: PeakSheetDatasetSnapshot; readonly row?: PeakSheetRow; readonly rowIndex: number; readonly field?: PeakSheetFieldDefinition; readonly fieldIndex: number; readonly editing: boolean; readonly initial?: string; onFinish(): void; onMutate(operations: readonly PeakSheetPatchOperation[]): void }): React.ReactElement {
	const value = field && row ? row.cells[field.id] ?? null : null;
	if (!editing || field?.formula) return <CellDisplay field={field} value={value} />;
	if (field?.type === 'checkbox') return <input autoFocus type="checkbox" checked={value === true} onChange={(event) => { onMutate(buildPeakSheetMaterializeOperations(snapshot, rowIndex, fieldIndex, event.target.checked, row?.id)); onFinish(); }} onBlur={onFinish} />;
	return <CellEditor snapshot={snapshot} row={row} rowIndex={rowIndex} field={field} fieldIndex={fieldIndex} initial={initial ?? displayValue(value)} onMutate={onMutate} onFinish={onFinish} />;
}

function CellDisplay({ field, value }: { readonly field?: PeakSheetFieldDefinition; readonly value: PeakSheetCellValue }): React.ReactElement {
	if (!field || value === null) return <span className="peak-sheet-empty-cell">empty</span>;
	if (field.type === 'checkbox') return <span className="peak-sheet-checkbox-cell">{value === true ? '✓' : ''}</span>;
	if (field.type === 'singleSelect') return <span className={`peak-sheet-tag peak-sheet-tag-${String(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{field.options?.find((option) => option.id === value)?.label ?? String(value)}</span>;
	if (field.formula) return <span className="peak-sheet-calculated-cell">{displayValue(value)} <small>ƒx</small></span>;
	return <span className={field.type === 'number' ? 'peak-sheet-cell-value is-number' : field.type === 'date' ? 'peak-sheet-cell-value is-date' : 'peak-sheet-cell-value'}>{displayValue(value)}</span>;
}

function CellEditor({ snapshot, row, rowIndex, field, fieldIndex, initial, onMutate, onFinish }: { readonly snapshot: PeakSheetDatasetSnapshot; readonly row?: PeakSheetRow; readonly rowIndex: number; readonly field?: PeakSheetFieldDefinition; readonly fieldIndex: number; readonly initial: string; onMutate(operations: readonly PeakSheetPatchOperation[]): void; onFinish(): void }): React.ReactElement {
	const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);
	const [draft, setDraft] = useState(initial);
	const composing = useRef(false);
	useEffect(() => { ref.current?.focus(); if (ref.current instanceof HTMLInputElement) ref.current.select(); }, []);
	const commit = () => { onMutate(buildPeakSheetMaterializeOperations(snapshot, rowIndex, fieldIndex, draft, row?.id)); onFinish(); };
	if (field?.type === 'singleSelect') return <select ref={ref as React.RefObject<HTMLSelectElement>} value={draft} onChange={(event) => { onMutate(buildPeakSheetMaterializeOperations(snapshot, rowIndex, fieldIndex, event.target.value, row?.id)); onFinish(); }} onBlur={onFinish}><option value="">—</option>{field.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
	return <input ref={ref as React.RefObject<HTMLInputElement>} type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'} value={draft} onChange={(event) => setDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onFinish(); return; } if (event.key !== 'Enter' || composing.current) return; event.preventDefault(); commit(); }} />;
}

function FieldMenu({ menu, snapshot, view, onMutate, onFilter, onSort, onClose }: { readonly menu: Extract<TableMenu, { kind: 'field' }>; readonly snapshot: PeakSheetDatasetSnapshot; readonly view: PeakSheetTableViewDefinition; onMutate(operations: readonly PeakSheetPatchOperation[]): void; onFilter(fieldId?: string): void; onSort(fieldId?: string): void; onClose(): void }): React.ReactElement | null {
	const field = snapshot.fields[menu.fieldIndex];
	if (!field) return null;
	return <div className="peak-sheet-popover peak-sheet-field-menu" style={menuStyle(menu)} role="menu" onPointerDown={(event) => event.stopPropagation()}>
		<div className="peak-sheet-popover-head"><span><strong>{field.name}</strong><small>{field.type}</small></span><kbd>⋮</kbd></div>
		<Button variant="unstyled" onClick={() => { onSort(field.id); onClose(); }}>Sort A → Z</Button>
		<Button variant="unstyled" onClick={() => { onFilter(field.id); onClose(); }}>Filter by this field</Button>
		<span className="peak-sheet-menu-separator" />
		<Button variant="unstyled" onClick={() => { onMutate([{ type: 'addField', field: newTextField(snapshot, menu.fieldIndex), index: menu.fieldIndex }]); onClose(); }}>Insert column left</Button>
		<Button variant="unstyled" onClick={() => { onMutate([{ type: 'addField', field: newTextField(snapshot, menu.fieldIndex + 1), index: menu.fieldIndex + 1 }]); onClose(); }}>Insert column right</Button>
		<Button variant="unstyled" onClick={() => { onMutate([{ type: 'addField', field: { ...field, id: `field-${crypto.randomUUID()}`, name: uniqueFieldName(snapshot, `${field.name} copy`) }, index: menu.fieldIndex + 1, values: Object.fromEntries(snapshot.rows.map((row) => [row.id, row.cells[field.id] ?? null])) }]); onClose(); }}><Copy size={13} />Duplicate column</Button>
		<Button variant="unstyled" onClick={() => { onMutate([{ type: 'upsertView', view: { ...view, hiddenFieldIds: [...new Set([...(view.hiddenFieldIds ?? []), field.id])] } }]); onClose(); }}>Hide from this view</Button>
		<span className="peak-sheet-menu-separator" />
		<Button variant="unstyled" className="is-destructive" disabled={snapshot.fields.length <= 1} onClick={() => { onMutate([{ type: 'deleteField', fieldId: field.id }]); onClose(); }}><Trash2 size={13} />Delete column</Button>
	</div>;
}

function RowMenu({ menu, snapshot, rows, onMutate, onClose }: { readonly menu: Extract<TableMenu, { kind: 'row' }>; readonly snapshot: PeakSheetDatasetSnapshot; readonly rows: readonly PeakSheetRow[]; onMutate(operations: readonly PeakSheetPatchOperation[]): void; onClose(): void }): React.ReactElement {
	const row = rows[menu.rowIndex];
	const index = row ? snapshot.rows.findIndex((candidate) => candidate.id === row.id) : snapshot.rows.length;
	return <div className="peak-sheet-popover peak-sheet-row-menu" style={menuStyle(menu)} role="menu" onPointerDown={(event) => event.stopPropagation()}>
		<div className="peak-sheet-popover-head"><strong>Row {menu.rowIndex + 1}</strong><kbd>⋮</kbd></div>
		<Button variant="unstyled" onClick={() => { onMutate([{ type: 'addRow', row: blankPeakSheetRow(snapshot.fields), index }]); onClose(); }}><Plus size={13} />Insert row above</Button>
		<Button variant="unstyled" onClick={() => { onMutate([{ type: 'addRow', row: blankPeakSheetRow(snapshot.fields), index: index + 1 }]); onClose(); }}><Plus size={13} />Insert row below</Button>
		<Button variant="unstyled" disabled={!row} onClick={() => { if (row) onMutate([{ type: 'addRow', row: { id: `row-${crypto.randomUUID()}`, cells: { ...row.cells } }, index: index + 1 }]); onClose(); }}><Copy size={13} />Duplicate row</Button>
		<span className="peak-sheet-menu-separator" />
		<Button variant="unstyled" className="is-destructive" disabled={!row} onClick={() => { if (row) onMutate([{ type: 'deleteRow', rowId: row.id }]); onClose(); }}><Trash2 size={13} />Delete row</Button>
	</div>;
}

function selectCell(row: number, field: number, extend: boolean, dragging: React.MutableRefObject<boolean>, props: PeakSheetTableProps): void {
	dragging.current = true;
	props.onGridState({ anchorRow: extend ? props.gridState.anchorRow : row, anchorField: extend ? props.gridState.anchorField : field, focusRow: row, focusField: field, mode: 'selecting' });
}

function extendSelection(row: number, field: number, dragging: React.MutableRefObject<boolean>, props: PeakSheetTableProps): void {
	if (!dragging.current) return;
	props.onGridState({ ...props.gridState, focusRow: row, focusField: field, mode: 'selecting' });
}

function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>, props: PeakSheetTableProps, rows: readonly PeakSheetRow[], fields: readonly PeakSheetFieldDefinition[], columnCount: number, rowCount: number, setEditing: (cell: EditingCell) => void): void {
	const target = event.target as HTMLElement;
	if (target.matches('input, select, textarea')) return;
	const cell = target.closest<HTMLTableCellElement>('td[data-row-index][data-field-index]');
	if (!cell) return;
	const row = Number(cell.dataset.rowIndex);
	const field = Number(cell.dataset.fieldIndex);
	if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); setEditing({ rowIndex: row, fieldIndex: field }); return; }
	if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearRange(props, rows, fields); return; }
	if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); setEditing({ rowIndex: row, fieldIndex: field, initial: event.key }); return; }
	const delta = event.key === 'ArrowUp' ? [-1, 0] : event.key === 'ArrowDown' ? [1, 0] : event.key === 'ArrowLeft' ? [0, -1] : event.key === 'ArrowRight' ? [0, 1] : event.key === 'Tab' ? [0, event.shiftKey ? -1 : 1] : null;
	if (!delta) return;
	event.preventDefault();
	const nextRow = Math.max(0, Math.min(rowCount - 1, row + delta[0]));
	const nextField = Math.max(0, Math.min(columnCount - 1, field + delta[1]));
	props.onGridState({ anchorRow: event.shiftKey && event.key !== 'Tab' ? props.gridState.anchorRow : nextRow, anchorField: event.shiftKey && event.key !== 'Tab' ? props.gridState.anchorField : nextField, focusRow: nextRow, focusField: nextField, mode: 'navigation' });
	document.querySelector<HTMLElement>(`.peak-sheet-data-grid td[data-row-index="${nextRow}"][data-field-index="${nextField}"]`)?.focus({ preventScroll: true });
}

function copyRange(event: React.ClipboardEvent, props: PeakSheetTableProps, rows: readonly PeakSheetRow[], fields: readonly PeakSheetFieldDefinition[]): void {
	const bounds = peakSheetGridBounds(props.gridState);
	const text = Array.from({ length: bounds.bottom - bounds.top + 1 }, (_, rowOffset) => Array.from({ length: bounds.right - bounds.left + 1 }, (_, fieldOffset) => {
		const row = rows[bounds.top + rowOffset];
		const field = fields[bounds.left + fieldOffset];
		return row && field ? displayValue(row.cells[field.id] ?? null) : '';
	}).join('\t')).join('\n');
	event.clipboardData.setData('text/plain', text);
	event.preventDefault();
}

function pasteRange(event: React.ClipboardEvent, props: PeakSheetTableProps, rows: readonly PeakSheetRow[], fields: readonly PeakSheetFieldDefinition[]): void {
	const text = event.clipboardData.getData('text/plain');
	const matrix = clipboardMatrix(text, event.clipboardData.getData('text/html'));
	if (!matrix.length) return;
	event.preventDefault();
	const operations = buildPeakSheetMatrixPasteOperations(props.snapshot, rows, fields, props.gridState.focusRow, props.gridState.focusField, matrix);
	if (operations.length) props.onMutate(operations);
	props.onGridState({ anchorRow: props.gridState.focusRow, anchorField: props.gridState.focusField, focusRow: props.gridState.focusRow + matrix.length - 1, focusField: props.gridState.focusField + Math.max(...matrix.map((row) => row.length)) - 1, mode: 'navigation' });
}

function clipboardMatrix(text: string, html: string): readonly (readonly string[])[] {
	const plain = parsePeakSheetClipboardText(text);
	if (plain.some((row) => row.length > 1) || !html.includes('<table')) return plain;
	const document = new DOMParser().parseFromString(html, 'text/html');
	const rows = [...document.querySelectorAll('table tr')].map((row) => [...row.querySelectorAll('th,td')].map((cell) => cell.textContent?.trim() ?? ''));
	return rows.some((row) => row.length > 1) ? rows : plain;
}

function clearRange(props: PeakSheetTableProps, rows: readonly PeakSheetRow[], fields: readonly PeakSheetFieldDefinition[]): void {
	const bounds = peakSheetGridBounds(props.gridState);
	const operations: PeakSheetPatchOperation[] = [];
	for (let rowIndex = bounds.top; rowIndex <= bounds.bottom; rowIndex++) for (let fieldIndex = bounds.left; fieldIndex <= bounds.right; fieldIndex++) {
		const row = rows[rowIndex];
		const field = fields[fieldIndex];
		if (row && field && !field.formula) operations.push({ type: 'setCell', rowId: row.id, fieldId: field.id, value: field.type === 'checkbox' ? false : null });
	}
	if (operations.length) props.onMutate(operations); else props.onMessage('Nothing materialized in this range yet');
}

function groupEntries(rows: readonly PeakSheetRow[], groupFields: readonly string[], fields: readonly PeakSheetFieldDefinition[]): GroupEntry[] {
	if (!groupFields.length) return rows.map((row, rowIndex) => ({ kind: 'row', row, rowIndex }));
	const output: GroupEntry[] = [];
	const visit = (bucket: readonly { row: PeakSheetRow; rowIndex: number }[], level: number, prefix: string) => {
		if (level >= groupFields.length) { output.push(...bucket.map(({ row, rowIndex }) => ({ kind: 'row' as const, row, rowIndex }))); return; }
		const fieldId = groupFields[level];
		const field = fields.find((candidate) => candidate.id === fieldId);
		const groups = new Map<string, { row: PeakSheetRow; rowIndex: number }[]>();
		for (const entry of bucket) { const label = displayValue(entry.row.cells[fieldId] ?? null) || 'Blank'; const current = groups.get(label) ?? []; current.push(entry); groups.set(label, current); }
		for (const [label, grouped] of groups) { const key = `${prefix}/${level}/${label}`; output.push({ kind: 'group', key, label: `${field?.name ?? 'Field'}: ${label}`, level, count: grouped.length }); visit(grouped, level + 1, key); }
	};
	visit(rows.map((row, rowIndex) => ({ row, rowIndex })), 0, 'root');
	return output;
}

function filterRows(rows: readonly PeakSheetRow[], search: string): PeakSheetRow[] { const query = search.trim().toLocaleLowerCase(); if (!query) return [...rows]; return rows.filter((row) => Object.values(row.cells).some((value) => displayValue(value ?? null).toLocaleLowerCase().includes(query))); }
function openMenu(event: React.MouseEvent, menu: Omit<TableMenu, 'x' | 'y'>, setMenu: (menu: TableMenu) => void): void { event.preventDefault(); setMenu({ ...menu, x: event.clientX, y: event.clientY } as TableMenu); }
function menuStyle(menu: TableMenu): React.CSSProperties { return { left: Math.max(8, Math.min(menu.x, window.innerWidth - 240)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 390)) }; }

function startResize(event: React.PointerEvent<HTMLSpanElement>, field: PeakSheetFieldDefinition, onMutate: PeakSheetTableProps['onMutate'], setLiveWidths: React.Dispatch<React.SetStateAction<Readonly<Record<string, number>>>>): void {
	event.preventDefault(); event.stopPropagation();
	const startX = event.clientX; const startWidth = peakSheetFieldWidth(field); const owner = event.currentTarget.ownerDocument.defaultView ?? window; let latest = startWidth;
	const move = (moveEvent: PointerEvent) => { latest = Math.max(84, Math.min(520, Math.round(startWidth + moveEvent.clientX - startX))); setLiveWidths((current) => ({ ...current, [field.id]: latest })); };
	const finish = () => { owner.removeEventListener('pointermove', move); owner.removeEventListener('pointerup', finish); setLiveWidths((current) => { const next = { ...current }; delete next[field.id]; return next; }); if (latest !== startWidth) onMutate([{ type: 'resizeField', fieldId: field.id, width: latest }]); };
	owner.addEventListener('pointermove', move); owner.addEventListener('pointerup', finish, { once: true });
}

function newTextField(snapshot: PeakSheetDatasetSnapshot, index: number): PeakSheetFieldDefinition { return { id: `field-${crypto.randomUUID()}`, name: uniqueFieldName(snapshot, `Column ${peakSheetColumnName(index)}`), type: 'text', width: 220 }; }
function uniqueFieldName(snapshot: PeakSheetDatasetSnapshot, base: string): string { const names = new Set(snapshot.fields.map((field) => field.name.toLocaleLowerCase())); if (!names.has(base.toLocaleLowerCase())) return base; let suffix = 2; while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix++; return `${base} ${suffix}`; }
export function selectedGridValues(fields: readonly PeakSheetFieldDefinition[], rows: readonly PeakSheetRow[], state: PeakSheetGridState): { readonly values: readonly PeakSheetCellValue[]; readonly stats: ReturnType<typeof computeSelectionStats> } {
	const bounds = peakSheetGridBounds(state); const values: PeakSheetCellValue[] = [];
	for (let row = bounds.top; row <= bounds.bottom; row++) for (let field = bounds.left; field <= bounds.right; field++) values.push(rows[row]?.cells[fields[field]?.id] ?? null);
	return { values, stats: computeSelectionStats(values) };
}
