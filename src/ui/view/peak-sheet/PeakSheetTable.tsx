import React, { useEffect, useRef, useState } from 'react';
import {
	ChevronDown, ClipboardCopy, ClipboardPaste, Copy, GripVertical,
	Paperclip, Plus, Trash2,
} from 'lucide-react';

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
	PeakSheetFieldType,
	PeakSheetFileRef,
	PeakSheetPatchOperation,
	PeakSheetRow,
	PeakSheetSelectOption,
	PeakSheetTableViewDefinition,
	PeakSheetViewDefinition,
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
	onAddRow(): void;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onPasteCells(operations: readonly PeakSheetPatchOperation[]): void;
	onClipboardError(message: string): void;
}

type TableMenu =
	| { readonly kind: 'field'; readonly fieldId: string; readonly x: number; readonly y: number }
	| { readonly kind: 'row'; readonly rowId: string; readonly x: number; readonly y: number }
	| { readonly kind: 'add'; readonly x: number; readonly y: number };

type EditingCell = { readonly key: string; readonly initial?: string } | null;

export function PeakSheetTable(props: PeakSheetTableProps): React.ReactElement {
	const selectionAnchor = useRef<{ row: number; field: number } | null>(null);
	const [menu, setMenu] = useState<TableMenu | null>(null);
	const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
	const [liveWidths, setLiveWidths] = useState<Readonly<Record<string, number>>>({});
	const [editingCell, setEditingCell] = useState<EditingCell>(null);
	const fields = props.snapshot.fields.filter((field) => !field.hidden && !props.view.hiddenFieldIds?.includes(field.id));
	const rows = stableSortRows(projectPeakSheetRows(props.snapshot, props.view.filters), props.snapshot.fields, props.view.sorts ?? []);
	const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
	const groups = groupRows(rows, props.view.groupBy);
	const selectedValues = props.selectedCells.size > 0
		? rows.flatMap((row) => fields.filter((field) => props.selectedCells.has(peakSheetCellKey(row.id, field.id))).map((field) => row.cells[field.id] ?? null))
		: rows.filter((row) => props.selectedRows.has(row.id)).flatMap((row) => fields.map((field) => row.cells[field.id] ?? null));
	const stats = computeSelectionStats(selectedValues);

	useEffect(() => {
		if (!menu) return;
		const owner = document;
		const close = () => setMenu(null);
		owner.addEventListener('pointerdown', close);
		return () => owner.removeEventListener('pointerdown', close);
	}, [menu]);

	return (
		<div className="peak-sheet-table-shell" onKeyDown={(event) => handleTableShortcut(event, props, rows, fields, setEditingCell)}>
			<div className="peak-sheet-table-scroll">
				<table className="peak-sheet-table">
					<colgroup>
						<col className="peak-sheet-row-number-column" />
						{fields.map((field) => <col key={field.id} style={{ width: liveWidths[field.id] ?? field.width ?? 160 }} />)}
						<col className="peak-sheet-add-column" />
					</colgroup>
					<thead>
						<tr>
							<th className="peak-sheet-corner-cell">
								<input type="checkbox" aria-label="Select all visible rows" checked={rows.length > 0 && rows.every((row) => props.selectedRows.has(row.id))} onChange={(event) => props.onSelectRows(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())} />
							</th>
							{fields.map((field) => (
								<th
									key={field.id}
									draggable
									data-field-id={field.id}
									onDragStart={(event) => { setDraggedFieldId(field.id); event.dataTransfer.effectAllowed = 'move'; }}
									onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
									onDrop={(event) => { event.preventDefault(); if (draggedFieldId && draggedFieldId !== field.id) props.onMutate(reorderFieldOperations(props.snapshot, draggedFieldId, field.id)); setDraggedFieldId(null); }}
									onContextMenu={(event) => openMenu(event, { kind: 'field', fieldId: field.id }, setMenu)}
								>
									<div className="peak-sheet-column-heading">
										<GripVertical size={13} className="peak-sheet-column-drag" />
										<Button variant="unstyled" geometry="toolbar-full" title={field.formula ?? field.type} onClick={(event) => setMenu({ kind: 'field', fieldId: field.id, x: event.clientX, y: event.clientY + 8 })}>
											<span>{field.name}{field.formula ? ' ƒ' : ''}</span><ChevronDown size={13} />
										</Button>
										<span className="peak-sheet-column-resizer" role="separator" aria-label={`Resize ${field.name}`} onPointerDown={(event) => startResize(event, field, props.onMutate, setLiveWidths)} />
									</div>
								</th>
							))}
							<th className="peak-sheet-add-field-cell">
								<Button variant="unstyled" geometry="toolbar-icon" aria-label="Add field" onClick={(event) => setMenu({ kind: 'add', x: event.clientX - 180, y: event.clientY + 8 })}><Plus size={16} /></Button>
							</th>
						</tr>
					</thead>
					<tbody>
						{groups.map((group) => (
							<React.Fragment key={group.key}>
								{props.view.groupBy && <tr className="peak-sheet-group-row"><td colSpan={fields.length + 2}>{group.key} <span>{group.rows.length}</span></td></tr>}
								{group.rows.map((row) => {
									const rowIndex = rowIndexById.get(row.id) ?? 0;
									return (
										<tr key={row.id} data-row-id={row.id}>
											<td className={props.selectedRows.has(row.id) ? 'peak-sheet-row-number is-selected' : 'peak-sheet-row-number'} onContextMenu={(event) => openMenu(event, { kind: 'row', rowId: row.id }, setMenu)}>
												<Button variant="unstyled" size="xs" aria-label={`Select row ${rowIndex + 1}`} onClick={(event) => selectRowNumber(event, props, rows, rowIndex)}>{rowIndex + 1}</Button>
											</td>
											{fields.map((field, fieldIndex) => {
												const key = peakSheetCellKey(row.id, field.id);
												return (
													<td
														key={field.id}
														className={props.selectedCells.has(key) ? 'is-selected-cell' : ''}
														data-row-index={rowIndex}
														data-field-index={fieldIndex}
														tabIndex={0}
														onPointerDown={(event) => selectCell(props, rows, fields, rowIndex, fieldIndex, event, selectionAnchor)}
														onDoubleClick={() => setEditingCell({ key })}
													>
														<PeakSheetCell row={row} field={field} editing={editingCell?.key === key} initial={editingCell?.key === key ? editingCell.initial : undefined} onBeginEdit={() => setEditingCell({ key })} onFinishEdit={() => setEditingCell(null)} onSetCell={props.onSetCell} onCopyExternalFile={props.onCopyExternalFile} />
													</td>
												);
											})}
											<td className="peak-sheet-add-field-cell" />
										</tr>
									);
								})}
							</React.Fragment>
						))}
						<tr className="peak-sheet-new-record-row">
							<td />
							<td colSpan={fields.length + 1}><Button variant="unstyled" geometry="toolbar-full" onClick={props.onAddRow}><Plus size={14} /> New record</Button></td>
						</tr>
					</tbody>
				</table>
				{rows.length === 0 && <div className="peak-sheet-empty-inline">No records match this view. Add a record below or clear the filter.</div>}
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
			{menu?.kind === 'field' && <FieldMenu menu={menu} snapshot={props.snapshot} view={props.view} onMutate={props.onMutate} onClose={() => setMenu(null)} />}
			{menu?.kind === 'row' && <RowMenu menu={menu} snapshot={props.snapshot} onCopy={() => { const row = props.snapshot.rows.find((candidate) => candidate.id === menu.rowId); if (row) props.onCopyRow(row); setMenu(null); }} onDelete={() => { props.onDeleteRow(menu.rowId); setMenu(null); }} onInsert={(after) => { props.onMutate([{ type: 'addRow', row: blankRow(props.snapshot), index: Math.max(0, props.snapshot.rows.findIndex((row) => row.id === menu.rowId) + (after ? 1 : 0)) }]); setMenu(null); }} />}
			{menu?.kind === 'add' && <AddFieldMenu menu={menu} snapshot={props.snapshot} onMutate={props.onMutate} onClose={() => setMenu(null)} />}
		</div>
	);
}

