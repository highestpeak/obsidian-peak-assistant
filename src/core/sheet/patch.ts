import type {
	PeakSheetCellValue,
	PeakSheetDatasetPatch,
	PeakSheetDatasetSnapshot,
	PeakSheetFieldDefinition,
	PeakSheetPatchOperation,
	PeakSheetRow,
	PeakSheetViewDefinition,
} from './types';

export class PeakSheetPatchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PeakSheetPatchError';
	}
}

export interface PeakSheetPatchApplyResult {
	readonly snapshot: PeakSheetDatasetSnapshot;
	readonly inverse: PeakSheetDatasetPatch;
}

export function applyPeakSheetPatch(
	snapshot: PeakSheetDatasetSnapshot,
	patch: PeakSheetDatasetPatch,
): PeakSheetPatchApplyResult {
	if (patch.datasetId !== snapshot.datasetId) {
		throw new PeakSheetPatchError('Patch dataset does not match the current dataset.');
	}
	if (patch.baseRevision !== snapshot.revision) {
		throw new PeakSheetPatchError(
			`Stale dataset revision: expected ${snapshot.revision}, received ${patch.baseRevision}.`,
		);
	}
	if (patch.operations.length === 0) {
		throw new PeakSheetPatchError('A dataset patch must contain at least one operation.');
	}

	let working = cloneSnapshot(snapshot);
	const inverseOperations: PeakSheetPatchOperation[] = [];
	for (const operation of patch.operations) {
		const result = applyOperation(working, operation);
		working = result.snapshot;
		inverseOperations.unshift(result.inverse);
	}

	const next: PeakSheetDatasetSnapshot = {
		...working,
		revision: snapshot.revision + 1,
		updatedAt: patch.createdAt,
	};
	validatePeakSheetSnapshot(next);
	return {
		snapshot: next,
		inverse: {
			patchId: `${patch.patchId}:inverse`,
			datasetId: patch.datasetId,
			baseRevision: next.revision,
			operations: inverseOperations,
			actor: patch.actor,
			createdAt: patch.createdAt,
		},
	};
}

export function validatePeakSheetSnapshot(snapshot: PeakSheetDatasetSnapshot): void {
	if (snapshot.schemaVersion !== 1) throw new PeakSheetPatchError('Unsupported Peak Sheet schema version.');
	if (!snapshot.datasetId.trim()) throw new PeakSheetPatchError('Dataset id is required.');
	if (!snapshot.name.trim()) throw new PeakSheetPatchError('Dataset name is required.');
	if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
		throw new PeakSheetPatchError('Dataset revision must be a positive integer.');
	}
	const fieldIds = new Set<string>();
	const fieldNames = new Set<string>();
	for (const field of snapshot.fields) {
		validateField(field);
		if (fieldIds.has(field.id)) throw new PeakSheetPatchError(`Duplicate field id: ${field.id}.`);
		const normalizedName = field.name.trim().toLocaleLowerCase();
		if (fieldNames.has(normalizedName)) throw new PeakSheetPatchError(`Duplicate field name: ${field.name}.`);
		fieldIds.add(field.id);
		fieldNames.add(normalizedName);
	}
	const rowIds = new Set<string>();
	for (const row of snapshot.rows) {
		if (!row.id.trim()) throw new PeakSheetPatchError('Row id is required.');
		if (rowIds.has(row.id)) throw new PeakSheetPatchError(`Duplicate row id: ${row.id}.`);
		rowIds.add(row.id);
		for (const [fieldId, value] of Object.entries(row.cells)) {
			const field = snapshot.fields.find((candidate) => candidate.id === fieldId);
			if (!field) throw new PeakSheetPatchError(`Row ${row.id} references unknown field ${fieldId}.`);
			if (field.formula && value !== null) {
				throw new PeakSheetPatchError(`Formula field ${field.name} cannot store raw cell values.`);
			}
			validateCellValue(field, value);
		}
	}
	const viewIds = new Set<string>();
	for (const view of snapshot.views) {
		if (viewIds.has(view.id)) throw new PeakSheetPatchError(`Duplicate view id: ${view.id}.`);
		viewIds.add(view.id);
		validateView(view, snapshot.fields);
	}
}

