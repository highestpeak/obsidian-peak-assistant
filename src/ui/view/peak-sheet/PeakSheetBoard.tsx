import React, { useState } from 'react';

import { displayValue, projectPeakSheetRows, stableSortRows } from '@/core/sheet';
import type { PeakSheetBoardViewDefinition, PeakSheetCellValue, PeakSheetDatasetSnapshot } from '@/core/sheet';

export function PeakSheetBoard({ snapshot, view, onSetCell, onOpenRow }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view?: PeakSheetBoardViewDefinition;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
	onOpenRow(rowId: string): void;
}): React.ReactElement {
	const [dragging, setDragging] = useState<string | null>(null);
	const [target, setTarget] = useState<string | null>(null);
	if (!view) return <div className="peak-sheet-board-shell"><div className="peak-sheet-view-empty"><strong>Add a Status field</strong><small>Board is a view of the same records, grouped by one Single Select field.</small></div></div>;
	const laneField = snapshot.fields.find((field) => field.id === view.laneFieldId);
	if (!laneField) return <div className="peak-sheet-board-shell"><div className="peak-sheet-view-empty"><strong>Status field is unavailable</strong><small>Choose a Single Select field for this Board projection.</small></div></div>;
	const rows = stableSortRows(projectPeakSheetRows(snapshot, view.filters), snapshot.fields, view.sorts ?? []);
	const options = laneField.options?.map((option) => ({ id: option.id, label: option.label })).filter((option) => option.label !== 'Backlog') ?? uniqueLanes(snapshot, laneField.id);
	const lanes = options.length ? options : [{ id: 'Todo', label: 'Todo' }, { id: 'Doing', label: 'Doing' }, { id: 'Blocked', label: 'Blocked' }, { id: 'Done', label: 'Done' }];
	return <div className="peak-sheet-board-shell" aria-label={`Status board for ${snapshot.name}`}>{lanes.map((lane) => {
		const laneRows = rows.filter((row) => String(row.cells[laneField.id] ?? '') === lane.id);
		return <div className="peak-sheet-board-lane" key={lane.id}><div className="peak-sheet-board-lane-head"><span><strong>{lane.label}</strong><small>{laneField.name}</small></span><span>{laneRows.length}</span></div><div className={target === lane.id ? 'peak-sheet-board-lane-body is-drop-target' : 'peak-sheet-board-lane-body'} onDragOver={(event) => { event.preventDefault(); setTarget(lane.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTarget(null); }} onDrop={(event) => { event.preventDefault(); const rowId = event.dataTransfer.getData('text/peak-sheet-row') || dragging; if (rowId) onSetCell(rowId, laneField.id, lane.id); setTarget(null); setDragging(null); }}>
			{laneRows.map((row) => <div key={row.id} className={dragging === row.id ? 'peak-sheet-board-card is-dragging' : 'peak-sheet-board-card'} draggable tabIndex={0} role="button" onDragStart={(event) => { setDragging(row.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/peak-sheet-row', row.id); }} onDragEnd={() => { setDragging(null); setTarget(null); }} onClick={() => onOpenRow(row.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpenRow(row.id); }}><strong>{displayValue(row.cells[view.titleFieldId] ?? null) || 'Untitled'}</strong><small>{detailValue(snapshot, row.cells, view.cardFieldIds) || 'No details'}</small><span><small>{firstValue(snapshot, row.cells, ['area', 'category', 'channel'])}</small><small>{firstValue(snapshot, row.cells, ['due-date', 'due', 'publish-date', 'date'])}</small></span></div>)}
			<span className="peak-sheet-board-drop-hint">Drop here</span>
		</div></div>;
	})}</div>;
}

function uniqueLanes(snapshot: PeakSheetDatasetSnapshot, fieldId: string): { id: string; label: string }[] { return [...new Set(snapshot.rows.map((row) => String(row.cells[fieldId] ?? '')).filter(Boolean))].map((value) => ({ id: value, label: value })); }
function firstValue(snapshot: PeakSheetDatasetSnapshot, cells: PeakSheetDatasetSnapshot['rows'][number]['cells'], ids: readonly string[]): string { const field = snapshot.fields.find((candidate) => ids.includes(candidate.id) || ids.includes(candidate.name.toLocaleLowerCase().replace(/\s+/g, '-'))); return field ? displayValue(cells[field.id] ?? null) : ''; }
function detailValue(snapshot: PeakSheetDatasetSnapshot, cells: PeakSheetDatasetSnapshot['rows'][number]['cells'], fieldIds?: readonly string[]): string { for (const fieldId of fieldIds ?? []) { const value = displayValue(cells[fieldId] ?? null); if (value) return value; } return firstValue(snapshot, cells, ['blocker', 'notes', 'category']); }
