/**
 * Peak Composer — table + chart block UI strings (WP6, configurability rule).
 *
 * No inline i18n in the components: labels/tooltips route through this typed
 * fallback, mirrored by the `table` / `chart` top-level keys in
 * `templates/config/composer.json` (drift-guarded like the other composer
 * config sections). The fallback is authoritative until the composer view wires
 * the JSON through TemplateManager.
 */

import type { TableSelectionStrings } from '@/service/composer';

export interface TableToolbarStrings {
	format: string;
	align: string;
	alignHint: string;
	alignLeft: string;
	alignLeftHint: string;
	alignCenter: string;
	alignCenterHint: string;
	alignRight: string;
	alignRightHint: string;
	addRow: string;
	addRowHint: string;
	removeRow: string;
	removeRowHint: string;
	addColumn: string;
	addColumnHint: string;
	removeColumn: string;
	removeColumnHint: string;
	sort: string;
	sortHint: string;
	formula: string;
	formulaHint: string;
	sumColumn: string;
	sumRow: string;
	merge: string;
	mergeHint: string;
	unmerge: string;
	unmergeHint: string;
	transpose: string;
	transposeHint: string;
	csv: string;
	csvHint: string;
	csvCopy: string;
	csvExport: string;
	csvImport: string;
	chart: string;
	chartHint: string;
	/** Hover delay for the table's own tooltip surface. */
	tooltipDelayMs: number;
	summary: string;
	/** Reason shown when an action is unavailable but has no model reason. */
	noSelection: string;
	needRectangle: string;
	needMergedCell: string;
	/** Suffix used when formula actions are blocked by merged cells. */
	mergedCells: string;
	parseError: string;
}

export interface ChartBlockStrings {
	bar: string;
	line: string;
	pie: string;
	loading: string;
	invalid: string;
	untitled: string;
	/** Accessible label for the bar / line / pie switch. */
	typeSwitchLabel: string;
}

export interface TableBlockStrings {
	toolbar: TableToolbarStrings;
	selection: TableSelectionStrings;
	chart: ChartBlockStrings;
}

export const DEFAULT_TABLE_BLOCK_STRINGS: TableBlockStrings = {
	toolbar: {
		format: 'Format',
		align: 'Align',
		alignHint: 'Set alignment for the active column',
		alignLeft: 'Left',
		alignLeftHint: 'Left-align the active column',
		alignCenter: 'Center',
		alignCenterHint: 'Center the active column',
		alignRight: 'Right',
		alignRightHint: 'Right-align the active column',
		addRow: 'Add row',
		addRowHint: 'Insert a row below the active row',
		removeRow: 'Remove row',
		removeRowHint: 'Delete the active row',
		addColumn: 'Add column',
		addColumnHint: 'Insert a column after the active column',
		removeColumn: 'Remove column',
		removeColumnHint: 'Delete the active column',
		sort: 'Sort',
		sortHint: 'Sort rows by the active column',
		formula: 'Formula',
		formulaHint: 'Calculate totals from the current table',
		sumColumn: 'Sum column → total row',
		sumRow: 'Sum row → total column',
		merge: 'Merge',
		mergeHint: 'Merge the selected rectangular cell range',
		unmerge: 'Unmerge',
		unmergeHint: 'Split the selected merged cell',
		transpose: 'Transpose',
		transposeHint: 'Swap table rows and columns',
		csv: 'CSV',
		csvHint: 'Copy, import, or export CSV',
		csvCopy: 'Copy as CSV',
		csvExport: 'Export CSV',
		csvImport: 'Import CSV',
		chart: 'Chart',
		chartHint: 'Create a chart block from this table',
		tooltipDelayMs: 40,
		summary: 'Summary',
		noSelection: 'Select a cell first',
		needRectangle: 'Select a clean rectangle of cells to merge',
		needMergedCell: 'Select a merged cell to unmerge',
		mergedCells: 'merged cells',
		parseError: 'This table could not be parsed for editing',
	},
	selection: {
		cellsSelected: '{count} cells selected',
		singleCell: 'Row {row}, column {col} selected',
		rangeCells: 'Rows {r0} to {r1}, columns {c0} to {c1} selected',
		none: 'No cells selected',
	},
	chart: {
		bar: 'Bar',
		line: 'Line',
		pie: 'Pie',
		loading: 'Loading chart…',
		invalid: 'Invalid chart source',
		untitled: 'Chart',
		typeSwitchLabel: 'Chart type',
	},
};