function applyOperation(
	snapshot: PeakSheetDatasetSnapshot,
	operation: PeakSheetPatchOperation,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	switch (operation.type) {
		case 'setCell':
			return setCell(snapshot, operation);
		case 'addRow':
			return addRow(snapshot, operation);
		case 'deleteRow':
			return deleteRow(snapshot, operation);
		case 'addField':
			return addField(snapshot, operation);
		case 'deleteField':
			return deleteField(snapshot, operation);
		case 'renameField':
			return renameField(snapshot, operation.fieldId, operation.name);
		case 'resizeField':
			return updateField(snapshot, operation.fieldId, (field) => ({ ...field, width: operation.width }), {
				type: 'resizeField', fieldId: operation.fieldId, width: requireField(snapshot, operation.fieldId).width ?? 160,
			});
		case 'setFieldHidden':
			return updateField(snapshot, operation.fieldId, (field) => ({ ...field, hidden: operation.hidden }), {
				type: 'setFieldHidden', fieldId: operation.fieldId, hidden: requireField(snapshot, operation.fieldId).hidden ?? false,
			});
		case 'setFieldOptions':
			return setFieldOptions(snapshot, operation);
		case 'setFieldFormula':
			return setFieldFormula(snapshot, operation);
		case 'upsertView':
			return upsertView(snapshot, operation.view);
		case 'deleteView':
			return deleteView(snapshot, operation.viewId);
		case 'renameDataset':
			return {
				snapshot: { ...snapshot, name: operation.name },
				inverse: { type: 'renameDataset', name: snapshot.name },
			};
		case 'setDatasetDeleted':
			return {
				snapshot: { ...snapshot, deletedAt: operation.deletedAt },
				inverse: { type: 'setDatasetDeleted', deletedAt: snapshot.deletedAt },
			};
	}
}

function setFieldOptions(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'setFieldOptions' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const field = requireField(snapshot, operation.fieldId);
	if (field.type !== 'singleSelect') throw new PeakSheetPatchError(`Field ${field.name} is not a Single Select field.`);
	return updateField(snapshot, field.id, (candidate) => ({ ...candidate, options: operation.options.map((option) => ({ ...option })) }), {
		type: 'setFieldOptions', fieldId: field.id, options: field.options?.map((option) => ({ ...option })) ?? [],
	});
}

function setCell(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'setCell' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const field = requireField(snapshot, operation.fieldId);
	if (field.formula) throw new PeakSheetPatchError(`Formula field ${field.name} is read-only.`);
	validateCellValue(field, operation.value);
	const row = requireRow(snapshot, operation.rowId);
	const previous = row.cells[operation.fieldId] ?? null;
	const rows = snapshot.rows.map((candidate) => {
		if (candidate.id !== operation.rowId) return candidate;
		return { ...candidate, cells: { ...candidate.cells, [operation.fieldId]: operation.value } };
	});
	return {
		snapshot: { ...snapshot, rows },
		inverse: { ...operation, value: previous },
	};
}

function addRow(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'addRow' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	if (snapshot.rows.some((row) => row.id === operation.row.id)) {
		throw new PeakSheetPatchError(`Row ${operation.row.id} already exists.`);
	}
	validateRowAgainstFields(operation.row, snapshot.fields);
	const rows = [...snapshot.rows];
	const index = clampIndex(operation.index, rows.length);
	rows.splice(index, 0, cloneRow(operation.row));
	return {
		snapshot: { ...snapshot, rows },
		inverse: { type: 'deleteRow', rowId: operation.row.id },
	};
}

function deleteRow(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'deleteRow' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const index = snapshot.rows.findIndex((row) => row.id === operation.rowId);
	if (index < 0) throw new PeakSheetPatchError(`Unknown row ${operation.rowId}.`);
	const row = snapshot.rows[index];
	return {
		snapshot: { ...snapshot, rows: snapshot.rows.filter((candidate) => candidate.id !== operation.rowId) },
		inverse: { type: 'addRow', row: cloneRow(row), index },
	};
}

function addField(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'addField' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	if (snapshot.fields.some((field) => field.id === operation.field.id)) {
		throw new PeakSheetPatchError(`Field ${operation.field.id} already exists.`);
	}
	validateField(operation.field);
	const fields = [...snapshot.fields];
	fields.splice(clampIndex(operation.index, fields.length), 0, { ...operation.field });
	const rows = snapshot.rows.map((row) => {
		const value = operation.values?.[row.id] ?? null;
		if (operation.field.formula) return row;
		validateCellValue(operation.field, value);
		return { ...row, cells: { ...row.cells, [operation.field.id]: value } };
	});
	return {
		snapshot: { ...snapshot, fields, rows, views: operation.views?.map(cloneView) ?? snapshot.views },
		inverse: { type: 'deleteField', fieldId: operation.field.id },
	};
}

