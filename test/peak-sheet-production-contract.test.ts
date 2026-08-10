import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function source(relative: string): string { return fs.readFileSync(path.join(root, relative), 'utf8'); }

function testProductionSurfaceContract(): void {
	const viewTypes = source('src/app/ui-host/views/types.ts');
	const manager = source('src/app/ui-host/views/ViewManager.ts');
	const main = source('main.ts');
	const cssEntry = source('src/styles/tailwind.css');
	assert.match(viewTypes, /PEAK_SHEET_VIEW_TYPE = 'peak-sheet-view'/);
	assert.ok(viewTypes.indexOf('PEAK_SHEET_VIEW_TYPE,') > viewTypes.indexOf('STANDALONE_PEAK_VIEW_TYPES'));
	assert.match(manager, /activatePeakSheetView/);
	assert.match(main, /setPeakSheetRuntime/);
	assert.match(main, /setPeakSheetRuntime\(peakSheetRuntime\)/);
	assert.match(main, /createPeakSheet: async/);
	assert.match(main, /runtime\.createBlankDataset\(\)/);
	assert.match(source('src/app/commands/gateway/manifests.ts'), /'peak-create-sheet'/);
	assert.match(cssEntry, /peak-sheet\.css/);
	console.log('PASS: Peak Sheet is registered as an app-owned standalone production view');
}

function testUiAndAiContract(): void {
	const uiDirectory = path.join(root, 'src/ui/view/peak-sheet');
	const uiSources = fs.readdirSync(uiDirectory).filter((file) => file.endsWith('.tsx')).map((file) => source(`src/ui/view/peak-sheet/${file}`)).join('\n');
	assert.doesNotMatch(uiSources, /<button\b/, 'Peak Sheet must use the shared Button primitive');
	for (const view of ['PeakSheetTable', 'PeakSheetChart', 'PeakSheetBoard', 'PeakSheetCalendar']) assert.match(uiSources, new RegExp(view));
	for (const fieldType of ['text', 'number', 'date', 'singleSelect', 'checkbox', 'link', 'file']) assert.match(uiSources, new RegExp(`['"]${fieldType}['"]`));
	assert.match(source('src/app/sheet/PeakSheetAttachmentAdapter.ts'), /kind: 'external-copy'/);
	assert.match(uiSources, /Copy external file into Peak attachments/);
	const tools = source('src/service/chat/tools/peakSheetTools.ts');
	for (const tool of ['peak_sheet_list', 'peak_sheet_query', 'peak_sheet_analyze', 'peak_sheet_patch', 'peak_sheet_create']) assert.match(tools, new RegExp(tool));
	assert.match(tools, /No arbitrary JavaScript or Python/);
	console.log('PASS: Peak Sheet view, field and safe AI tool contracts are present');
}

testProductionSurfaceContract();
testUiAndAiContract();
