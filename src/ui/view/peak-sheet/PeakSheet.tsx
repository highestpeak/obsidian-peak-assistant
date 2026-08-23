import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, CalendarDays, Code2, Columns3, Download, Filter, Grid2X2, ListTree, MoreHorizontal, Plus, Redo2, Search, Share2, Sparkles, Table2, Trash2, Undo2, Upload, X } from 'lucide-react';

import { displayValue, projectPeakSheetRows, stableSortRows } from '@/core/sheet';
import type { PeakSheetAttachmentPort, PeakSheetUiPort } from '@/core/ports/PeakSheetToolPort';
import type { PeakSheetBoardViewDefinition, PeakSheetCalendarViewDefinition, PeakSheetCellValue, PeakSheetDatasetSnapshot, PeakSheetPatchOperation, PeakSheetRow, PeakSheetTableViewDefinition, PeakSheetWorkbookDraft } from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';
import { PeakSheetAiDrawer } from './PeakSheetAiDrawer';
import { PeakSheetBoard } from './PeakSheetBoard';
import { PeakSheetCalendar } from './PeakSheetCalendar';
import { blankPeakSheetRow, buildPeakSheetMaterializeOperations, INITIAL_PEAK_SHEET_GRID_STATE, peakSheetGridBounds, peakSheetRangeLabel } from './PeakSheetGridState';
import type { PeakSheetGridState } from './PeakSheetGridState';
import { PeakSheetRulePopover } from './PeakSheetRulePopover';
import type { PeakSheetRuleKind } from './PeakSheetRulePopover';
import { PeakSheetScriptsDrawer } from './PeakSheetScriptsDrawer';
import { PeakSheetTable, selectedGridValues } from './PeakSheetTable';

type ViewMode = 'table' | 'board' | 'calendar';
type Overlay = 'ai' | 'scripts' | 'filter' | 'sort' | 'group' | 'fields' | 'more' | 'peakshare' | null;

