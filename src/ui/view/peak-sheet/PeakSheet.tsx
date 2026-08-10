import React, { useEffect, useRef, useState } from 'react';
import {
	BarChart3, Columns3, Download, FileJson2, FileSpreadsheet, Filter,
	Plus, Redo2, Trash2, Undo2, Upload, X,
} from 'lucide-react';

import type { PeakSheetAttachmentPort, PeakSheetUiPort } from '@/core/ports/PeakSheetToolPort';
import type {
	PeakSheetCellValue,
	PeakSheetDatasetSnapshot,
	PeakSheetDatasetSummary,
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

export function PeakSheet({ runtime, datasetId, filePath, attachmentPort, onOpenFile }: {
	readonly runtime: PeakSheetUiPort;
	readonly datasetId: string;
	readonly filePath: string;
	readonly attachmentPort: PeakSheetAttachmentPort;
	onOpenFile(path: string): Promise<void>;
}): React.ReactElement {
	const [, render] = useState(0);
	const [viewId, setViewId] = useState<string | null>(null);
	const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
	const [selectedCells, setSelectedCells] = useState<ReadonlySet<string>>(new Set());
	const [viewsOpen, setViewsOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState(false);
	const [pendingWorkbook, setPendingWorkbook] = useState<PeakSheetWorkbookDraft | null>(null);
	const [selectedWorksheetIndexes, setSelectedWorksheetIndexes] = useState<ReadonlySet<number>>(new Set());
	const [legacyDatasets, setLegacyDatasets] = useState<readonly PeakSheetDatasetSummary[]>([]);
	const importRef = useRef<HTMLInputElement>(null);
	const snapshot = safeDataset(runtime, datasetId);
	const activeView = snapshot?.views.find((view) => view.id === viewId) ?? snapshot?.views[0] ?? null;
	const folderPath = parentPath(filePath);

	useEffect(() => runtime.subscribe(() => render((value) => value + 1)), [runtime]);
	useEffect(() => {
		void runtime.listLegacyDatasets().then(setLegacyDatasets).catch((error) => setMessage(errorMessage(error)));
	}, [runtime]);
	useEffect(() => {
		if (!activeView || activeView.id === viewId) return;
		setViewId(activeView.id);
	}, [activeView?.id, viewId]);
	useEffect(() => {
		setSelectedRows(new Set());
		setSelectedCells(new Set());
	}, [datasetId, viewId]);

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

	if (!snapshot || !activeView) {
		return <div className="peak-sheet-file-error">This Peak Sheet file is unavailable or invalid.</div>;
	}

	return (
		<div className="peak-sheet-root">
			<main className="peak-sheet-workspace">
				<header className="peak-sheet-document-header">
					<div className="peak-sheet-title-block">
						<input
							className="peak-sheet-title-input"
							defaultValue={snapshot.name}
							key={`${snapshot.datasetId}-${snapshot.name}`}
							onBlur={(event) => {
								const title = event.target.value.trim();
								if (!title || title === snapshot.name) return;
								void run(() => runtime.renameFile(snapshot.datasetId, title), setMessage);
							}}
						/>
						<span className="peak-sheet-file-path">{filePath}</span>
					</div>
					<div className="peak-sheet-header-actions">
						<span className="peak-sheet-document-meta">{snapshot.rows.length} rows · {snapshot.fields.length} fields</span>
						<Button variant="unstyled" geometry="toolbar" onClick={() => importRef.current?.click()}><Upload size={15} /> Import</Button>
						<input ref={importRef} className="peak-sheet-hidden-input" type="file" accept=".csv,.json,.xlsx" onChange={(event) => void handleImport(event, runtime, folderPath, onOpenFile, setPendingWorkbook, setSelectedWorksheetIndexes, setMessage)} />
						<div className="peak-sheet-menu-anchor">
							<Button variant="unstyled" geometry="toolbar" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}><Download size={15} /> Export</Button>
							{exportOpen && <ExportMenu snapshot={snapshot} runtime={runtime} onClose={() => setExportOpen(false)} onError={setMessage} />}
						</div>
						<Button variant="unstyled" geometry="toolbar-icon" aria-label="Delete sheet file" onClick={() => setPendingDelete(true)}><Trash2 size={16} /></Button>
					</div>
				</header>

				{legacyDatasets.length > 0 && (
					<div className="peak-sheet-migration-banner">
						<span><strong>{legacyDatasets.length} legacy sheet{legacyDatasets.length === 1 ? '' : 's'}</strong> can be materialized as visible files in this folder.</span>
						<Button variant="unstyled" geometry="toolbar" onClick={() => void migrateLegacy(runtime, legacyDatasets, folderPath, setLegacyDatasets, setMessage)}>Create files</Button>
					</div>
				)}

				<div className="peak-sheet-view-tabs">
					{snapshot.views.map((view) => <Button key={view.id} variant="unstyled" className={view.id === activeView.id ? 'is-active' : ''} onClick={() => setViewId(view.id)}>{view.name}<span>{view.type}</span></Button>)}
					<Button variant="unstyled" geometry="toolbar-icon" aria-label="Manage saved views" onClick={() => setViewsOpen(true)}><Plus size={15} /></Button>
				</div>

				<div className="peak-sheet-toolbar">
					<Button variant="unstyled" geometry="toolbar-icon" aria-label="Undo" disabled={!runtime.canUndo(snapshot.datasetId)} onClick={() => void run(() => runtime.undo(snapshot.datasetId), setMessage)}><Undo2 size={15} /></Button>
					<Button variant="unstyled" geometry="toolbar-icon" aria-label="Redo" disabled={!runtime.canRedo(snapshot.datasetId)} onClick={() => void run(() => runtime.redo(snapshot.datasetId), setMessage)}><Redo2 size={15} /></Button>
					<span className="peak-sheet-toolbar-separator" />
					<Button variant="unstyled" geometry="toolbar" className={filterOpen ? 'is-active' : ''} onClick={() => setFilterOpen((value) => !value)}><Filter size={14} /> Filter</Button>
					<ViewControls snapshot={snapshot} view={activeView} onMutate={mutate} />
					<Button variant="unstyled" geometry="toolbar" onClick={() => setViewsOpen((value) => !value)}><Columns3 size={14} /> Views</Button>
					<span className="peak-sheet-toolbar-spacer" />
					<span className="peak-sheet-save-state">Saved to file · revision {snapshot.revision}</span>
				</div>
				{filterOpen && <FilterEditor snapshot={snapshot} view={activeView} onMutate={mutate} onClose={() => setFilterOpen(false)} />}

				<div className="peak-sheet-content-row">
					<section className="peak-sheet-content">
						{activeView.type === 'table' && <PeakSheetTable snapshot={snapshot} view={activeView} selectedRows={selectedRows} selectedCells={selectedCells} onSelectRows={setSelectedRows} onSelectCells={setSelectedCells} onSetCell={setCell} onCopyExternalFile={(file) => copyExternalAttachment(attachmentPort, file, setMessage)} onCopyRow={(row) => mutate([{ type: 'addRow', row: copyRow(row), index: snapshot.rows.findIndex((candidate) => candidate.id === row.id) + 1 }])} onDeleteRow={(rowId) => mutate([{ type: 'deleteRow', rowId }])} onAddRow={() => mutate([{ type: 'addRow', row: newRow(snapshot) }])} onMutate={mutate} onPasteCells={mutate} onClipboardError={setMessage} />}
						{activeView.type === 'chart' && <PeakSheetChart snapshot={snapshot} view={activeView} />}
						{activeView.type === 'board' && <PeakSheetBoard snapshot={snapshot} view={activeView} onSetCell={setCell} />}
						{activeView.type === 'calendar' && <PeakSheetCalendar snapshot={snapshot} view={activeView} onSetCell={setCell} onAddRow={(date) => mutate([{ type: 'addRow', row: newCalendarRow(snapshot, activeView.dateFieldId, activeView.titleFieldId, date) }])} />}
					</section>
					{viewsOpen && <PeakSheetFieldPanel snapshot={snapshot} activeView={activeView} onMutate={mutate} onClose={() => setViewsOpen(false)} onSelectView={setViewId} />}
				</div>
				{message && <div className="peak-sheet-message"><span>{message}</span><Button variant="unstyled" size="xs" aria-label="Dismiss message" onClick={() => setMessage(null)}><X size={14} /></Button></div>}
			</main>

			{pendingDelete && (
				<div className="peak-sheet-dialog-backdrop">
					<div className="peak-sheet-dialog" role="dialog" aria-modal="true" aria-label="Move Peak Sheet file to trash">
						<span className="peak-sheet-dialog-title">Move “{snapshot.name}.peaksheet” to trash?</span>
						<span>The visible file is removed through Obsidian. Recovery history stays local.</span>
						<div><Button variant="outline" onClick={() => setPendingDelete(false)}>Cancel</Button><Button variant="destructive" onClick={() => void run(async () => { setPendingDelete(false); await runtime.trashFile(snapshot.datasetId); }, setMessage)}>Move to trash</Button></div>
					</div>
				</div>
			)}
			{pendingWorkbook && (
				<WorkbookDialog workbook={pendingWorkbook} selected={selectedWorksheetIndexes} onSelected={setSelectedWorksheetIndexes} onCancel={() => setPendingWorkbook(null)} onConfirm={() => void confirmWorkbookImport(runtime, pendingWorkbook, selectedWorksheetIndexes, folderPath, onOpenFile, setPendingWorkbook, setMessage)} />
			)}
		</div>
	);
}

function ExportMenu({ snapshot, runtime, onClose, onError }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly runtime: PeakSheetUiPort;
	onClose(): void;
	onError(message: string | null): void;
}): React.ReactElement {
	const filename = safeDownloadName(snapshot.name);
	return (
		<div className="peak-sheet-popup-menu" role="menu">
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => { downloadText(`${filename}.csv`, runtime.exportCsv(snapshot.datasetId), 'text/csv;charset=utf-8'); onClose(); }}><FileSpreadsheet size={15} /> CSV <span>values only</span></Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => void run(async () => { downloadBuffer(`${filename}.xlsx`, await runtime.exportXlsx(snapshot.datasetId), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); onClose(); }, onError)}><BarChart3 size={15} /> Excel (.xlsx) <span>typed values</span></Button>
			<Button variant="unstyled" geometry="toolbar-full" onClick={() => { downloadText(`${filename}.peaksheet`, runtime.exportNative(snapshot.datasetId), 'application/json'); onClose(); }}><FileJson2 size={15} /> Peak Sheet <span>portable copy</span></Button>
		</div>
	);
}