function deleteField(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'deleteField' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const index = snapshot.fields.findIndex((field) => field.id === operation.fieldId);
	if (index < 0) throw new PeakSheetPatchError(`Unknown field ${operation.fieldId}.`);
	const field = snapshot.fields[index];
	const values: Record<string, PeakSheetCellValue> = {};
	const rows = snapshot.rows.map((row) => {
		values[row.id] = row.cells[field.id] ?? null;
		const cells = { ...row.cells };
		delete cells[field.id];
		return { ...row, cells };
	});
	return {
		snapshot: {
			...snapshot,
			fields: snapshot.fields.filter((candidate) => candidate.id !== field.id),
			rows,
			views: pruneViewsForDeletedField(snapshot.views, field.id),
		},
		inverse: { type: 'addField', field: { ...field }, index, values, views: snapshot.views.map(cloneView) },
	};
}

function setFieldFormula(
	snapshot: PeakSheetDatasetSnapshot,
	operation: Extract<PeakSheetPatchOperation, { type: 'setFieldFormula' }>,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const field = requireField(snapshot, operation.fieldId);
	const previous = field.formula;
	const normalized = operation.formula?.trim() || undefined;
	const previousValues: Record<string, PeakSheetCellValue> = {};
	if (!previous) {
		for (const row of snapshot.rows) previousValues[row.id] = row.cells[field.id] ?? null;
	}
	const rows = normalized
		? snapshot.rows.map((row) => {
				const cells = { ...row.cells };
				delete cells[field.id];
				return { ...row, cells };
			})
		: snapshot.rows.map((row) => operation.values
			? { ...row, cells: { ...row.cells, [field.id]: operation.values[row.id] ?? null } }
			: row);
	return {
		snapshot: {
			...snapshot,
			fields: snapshot.fields.map((candidate) => candidate.id === field.id
				? { ...candidate, formula: normalized }
				: candidate),
			rows,
		},
		inverse: {
			type: 'setFieldFormula', fieldId: field.id, formula: previous,
			values: previous ? undefined : previousValues,
		},
	};
}

function renameField(
	snapshot: PeakSheetDatasetSnapshot,
	fieldId: string,
	name: string,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const field = requireField(snapshot, fieldId);
	const escaped = field.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const reference = new RegExp(`\\[${escaped}\\]`, 'gi');
	return {
		snapshot: {
			...snapshot,
			fields: snapshot.fields.map((candidate) => ({
				...candidate,
				name: candidate.id === fieldId ? name : candidate.name,
				formula: candidate.formula?.replace(reference, `[${name}]`),
			})),
		},
		inverse: { type: 'renameField', fieldId, name: field.name },
	};
}

function updateField(
	snapshot: PeakSheetDatasetSnapshot,
	fieldId: string,
	update: (field: PeakSheetFieldDefinition) => PeakSheetFieldDefinition,
	inverse: PeakSheetPatchOperation,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	requireField(snapshot, fieldId);
	return {
		snapshot: {
			...snapshot,
			fields: snapshot.fields.map((field) => field.id === fieldId ? update(field) : field),
		},
		inverse,
	};
}

function upsertView(
	snapshot: PeakSheetDatasetSnapshot,
	view: PeakSheetViewDefinition,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const existing = snapshot.views.find((candidate) => candidate.id === view.id);
	const views = existing
		? snapshot.views.map((candidate) => candidate.id === view.id ? cloneView(view) : candidate)
		: [...snapshot.views, cloneView(view)];
	return {
		snapshot: { ...snapshot, views },
		inverse: existing ? { type: 'upsertView', view: cloneView(existing) } : { type: 'deleteView', viewId: view.id },
	};
}

function deleteView(
	snapshot: PeakSheetDatasetSnapshot,
	viewId: string,
): { snapshot: PeakSheetDatasetSnapshot; inverse: PeakSheetPatchOperation } {
	const existing = snapshot.views.find((view) => view.id === viewId);
	if (!existing) throw new PeakSheetPatchError(`Unknown view ${viewId}.`);
	if (snapshot.views.length === 1) throw new PeakSheetPatchError('A dataset must keep at least one view.');
	return {
		snapshot: { ...snapshot, views: snapshot.views.filter((view) => view.id !== viewId) },
		inverse: { type: 'upsertView', view: cloneView(existing) },
	};
}

