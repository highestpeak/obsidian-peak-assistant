import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import { displayValue, projectPeakSheetRows } from '@/core/sheet';
import type { PeakSheetCalendarViewDefinition, PeakSheetCellValue, PeakSheetDatasetSnapshot, PeakSheetRow } from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';

export function PeakSheetCalendar({ snapshot, view, onSetCell, onAddRow, onOpenRow }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view?: PeakSheetCalendarViewDefinition;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onAddRow(date: string): void;
	onOpenRow(rowId: string): void;
}): React.ReactElement {
	const initialDate = useMemo(() => view ? firstDatasetDate(snapshot, view) ?? new Date() : new Date(), [snapshot.datasetId, view?.id]);
	const [cursor, setCursor] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
	if (!view) return <div className="peak-sheet-calendar-shell"><div className="peak-sheet-view-empty"><strong>Add a Date field</strong><small>Calendar is a view of the same records, placed by one Date field.</small></div></div>;
	const dateField = snapshot.fields.find((field) => field.id === view.dateFieldId);
	if (!dateField) return <div className="peak-sheet-calendar-shell"><div className="peak-sheet-view-empty"><strong>Date field is unavailable</strong><small>Choose a Date field for this Calendar projection.</small></div></div>;
	const cells = calendarCells(cursor);
	const rows = projectPeakSheetRows(snapshot, view.filters);
	const byDay = rowsByDay(rows, view.dateFieldId);
	const upcoming = [...byDay.values()].flat().slice(0, 8);
	return <div className="peak-sheet-calendar-shell"><div className="peak-sheet-calendar-main"><div className="peak-sheet-calendar-head"><strong>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><span><Button variant="unstyled" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={14} /></Button><Button variant="unstyled" onClick={() => setCursor(new Date())}>Today</Button><Button variant="unstyled" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={14} /></Button><i>Month</i><Button variant="unstyled" onClick={() => onAddRow(localDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1)))}><Plus size={12} />New</Button></span></div><div className="peak-sheet-calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="peak-sheet-calendar-grid">{cells.map((date) => {
		const key = localDateKey(date); const events = byDay.get(key) ?? [];
		return <div key={key} className={date.getMonth() === cursor.getMonth() ? '' : 'is-outside'} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const rowId = event.dataTransfer.getData('text/peak-sheet-calendar-row'); if (rowId) onSetCell(rowId, view.dateFieldId, key); }}><span>{date.getDate()}</span>{events.slice(0, 3).map((row) => <Button key={row.id} variant="unstyled" className="peak-sheet-calendar-event" draggable onDragStart={(event) => event.dataTransfer.setData('text/peak-sheet-calendar-row', row.id)} onClick={() => onOpenRow(row.id)}>{displayValue(row.cells[view.titleFieldId] ?? null) || 'Untitled'}</Button>)}{events.length > 3 && <small className="peak-sheet-calendar-more">+{events.length - 3} more</small>}</div>;
	})}</div></div><div className="peak-sheet-agenda"><div><strong>Upcoming</strong><small>{dateField.name}</small></div>{upcoming.length ? upcoming.map((row) => <Button key={row.id} variant="unstyled" onClick={() => onOpenRow(row.id)}><small>{displayValue(row.cells[view.dateFieldId] ?? null)}</small><span>{displayValue(row.cells[view.titleFieldId] ?? null) || 'Untitled'}</span></Button>) : <span className="peak-sheet-agenda-empty">No records in this month</span>}</div></div>;
}

function firstDatasetDate(snapshot: PeakSheetDatasetSnapshot, view: PeakSheetCalendarViewDefinition): Date | null { for (const row of snapshot.rows) { const value = row.cells[view.dateFieldId]; if (typeof value !== 'string') continue; const date = new Date(value); if (Number.isFinite(date.getTime())) return date; } return null; }
function calendarCells(cursor: Date): Date[] { const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay()); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
function rowsByDay(rows: readonly PeakSheetRow[], fieldId: string): Map<string, PeakSheetRow[]> { const result = new Map<string, PeakSheetRow[]>(); for (const row of rows) { const value = row.cells[fieldId]; if (typeof value !== 'string') continue; const date = new Date(value); if (!Number.isFinite(date.getTime())) continue; const key = localDateKey(date); const current = result.get(key) ?? []; current.push(row); result.set(key, current); } return result; }
function localDateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