export function PeakSheet({ runtime, datasetId, filePath, attachmentPort: _attachmentPort, onOpenFile }: {
	readonly runtime: PeakSheetUiPort;
	readonly datasetId: string;
	readonly filePath: string;
	readonly attachmentPort: PeakSheetAttachmentPort;
	onOpenFile(path: string): Promise<void>;
}): React.ReactElement {
	const [, render] = useState(0);
	const [viewMode, setViewMode] = useState<ViewMode>('table');
	const [overlay, setOverlay] = useState<Overlay>(null);
	const [ruleInitialField, setRuleInitialField] = useState<string>();
	const [gridState, setGridState] = useState<PeakSheetGridState>(INITIAL_PEAK_SHEET_GRID_STATE);
	const [search, setSearch] = useState('');
	const [message, setMessage] = useState<string | null>(null);
	const [formulaFocused, setFormulaFocused] = useState(false);
	const [formulaDraft, setFormulaDraft] = useState('');
	const [aiInitialPrompt, setAiInitialPrompt] = useState<string>();
	const [projectionTarget, setProjectionTarget] = useState<string | null>(null);
	const [pendingWorkbook, setPendingWorkbook] = useState<PeakSheetWorkbookDraft | null>(null);
	const [selectedWorksheetIndexes, setSelectedWorksheetIndexes] = useState<ReadonlySet<number>>(new Set());
	const importRef = useRef<HTMLInputElement>(null);
	const snapshot = safeDataset(runtime, datasetId);
	const folderPath = parentPath(filePath);
	const tableView = snapshot ? referenceTableView(snapshot) : null;
	const boardView = snapshot ? referenceBoardView(snapshot) : undefined;
	const calendarView = snapshot ? referenceCalendarView(snapshot) : undefined;
	const orderedRows = snapshot && tableView ? stableSortRows(projectPeakSheetRows(snapshot, tableView.filters), snapshot.fields, tableView.sorts ?? []) : [];
	const visibleRows = orderedRows.filter((row) => !search || Object.values(row.cells).some((value) => displayValue(value ?? null).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
	const visibleFields = snapshot?.fields.filter((field) => !field.hidden && !tableView?.hiddenFieldIds?.includes(field.id)) ?? [];
	const bounds = peakSheetGridBounds(gridState);
	const rangeLabel = peakSheetRangeLabel(bounds);
	const selectedCount = (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1);
	const selectedRowIds = visibleRows.slice(bounds.top, bounds.bottom + 1).map((row) => row.id);
	const activeRow = visibleRows[gridState.focusRow];
	const activeField = visibleFields[gridState.focusField];
	const activeValue = activeRow && activeField ? activeRow.cells[activeField.id] ?? null : null;

	useEffect(() => runtime.subscribe(() => render((value) => value + 1)), [runtime]);
	useEffect(() => { setGridState(INITIAL_PEAK_SHEET_GRID_STATE); setSearch(''); setOverlay(null); }, [datasetId]);
	useEffect(() => {
		const close = (event: PointerEvent) => { if (!overlay) return; const target = event.target as HTMLElement; if (target.closest('.peak-sheet-overlay-surface, .peak-sheet-popover, [data-peak-overlay-trigger]')) return; setOverlay(null); };
		const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && overlay) setOverlay(null); };
		document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
		return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
	}, [overlay]);
	useEffect(() => setFormulaDraft(activeField?.formula ?? displayValue(activeValue)), [activeRow?.id, activeField?.id, activeValue, activeField?.formula]);

	if (!snapshot || !tableView) return <div className="peak-sheet-file-error">This Peak Sheet file is unavailable or invalid.</div>;
	const selected = selectedGridValues(visibleFields, visibleRows, gridState);

	const mutate = (operations: readonly PeakSheetPatchOperation[]) => {
		if (!operations.length) return;
		setMessage(null);
		void run(() => runtime.mutate(snapshot.datasetId, operations), setMessage);
	};
	const setCell = (rowId: string, fieldId: string, value: PeakSheetCellValue) => mutate([{ type: 'setCell', rowId, fieldId, value }]);
	const openRule = (kind: PeakSheetRuleKind, fieldId?: string) => { setRuleInitialField(fieldId); setOverlay(kind); };
	const openSourceRow = (rowId: string) => {
		if (tableView.filters?.rules.length) mutate([{ type: 'upsertView', view: { ...tableView, filters: undefined } }]);
		setSearch(''); setProjectionTarget(rowId); setViewMode('table'); setOverlay(null);
	};
	const commitFormula = () => {
		if (activeField?.formula) {
			const formula = formulaDraft.trim();
			if (formula && formula !== activeField.formula) mutate([{ type: 'setFieldFormula', fieldId: activeField.id, formula }]);
			return;
		}
		const materializeFieldIndex = activeField ? snapshot.fields.findIndex((field) => field.id === activeField.id) : snapshot.fields.length + Math.max(0, gridState.focusField - visibleFields.length);
		mutate(buildPeakSheetMaterializeOperations(snapshot, gridState.focusRow, materializeFieldIndex, formulaDraft, activeRow?.id));
	};

	return <div className="peak-sheet-root">
		<div className="peak-sheet-document-head"><div className="peak-sheet-document-identity"><span>{folderPath || 'Vault'} <i>/</i> <strong>{snapshot.name}.peaksheet</strong></span><span><Table2 size={17} /><input key={`${snapshot.datasetId}-${snapshot.name}`} defaultValue={snapshot.name} aria-label="Sheet title" onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== snapshot.name) void run(() => runtime.renameFile(snapshot.datasetId, title), setMessage); }} /></span></div><Button variant="unstyled" className="peak-sheet-share-button" data-peak-overlay-trigger aria-expanded={overlay === 'peakshare'} onClick={() => setOverlay((current) => current === 'peakshare' ? null : 'peakshare')}><Share2 size={13} />Share via PeakShare</Button></div>
		<div className="peak-sheet-view-tabs"><ViewTab mode="table" current={viewMode} onSelect={setViewMode}><Table2 size={13} />Table</ViewTab><ViewTab mode="board" current={viewMode} onSelect={setViewMode}><Grid2X2 size={13} />Board</ViewTab><ViewTab mode="calendar" current={viewMode} onSelect={setViewMode}><CalendarDays size={13} />Calendar</ViewTab><span className="peak-sheet-view-divider" /><Button variant="unstyled" className="peak-sheet-scripts-button" data-peak-overlay-trigger aria-expanded={overlay === 'scripts'} onClick={() => setOverlay((current) => current === 'scripts' ? null : 'scripts')}><Code2 size={13} />Scripts<span>{snapshot.scripts?.length ?? 0}</span></Button><small>Local dataset · 3 live views</small></div>
		<div className="peak-sheet-data-toolbar"><div className="peak-sheet-toolbar-primary"><span className="peak-sheet-history-controls"><Button variant="unstyled" aria-label="Undo" disabled={!runtime.canUndo(snapshot.datasetId)} onClick={() => void run(() => runtime.undo(snapshot.datasetId), setMessage)}><Undo2 size={14} /></Button><Button variant="unstyled" aria-label="Redo" disabled={!runtime.canRedo(snapshot.datasetId)} onClick={() => void run(() => runtime.redo(snapshot.datasetId), setMessage)}><Redo2 size={14} /></Button></span><label className="peak-sheet-table-search"><Search size={12} /><input type="search" placeholder="Search this view" value={search} onChange={(event) => setSearch(event.target.value)} /><small>{orderedRows.filter((row) => !search || Object.values(row.cells).some((value) => displayValue(value ?? null).toLocaleLowerCase().includes(search.toLocaleLowerCase()))).length}</small></label><span className="peak-sheet-toolbar-operations"><ToolButton active={Boolean(tableView.filters?.rules.length)} onClick={() => openRule('filter')}><Filter size={13} />Filter</ToolButton><ToolButton active={Boolean(tableView.sorts?.length)} onClick={() => openRule('sort')}><ArrowDownAZ size={13} />Sort</ToolButton><ToolButton active={Boolean(tableView.groupByFields?.length || tableView.groupBy)} onClick={() => openRule('group')}><ListTree size={13} />Group</ToolButton><ToolButton active={overlay === 'fields'} onClick={() => setOverlay((current) => current === 'fields' ? null : 'fields')}><Columns3 size={13} />Fields</ToolButton></span></div><div className="peak-sheet-toolbar-actions"><Button variant="unstyled" className="peak-sheet-new-button" onClick={() => mutate([{ type: 'addRow', row: newReferenceRow(snapshot, viewMode === 'calendar' ? calendarView?.dateFieldId : undefined) }])}><Plus size={13} />New</Button><Button variant="unstyled" className="peak-sheet-ask-button" data-peak-overlay-trigger aria-expanded={overlay === 'ai'} onClick={() => setOverlay((current) => current === 'ai' ? null : 'ai')}><Sparkles size={13} />Ask AI</Button><Button variant="unstyled" data-peak-overlay-trigger aria-label="More sheet actions" onClick={() => setOverlay((current) => current === 'more' ? null : 'more')}><MoreHorizontal size={14} /></Button></div>
			{overlay === 'filter' || overlay === 'sort' || overlay === 'group' ? <PeakSheetRulePopover kind={overlay} snapshot={snapshot} view={tableView} initialFieldId={ruleInitialField} onMutate={mutate} onClose={() => setOverlay(null)} /> : null}
			{overlay === 'fields' && <FieldsPopover snapshot={snapshot} view={tableView} onMutate={mutate} onClose={() => setOverlay(null)} />}
			{overlay === 'more' && <MoreMenu onImport={() => importRef.current?.click()} onExportCsv={() => downloadText(`${safeDownloadName(snapshot.name)}.csv`, runtime.exportCsv(snapshot.datasetId), 'text/csv;charset=utf-8')} onExportXlsx={() => void run(async () => downloadBuffer(`${safeDownloadName(snapshot.name)}.xlsx`, await runtime.exportXlsx(snapshot.datasetId), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), setMessage)} onExportNative={() => downloadText(`${safeDownloadName(snapshot.name)}.peaksheet`, runtime.exportNative(snapshot.datasetId), 'application/json')} onDelete={() => void run(() => runtime.trashFile(snapshot.datasetId), setMessage)} />}
			<input ref={importRef} className="peak-sheet-hidden-input" type="file" accept=".csv,.json,.xlsx" onChange={(event) => void handleImport(event, runtime, folderPath, onOpenFile, setPendingWorkbook, setSelectedWorksheetIndexes, setMessage)} />
		</div>
		<div className="peak-sheet-formula-bar"><span>{rangeLabel}</span><strong>ƒx</strong><span className="peak-sheet-formula-entry"><input value={formulaDraft} aria-label="Formula or cell value" onFocus={() => setFormulaFocused(true)} onBlur={() => { setFormulaFocused(false); commitFormula(); }} onChange={(event) => setFormulaDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && event.metaKey) { event.preventDefault(); setAiInitialPrompt('Add a Days left formula column for unfinished tasks'); setOverlay('ai'); return; } if (event.key === 'Enter') { event.preventDefault(); commitFormula(); } }} />{formulaFocused && formulaDraft.trim() && <span className="peak-sheet-formula-shortcut"><span><kbd>Command</kbd><i>+</i><kbd>Return</kbd></span>Generate formula</span>}</span></div>
		<div className="peak-sheet-view-stage">{viewMode === 'table' && <PeakSheetTable snapshot={snapshot} view={tableView} gridState={gridState} search={search} projectionTargetRowId={projectionTarget} onGridState={setGridState} onMutate={mutate} onOpenFilter={(fieldId) => openRule('filter', fieldId)} onOpenSort={(fieldId) => openRule('sort', fieldId)} onProjectionHandled={() => setProjectionTarget(null)} onMessage={setMessage} />}{viewMode === 'board' && <PeakSheetBoard snapshot={snapshot} view={boardView} onSetCell={setCell} onOpenRow={openSourceRow} />}{viewMode === 'calendar' && <PeakSheetCalendar snapshot={snapshot} view={calendarView} onSetCell={setCell} onAddRow={(date) => mutate([{ type: 'addRow', row: newReferenceRow(snapshot, calendarView?.dateFieldId, date) }])} onOpenRow={openSourceRow} />}</div>
		<div className="peak-sheet-status-bar"><span><i />{rangeLabel} · {selectedCount} {selectedCount === 1 ? 'cell' : 'cells'} selected{selected.stats.count ? ` · ${selected.stats.count} values` : ''}{selected.stats.numericCount > 1 ? ` · Sum ${selected.stats.sum} · Avg ${selected.stats.average?.toFixed(1)}` : ''}</span><span>Type to edit · Drag · Shift + arrow · ⌘C/V/X</span><span>{filePath}</span><span>JSON canonical</span><span>revision <strong>{snapshot.revision}</strong></span></div>

		{overlay === 'ai' && <div className="peak-sheet-overlay-surface"><PeakSheetAiDrawer runtime={runtime} snapshot={snapshot} gridState={gridState} initialPrompt={aiInitialPrompt} onInitialPromptConsumed={() => setAiInitialPrompt(undefined)} onClose={() => setOverlay(null)} onMutate={mutate} /></div>}
		{overlay === 'scripts' && <div className="peak-sheet-overlay-surface"><PeakSheetScriptsDrawer runtime={runtime} snapshot={snapshot} selectedCellCount={selectedCount} selectedRowIds={selectedRowIds} viewRowIds={visibleRows.map((row) => row.id)} onClose={() => setOverlay(null)} onMutate={mutate} /></div>}
		{overlay === 'peakshare' && <PeakShareDialog onClose={() => setOverlay(null)} />}
		{message && <div className="peak-sheet-message"><span>{message}</span><Button variant="unstyled" aria-label="Dismiss message" onClick={() => setMessage(null)}><X size={14} /></Button></div>}
		{pendingWorkbook && <WorkbookDialog workbook={pendingWorkbook} selected={selectedWorksheetIndexes} onSelected={setSelectedWorksheetIndexes} onCancel={() => setPendingWorkbook(null)} onConfirm={() => void confirmWorkbookImport(runtime, pendingWorkbook, selectedWorksheetIndexes, folderPath, onOpenFile, setPendingWorkbook, setMessage)} />}
	</div>;
}