function FieldMenu({ menu, snapshot, view, onMutate, onClose }: {
	readonly menu: Extract<TableMenu, { kind: 'field' }>;
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetTableViewDefinition;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onClose(): void;
}): React.ReactElement | null {
	const field = snapshot.fields.find((candidate) => candidate.id === menu.fieldId);
	const [name, setName] = useState(field?.name ?? '');
	const [options, setOptions] = useState(field?.options?.map((option) => option.label).join(', ') ?? '');
	const [formula, setFormula] = useState(field?.formula ?? '');
	const [confirmDelete, setConfirmDelete] = useState(false);
	if (!field) return null;
	const index = snapshot.fields.findIndex((candidate) => candidate.id === field.id);
	const commitName = () => {
		const next = name.trim();
		if (next && next !== field.name) onMutate([{ type: 'renameField', fieldId: field.id, name: next }]);
	};
	return (
		<div className="peak-sheet-popup-menu peak-sheet-field-menu" style={menuStyle(menu)} role="menu" onPointerDown={(event) => event.stopPropagation()}>
			<label>Field name<input value={name} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => { if (event.key === 'Enter') { commitName(); onClose(); } }} autoFocus /></label>
			<label>Field type<select value={field.type} onChange={(event) => { const nextType = event.target.value as PeakSheetFieldType; if (nextType !== field.type) onMutate(replaceFieldTypeOperations(snapshot, field, nextType)); onClose(); }}>{FIELD_TYPES.map((type) => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}</select></label>
			{field.type === 'singleSelect' && <label>Options<input value={options} placeholder="Todo, Doing, Done" onChange={(event) => setOptions(event.target.value)} onBlur={() => { const parsed = parseSelectOptions(field.options ?? [], options); if (JSON.stringify(parsed) !== JSON.stringify(field.options ?? [])) onMutate([{ type: 'setFieldOptions', fieldId: field.id, options: parsed }]); }} /></label>}
			<label>Formula<input value={formula} placeholder="=[Amount]*2" onChange={(event) => setFormula(event.target.value)} onBlur={() => { const next = formula.trim() || undefined; if (next !== field.formula) onMutate([{ type: 'setFieldFormula', fieldId: field.id, formula: next }]); }} /></label>
			<span className="peak-sheet-menu-separator" />
			<Button variant="unstyled" geometry="toolbar-full" disabled={index <= 0} onClick={() => { const target = snapshot.fields[index - 1]; if (target) onMutate(reorderFieldOperations(snapshot, field.id, target.id)); onClose(); }}>Move left</Button>
			<Button variant="unstyled" geometry="toolbar-full" disabled={index >= snapshot.fields.length - 1} onClick={() => { const target = snapshot.fields[index + 1]; if (target) onMutate(reorderFieldOperations(snapshot, field.id, target.id, true)); onClose(); }}>Move right</Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => { onMutate([{ type: 'addField', field: newField(snapshot, 'text'), index }]); onClose(); }}><Plus size={14} /> Insert left</Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => { onMutate([{ type: 'addField', field: newField(snapshot, 'text'), index: index + 1 }]); onClose(); }}><Plus size={14} /> Insert right</Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => { onMutate([duplicateFieldOperation(snapshot, field, index + 1)]); onClose(); }}><Copy size={14} /> Duplicate field</Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => { onMutate([{ type: 'upsertView', view: { ...view, hiddenFieldIds: [...new Set([...(view.hiddenFieldIds ?? []), field.id])] } }]); onClose(); }}>Hide in this view</Button>
			{!confirmDelete && <Button variant="unstyled" geometry="toolbar-full" disabled={snapshot.fields.length <= 1} className="is-destructive" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete field…</Button>}
			{confirmDelete && <div className="peak-sheet-menu-confirm"><span>Delete “{field.name}” and {populatedValueCount(snapshot, field.id)} values?</span><Button variant="outline" size="xs" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="destructive" size="xs" onClick={() => { onMutate([{ type: 'deleteField', fieldId: field.id }]); onClose(); }}>Delete</Button></div>}
		</div>
	);
}