function WorkbookDialog({ workbook, selected, onSelected, onCancel, onConfirm }: {
	readonly workbook: PeakSheetWorkbookDraft;
	readonly selected: ReadonlySet<number>;
	onSelected(indexes: ReadonlySet<number>): void;
	onCancel(): void;
	onConfirm(): void;
}): React.ReactElement {
	return (
		<div className="peak-sheet-dialog-backdrop">
			<div className="peak-sheet-dialog peak-sheet-workbook-dialog" role="dialog" aria-modal="true" aria-label="Review Excel workbook import">
				<span className="peak-sheet-dialog-title">Review “{workbook.workbookName}”</span>
				<span>Select worksheets to import. Values and basic field types are preserved; workbook presentation is not copied.</span>
				<div className="peak-sheet-workbook-diagnostics">{workbook.diagnostics.map((diagnostic) => <span key={diagnostic}>{diagnostic}</span>)}</div>
				<div className="peak-sheet-workbook-sheets">
					{workbook.sheets.map((sheet, index) => (
						<label key={`${sheet.name}-${index}`}>
							<input type="checkbox" checked={selected.has(index)} onChange={(event) => onSelected(toggleIndex(selected, index, event.target.checked))} />
							<span><strong>{sheet.name}</strong><small>{sheet.draft.rows.length} rows · {sheet.draft.fields.length} fields</small>{sheet.compatibility.map((diagnostic) => <small key={diagnostic}>{diagnostic}</small>)}</span>
						</label>
					))}
				</div>
				<div className="peak-sheet-dialog-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button disabled={selected.size === 0} onClick={onConfirm}>Import {selected.size}</Button></div>
			</div>
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
		return <><label className="peak-sheet-toolbar-select">Type<select value={view.chartType} onChange={(event) => upsert({ ...view, chartType: event.target.value as typeof view.chartType })}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select></label><label className="peak-sheet-toolbar-select">Category<select value={view.categoryFieldId} onChange={(event) => upsert({ ...view, categoryFieldId: event.target.value })}>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="peak-sheet-toolbar-select">Value<select value={view.series[0]?.fieldId ?? ''} onChange={(event) => upsert({ ...view, series: [{ ...view.series[0], fieldId: event.target.value, aggregate: view.series[0]?.aggregate ?? 'count' }] })}>{snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="peak-sheet-toolbar-select">Aggregate<select value={view.series[0]?.aggregate ?? 'count'} onChange={(event) => upsert({ ...view, series: [{ ...view.series[0], fieldId: view.series[0]?.fieldId ?? snapshot.fields[0].id, aggregate: event.target.value as typeof view.series[number]['aggregate'] }] })}>{['count', 'sum', 'average', 'min', 'max'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></>;
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

async function handleImport(
	event: React.ChangeEvent<HTMLInputElement>,
	runtime: PeakSheetUiPort,
	folderPath: string,
	onOpenFile: (path: string) => Promise<void>,
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
			return;
		}
		const created = file.name.toLocaleLowerCase().endsWith('.json')
			? await runtime.importJson(await file.text(), file.name.replace(/\.json$/i, ''), { folderPath })
			: await runtime.importCsv(await file.text(), file.name.replace(/\.csv$/i, ''), { folderPath });
		const path = runtime.getFilePath(created.datasetId);
		if (path) await onOpenFile(path);
	}, setMessage);
	event.target.value = '';
}

async function confirmWorkbookImport(
	runtime: PeakSheetUiPort,
	workbook: PeakSheetWorkbookDraft,
	selected: ReadonlySet<number>,
	folderPath: string,
	onOpenFile: (path: string) => Promise<void>,
	setPendingWorkbook: (workbook: PeakSheetWorkbookDraft | null) => void,
	setMessage: (message: string | null) => void,
): Promise<void> {
	const created = await run(() => runtime.importWorkbook(workbook, [...selected], { folderPath }), setMessage);
	if (!created) return;
	setPendingWorkbook(null);
	const path = created[0] ? runtime.getFilePath(created[0].datasetId) : null;
	if (path) await onOpenFile(path);
}

async function migrateLegacy(
	runtime: PeakSheetUiPort,
	legacyDatasets: readonly PeakSheetDatasetSummary[],
	folderPath: string,
	setLegacyDatasets: (datasets: readonly PeakSheetDatasetSummary[]) => void,
	setMessage: (message: string | null) => void,
): Promise<void> {
	const migrated = await run(() => runtime.migrateLegacyDatasets({ datasetIds: legacyDatasets.map((dataset) => dataset.datasetId), folderPath }), setMessage);
	if (!migrated) return;
	setLegacyDatasets([]);
	setMessage(`Created ${migrated.length} visible Peak Sheet file${migrated.length === 1 ? '' : 's'}. Legacy data was kept unchanged.`);
}

function toggleIndex(current: ReadonlySet<number>, index: number, checked: boolean): ReadonlySet<number> {
	const next = new Set(current);
	if (checked) next.add(index);
	else next.delete(index);
	return next;
}

function downloadText(filename: string, text: string, mediaType: string): void {
	downloadBlob(filename, new Blob([text], { type: mediaType }));
}

function downloadBuffer(filename: string, buffer: ArrayBuffer, mediaType: string): void {
	downloadBlob(filename, new Blob([buffer], { type: mediaType }));
}

function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
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
		setMessage(errorMessage(error));
		throw error;
	}
}

function safeDataset(runtime: PeakSheetUiPort, datasetId: string): PeakSheetDatasetSnapshot | null {
	try { return runtime.getDataset(datasetId); } catch { return null; }
}

function parentPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index < 0 ? '' : path.slice(0, index);
}

function safeDownloadName(name: string): string {
	return name.replace(/[^a-z0-9-_]+/gi, '-') || 'peak-sheet';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function run<T>(operation: () => Promise<T>, setMessage: (message: string | null) => void): Promise<T | undefined> {
	try { return await operation(); } catch (error) { setMessage(errorMessage(error)); return undefined; }
}