function ViewTab({ mode, current, onSelect, children }: { readonly mode: ViewMode; readonly current: ViewMode; onSelect(mode: ViewMode): void; readonly children: React.ReactNode }): React.ReactElement { return <Button variant="unstyled" className={mode === current ? 'peak-sheet-view-tab is-active' : 'peak-sheet-view-tab'} onClick={() => onSelect(mode)}>{children}</Button>; }
function ToolButton({ active, onClick, children }: { readonly active: boolean; onClick(): void; readonly children: React.ReactNode }): React.ReactElement { return <Button variant="unstyled" data-peak-overlay-trigger className={active ? 'peak-sheet-tool-button is-active' : 'peak-sheet-tool-button'} onClick={onClick}>{children}</Button>; }

function referenceTableView(snapshot: PeakSheetDatasetSnapshot): PeakSheetTableViewDefinition { return snapshot.views.find((view): view is PeakSheetTableViewDefinition => view.type === 'table') ?? { id: 'table-main', name: 'Table', type: 'table' }; }
function referenceBoardView(snapshot: PeakSheetDatasetSnapshot): PeakSheetBoardViewDefinition | undefined { const saved = snapshot.views.find((view): view is PeakSheetBoardViewDefinition => view.type === 'board'); if (saved) return saved; const lane = snapshot.fields.find((field) => field.type === 'singleSelect' && /status/i.test(field.name)) ?? snapshot.fields.find((field) => field.type === 'singleSelect'); const title = snapshot.fields.find((field) => field.type === 'text'); return lane && title ? { id: 'board-projection', name: 'Board', type: 'board', laneFieldId: lane.id, titleFieldId: title.id, cardFieldIds: snapshot.fields.filter((field) => ['text', 'date'].includes(field.type) && field.id !== title.id).slice(0, 2).map((field) => field.id) } : undefined; }
function referenceCalendarView(snapshot: PeakSheetDatasetSnapshot): PeakSheetCalendarViewDefinition | undefined { const saved = snapshot.views.find((view): view is PeakSheetCalendarViewDefinition => view.type === 'calendar'); if (saved) return saved; const date = snapshot.fields.find((field) => field.type === 'date'); const title = snapshot.fields.find((field) => field.type === 'text'); return date && title ? { id: 'calendar-projection', name: 'Calendar', type: 'calendar', dateFieldId: date.id, titleFieldId: title.id } : undefined; }
function newReferenceRow(snapshot: PeakSheetDatasetSnapshot, dateFieldId?: string, date?: string): PeakSheetRow { const row = blankPeakSheetRow(snapshot.fields); const title = snapshot.fields.find((field) => field.type === 'text'); const status = snapshot.fields.find((field) => /status/i.test(field.name) && field.type === 'singleSelect'); return { ...row, cells: { ...row.cells, ...(title ? { [title.id]: 'Untitled record' } : {}), ...(status && status.options?.some((option) => option.id === 'Todo') ? { [status.id]: 'Todo' } : {}), ...(dateFieldId ? { [dateFieldId]: date ?? new Date().toISOString().slice(0, 10) } : {}) } }; }