function RowMenu({ menu, snapshot, onCopy, onDelete, onInsert }: {
	readonly menu: Extract<TableMenu, { kind: 'row' }>;
	readonly snapshot: PeakSheetDatasetSnapshot;
	onCopy(): void;
	onDelete(): void;
	onInsert(after: boolean): void;
}): React.ReactElement {
	const index = snapshot.rows.findIndex((row) => row.id === menu.rowId);
	return (
		<div className="peak-sheet-popup-menu" style={menuStyle(menu)} role="menu" onPointerDown={(event) => event.stopPropagation()}>
			<span className="peak-sheet-menu-caption">Record {index + 1}</span>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => onInsert(false)}><Plus size={14} /> Insert above</Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => onInsert(true)}><Plus size={14} /> Insert below</Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={onCopy}><Copy size={14} /> Duplicate record</Button>
			<Button variant="unstyled" geometry="toolbar-full" className="is-destructive" onClick={onDelete}><Trash2 size={14} /> Delete record</Button>
		</div>
	);
}

function AddFieldMenu({ menu, snapshot, onMutate, onClose }: {
	readonly menu: Extract<TableMenu, { kind: 'add' }>;
	readonly snapshot: PeakSheetDatasetSnapshot;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onClose(): void;
}): React.ReactElement {
	return (
		<div className="peak-sheet-popup-menu peak-sheet-add-field-menu" style={menuStyle(menu)} role="menu" onPointerDown={(event) => event.stopPropagation()}>
			<span className="peak-sheet-menu-caption">Add field</span>
			{FIELD_TYPES.map((type) => <Button key={type} variant="unstyled" geometry="toolbar-full" onClick={() => { onMutate([{ type: 'addField', field: newField(snapshot, type) }]); onClose(); }}>{FIELD_TYPE_LABELS[type]}</Button>)}
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

function selectRowNumber(event: React.MouseEvent, props: PeakSheetTableProps, rows: readonly PeakSheetRow[], index: number): void {
	if (event.shiftKey && props.selectedRows.size > 0) {
		const first = rows.findIndex((row) => props.selectedRows.has(row.id));
		const start = first < 0 ? index : Math.min(first, index);
		const end = first < 0 ? index : Math.max(first, index);
		props.onSelectRows(new Set(rows.slice(start, end + 1).map((row) => row.id)));
		return;
	}
	if (event.metaKey || event.ctrlKey) {
		const next = new Set(props.selectedRows);
		if (next.has(rows[index].id)) next.delete(rows[index].id); else next.add(rows[index].id);
		props.onSelectRows(next);
		return;
	}
	props.onSelectRows(new Set([rows[index].id]));
}

function PeakSheetCell({ row, field, editing, initial, onBeginEdit, onFinishEdit, onSetCell, onCopyExternalFile }: {
	readonly row: PeakSheetRow;
	readonly field: PeakSheetFieldDefinition;
	readonly editing: boolean;
	readonly initial?: string;
	onBeginEdit(): void;
	onFinishEdit(): void;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onCopyExternalFile(file: { readonly name: string; readonly type: string; readonly buffer: ArrayBuffer }): Promise<PeakSheetFileRef>;
}): React.ReactElement {
	const value = row.cells[field.id] ?? null;
	if (field.formula) return <span className="peak-sheet-formula-value">{displayValue(value)}</span>;
	if (field.type === 'checkbox') return <input type="checkbox" aria-label={`${field.name} for row ${row.id}`} checked={value === true} onChange={(event) => onSetCell(row.id, field.id, event.target.checked)} />;
	if (field.type === 'singleSelect') {
		return <select value={typeof value === 'string' ? value : ''} aria-label={`${field.name} for row ${row.id}`} onChange={(event) => onSetCell(row.id, field.id, event.target.value || null)}><option value="">—</option>{field.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
	}
	if (field.type === 'file') return <FileCell row={row} field={field} value={value} onSetCell={onSetCell} onCopyExternalFile={onCopyExternalFile} />;
	if (!editing) return <span className={value === null ? 'peak-sheet-cell-display is-empty' : 'peak-sheet-cell-display'} onDoubleClick={onBeginEdit}>{value === null ? '' : String(value)}</span>;
	return <TextCellEditor row={row} field={field} value={value} initial={initial} onSetCell={onSetCell} onFinish={onFinishEdit} />;
}

function TextCellEditor({ row, field, value, initial, onSetCell, onFinish }: {
	readonly row: PeakSheetRow;
	readonly field: PeakSheetFieldDefinition;
	readonly value: PeakSheetCellValue;
	readonly initial?: string;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onFinish(): void;
}): React.ReactElement {
	const inputRef = useRef<HTMLInputElement>(null);
	const composing = useRef(false);
	const [draft, setDraft] = useState(initial ?? (value === null ? '' : String(value)));
	useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
	const commit = () => { onSetCell(row.id, field.id, normalizeInput(draft, field)); onFinish(); };
	return (
		<input
			ref={inputRef}
			type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'link' ? 'url' : 'text'}
			value={field.type === 'date' ? draft.slice(0, 10) : draft}
			aria-label={`${field.name} for row ${row.id}`}
			onChange={(event) => setDraft(event.target.value)}
			onCompositionStart={() => { composing.current = true; }}
			onCompositionEnd={() => { composing.current = false; }}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Escape') { event.preventDefault(); onFinish(); return; }
				if (event.key !== 'Enter' || composing.current) return;
				event.preventDefault();
				commit();
			}}
		/>
	);
}

