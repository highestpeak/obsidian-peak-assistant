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
	alignLeft: string;
	alignCenter: string;
	alignRight: string;
	addRow: string;
	removeRow: string;
	addColumn: string;
	removeColumn: string;
	sort: string;
	formula: string;
	sumColumn: string;
	sumRow: string;
	merge: string;
	unmerge: string;
	transpose: string;
	csv: string;
	csvCopy: string;
	csvExport: string;
	csvImport: string;
	chart: string;
	summary: string;
	/** Reason shown when an action is unavailable but has no model reason. */
	noSelection: string;
	needRectangle: string;
	needMergedCell: string;
	parseError: string;
}

export interface ChartBlockStrings {
	bar: string;
	line: string;
	pie: string;
	loading: string;
	invalid: string;
	untitled: string;
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
		alignLeft: 'Left',
		alignCenter: 'Center',
		alignRight: 'Right',
		addRow: 'Add row',
		removeRow: 'Remove row',
		addColumn: 'Add column',
		removeColumn: 'Remove column',
		sort: 'Sort',
		formula: 'Formula',
		sumColumn: 'Sum column → total row',
		sumRow: 'Sum row → total column',
		merge: 'Merge',
		unmerge: 'Unmerge',
		transpose: 'Transpose',
		csv: 'CSV',
		csvCopy: 'Copy as CSV',
		csvExport: 'Export CSV',
		csvImport: 'Import CSV',
		chart: 'Chart',
		summary: 'Summary',
		noSelection: 'Select a cell first',
		needRectangle: 'Select a clean rectangle of cells to merge',
		needMergedCell: 'Select a merged cell to unmerge',
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
	},
};
