import React from 'react';

import { displayValue, projectPeakSheetRows, stableSortRows } from '@/core/sheet';
import type { PeakSheetBoardViewDefinition, PeakSheetCellValue, PeakSheetDatasetSnapshot } from '@/core/sheet';

export function PeakSheetBoard({ snapshot, view, onSetCell }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetBoardViewDefinition;
	onSetCell(rowId: string, fieldId: string, value: PeakSheetCellValue): void;
}): React.ReactElement {
	const laneField = snapshot.fields.find((field) => field.id === view.laneFieldId);
	const lanes = laneField?.options?.map((option) => ({ id: option.id, label: option.label })) ?? uniqueLanes(snapshot, view.laneFieldId);
	const rows = stableSortRows(projectPeakSheetRows(snapshot, view.filters), snapshot.fields, view.sorts ?? []);
	return (
		<div className="peak-sheet-board">
			{[...lanes, { id: '', label: 'Unassigned' }].map((lane) => {
				const laneRows = rows.filter((row) => String(row.cells[view.laneFieldId] ?? '') === lane.id);
				if (lane.id === '' && laneRows.length === 0) return null;
				return (
					<div
						key={lane.id || 'unassigned'}
						className="peak-sheet-board-lane"
						onDragOver={(event) => event.preventDefault()}
						onDrop={(event) => {
							const rowId = event.dataTransfer.getData('text/peak-sheet-row');
							if (rowId) onSetCell(rowId, view.laneFieldId, lane.id || null);
						}}
					>
						<div className="peak-sheet-board-lane-title"><span>{lane.label}</span><span>{laneRows.length}</span></div>
						<div className="peak-sheet-board-cards">
							{laneRows.map((row) => (
								<div key={row.id} className="peak-sheet-board-card" draggable onDragStart={(event) => event.dataTransfer.setData('text/peak-sheet-row', row.id)}>
									<span className="peak-sheet-board-card-title">{displayValue(row.cells[view.titleFieldId] ?? null) || 'Untitled'}</span>
									{view.cardFieldIds?.map((fieldId) => {
										const field = snapshot.fields.find((candidate) => candidate.id === fieldId);
										if (!field) return null;
										return <span key={fieldId} className="peak-sheet-board-card-meta">{field.name}: {displayValue(row.cells[fieldId] ?? null) || '—'}</span>;
									})}
									<select aria-label={`Move ${displayValue(row.cells[view.titleFieldId] ?? null) || 'card'} to lane`} value={String(row.cells[view.laneFieldId] ?? '')} onChange={(event) => onSetCell(row.id, view.laneFieldId, event.target.value || null)}>
										<option value="">Unassigned</option>
										{lanes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
									</select>
								</div>
							))}
							{laneRows.length === 0 && <span className="peak-sheet-board-drop-hint">Drop cards here</span>}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function uniqueLanes(snapshot: PeakSheetDatasetSnapshot, fieldId: string): { id: string; label: string }[] {
	return [...new Set(snapshot.rows.map((row) => String(row.cells[fieldId] ?? '')).filter(Boolean))].map((value) => ({ id: value, label: value }));
}