function FileCell({ row, field, value, onSetCell, onCopyExternalFile }: {
	readonly row: PeakSheetRow;
	readonly field: PeakSheetFieldDefinition;
	readonly value: PeakSheetCellValue;
	onSetCell: PeakSheetTableProps['onSetCell'];
	onCopyExternalFile: PeakSheetTableProps['onCopyExternalFile'];
}): React.ReactElement {
	const file = isFileRef(value) ? value : null;
	return (
		<div className="peak-sheet-file-cell">
			<ResourcePreviewHover filePath={file?.vaultPath} fileType={detectFileType(file?.vaultPath)} enabled={Boolean(file)}>
				<input key={`${row.id}-${field.id}-${file?.vaultPath ?? ''}`} defaultValue={file?.vaultPath ?? ''} placeholder="Vault path" onBlur={(event) => onSetCell(row.id, field.id, event.target.value.trim() ? { kind: 'vault', vaultPath: event.target.value.trim() } : null)} />
			</ResourcePreviewHover>
			<label className="peak-sheet-file-copy" title="Copy external file into Peak attachments"><Paperclip size={13} /><input type="file" aria-label={`Copy external file for ${field.name}`} onChange={(event) => void copyExternal(event, row.id, field.id, onCopyExternalFile, onSetCell)} /></label>
		</div>
	);
}