function pruneViewsForDeletedField(
	views: readonly PeakSheetViewDefinition[],
	fieldId: string,
): PeakSheetViewDefinition[] {
	const next: PeakSheetViewDefinition[] = [];
	for (const view of views) {
		const filters = view.filters
			? { ...view.filters, rules: view.filters.rules.filter((rule) => rule.fieldId !== fieldId) }
			: undefined;
		const sorts = view.sorts?.filter((sort) => sort.fieldId !== fieldId);
		if (view.type === 'table') {
			next.push({
				...view,
				filters,
				sorts,
				groupBy: view.groupBy === fieldId ? undefined : view.groupBy,
				hiddenFieldIds: view.hiddenFieldIds?.filter((id) => id !== fieldId),
			});
			continue;
		}
		if (view.type === 'chart') {
			if (view.categoryFieldId === fieldId) continue;
			const series = view.series.filter((item) => item.fieldId !== fieldId);
			if (series.length === 0) continue;
			next.push({ ...view, filters, sorts, series });
			continue;
		}
		if (view.type === 'board') {
			if (view.laneFieldId === fieldId || view.titleFieldId === fieldId) continue;
			next.push({ ...view, filters, sorts, cardFieldIds: view.cardFieldIds?.filter((id) => id !== fieldId) });
			continue;
		}
		if (view.dateFieldId === fieldId || view.titleFieldId === fieldId) continue;
		next.push({ ...view, filters, sorts });
	}
	if (next.length > 0) return next;
	return [{ id: 'table-default', name: 'Table', type: 'table' }];
}

function validateField(field: PeakSheetFieldDefinition): void {
	if (!field.id.trim()) throw new PeakSheetPatchError('Field id is required.');
	if (!field.name.trim()) throw new PeakSheetPatchError('Field name is required.');
	if (field.width !== undefined && (!Number.isFinite(field.width) || field.width < 72 || field.width > 720)) {
		throw new PeakSheetPatchError(`Field ${field.name} width must be between 72 and 720.`);
	}
	if (field.type === 'singleSelect') {
		const ids = new Set<string>();
		for (const option of field.options ?? []) {
			if (!option.id.trim() || !option.label.trim()) throw new PeakSheetPatchError(`Field ${field.name} has an invalid option.`);
			if (ids.has(option.id)) throw new PeakSheetPatchError(`Field ${field.name} has duplicate option ${option.id}.`);
			ids.add(option.id);
		}
	}
}

function validateCellValue(field: PeakSheetFieldDefinition, value: PeakSheetCellValue): void {
	if (value === null) return;
	if (field.type === 'number' && typeof value !== 'number') {
		throw new PeakSheetPatchError(`Field ${field.name} requires a number.`);
	}
	if (field.type === 'checkbox' && typeof value !== 'boolean') {
		throw new PeakSheetPatchError(`Field ${field.name} requires a checkbox value.`);
	}
	if (field.type === 'file') {
		if (!isFileRef(value)) throw new PeakSheetPatchError(`Field ${field.name} requires a file reference.`);
		return;
	}
	if (field.type !== 'number' && field.type !== 'checkbox' && typeof value !== 'string') {
		throw new PeakSheetPatchError(`Field ${field.name} requires text.`);
	}
	if (field.type === 'singleSelect' && typeof value === 'string') {
		const known = (field.options ?? []).some((option) => option.id === value || option.label === value);
		if (!known) throw new PeakSheetPatchError(`Unknown option ${value} for field ${field.name}.`);
	}
	if (field.type === 'date' && typeof value === 'string' && Number.isNaN(Date.parse(value))) {
		throw new PeakSheetPatchError(`Field ${field.name} requires an ISO date or datetime.`);
	}
}

