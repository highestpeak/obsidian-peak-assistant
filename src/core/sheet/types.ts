export type PeakSheetFieldType =
	| 'text'
	| 'number'
	| 'date'
	| 'singleSelect'
	| 'checkbox'
	| 'link'
	| 'file';

export interface PeakSheetFileRef {
	readonly kind: 'vault' | 'external-copy';
	readonly vaultPath: string;
	readonly mediaType?: string;
	readonly displayName?: string;
}

export type PeakSheetCellValue = string | number | boolean | PeakSheetFileRef | null;

export interface PeakSheetSelectOption {
	readonly id: string;
	readonly label: string;
	readonly color?: string;
}

export interface PeakSheetFieldDefinition {
	readonly id: string;
	readonly name: string;
	readonly type: PeakSheetFieldType;
	readonly width?: number;
	readonly hidden?: boolean;
	readonly options?: readonly PeakSheetSelectOption[];
	/** Optional row formula. Field references use `[Field name]`. */
	readonly formula?: string;
}

export interface PeakSheetRow {
	readonly id: string;
	readonly cells: Readonly<Record<string, PeakSheetCellValue>>;
}

export type PeakSheetFilterOperator =
	| 'equals'
	| 'notEquals'
	| 'contains'
	| 'notContains'
	| 'isEmpty'
	| 'isNotEmpty'
	| 'greaterThan'
	| 'greaterThanOrEqual'
	| 'lessThan'
	| 'lessThanOrEqual'
	| 'before'
	| 'after';

export interface PeakSheetFilterRule {
	readonly id: string;
	readonly fieldId: string;
	readonly operator: PeakSheetFilterOperator;
	readonly value?: PeakSheetCellValue;
}

export interface PeakSheetFilterGroup {
	readonly conjunction: 'all' | 'any';
	readonly rules: readonly PeakSheetFilterRule[];
}

export interface PeakSheetSortRule {
	readonly fieldId: string;
	readonly direction: 'asc' | 'desc';
}

interface PeakSheetViewBase {
	readonly id: string;
	readonly name: string;
	readonly filters?: PeakSheetFilterGroup;
	readonly sorts?: readonly PeakSheetSortRule[];
}

export interface PeakSheetTableViewDefinition extends PeakSheetViewBase {
	readonly type: 'table';
	readonly groupBy?: string;
	readonly hiddenFieldIds?: readonly string[];
}

export interface PeakSheetChartSeries {
	readonly fieldId: string;
	readonly aggregate: PeakSheetAggregateOperation;
	readonly label?: string;
}

export interface PeakSheetChartViewDefinition extends PeakSheetViewBase {
	readonly type: 'chart';
	readonly chartType: 'bar' | 'line' | 'pie';
	readonly categoryFieldId: string;
	readonly series: readonly PeakSheetChartSeries[];
}

export interface PeakSheetBoardViewDefinition extends PeakSheetViewBase {
	readonly type: 'board';
	readonly laneFieldId: string;
	readonly titleFieldId: string;
	readonly cardFieldIds?: readonly string[];
}

export interface PeakSheetCalendarViewDefinition extends PeakSheetViewBase {
	readonly type: 'calendar';
	readonly dateFieldId: string;
	readonly titleFieldId: string;
}

export type PeakSheetViewDefinition =
	| PeakSheetTableViewDefinition
	| PeakSheetChartViewDefinition
	| PeakSheetBoardViewDefinition
	| PeakSheetCalendarViewDefinition;

export interface PeakSheetDatasetSnapshot {
	readonly schemaVersion: 1;
	readonly datasetId: string;
	readonly name: string;
	readonly revision: number;
	readonly fields: readonly PeakSheetFieldDefinition[];
	readonly rows: readonly PeakSheetRow[];
	readonly views: readonly PeakSheetViewDefinition[];
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly deletedAt?: string;
}

export type PeakSheetPatchOperation =
	| { readonly type: 'setCell'; readonly rowId: string; readonly fieldId: string; readonly value: PeakSheetCellValue }
	| { readonly type: 'addRow'; readonly row: PeakSheetRow; readonly index?: number }
	| { readonly type: 'deleteRow'; readonly rowId: string }
	| { readonly type: 'addField'; readonly field: PeakSheetFieldDefinition; readonly index?: number; readonly values?: Readonly<Record<string, PeakSheetCellValue>>; readonly views?: readonly PeakSheetViewDefinition[] }
	| { readonly type: 'deleteField'; readonly fieldId: string }
	| { readonly type: 'renameField'; readonly fieldId: string; readonly name: string }
	| { readonly type: 'resizeField'; readonly fieldId: string; readonly width: number }
	| { readonly type: 'setFieldHidden'; readonly fieldId: string; readonly hidden: boolean }
	| { readonly type: 'setFieldOptions'; readonly fieldId: string; readonly options: readonly PeakSheetSelectOption[] }
	| { readonly type: 'setFieldFormula'; readonly fieldId: string; readonly formula?: string; readonly values?: Readonly<Record<string, PeakSheetCellValue>> }
	| { readonly type: 'upsertView'; readonly view: PeakSheetViewDefinition }
	| { readonly type: 'deleteView'; readonly viewId: string }
	| { readonly type: 'renameDataset'; readonly name: string }
	| { readonly type: 'setDatasetDeleted'; readonly deletedAt?: string };