function handleTableShortcut(
	event: React.KeyboardEvent<HTMLDivElement>,
	props: PeakSheetTableProps,
	rows: readonly PeakSheetRow[],
	fields: readonly PeakSheetFieldDefinition[],
	setEditing: (cell: EditingCell) => void,
): void {
	const target = event.target as HTMLElement;
	if (target.matches('input, select, textarea')) return;
	const cell = target.closest<HTMLTableCellElement>('td[data-row-index][data-field-index]');
	if (!cell) return;
	const rowIndex = Number(cell.dataset.rowIndex);
	const fieldIndex = Number(cell.dataset.fieldIndex);
	const row = rows[rowIndex];
	const field = fields[fieldIndex];
	if (!row || !field) return;
	const key = peakSheetCellKey(row.id, field.id);
	if (event.key === 'Enter' || event.key === 'F2') {
		event.preventDefault();
		setEditing({ key });
		return;
	}
	if (event.key === 'Backspace' || event.key === 'Delete') {
		event.preventDefault();
		const selected = props.selectedCells.size > 0 ? props.selectedCells : new Set([key]);
		props.onMutate([...selected].flatMap((selectedKey) => {
			const split = selectedKey.indexOf('\u0000');
			if (split < 0) return [];
			return [{ type: 'setCell' as const, rowId: selectedKey.slice(0, split), fieldId: selectedKey.slice(split + 1), value: null }];
		}));
		return;
	}
	if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey && !field.formula && !['checkbox', 'singleSelect', 'file'].includes(field.type)) {
		event.preventDefault();
		setEditing({ key, initial: event.key });
		return;
	}
	const delta = event.key === 'ArrowUp' ? [-1, 0] : event.key === 'ArrowDown' ? [1, 0] : event.key === 'ArrowLeft' ? [0, -1] : event.key === 'ArrowRight' || event.key === 'Tab' ? [0, event.shiftKey ? -1 : 1] : null;
	if (!delta) return;
	event.preventDefault();
	const nextRow = Math.max(0, Math.min(rows.length - 1, rowIndex + delta[0]));
	const nextField = Math.max(0, Math.min(fields.length - 1, fieldIndex + delta[1]));
	const next = target.ownerDocument.querySelector<HTMLElement>(`td[data-row-index="${nextRow}"][data-field-index="${nextField}"]`);
	next?.focus();
	props.onSelectCells(new Set([peakSheetCellKey(rows[nextRow].id, fields[nextField].id)]));
}