function validateView(view: PeakSheetViewDefinition, fields: readonly PeakSheetFieldDefinition[]): void {
	const fieldIds = new Set(fields.map((field) => field.id));
	if (!view.id.trim() || !view.name.trim()) throw new PeakSheetPatchError('View id and name are required.');
	for (const rule of view.filters?.rules ?? []) requireFieldId(fieldIds, rule.fieldId, view.name);
	for (const sort of view.sorts ?? []) requireFieldId(fieldIds, sort.fieldId, view.name);
	if (view.type === 'table' && view.groupBy) requireFieldId(fieldIds, view.groupBy, view.name);
	if (view.type === 'chart') {
		requireFieldId(fieldIds, view.categoryFieldId, view.name);
		if (view.series.length === 0) throw new PeakSheetPatchError(`Chart view ${view.name} needs a series.`);
		for (const series of view.series) requireFieldId(fieldIds, series.fieldId, view.name);
	}
	if (view.type === 'board') {
		requireFieldId(fieldIds, view.laneFieldId, view.name);
		requireFieldId(fieldIds, view.titleFieldId, view.name);
		if (fields.find((field) => field.id === view.laneFieldId)?.type !== 'singleSelect') throw new PeakSheetPatchError(`Board view ${view.name} requires a Single Select lane field.`);
		if (fields.find((field) => field.id === view.titleFieldId)?.type !== 'text') throw new PeakSheetPatchError(`Board view ${view.name} requires a Text title field.`);
		for (const id of view.cardFieldIds ?? []) requireFieldId(fieldIds, id, view.name);
	}
	if (view.type === 'calendar') {
		requireFieldId(fieldIds, view.dateFieldId, view.name);
		requireFieldId(fieldIds, view.titleFieldId, view.name);
		if (fields.find((field) => field.id === view.dateFieldId)?.type !== 'date') throw new PeakSheetPatchError(`Calendar view ${view.name} requires a Date field.`);
		if (fields.find((field) => field.id === view.titleFieldId)?.type !== 'text') throw new PeakSheetPatchError(`Calendar view ${view.name} requires a Text title field.`);
	}
}

function validateRowAgainstFields(row: PeakSheetRow, fields: readonly PeakSheetFieldDefinition[]): void {
	if (!row.id.trim()) throw new PeakSheetPatchError('Row id is required.');
	for (const [fieldId, value] of Object.entries(row.cells)) {
		const field = fields.find((candidate) => candidate.id === fieldId);
		if (!field) throw new PeakSheetPatchError(`Row ${row.id} references unknown field ${fieldId}.`);
		if (field.formula && value !== null) throw new PeakSheetPatchError(`Formula field ${field.name} is read-only.`);
		validateCellValue(field, value);
	}
}

function requireField(snapshot: PeakSheetDatasetSnapshot, fieldId: string): PeakSheetFieldDefinition {
	const field = snapshot.fields.find((candidate) => candidate.id === fieldId);
	if (!field) throw new PeakSheetPatchError(`Unknown field ${fieldId}.`);
	return field;
}

function requireRow(snapshot: PeakSheetDatasetSnapshot, rowId: string): PeakSheetRow {
	const row = snapshot.rows.find((candidate) => candidate.id === rowId);
	if (!row) throw new PeakSheetPatchError(`Unknown row ${rowId}.`);
	return row;
}

function requireFieldId(fieldIds: ReadonlySet<string>, fieldId: string, viewName: string): void {
	if (fieldIds.has(fieldId)) return;
	throw new PeakSheetPatchError(`View ${viewName} references unknown field ${fieldId}.`);
}

function clampIndex(index: number | undefined, length: number): number {
	if (index === undefined) return length;
	return Math.max(0, Math.min(length, Math.floor(index)));
}

function isFileRef(value: PeakSheetCellValue): value is Extract<PeakSheetCellValue, { vaultPath: string }> {
	if (!value || typeof value !== 'object') return false;
	return (value.kind === 'vault' || value.kind === 'external-copy') && typeof value.vaultPath === 'string' && value.vaultPath.trim().length > 0;
}

function cloneSnapshot(snapshot: PeakSheetDatasetSnapshot): PeakSheetDatasetSnapshot {
	return {
		...snapshot,
		fields: snapshot.fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })),
		rows: snapshot.rows.map(cloneRow),
		views: snapshot.views.map(cloneView),
	};
}

function cloneRow(row: PeakSheetRow): PeakSheetRow {
	return { ...row, cells: { ...row.cells } };
}

function cloneView<T extends PeakSheetViewDefinition>(view: T): T {
	return {
		...view,
		...(view.filters ? { filters: { ...view.filters, rules: view.filters.rules.map((rule) => ({ ...rule })) } } : {}),
		...(view.sorts ? { sorts: view.sorts.map((sort) => ({ ...sort })) } : {}),
	} as T;
}
