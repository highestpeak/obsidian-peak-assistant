import React, { useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';

import type {
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
	PeakSheetFieldType,
	PeakSheetPatchOperation,
	PeakSheetSelectOption,
	PeakSheetViewDefinition,
} from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';

export function PeakSheetFieldPanel({ snapshot, activeView, onMutate, onClose, onSelectView }: {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly activeView: PeakSheetViewDefinition;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onClose(): void;
	onSelectView(viewId: string): void;
}): React.ReactElement {
	const [fieldType, setFieldType] = useState<PeakSheetFieldType>('text');
	const [pendingFieldDelete, setPendingFieldDelete] = useState<string | null>(null);
	return (
		<aside className="peak-sheet-field-panel">
			<div className="peak-sheet-panel-title"><span>Fields & views</span><Button variant="unstyled" geometry="toolbar-icon" aria-label="Close field panel" onClick={onClose}><X size={17} /></Button></div>
			<div className="peak-sheet-panel-section">
				<span className="peak-sheet-panel-label">Fields</span>
				{snapshot.fields.map((field) => (
					<div key={field.id} className="peak-sheet-field-card">
						<div className="peak-sheet-field-card-heading">
							<input defaultValue={field.name} aria-label={`Rename ${field.name}`} onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== field.name && onMutate([{ type: 'renameField', fieldId: field.id, name: event.target.value.trim() }])} />
							<Button variant="unstyled" size="xs" aria-label={field.hidden ? `Show ${field.name}` : `Hide ${field.name}`} onClick={() => onMutate([{ type: 'setFieldHidden', fieldId: field.id, hidden: !field.hidden }])}>{field.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</Button>
							<Button variant="unstyled" size="xs" aria-label={`Delete ${field.name}`} disabled={snapshot.fields.length <= 1} onClick={() => setPendingFieldDelete(field.id)}><Trash2 size={14} /></Button>
						</div>
						<div className="peak-sheet-field-card-meta"><span>{field.type}</span><label>Width <input type="number" min={72} max={720} defaultValue={field.width ?? 160} onBlur={(event) => { const width = Number(event.target.value); if (width !== (field.width ?? 160)) onMutate([{ type: 'resizeField', fieldId: field.id, width }]); }} /></label></div>
						{field.type === 'singleSelect' && <label className="peak-sheet-options-editor">Options<input defaultValue={field.options?.map((option) => option.label).join(', ') ?? ''} placeholder="Todo, Doing, Done" onBlur={(event) => { const options = parseSelectOptions(field.options ?? [], event.target.value); if (!sameOptions(options, field.options ?? [])) onMutate([{ type: 'setFieldOptions', fieldId: field.id, options }]); }} /></label>}
						<label className="peak-sheet-formula-editor">Formula<input defaultValue={field.formula ?? ''} placeholder="e.g. =[Result]*2" onBlur={(event) => { const formula = event.target.value.trim() || undefined; if (formula !== field.formula) onMutate([{ type: 'setFieldFormula', fieldId: field.id, formula }]); }} /></label>
						{pendingFieldDelete === field.id && <div className="peak-sheet-field-delete-confirm"><span>Delete field and {populatedValueCount(snapshot, field.id)} stored values?</span><Button variant="unstyled" size="xs" onClick={() => setPendingFieldDelete(null)}>Cancel</Button><Button variant="unstyled" size="xs" onClick={() => { setPendingFieldDelete(null); onMutate([{ type: 'deleteField', fieldId: field.id }]); }}>Delete</Button></div>}
					</div>
				))}
				<div className="peak-sheet-add-field">
					<select value={fieldType} onChange={(event) => setFieldType(event.target.value as PeakSheetFieldType)}>{FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
					<Button variant="unstyled" geometry="toolbar" onClick={() => onMutate([{ type: 'addField', field: newField(snapshot, fieldType) }])}><Plus size={14} /> Add field</Button>
				</div>
			</div>
			<div className="peak-sheet-panel-section">
				<span className="peak-sheet-panel-label">Saved views</span>
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

const FIELD_TYPES: readonly PeakSheetFieldType[] = ['text', 'number', 'date', 'singleSelect', 'checkbox', 'link', 'file'];

function newField(snapshot: PeakSheetDatasetSnapshot, type: PeakSheetFieldType): PeakSheetFieldDefinition {
	const id = `field-${crypto.randomUUID()}`;
	const base: PeakSheetFieldDefinition = { id, name: uniqueName(snapshot, `New ${type}`), type, width: 160 };
	if (type !== 'singleSelect') return base;
	return { ...base, options: [{ id: 'Option 1', label: 'Option 1' }, { id: 'Option 2', label: 'Option 2' }] };
}

function uniqueName(snapshot: PeakSheetDatasetSnapshot, base: string): string {
	const names = new Set(snapshot.fields.map((field) => field.name.toLocaleLowerCase()));
	if (!names.has(base.toLocaleLowerCase())) return base;
	let suffix = 2;
	while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix++;
	return `${base} ${suffix}`;
}

function parseSelectOptions(current: readonly PeakSheetSelectOption[], text: string): PeakSheetSelectOption[] {
	const seen = new Set<string>();
	const labels = text.split(',').map((label) => label.trim()).filter((label) => {
		const normalized = label.toLocaleLowerCase();
		if (!normalized || seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
	const usedIds = new Set<string>();
	return labels.map((label, index) => {
		const exact = current.find((option) => !usedIds.has(option.id) && option.label.toLocaleLowerCase() === label.toLocaleLowerCase());
		const previous = exact ?? (current[index] && !usedIds.has(current[index].id) ? current[index] : undefined);
		const option = previous ? { ...previous, label } : { id: label, label };
		usedIds.add(option.id);
		return option;
	});
}

function populatedValueCount(snapshot: PeakSheetDatasetSnapshot, fieldId: string): number {
	return snapshot.rows.filter((row) => row.cells[fieldId] !== null && row.cells[fieldId] !== undefined).length;
}

function sameOptions(left: readonly PeakSheetSelectOption[], right: readonly PeakSheetSelectOption[]): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
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