function startResize(
	event: React.PointerEvent<HTMLSpanElement>,
	field: PeakSheetFieldDefinition,
	onMutate: PeakSheetTableProps['onMutate'],
	setLiveWidths: React.Dispatch<React.SetStateAction<Readonly<Record<string, number>>>>,
): void {
	event.preventDefault();
	event.stopPropagation();
	const startX = event.clientX;
	const startWidth = field.width ?? 160;
	const ownerWindow = event.currentTarget.ownerDocument.defaultView ?? window;
	let latest = startWidth;
	const move = (moveEvent: PointerEvent) => {
		latest = Math.max(72, Math.min(720, Math.round(startWidth + moveEvent.clientX - startX)));
		setLiveWidths((current) => ({ ...current, [field.id]: latest }));
	};
	const finish = () => {
		ownerWindow.removeEventListener('pointermove', move);
		ownerWindow.removeEventListener('pointerup', finish);
		setLiveWidths((current) => { const next = { ...current }; delete next[field.id]; return next; });
		if (latest !== startWidth) onMutate([{ type: 'resizeField', fieldId: field.id, width: latest }]);
	};
	ownerWindow.addEventListener('pointermove', move);
	ownerWindow.addEventListener('pointerup', finish, { once: true });
}

function openMenu(
	event: React.MouseEvent,
	menu: Omit<Extract<TableMenu, { kind: 'field' | 'row' }>, 'x' | 'y'>,
	setMenu: (menu: TableMenu) => void,
): void {
	event.preventDefault();
	setMenu({ ...menu, x: event.clientX, y: event.clientY } as TableMenu);
}

function menuStyle(menu: TableMenu): React.CSSProperties {
	return { left: Math.max(8, Math.min(menu.x, window.innerWidth - 280)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 480)) };
}

function reorderFieldOperations(snapshot: PeakSheetDatasetSnapshot, sourceId: string, targetId: string, after = false): PeakSheetPatchOperation[] {
	const source = snapshot.fields.find((field) => field.id === sourceId);
	const targetIndex = snapshot.fields.findIndex((field) => field.id === targetId);
	if (!source || targetIndex < 0) return [];
	const sourceIndex = snapshot.fields.findIndex((field) => field.id === sourceId);
	let insertIndex = targetIndex + (after ? 1 : 0);
	if (sourceIndex < insertIndex) insertIndex--;
	if (insertIndex === sourceIndex) return [];
	return [
		{ type: 'deleteField', fieldId: source.id },
		{ type: 'addField', field: { ...source }, index: insertIndex, values: fieldValues(snapshot, source.id), views: snapshot.views },
	];
}

