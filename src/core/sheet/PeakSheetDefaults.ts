/**
 * Compiled fallback mirrored by `templates/config/peak-sheet.json`.
 * TemplateManager may override the UI copy and operational limits at runtime.
 */
export const PEAK_SHEET_DEFAULTS = Object.freeze({
	limits: {
		maxImportRows: 5_000,
		maxImportColumns: 100,
		maxImportBytes: 8_000_000,
		maxWorkbookEntries: 2_000,
		maxWorkbookExpandedBytes: 64_000_000,
		maxAnalysisRows: 500,
		maxAnalysisGroups: 100,
		maxAnalysisOutputBytes: 160_000,
	},
	field: {
		defaultWidth: 160,
		minWidth: 72,
		maxWidth: 720,
	},
	chart: {
		palette: ['#7456a8', '#2f7d78', '#b56b3f', '#4f6f9d', '#9b496b', '#66724c'],
	},
});

export type PeakSheetOperationalDefaults = typeof PEAK_SHEET_DEFAULTS;
