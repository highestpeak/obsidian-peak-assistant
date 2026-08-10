import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import type {
	PeakSheetDatasetSnapshot,
	PeakSheetPatchOperation,
	PeakSheetViewDefinition,
} from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';

/** Saved-view manager. Field editing intentionally lives on each column header. */
export function PeakSheetFieldPanel({ snapshot, activeView, onMutate, onClose, onSelectView }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly activeView: PeakSheetViewDefinition;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onClose(): void;
	onSelectView(viewId: string): void;
}): React.ReactElement {
	return (
		<aside className="peak-sheet-field-panel">
			<div className="peak-sheet-panel-title"><span>Saved views</span><Button variant="unstyled" geometry="toolbar-icon" aria-label="Close view panel" onClick={onClose}><X size={17} /></Button></div>
			<div className="peak-sheet-panel-section">
				<span className="peak-sheet-panel-label">Views share the same rows</span>
				{snapshot.views.map((view) => (
					<div key={view.id} className={`peak-sheet-view-card ${view.id === activeView.id ? 'is-active' : ''}`}>
						<Button variant="unstyled" geometry="toolbar-full" onClick={() => onSelectView(view.id)}>{view.name}<span>{view.type}</span></Button>
						<input defaultValue={view.name} aria-label={`Rename ${view.name} view`} onBlur={(event) => event.target.value.trim() && onMutate([{ type: 'upsertView', view: { ...view, name: event.target.value.trim() } }])} />
						<Button variant="unstyled" size="xs" aria-label={`Delete ${view.name} view`} disabled={snapshot.views.length <= 1} onClick={() => onMutate([{ type: 'deleteView', viewId: view.id }])}><Trash2 size={14} /></Button>
					</div>
				))}
				<div className="peak-sheet-add-views">
					{(['table', 'chart', 'board', 'calendar'] as const).map((type) => <Button key={type} variant="unstyled" geometry="toolbar" disabled={!canCreateView(snapshot, type)} onClick={() => onMutate([{ type: 'upsertView', view: createView(snapshot, type) }])}><Plus size={13} /> {type}</Button>)}
				</div>
			</div>
		</aside>
	);
}

function canCreateView(snapshot: PeakSheetDatasetSnapshot, type: PeakSheetViewDefinition['type']): boolean {
	if (type === 'table') return true;
	if (type === 'calendar') return snapshot.fields.some((field) => field.type === 'date') && snapshot.fields.some((field) => field.type === 'text');
	if (type === 'board') return snapshot.fields.some((field) => field.type === 'singleSelect') && snapshot.fields.some((field) => field.type === 'text');
	return snapshot.fields.length > 0;
}

function createView(snapshot: PeakSheetDatasetSnapshot, type: PeakSheetViewDefinition['type']): PeakSheetViewDefinition {
	const id = `${type}-${crypto.randomUUID()}`;
	const text = snapshot.fields.find((field) => field.type === 'text') ?? snapshot.fields[0];
	const category = snapshot.fields.find((field) => field.type === 'singleSelect') ?? snapshot.fields[0];
	const numeric = snapshot.fields.find((field) => field.type === 'number') ?? category;
	const date = snapshot.fields.find((field) => field.type === 'date') ?? snapshot.fields[0];
	const name = `${type[0].toUpperCase()}${type.slice(1)} ${snapshot.views.filter((view) => view.type === type).length + 1}`;
	if (type === 'table') return { id, name, type };
	if (type === 'chart') return { id, name, type, chartType: 'bar', categoryFieldId: category.id, series: [{ fieldId: numeric.id, aggregate: numeric.type === 'number' ? 'sum' : 'count' }] };
	if (type === 'board') return { id, name, type, laneFieldId: category.id, titleFieldId: text.id };
	return { id, name, type, dateFieldId: date.id, titleFieldId: text.id };
}