function replaceFieldTypeOperations(snapshot: PeakSheetDatasetSnapshot, field: PeakSheetFieldDefinition, type: PeakSheetFieldType): PeakSheetPatchOperation[] {
	const index = snapshot.fields.findIndex((candidate) => candidate.id === field.id);
	const replacement: PeakSheetFieldDefinition = {
		id: field.id,
		name: field.name,
		type,
		width: field.width,
		options: type === 'singleSelect' ? defaultOptions(field.options) : undefined,
	};
	const values = Object.fromEntries(snapshot.rows.map((row) => [row.id, convertCellValue(row.cells[field.id] ?? null, type, replacement.options)]));
	const fields = snapshot.fields.map((candidate) => candidate.id === field.id ? replacement : candidate);
	return [
		{ type: 'deleteField', fieldId: field.id },
		{ type: 'addField', field: replacement, index, values, views: compatibleViews(snapshot.views, fields) },
	];
}

function duplicateFieldOperation(snapshot: PeakSheetDatasetSnapshot, field: PeakSheetFieldDefinition, index: number): Extract<PeakSheetPatchOperation, { type: 'addField' }> {
	return {
		type: 'addField',
		field: { ...field, id: `field-${crypto.randomUUID()}`, name: uniqueFieldName(snapshot, `${field.name} copy`) },
		index,
		values: fieldValues(snapshot, field.id),
	};
}

function newField(snapshot: PeakSheetDatasetSnapshot, type: PeakSheetFieldType): PeakSheetFieldDefinition {
	const field: PeakSheetFieldDefinition = { id: `field-${crypto.randomUUID()}`, name: uniqueFieldName(snapshot, `New ${FIELD_TYPE_LABELS[type]}`), type, width: 160 };
	return type === 'singleSelect' ? { ...field, options: defaultOptions() } : field;
}

function compatibleViews(views: readonly PeakSheetViewDefinition[], fields: readonly PeakSheetFieldDefinition[]): PeakSheetViewDefinition[] {
	const byId = new Map(fields.map((field) => [field.id, field]));
	return views.filter((view) => {
		if (view.type === 'board') return byId.get(view.laneFieldId)?.type === 'singleSelect' && byId.get(view.titleFieldId)?.type === 'text';
		if (view.type === 'calendar') return byId.get(view.dateFieldId)?.type === 'date' && byId.get(view.titleFieldId)?.type === 'text';
		return true;
	});
}

function fieldValues(snapshot: PeakSheetDatasetSnapshot, fieldId: string): Readonly<Record<string, PeakSheetCellValue>> {
	return Object.fromEntries(snapshot.rows.map((row) => [row.id, row.cells[fieldId] ?? null]));
}

function convertCellValue(value: PeakSheetCellValue, type: PeakSheetFieldType, options?: readonly PeakSheetSelectOption[]): PeakSheetCellValue {
	if (value === null) return type === 'checkbox' ? false : null;
	if (type === 'text' || type === 'link' || type === 'date') return typeof value === 'object' ? value.vaultPath : String(value);
	if (type === 'number') { const parsed = Number(typeof value === 'object' ? value.vaultPath : value); return Number.isFinite(parsed) ? parsed : null; }
	if (type === 'checkbox') return typeof value === 'boolean' ? value : ['true', 'yes', '1', 'done'].includes(String(value).toLocaleLowerCase());
	if (type === 'file') return typeof value === 'object' ? value : { kind: 'vault', vaultPath: String(value) };
	const text = typeof value === 'object' ? value.vaultPath : String(value);
	return options?.some((option) => option.id === text) ? text : null;
}

function defaultOptions(current?: readonly PeakSheetSelectOption[]): PeakSheetSelectOption[] {
	return current?.length ? current.map((option) => ({ ...option })) : [{ id: 'Option 1', label: 'Option 1' }, { id: 'Option 2', label: 'Option 2' }];
}

