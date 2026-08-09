import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { displayValue, projectPeakSheetRows } from '@/core/sheet';
import type { PeakSheetCalendarViewDefinition, PeakSheetCellValue, PeakSheetDatasetSnapshot, PeakSheetRow } from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';

export function PeakSheetCalendar({ snapshot, view, onSetCell, onAddRow }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetCalendarViewDefinition;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onAddRow(date: string): void;
}): React.ReactElement {
	const initialDate = useMemo(() => firstDatasetDate(snapshot, view) ?? new Date(), [snapshot.datasetId, view.id]);
	const [cursor, setCursor] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
	const cells = calendarCells(cursor);
	const rows = projectPeakSheetRows(snapshot, view.filters);
	const byDay = rowsByDay(rows, view.dateFieldId);
	return (
		<div className="peak-sheet-calendar">
			<div className="peak-sheet-calendar-heading">
				<Button variant="unstyled" geometry="toolbar-icon" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={17} /></Button>
				<span>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
				<Button variant="unstyled" geometry="toolbar-icon" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={17} /></Button>
			</div>
			<div className="peak-sheet-calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
			<div className="peak-sheet-calendar-grid">
				{cells.map((date) => {
					const key = localDateKey(date);
					const events = byDay.get(key) ?? [];
					return (
						<div key={key} className={date.getMonth() === cursor.getMonth() ? 'is-current-month' : 'is-other-month'} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const rowId = event.dataTransfer.getData('text/peak-sheet-calendar-row'); if (rowId) onSetCell(rowId, view.dateFieldId, key); }}>
							<div className="peak-sheet-calendar-day-heading"><Button variant="unstyled" size="xs" aria-label={`Add item on ${key}`} onClick={() => onAddRow(key)}>+</Button><span className="peak-sheet-calendar-day">{date.getDate()}</span></div>
							{events.slice(0, 4).map((row) => <div key={row.id} className="peak-sheet-calendar-event" draggable onDragStart={(event) => event.dataTransfer.setData('text/peak-sheet-calendar-row', row.id)}><input defaultValue={displayValue(row.cells[view.titleFieldId] ?? null) || 'Untitled'} aria-label="Edit calendar item" onBlur={(event) => onSetCell(row.id, view.titleFieldId, event.target.value.trim() || null)} /></div>)}
							{events.length > 4 && <span className="peak-sheet-calendar-more">+{events.length - 4} more</span>}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function firstDatasetDate(snapshot: PeakSheetDatasetSnapshot, view: PeakSheetCalendarViewDefinition): Date | null {
	for (const row of snapshot.rows) {
		const value = row.cells[view.dateFieldId];
		if (typeof value !== 'string') continue;
		const date = new Date(value);
		if (Number.isFinite(date.getTime())) return date;
	}
	return null;
}

function calendarCells(cursor: Date): Date[] {
	const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - cursor.getDay());
	return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function rowsByDay(rows: readonly PeakSheetRow[], fieldId: string): Map<string, PeakSheetRow[]> {
	const result = new Map<string, PeakSheetRow[]>();
	for (const row of rows) {
		const value = row.cells[fieldId];
		if (typeof value !== 'string') continue;
		const date = new Date(value);
		if (!Number.isFinite(date.getTime())) continue;
		const key = localDateKey(date);
		const current = result.get(key) ?? [];
		current.push(row);
		result.set(key, current);
	}
	return result;
}

function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