function FieldsPopover({ snapshot, view, onMutate, onClose }: { readonly snapshot: PeakSheetDatasetSnapshot; readonly view: PeakSheetTableViewDefinition; onMutate(operations: readonly PeakSheetPatchOperation[]): void; onClose(): void }): React.ReactElement { const hidden = new Set(view.hiddenFieldIds ?? []); return <div className="peak-sheet-popover peak-sheet-fields-popover"><div className="peak-sheet-popover-head"><span><strong>Fields</strong><small>Show or hide columns in this view</small></span><Button variant="unstyled" aria-label="Close Fields" onClick={onClose}><X size={13} /></Button></div>{snapshot.fields.length ? snapshot.fields.map((field) => <label key={field.id}><input type="checkbox" checked={!hidden.has(field.id)} onChange={(event) => { const next = new Set(hidden); if (event.target.checked) next.delete(field.id); else next.add(field.id); onMutate([{ type: 'upsertView', view: { ...view, hiddenFieldIds: [...next] } }]); }} /><span>{field.name}</span><small>{field.type}</small></label>) : <span className="peak-sheet-rule-empty">No materialized fields yet.</span>}</div>; }
function MoreMenu({ onImport, onExportCsv, onExportXlsx, onExportNative, onDelete }: { onImport(): void; onExportCsv(): void; onExportXlsx(): void; onExportNative(): void; onDelete(): void }): React.ReactElement { return <div className="peak-sheet-popover peak-sheet-more-menu"><Button variant="unstyled" onClick={onImport}><Upload size={13} />Import CSV / XLSX</Button><Button variant="unstyled" onClick={onExportCsv}><Download size={13} />Export CSV</Button><Button variant="unstyled" onClick={onExportXlsx}><Download size={13} />Export XLSX</Button><Button variant="unstyled" onClick={onExportNative}><Download size={13} />Export .peaksheet</Button><span className="peak-sheet-menu-separator" /><Button variant="unstyled" className="is-destructive" onClick={onDelete}><Trash2 size={13} />Move file to trash</Button></div>; }
function PeakShareDialog({ onClose }: { onClose(): void }): React.ReactElement { return <div className="peak-sheet-peakshare-backdrop"><div className="peak-sheet-peakshare-card" role="dialog" aria-modal="true"><div><span><Share2 size={14} /></span><span><strong>Share via PeakShare</strong><small>Optional cloud layer</small></span><Button variant="unstyled" aria-label="Close PeakShare" onClick={onClose}><X size={14} /></Button></div><span className="peak-sheet-peakshare-boundary"><i /><span><strong>Your .peaksheet is still local.</strong><small>Nothing uploads until you confirm the next step.</small></span></span><ol><li><span>1</span>Upload a versioned copy</li><li><span>2</span>Create sharing and permissions</li><li><span>3</span>Optionally enable collaboration, Cloud Scripts, or schedules</li></ol><div><Button variant="unstyled" onClick={onClose}>Stay local</Button><Button variant="unstyled" disabled title="PeakShare cloud handoff is not configured in this build">Continue to PeakShare</Button></div></div></div>; }