function parseSelectOptions(current: readonly PeakSheetSelectOption[], text: string): PeakSheetSelectOption[] {
	const seen = new Set<string>();
	return text.split(',').map((label) => label.trim()).filter((label) => { const key = label.toLocaleLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).map((label, index) => {
		const previous = current.find((option) => option.label.toLocaleLowerCase() === label.toLocaleLowerCase()) ?? current[index];
		return previous ? { ...previous, label } : { id: label, label };
	});
}

function uniqueFieldName(snapshot: PeakSheetDatasetSnapshot, base: string): string {
	const names = new Set(snapshot.fields.map((field) => field.name.toLocaleLowerCase()));
	if (!names.has(base.toLocaleLowerCase())) return base;
	let suffix = 2;
	while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix++;
	return `${base} ${suffix}`;
}

function blankRow(snapshot: PeakSheetDatasetSnapshot): PeakSheetRow {
	return { id: `row-${crypto.randomUUID()}`, cells: Object.fromEntries(snapshot.fields.filter((field) => !field.formula).map((field) => [field.id, field.type === 'checkbox' ? false : null])) };
}

async function copyExternal(event: React.ChangeEvent<HTMLInputElement>, rowId: string, fieldId: string, copy: PeakSheetTableProps['onCopyExternalFile'], setCell: PeakSheetTableProps['onSetCell']): Promise<void> {
	const file = event.target.files?.[0];
	if (!file) return;
	try { setCell(rowId, fieldId, await copy({ name: file.name, type: file.type, buffer: await file.arrayBuffer() })); } catch { /* owning surface reports */ } finally { event.target.value = ''; }
}

function normalizeInput(value: string, field: PeakSheetFieldDefinition): PeakSheetCellValue {
	const text = value.trim();
	if (!text) return null;
	if (field.type === 'number') { const parsed = Number(text); return Number.isFinite(parsed) ? parsed : null; }
	return text;
}

function groupRows(rows: readonly PeakSheetRow[], fieldId?: string): { key: string; rows: readonly PeakSheetRow[] }[] {
	if (!fieldId) return [{ key: 'all', rows }];
	const grouped = new Map<string, PeakSheetRow[]>();
	for (const row of rows) { const key = displayValue(row.cells[fieldId] ?? null) || 'Unassigned'; const current = grouped.get(key) ?? []; current.push(row); grouped.set(key, current); }
	return [...grouped.entries()].map(([key, groupedRows]) => ({ key, rows: groupedRows }));
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

function populatedValueCount(snapshot: PeakSheetDatasetSnapshot, fieldId: string): number {
	return snapshot.rows.filter((row) => row.cells[fieldId] !== null && row.cells[fieldId] !== undefined).length;
}

function formatNumber(value: number | null): string {
	return value === null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

async function copySelection(props: PeakSheetTableProps, rows: readonly PeakSheetRow[], fields: readonly PeakSheetFieldDefinition[]): Promise<void> {
	try { if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this Obsidian window.'); await navigator.clipboard.writeText(serializePeakSheetSelection(rows, fields, props.selectedCells, props.selectedRows)); } catch (error) { props.onClipboardError(error instanceof Error ? error.message : String(error)); }
}

async function pasteSelection(props: PeakSheetTableProps, rows: readonly PeakSheetRow[], fields: readonly PeakSheetFieldDefinition[]): Promise<void> {
	try {
		if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this Obsidian window.');
		const selected = rows.flatMap((row, rowIndex) => fields.flatMap((field, fieldIndex) => props.selectedCells.has(peakSheetCellKey(row.id, field.id)) ? [{ rowIndex, fieldIndex }] : []));
		if (selected.length === 0) return;
		const operations = buildPeakSheetPasteOperations(await navigator.clipboard.readText(), rows, fields, Math.min(...selected.map((item) => item.rowIndex)), Math.min(...selected.map((item) => item.fieldIndex)));
		if (operations.length > 0) props.onPasteCells(operations);
	} catch (error) { props.onClipboardError(error instanceof Error ? error.message : String(error)); }
}

const FIELD_TYPES: readonly PeakSheetFieldType[] = ['text', 'number', 'date', 'singleSelect', 'checkbox', 'link', 'file'];
const FIELD_TYPE_LABELS: Readonly<Record<PeakSheetFieldType, string>> = {
	text: 'Text', number: 'Number', date: 'Date', singleSelect: 'Single select', checkbox: 'Checkbox', link: 'Link', file: 'File / image',
};
