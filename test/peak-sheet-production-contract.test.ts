import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function source(relative: string): string { return fs.readFileSync(path.join(root, relative), 'utf8'); }

function testProductionSurfaceContract(): void {
	const viewTypes = source('src/app/ui-host/views/types.ts');
	const manager = source('src/app/ui-host/views/ViewManager.ts');
	const view = source('src/app/ui-host/views/PeakSheetView.tsx');
	const main = source('main.ts');
	const cssEntry = source('src/styles/tailwind.css');
	assert.match(viewTypes, /PEAK_SHEET_VIEW_TYPE = 'peak-sheet-view'/);
	assert.match(manager, /registerExtensions\(\['peaksheet'\], PEAK_SHEET_VIEW_TYPE\)/);
	assert.match(manager, /openPeakSheetFile/);
	assert.match(view, /extends ReactFileViewHost/);
	assert.match(view, /runtime\.openFile\(file\.path\)/);
	assert.match(main, /setPeakSheetRuntime/);
	assert.match(main, /setPeakSheetRuntime\(peakSheetRuntime\)/);
	assert.match(main, /createPeakSheet: async/);
	assert.match(main, /runtime\.createBlankDataset\(\{ folderPath \}\)/);
	assert.match(main, /AppPeakSheetFileRepository/);
	assert.match(source('src/app/commands/gateway/manifests.ts'), /'peak-create-sheet'/);
	assert.match(cssEntry, /peak-sheet\.css/);
	console.log('PASS: Peak Sheet is registered as a file-native production view');
}

function testUiAndAiContract(): void {
	const uiDirectory = path.join(root, 'src/ui/view/peak-sheet');
	const uiSources = fs.readdirSync(uiDirectory).filter((file) => file.endsWith('.tsx')).map((file) => source(`src/ui/view/peak-sheet/${file}`)).join('\n');
	const gridState = source('src/ui/view/peak-sheet/PeakSheetGridState.ts');
	assert.doesNotMatch(uiSources, /<button\b/, 'Peak Sheet must use the shared Button primitive');
	assert.doesNotMatch(uiSources, /Find a sheet|New sheet/, 'Vault File Explorer owns sheet navigation and creation discovery');
	assert.doesNotMatch(uiSources, /New record|Create typed field|Field name/, 'Virtual grid materializes rows and fields without legacy creation forms');
	assert.match(gridState, /PEAK_SHEET_MIN_ROWS = 64/);
	assert.match(gridState, /PEAK_SHEET_MIN_COLUMNS = 30/);
	assert.match(uiSources, /peakSheetColumnName/);
	assert.match(uiSources, /peak-sheet-formula-bar/);
	assert.match(uiSources, /onContextMenu/);
	assert.match(uiSources, /Resize/);
	assert.match(uiSources, /MoreMenu/);
	assert.match(uiSources, /\.csv/);
	assert.match(uiSources, /\.xlsx/);
	for (const view of ['PeakSheetTable', 'PeakSheetBoard', 'PeakSheetCalendar', 'PeakSheetAiDrawer', 'PeakSheetScriptsDrawer']) assert.match(uiSources, new RegExp(view));
	const sheetTypes = source('src/core/sheet/types.ts');
	for (const fieldType of ['text', 'number', 'date', 'singleSelect', 'checkbox', 'link', 'file']) assert.match(sheetTypes, new RegExp(`['"]${fieldType}['"]`));
	assert.match(source('src/app/sheet/PeakSheetAttachmentAdapter.ts'), /kind: 'external-copy'/);
	assert.match(gridState, /kind: 'vault', vaultPath: text/);
	assert.match(uiSources, /groupByFields/);
	assert.match(uiSources, /Drag/);
	assert.match(uiSources, /Formula ready/);
	assert.match(uiSources, /Local execution/);
	assert.match(uiSources, /scope === 'selection' \? selectedRowIds/);
	const tools = source('src/service/chat/tools/peakSheetTools.ts');
	for (const tool of ['peak_sheet_list', 'peak_sheet_query', 'peak_sheet_analyze', 'peak_sheet_script', 'peak_sheet_patch', 'peak_sheet_create']) assert.match(tools, new RegExp(tool));
	assert.match(tools, /No arbitrary JavaScript or Python/);
	assert.match(tools, /filePath/);
	console.log('PASS: Peak Sheet view, field and safe AI tool contracts are present');
}

testProductionSurfaceContract();
testUiAndAiContract();