function WorkbookDialog({ workbook, selected, onSelected, onCancel, onConfirm }: { readonly workbook: PeakSheetWorkbookDraft; readonly selected: ReadonlySet<number>; onSelected(indexes: ReadonlySet<number>): void; onCancel(): void; onConfirm(): void }): React.ReactElement { return <div className="peak-sheet-dialog-backdrop"><div className="peak-sheet-dialog peak-sheet-workbook-dialog" role="dialog" aria-modal="true"><strong>Review “{workbook.workbookName}”</strong><span>Select worksheets to import. Values and basic field types are preserved.</span><div>{workbook.sheets.map((sheet, index) => <label key={`${sheet.name}-${index}`}><input type="checkbox" checked={selected.has(index)} onChange={(event) => onSelected(toggleIndex(selected, index, event.target.checked))} /><span><strong>{sheet.name}</strong><small>{sheet.draft.rows.length} rows · {sheet.draft.fields.length} fields</small></span></label>)}</div><span><Button variant="unstyled" onClick={onCancel}>Cancel</Button><Button variant="unstyled" disabled={!selected.size} onClick={onConfirm}>Import {selected.size}</Button></span></div></div>; }

async function handleImport(event: React.ChangeEvent<HTMLInputElement>, runtime: PeakSheetUiPort, folderPath: string, onOpenFile: (path: string) => Promise<void>, setPendingWorkbook: (workbook: PeakSheetWorkbookDraft | null) => void, setSelected: (indexes: ReadonlySet<number>) => void, setMessage: (message: string | null) => void): Promise<void> { const file = event.target.files?.[0]; if (!file) return; await run(async () => { if (file.name.toLocaleLowerCase().endsWith('.xlsx')) { const workbook = await runtime.previewXlsx(await file.arrayBuffer(), file.name.replace(/\.xlsx$/i, '')); setPendingWorkbook(workbook); setSelected(new Set(workbook.sheets.map((_, index) => index))); return; } const created = file.name.toLocaleLowerCase().endsWith('.json') ? await runtime.importJson(await file.text(), file.name.replace(/\.json$/i, ''), { folderPath }) : await runtime.importCsv(await file.text(), file.name.replace(/\.csv$/i, ''), { folderPath }); const path = runtime.getFilePath(created.datasetId); if (path) await onOpenFile(path); }, setMessage); event.target.value = ''; }
async function confirmWorkbookImport(runtime: PeakSheetUiPort, workbook: PeakSheetWorkbookDraft, selected: ReadonlySet<number>, folderPath: string, onOpenFile: (path: string) => Promise<void>, setPending: (workbook: PeakSheetWorkbookDraft | null) => void, setMessage: (message: string | null) => void): Promise<void> { const created = await run(() => runtime.importWorkbook(workbook, [...selected], { folderPath }), setMessage); if (!created) return; setPending(null); const path = created[0] ? runtime.getFilePath(created[0].datasetId) : null; if (path) await onOpenFile(path); }
function toggleIndex(current: ReadonlySet<number>, index: number, checked: boolean): ReadonlySet<number> { const next = new Set(current); if (checked) next.add(index); else next.delete(index); return next; }
function safeDataset(runtime: PeakSheetUiPort, datasetId: string): PeakSheetDatasetSnapshot | null { try { return runtime.getDataset(datasetId); } catch { return null; } }
function parentPath(path: string): string { const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index); }
function safeDownloadName(name: string): string { return name.replace(/[^a-z0-9-_]+/gi, '-') || 'peak-sheet'; }
function downloadText(filename: string, text: string, mediaType: string): void { downloadBlob(filename, new Blob([text], { type: mediaType })); }
function downloadBuffer(filename: string, buffer: ArrayBuffer, mediaType: string): void { downloadBlob(filename, new Blob([buffer], { type: mediaType })); }
function downloadBlob(filename: string, blob: Blob): void { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
async function run<T>(operation: () => Promise<T>, setMessage: (message: string | null) => void): Promise<T | undefined> { try { return await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return undefined; } }
