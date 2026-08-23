import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { displayValue } from '@/core/sheet';
import type { PeakSheetDatasetSnapshot, PeakSheetFilterRule, PeakSheetPatchOperation, PeakSheetSortRule, PeakSheetTableViewDefinition } from '@/core/sheet';
import { Button } from '@/ui/component/shared-ui/button';

export type PeakSheetRuleKind = 'filter' | 'sort' | 'group';

export function PeakSheetRulePopover({ kind, snapshot, view, initialFieldId, onMutate, onClose }: {
	readonly kind: PeakSheetRuleKind;
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly view: PeakSheetTableViewDefinition;
	readonly initialFieldId?: string;
	onMutate(operations: readonly PeakSheetPatchOperation[]): void;
	onClose(): void;
}): React.ReactElement {
	const defaultField = initialFieldId ?? snapshot.fields[0]?.id ?? '';
	const [filters, setFilters] = useState<PeakSheetFilterRule[]>(() => view.filters?.rules.map((rule) => ({ ...rule })) ?? (defaultField ? [newFilter(defaultField)] : []));
	const [sorts, setSorts] = useState<PeakSheetSortRule[]>(() => view.sorts?.map((sort) => ({ ...sort })) ?? (defaultField ? [{ fieldId: defaultField, direction: 'asc' }] : []));
	const [groups, setGroups] = useState<string[]>(() => view.groupByFields?.length ? [...view.groupByFields] : view.groupBy ? [view.groupBy] : defaultField ? [defaultField] : []);
	const title = kind === 'filter' ? 'Filter this view' : kind === 'sort' ? 'Sort this view' : 'Group & summarize';
	const detail = kind === 'filter' ? 'Match all of these' : kind === 'sort' ? 'Sort in this order' : 'Pivot-like answers without a pivot table';
	const apply = () => {
		const next: PeakSheetTableViewDefinition = kind === 'filter'
			? { ...view, filters: filters.length ? { conjunction: 'all', rules: filters } : undefined }
			: kind === 'sort'
				? { ...view, sorts }
				: { ...view, groupBy: undefined, groupByFields: groups };
		onMutate([{ type: 'upsertView', view: next }]);
		onClose();
	};
	return <div className={`peak-sheet-popover peak-sheet-rule-popover is-${kind}`} role="dialog" onPointerDown={(event) => event.stopPropagation()}>
		<div className="peak-sheet-popover-head"><span><strong>{title}</strong><small>{detail}</small></span><Button variant="unstyled" aria-label={`Close ${kind}`} onClick={onClose}><X size={13} /></Button></div>
		<div className="peak-sheet-rule-menu-head"><span>{kind === 'filter' ? 'Match all of these' : kind === 'sort' ? 'Priority order' : 'Group by'}</span><Button variant="unstyled" disabled={!defaultField} onClick={() => kind === 'filter' ? setFilters((current) => [...current, newFilter(snapshot.fields[current.length % Math.max(1, snapshot.fields.length)]?.id ?? defaultField)]) : kind === 'sort' ? setSorts((current) => [...current, { fieldId: snapshot.fields[current.length % Math.max(1, snapshot.fields.length)]?.id ?? defaultField, direction: 'asc' }]) : setGroups((current) => [...current, snapshot.fields[current.length % Math.max(1, snapshot.fields.length)]?.id ?? defaultField])}><Plus size={11} />Add {kind === 'group' ? 'field' : kind}</Button></div>
		<div className="peak-sheet-rule-list">
			{kind === 'filter' && filters.map((rule, index) => <div className="peak-sheet-rule-row" key={rule.id}><select aria-label="Filter field" value={rule.fieldId} onChange={(event) => setFilters((current) => current.map((candidate, item) => item === index ? newFilter(event.target.value, candidate.id) : candidate))}>{fieldOptions(snapshot)}</select><select aria-label="Filter value" value={String(rule.value ?? '')} onChange={(event) => setFilters((current) => current.map((candidate, item) => item === index ? { ...candidate, value: event.target.value } : candidate))}><option value="">Choose value</option>{valueOptions(snapshot, rule.fieldId)}</select><Remove onClick={() => setFilters((current) => current.filter((_, item) => item !== index))} /></div>)}
			{kind === 'sort' && sorts.map((rule, index) => <div className="peak-sheet-rule-row" key={`${rule.fieldId}-${index}`}><select aria-label="Sort field" value={rule.fieldId} onChange={(event) => setSorts((current) => current.map((candidate, item) => item === index ? { ...candidate, fieldId: event.target.value } : candidate))}>{fieldOptions(snapshot)}</select><select aria-label="Sort direction" value={rule.direction} onChange={(event) => setSorts((current) => current.map((candidate, item) => item === index ? { ...candidate, direction: event.target.value as 'asc' | 'desc' } : candidate))}><option value="asc">A → Z</option><option value="desc">Z → A</option></select><Remove onClick={() => setSorts((current) => current.filter((_, item) => item !== index))} /></div>)}
			{kind === 'group' && groups.map((fieldId, index) => <div className="peak-sheet-rule-row" key={`${fieldId}-${index}`}><select aria-label="Group field" value={fieldId} onChange={(event) => setGroups((current) => current.map((candidate, item) => item === index ? event.target.value : candidate))}>{fieldOptions(snapshot)}</select><span className="peak-sheet-rule-order">{index + 1}</span><Remove onClick={() => setGroups((current) => current.filter((_, item) => item !== index))} /></div>)}
			{snapshot.fields.length === 0 && <span className="peak-sheet-rule-empty">Materialize a column before configuring this view.</span>}
		</div>
		{kind === 'group' && <><label className="peak-sheet-summary-select">Summary<select defaultValue="count"><option value="count">Count records</option><option value="average">Average numeric field</option><option value="sum">Sum numeric field</option><option value="minmax">Min / Max</option></select></label><div className="peak-sheet-group-preview">{groupPreview(snapshot, groups)}</div></>}
		<div className="peak-sheet-view-config-actions"><Button variant="unstyled" onClick={() => { if (kind === 'filter') setFilters([]); if (kind === 'sort') setSorts([]); if (kind === 'group') setGroups([]); }}>Clear</Button><Button variant="unstyled" onClick={apply}>Apply {kind}</Button></div>
	</div>;
}