export interface PeakSheetDatasetPatch {
	readonly patchId: string;
	readonly datasetId: string;
	readonly baseRevision: number;
	readonly operations: readonly PeakSheetPatchOperation[];
	readonly actor: { readonly kind: 'user' | 'ai'; readonly runId?: string };
	readonly createdAt: string;
}

export interface PeakSheetPatchPair {
	readonly forward: PeakSheetDatasetPatch;
	readonly inverse: PeakSheetDatasetPatch;
}

export interface PeakSheetCommitEvent {
	readonly eventId: string;
	readonly datasetId: string;
	readonly kind: 'apply' | 'undo' | 'redo' | 'create';
	readonly baseRevision: number;
	readonly nextRevision: number;
	readonly patch?: PeakSheetDatasetPatch;
	readonly inverse?: PeakSheetDatasetPatch;
	readonly targetPatchId?: string;
	/** Creation events carry a complete recovery checkpoint. */
	readonly snapshot?: PeakSheetDatasetSnapshot;
	readonly recordedAt: string;
}

export interface PeakSheetDatasetSummary {
	readonly datasetId: string;
	readonly name: string;
	readonly revision: number;
	readonly rowCount: number;
	readonly fieldCount: number;
	readonly updatedAt: string;
}

export type PeakSheetAggregateOperation = 'count' | 'sum' | 'average' | 'min' | 'max';

export interface PeakSheetAggregateMetric {
	readonly id: string;
	readonly fieldId?: string;
	readonly operation: PeakSheetAggregateOperation;
	readonly label?: string;
}

export type PeakSheetAnalysisStep =
	| { readonly op: 'filter'; readonly filters: PeakSheetFilterGroup }
	| { readonly op: 'sort'; readonly sorts: readonly PeakSheetSortRule[] }
	| { readonly op: 'group'; readonly fieldId: string }
	| { readonly op: 'aggregate'; readonly metrics: readonly PeakSheetAggregateMetric[] }
	| { readonly op: 'topN'; readonly count: number; readonly fieldId: string; readonly direction?: 'asc' | 'desc' }
	| { readonly op: 'dedupe'; readonly fieldIds: readonly string[] }
	| { readonly op: 'cast'; readonly fieldId: string; readonly target: Extract<PeakSheetFieldType, 'text' | 'number' | 'date' | 'checkbox'> }
	| { readonly op: 'derive'; readonly fieldId: string; readonly formula: string }
	| { readonly op: 'chart'; readonly chartType: 'bar' | 'line' | 'pie'; readonly categoryFieldId: string; readonly metrics: readonly PeakSheetAggregateMetric[] };

export interface PeakSheetAnalysisPlan {
	readonly planId: string;
	readonly datasetId: string;
	readonly baseRevision: number;
	readonly steps: readonly PeakSheetAnalysisStep[];
	readonly limits?: { readonly maxRows?: number; readonly maxGroups?: number; readonly maxOutputBytes?: number };
}

export interface PeakSheetAnalysisGroup {
	readonly key: string;
	readonly rowCount: number;
	readonly metrics: Readonly<Record<string, number | null>>;
}

export interface PeakSheetChartPoint {
	readonly category: string;
	readonly values: Readonly<Record<string, number>>;
}

export interface PeakSheetAnalysisResult {
	readonly datasetId: string;
	readonly revision: number;
	readonly rows: readonly PeakSheetRow[];
	readonly groups?: readonly PeakSheetAnalysisGroup[];
	readonly metrics?: Readonly<Record<string, number | null>>;
	readonly chart?: {
		readonly type: 'bar' | 'line' | 'pie';
		readonly points: readonly PeakSheetChartPoint[];
	};
	readonly diagnostics: readonly string[];
}

export interface PeakSheetSelectionStats {
	readonly count: number;
	readonly numericCount: number;
	readonly sum: number | null;
	readonly average: number | null;
	readonly min: number | null;
	readonly max: number | null;
}

export interface PeakSheetDatasetDraft {
	readonly name: string;
	readonly fields: readonly PeakSheetFieldDefinition[];
	readonly rows: readonly PeakSheetRow[];
	readonly diagnostics: readonly string[];
	readonly source: 'manual' | 'ai' | 'csv' | 'json' | 'xlsx';
	readonly sourceHash?: string;
}

export interface PeakSheetWorkbookSheetDraft {
	readonly name: string;
	readonly draft: PeakSheetDatasetDraft;
	readonly compatibility: readonly string[];
}

export interface PeakSheetWorkbookDraft {
	readonly workbookName: string;
	readonly sheets: readonly PeakSheetWorkbookSheetDraft[];
	readonly diagnostics: readonly string[];
}
