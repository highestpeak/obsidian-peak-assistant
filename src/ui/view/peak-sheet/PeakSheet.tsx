import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Columns3, Download, FilePlus2, Filter, Plus, Redo2, Search, Settings2,
	Sparkles, Trash2, Undo2, Upload, X,
} from 'lucide-react';

import type { PeakSheetAttachmentPort, PeakSheetUiPort } from '@/core/ports/PeakSheetToolPort';
import type {
	PeakSheetCellValue,
	PeakSheetDatasetSnapshot,
	PeakSheetFilterOperator,
	PeakSheetPatchOperation,
	PeakSheetRow,
	PeakSheetViewDefinition,
	PeakSheetWorkbookDraft,
} from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';
import { PeakSheetBoard } from './PeakSheetBoard';
import { PeakSheetCalendar } from './PeakSheetCalendar';
import { PeakSheetChart } from './PeakSheetChart';
import { PeakSheetFieldPanel } from './PeakSheetFieldPanel';
import { PeakSheetTable } from './PeakSheetTable';

export function PeakSheet({ runtime, attachmentPort }: {
	readonly runtime: PeakSheetUiPort;
	readonly attachmentPort: PeakSheetAttachmentPort;
}): React.ReactElement {
	const [, render] = useState(0);
	const [datasetId, setDatasetId] = useState<string | null>(null);
	const [viewId, setViewId] = useState<string | null>(null);
	const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
	const [selectedCells, setSelectedCells] = useState<ReadonlySet<string>>(new Set());
	const [fieldsOpen, setFieldsOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [busy, setBusy] = useState(true);
	const [message, setMessage] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState(false);
	const [pendingWorkbook, setPendingWorkbook] = useState<PeakSheetWorkbookDraft | null>(null);
	const [selectedWorksheetIndexes, setSelectedWorksheetIndexes] = useState<ReadonlySet<number>>(new Set());
	const importRef = useRef<HTMLInputElement>(null);

	useEffect(() => runtime.subscribe(() => render((value) => value + 1)), [runtime]);
	useEffect(() => {
		void run(async () => {
			await runtime.ensureStarterDatasets();
			setBusy(false);
		}, setMessage);
	}, [runtime]);
	const datasets = runtime.listDatasets();
	useEffect(() => {
		if (datasetId && datasets.some((dataset) => dataset.datasetId === datasetId)) return;
		setDatasetId(datasets[0]?.datasetId ?? null);
	}, [datasetId, datasets.map((dataset) => dataset.datasetId).join('|')]);
	useEffect(() => {
		const requestedDatasetId = runtime.takeDatasetFocusRequest();
		if (!requestedDatasetId) return;
		setDatasetId(requestedDatasetId);
		setViewId(null);
	});
	const snapshot = useMemo(() => datasetId ? safeDataset(runtime, datasetId) : null, [runtime, datasetId, datasets.map((dataset) => `${dataset.datasetId}:${dataset.revision}`).join('|')]);
	const activeView = snapshot?.views.find((view) => view.id === viewId) ?? snapshot?.views[0] ?? null;
	useEffect(() => {
		if (!activeView) return;
		if (viewId === activeView.id) return;
		setViewId(activeView.id);
	}, [activeView?.id, viewId]);
	useEffect(() => { setSelectedRows(new Set()); setSelectedCells(new Set()); }, [datasetId, viewId]);
	const filteredDatasets = datasets.filter((dataset) => dataset.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

	const mutate = (operations: readonly PeakSheetPatchOperation[]) => {
		if (!snapshot) return;
		setMessage(null);
		void run(() => runtime.mutate(snapshot.datasetId, operations), setMessage);
	};
	const setCell = (rowId: string, fieldId: string, value: PeakSheetCellValue) => {
		if (!snapshot) return;
		const row = snapshot.rows.find((candidate) => candidate.id === rowId);
		if (JSON.stringify(row?.cells[fieldId] ?? null) === JSON.stringify(value)) return;
		mutate([{ type: 'setCell', rowId, fieldId, value }]);
	};

	return (
		<div className="peak-sheet-root">
			<aside className="peak-sheet-sidebar">
				<div className="peak-sheet-brand"><span className="peak-sheet-brand-mark"><Sparkles size={15} /></span><span>Peak Sheet</span></div>
				<div className="peak-sheet-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a sheet" aria-label="Find a sheet" /></div>
				<div className="peak-sheet-dataset-list">
					{filteredDatasets.map((dataset) => (
						<Button key={dataset.datasetId} variant="unstyled" className={dataset.datasetId === datasetId ? 'is-active' : ''} onClick={() => { setDatasetId(dataset.datasetId); setViewId(null); }}>
							<span>{dataset.name}</span><span>{dataset.rowCount}</span>
						</Button>
					))}
				</div>
				<Button variant="unstyled" className="peak-sheet-new-dataset" onClick={() => void createBlankSheet(runtime, setDatasetId, setMessage)}><FilePlus2 size={15} /> New sheet</Button>
				<div className="peak-sheet-sidebar-foot"><span>Local-first</span><span>AI read/write</span></div>
			</aside>

			<main className="peak-sheet-workspace">
				{busy && <div className="peak-sheet-empty">Loading local sheets…</div>}
				{!busy && (!snapshot || !activeView) && <div className="peak-sheet-empty">Create a sheet to begin.</div>}
				{snapshot && activeView && (
					<>
						<header className="peak-sheet-document-header">
							<div>
								<input className="peak-sheet-title-input" defaultValue={snapshot.name} key={`${snapshot.datasetId}-${snapshot.name}`} onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== snapshot.name && mutate([{ type: 'renameDataset', name: event.target.value.trim() }])} />
								<span>{snapshot.rows.length} rows · {snapshot.fields.length} fields · revision {snapshot.revision}</span>
							</div>
							<div className="peak-sheet-header-actions">
								<Button variant="unstyled" geometry="toolbar-icon" aria-label="Import" onClick={() => importRef.current?.click()}><Upload size={16} /></Button>
								<input ref={importRef} className="peak-sheet-hidden-input" type="file" accept=".csv,.json,.xlsx" onChange={(event) => void handleImport(event, runtime, setDatasetId, setPendingWorkbook, setSelectedWorksheetIndexes, setMessage)} />
								<Button variant="unstyled" geometry="toolbar-icon" aria-label="Export JSON" onClick={() => exportSnapshot(snapshot)}><Download size={16} /></Button>
								<Button variant="unstyled" geometry="toolbar-icon" aria-label="Delete sheet" onClick={() => setPendingDelete(true)}><Trash2 size={16} /></Button>
							</div>
						</header>

						<div className="peak-sheet-view-tabs">
							{snapshot.views.map((view) => <Button key={view.id} variant="unstyled" className={view.id === activeView.id ? 'is-active' : ''} onClick={() => setViewId(view.id)}>{view.name}<span>{view.type}</span></Button>)}
							<Button variant="unstyled" geometry="toolbar-icon" aria-label="Manage views" onClick={() => setFieldsOpen(true)}><Plus size={15} /></Button>
						</div>

						<div className="peak-sheet-toolbar">
							<Button variant="unstyled" geometry="toolbar-icon" aria-label="Undo" disabled={!runtime.canUndo(snapshot.datasetId)} onClick={() => void run(() => runtime.undo(snapshot.datasetId), setMessage)}><Undo2 size={15} /></Button>
							<Button variant="unstyled" geometry="toolbar-icon" aria-label="Redo" disabled={!runtime.canRedo(snapshot.datasetId)} onClick={() => void run(() => runtime.redo(snapshot.datasetId), setMessage)}><Redo2 size={15} /></Button>
							<span className="peak-sheet-toolbar-separator" />
							<Button variant="unstyled" geometry="toolbar" onClick={() => mutate([{ type: 'addRow', row: newRow(snapshot) }])}><Plus size={14} /> Row</Button>
							{selectedRows.size > 0 && <Button variant="unstyled" geometry="toolbar" onClick={() => mutate([...selectedRows].map((rowId) => ({ type: 'deleteRow' as const, rowId })))}><Trash2 size={14} /> Delete {selectedRows.size}</Button>}
							<Button variant="unstyled" geometry="toolbar" className={filterOpen ? 'is-active' : ''} onClick={() => setFilterOpen((value) => !value)}><Filter size={14} /> Filter</Button>
							<ViewControls snapshot={snapshot} view={activeView} onMutate={mutate} />
							<Button variant="unstyled" geometry="toolbar" onClick={() => setFieldsOpen((value) => !value)}><Columns3 size={14} /> Fields</Button>
							<span className="peak-sheet-toolbar-spacer" />
							<span className="peak-sheet-save-state">Saved locally</span>
						</div>
						{filterOpen && <FilterEditor snapshot={snapshot} view={activeView} onMutate={mutate} onClose={() => setFilterOpen(false)} />}

						<div className="peak-sheet-content-row">
							<section className="peak-sheet-content">
								{activeView.type === 'table' && <PeakSheetTable snapshot={snapshot} view={activeView} selectedRows={selectedRows} selectedCells={selectedCells} onSelectRows={setSelectedRows} onSelectCells={setSelectedCells} onSetCell={setCell} onCopyExternalFile={(file) => copyExternalAttachment(attachmentPort, file, setMessage)} onCopyRow={(row) => mutate([{ type: 'addRow', row: copyRow(row), index: snapshot.rows.findIndex((candidate) => candidate.id === row.id) + 1 }])} onDeleteRow={(rowId) => mutate([{ type: 'deleteRow', rowId }])} onPasteCells={mutate} onClipboardError={setMessage} />}
								{activeView.type === 'chart' && <PeakSheetChart snapshot={snapshot} view={activeView} />}
								{activeView.type === 'board' && <PeakSheetBoard snapshot={snapshot} view={activeView} onSetCell={setCell} />}
								{activeView.type === 'calendar' && <PeakSheetCalendar snapshot={snapshot} view={activeView} onSetCell={setCell} onAddRow={(date) => mutate([{ type: 'addRow', row: newCalendarRow(snapshot, activeView.dateFieldId, activeView.titleFieldId, date) }])} />}
							</section>
							{fieldsOpen && <PeakSheetFieldPanel snapshot={snapshot} activeView={activeView} onMutate={mutate} onClose={() => setFieldsOpen(false)} onSelectView={setViewId} />}
						</div>
					</>
				)}
				{message && <div className="peak-sheet-message"><span>{message}</span><Button variant="unstyled" size="xs" aria-label="Dismiss message" onClick={() => setMessage(null)}><X size={14} /></Button></div>}
			</main>

			{pendingDelete && snapshot && (
				<div className="peak-sheet-dialog-backdrop">
					<div className="peak-sheet-dialog" role="dialog" aria-modal="true" aria-label="Delete sheet">
						<span className="peak-sheet-dialog-title">Delete “{snapshot.name}”?</span>
						<span>The data stays recoverable in the local event history, but disappears from Peak Sheet.</span>
						<div><Button variant="outline" onClick={() => setPendingDelete(false)}>Cancel</Button><Button variant="destructive" onClick={() => { setPendingDelete(false); mutate([{ type: 'setDatasetDeleted', deletedAt: new Date().toISOString() }]); }}>Delete</Button></div>
					</div>
				</div>
			)}
			{pendingWorkbook && (
				<div className="peak-sheet-dialog-backdrop">
					<div className="peak-sheet-dialog peak-sheet-workbook-dialog" role="dialog" aria-modal="true" aria-label="Review Excel workbook import">
						<span className="peak-sheet-dialog-title">Review “{pendingWorkbook.workbookName}”</span>
						<span>Select worksheets to import. Peak Sheet keeps cell values and basic types; workbook presentation features are not copied.</span>
						<div className="peak-sheet-workbook-diagnostics">{pendingWorkbook.diagnostics.map((diagnostic) => <span key={diagnostic}>{diagnostic}</span>)}</div>
						<div className="peak-sheet-workbook-sheets">
							{pendingWorkbook.sheets.map((sheet, index) => (
								<label key={`${sheet.name}-${index}`}>
									<input type="checkbox" checked={selectedWorksheetIndexes.has(index)} onChange={(event) => setSelectedWorksheetIndexes(toggleIndex(selectedWorksheetIndexes, index, event.target.checked))} />
									<span><strong>{sheet.name}</strong><small>{sheet.draft.rows.length} rows · {sheet.draft.fields.length} fields</small>{sheet.compatibility.map((diagnostic) => <small key={diagnostic}>{diagnostic}</small>)}</span>
								</label>
							))}
						</div>
						<div className="peak-sheet-dialog-actions"><Button variant="outline" onClick={() => setPendingWorkbook(null)}>Cancel</Button><Button disabled={selectedWorksheetIndexes.size === 0} onClick={() => void confirmWorkbookImport(runtime, pendingWorkbook, selectedWorksheetIndexes, setPendingWorkbook, setDatasetId, setMessage)}>Import {selectedWorksheetIndexes.size}</Button></div>
					</div>
				</div>
			)}
		</div>
	);
}

function ViewControls({ snapshot, view, onMutate }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetViewDefinition;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
}): React.ReactElement {
	const upsert = (next: PeakSheetViewDefinition) => onMutate([{ type: 'upsertView', view: next }]);
	if (view.type === 'table') {
		return <><label className="peak-sheet-toolbar-select">Sort<select value={view.sorts?.[0]?.fieldId ?? ''} onChange={(event) => upsert({ ...view, sorts: event.target.value ? [{ fieldId: event.target.value, direction: view.sorts?.[0]?.direction ?? 'asc' }] : [] })}><option value="">None</option>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><Button variant="unstyled" geometry="toolbar" disabled={!view.sorts?.length} onClick={() => upsert({ ...view, sorts: view.sorts?.map((sort) => ({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })) })}>{view.sorts?.[0]?.direction === 'desc' ? 'Z–A' : 'A–Z'}</Button><label className="peak-sheet-toolbar-select">Group<select value={view.groupBy ?? ''} onChange={(event) => upsert({ ...view, groupBy: event.target.value || undefined })}><option value="">None</option>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label></>;
	}
	if (view.type === 'chart') {
		return <><label className="peak-sheet-toolbar-select">Type<select value={view.chartType} onChange={(event) => upsert({ ...view, chartType: event.target.value as typeof view.chartType })}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select></label><label className="peak-sheet-toolbar-select">Category<select value={view.categoryFieldId} onChange={(event) => upsert({ ...view, categoryFieldId: event.target.value })}>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="peak-sheet-toolbar-select">Value<select value={view.series[0]?.fieldId} onChange={(event) => upsert({ ...view, series: [{ ...view.series[0], fieldId: event.target.value }] })}>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="peak-sheet-toolbar-select">Aggregate<select value={view.series[0]?.aggregate} onChange={(event) => upsert({ ...view, series: [{ ...view.series[0], aggregate: event.target.value as typeof view.series[number]['aggregate'] }] })}>{['count', 'sum', 'average', 'min', 'max'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></>;
	}
	if (view.type === 'board') return <label className="peak-sheet-toolbar-select">Lanes<select value={view.laneFieldId} onChange={(event) => upsert({ ...view, laneFieldId: event.target.value })}>{snapshot.fields.filter((field) => field.type === 'singleSelect').map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>;
	return <label className="peak-sheet-toolbar-select">Date<select value={view.dateFieldId} onChange={(event) => upsert({ ...view, dateFieldId: event.target.value })}>{snapshot.fields.filter((field) => field.type === 'date').map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>;
}

function FilterEditor({ snapshot, view, onMutate, onClose }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetViewDefinition;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onClose(): void;
}): React.ReactElement {
	const firstRule = view.filters?.rules[0];
	const [fieldId, setFieldId] = useState(firstRule?.fieldId ?? snapshot.fields[0]?.id ?? '');
	const [operator, setOperator] = useState<PeakSheetFilterOperator>(firstRule?.operator ?? 'contains');
	const [value, setValue] = useState(typeof firstRule?.value === 'string' || typeof firstRule?.value === 'number' ? String(firstRule.value) : '');
	return (
		<div className="peak-sheet-filter-editor">
			<select value={fieldId} onChange={(event) => setFieldId(event.target.value)}>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
			<select value={operator} onChange={(event) => setOperator(event.target.value as PeakSheetFilterOperator)}>{FILTER_OPERATORS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
			{!['isEmpty', 'isNotEmpty'].includes(operator) && <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Value" />}
			<Button variant="unstyled" geometry="toolbar" onClick={() => onMutate([{ type: 'upsertView', view: { ...view, filters: { conjunction: 'all', rules: [{ id: firstRule?.id ?? `filter-${crypto.randomUUID()}`, fieldId, operator, value: normalizeFilterValue(value, snapshot, fieldId) }] } } }])}>Apply</Button>
			<Button variant="unstyled" geometry="toolbar" disabled={!view.filters?.rules.length} onClick={() => onMutate([{ type: 'upsertView', view: { ...view, filters: undefined } }])}>Clear</Button>
			<Button variant="unstyled" geometry="toolbar-icon" aria-label="Close filter editor" onClick={onClose}><X size={15} /></Button>
		</div>
	);
}

const FILTER_OPERATORS: readonly PeakSheetFilterOperator[] = ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'before', 'after'];

function normalizeFilterValue(value: string, snapshot: PeakSheetDatasetSnapshot, fieldId: string): PeakSheetCellValue {
	const field = snapshot.fields.find((candidate) => candidate.id === fieldId);
	if (field?.type === 'number') return Number.isFinite(Number(value)) ? Number(value) : null;
	if (field?.type === 'checkbox') return value.toLocaleLowerCase() === 'true';
	return value || null;
}

function newRow(snapshot: PeakSheetDatasetSnapshot): PeakSheetRow {
	return {
		id: `row-${crypto.randomUUID()}`,
		cells: Object.fromEntries(snapshot.fields.filter((field) => !field.formula).map((field) => [field.id, field.type === 'checkbox' ? false : null])),
	};
}

function newCalendarRow(snapshot: PeakSheetDatasetSnapshot, dateFieldId: string, titleFieldId: string, date: string): PeakSheetRow {
	const row = newRow(snapshot);
	return { ...row, cells: { ...row.cells, [dateFieldId]: date, [titleFieldId]: 'New item' } };
}

function copyRow(row: PeakSheetRow): PeakSheetRow {
	return { id: `row-${crypto.randomUUID()}`, cells: { ...row.cells } };
}

async function createBlankSheet(runtime: PeakSheetUiPort, select: (id: string) => void, setMessage: (message: string | null) => void): Promise<void> {
	await run(async () => {
		const created = await runtime.createBlankDataset();
		select(created.datasetId);
	}, setMessage);
}

async function handleImport(
	event: React.ChangeEvent<HTMLInputElement>,
	runtime: PeakSheetUiPort,
	select: (id: string) => void,
	setPendingWorkbook: (workbook: PeakSheetWorkbookDraft | null) => void,
	setSelectedWorksheetIndexes: (indexes: ReadonlySet<number>) => void,
	setMessage: (message: string | null) => void,
): Promise<void> {
	const file = event.target.files?.[0];
	if (!file) return;
	await run(async () => {
		if (file.name.toLocaleLowerCase().endsWith('.xlsx')) {
			const workbook = await runtime.previewXlsx(await file.arrayBuffer(), file.name.replace(/\.xlsx$/i, ''));
			setPendingWorkbook(workbook);
			setSelectedWorksheetIndexes(new Set(workbook.sheets.map((_, index) => index)));
		} else if (file.name.toLocaleLowerCase().endsWith('.json')) {
			select((await runtime.importJson(await file.text(), file.name.replace(/\.json$/i, ''))).datasetId);
		} else {
			select((await runtime.importCsv(await file.text(), file.name.replace(/\.csv$/i, ''))).datasetId);
		}
	}, setMessage);
	event.target.value = '';
}

async function confirmWorkbookImport(
	runtime: PeakSheetUiPort,
	workbook: PeakSheetWorkbookDraft,
	selected: ReadonlySet<number>,
	setPendingWorkbook: (workbook: PeakSheetWorkbookDraft | null) => void,
	select: (id: string) => void,
	setMessage: (message: string | null) => void,
): Promise<void> {
	const created = await run(() => runtime.importWorkbook(workbook, [...selected]), setMessage);
	if (!created) return;
	setPendingWorkbook(null);
	if (created[0]) select(created[0].datasetId);
}

function toggleIndex(current: ReadonlySet<number>, index: number, checked: boolean): ReadonlySet<number> {
	const next = new Set(current);
	if (checked) next.add(index);
	else next.delete(index);
	return next;
}

function exportSnapshot(snapshot: PeakSheetDatasetSnapshot): void {
	const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${snapshot.name.replace(/[^a-z0-9-_]+/gi, '-') || 'peak-sheet'}.json`;
	anchor.click();
	URL.revokeObjectURL(url);
}

async function copyExternalAttachment(
	port: PeakSheetAttachmentPort,
	file: { readonly name: string; readonly type: string; readonly buffer: ArrayBuffer },
	setMessage: (message: string | null) => void,
) {
	try {
		return await port.copyExternalFile({ name: file.name, mediaType: file.type, bytes: new Uint8Array(file.buffer) });
	} catch (error) {
		setMessage(error instanceof Error ? error.message : String(error));
		throw error;
	}
}

function safeDataset(runtime: PeakSheetUiPort, datasetId: string): PeakSheetDatasetSnapshot | null {
	try { return runtime.getDataset(datasetId); } catch { return null; }
}

async function run<T>(operation: () => Promise<T>, setMessage: (message: string | null) => void): Promise<T | undefined> {
	try { return await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return undefined; }
}