function Remove({ onClick }: { onClick(): void }): React.ReactElement { return <Button variant="unstyled" className="peak-sheet-remove-rule" aria-label="Remove rule" onClick={onClick}>×</Button>; }
function newFilter(fieldId: string, id = `filter-${crypto.randomUUID()}`): PeakSheetFilterRule { return { id, fieldId, operator: 'equals', value: '' }; }
function fieldOptions(snapshot: PeakSheetDatasetSnapshot): React.ReactNode { return snapshot.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>); }
function valueOptions(snapshot: PeakSheetDatasetSnapshot, fieldId: string): React.ReactNode { return [...new Set(snapshot.rows.map((row) => displayValue(row.cells[fieldId] ?? null)).filter(Boolean))].sort().map((value) => <option key={value} value={value}>{value}</option>); }
function groupPreview(snapshot: PeakSheetDatasetSnapshot, groups: readonly string[]): React.ReactNode {
	if (!groups.length || snapshot.rows.length === 0) return <span>No materialized rows <b>0</b></span>;
	const counts = new Map<string, number>();
	for (const row of snapshot.rows) { const label = groups.map((fieldId) => displayValue(row.cells[fieldId] ?? null) || 'Blank').join(' · '); counts.set(label, (counts.get(label) ?? 0) + 1); }
	return [...counts].slice(0, 6).map(([label, count]) => <span key={label}>{label}<b>{count}</b></span>);
}
