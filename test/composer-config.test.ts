/**
 * Peak Composer — config drift guard (WP1). Keeps templates/config/composer.json
 * shape-compatible with the compiled fallback in composerConfig.ts, so an edit
 * to one without the other is caught. Mirrors test/file-atlas-config.test.ts.
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer/config/composerConfig';
import { DEFAULT_TABLE_BLOCK_STRINGS } from '@/ui/view/composer/blocks/table/tableViewConfig';
import { DEFAULT_TRANSACTION_CONFIG } from '@/core/composer';
import { DEFAULT_COMPOSER_STORAGE_CONFIG } from '@/app/composer/ComposerStorageConfig';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function main(): void {
	const jsonPath = path.join(process.cwd(), 'templates', 'config', 'composer.json');
	const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

	const fbKinds = Object.keys(DEFAULT_COMPOSER_CONFIG.kinds).sort();
	const jsonKinds = Object.keys(json.kinds ?? {}).sort();
	check('kind keys match', fbKinds.join(',') === jsonKinds.join(','), `fb=${fbKinds.length} json=${jsonKinds.length}`);

	const fbStrings = Object.keys(DEFAULT_COMPOSER_CONFIG.strings).sort();
	const jsonStrings = Object.keys(json.strings ?? {}).sort();
	check('string keys match', fbStrings.join(',') === jsonStrings.join(','), `fb=${fbStrings.length} json=${jsonStrings.length}`);
	check(
		'preparation keys match',
		Object.keys(DEFAULT_COMPOSER_CONFIG.preparation).sort().join(',') ===
			Object.keys(json.preparation ?? {}).filter((key) => !key.startsWith('_')).sort().join(','),
	);
	check(
		'virtualization keys match',
		Object.keys(DEFAULT_COMPOSER_CONFIG.virtualization).sort().join(',') ===
			Object.keys(json.virtualization ?? {}).filter((key) => !key.startsWith('_')).sort().join(','),
	);

	// WP4: chrome section top-level + selection sub-keys mirror the fallback.
	const fbChrome = Object.keys(DEFAULT_COMPOSER_CONFIG.chrome).sort();
	const jsonChrome = Object.keys(json.chrome ?? {}).filter((k) => !k.startsWith('_')).sort();
	check('chrome keys match', fbChrome.join(',') === jsonChrome.join(','), `fb=${fbChrome.join(',')} json=${jsonChrome.join(',')}`);
	const fbSel = Object.keys(DEFAULT_COMPOSER_CONFIG.chrome.selection).sort();
	const jsonSel = Object.keys(json.chrome?.selection ?? {}).sort();
	check('chrome.selection keys match', fbSel.join(',') === jsonSel.join(','), `fb=${fbSel.join(',')} json=${jsonSel.join(',')}`);
	check(
		'chrome.find keys match',
		Object.keys(DEFAULT_COMPOSER_CONFIG.chrome.find).sort().join(',') ===
			Object.keys(json.chrome?.find ?? {}).sort().join(','),
	);
	check(
		'chrome.documentTitle keys match',
		Object.keys(DEFAULT_COMPOSER_CONFIG.chrome.documentTitle).sort().join(',') ===
			Object.keys(json.chrome?.documentTitle ?? {}).sort().join(','),
	);
	check(
		'chrome.actions keys match',
		Object.keys(DEFAULT_COMPOSER_CONFIG.chrome.actions).sort().join(',') ===
			Object.keys(json.chrome?.actions ?? {}).sort().join(','),
	);
	const fbComment = DEFAULT_COMPOSER_CONFIG.chrome.comment;
	const jsonComment = json.chrome?.comment ?? {};
	check(
		'chrome.comment keys match',
		Object.keys(fbComment).sort().join(',') === Object.keys(jsonComment).sort().join(','),
	);
	check(
		'comment rail breakpoint matches',
		jsonComment.railBreakpointPx === fbComment.railBreakpointPx,
		`fb=${fbComment.railBreakpointPx} json=${String(jsonComment.railBreakpointPx)}`,
	);
	const fallbackInsertTypes = DEFAULT_COMPOSER_CONFIG.chrome.insertDraft.types;
	const jsonInsertTypes = json.chrome?.insertDraft?.types ?? [];
	check(
		'chrome.insertDraft keys match',
		Object.keys(DEFAULT_COMPOSER_CONFIG.chrome.insertDraft).sort().join(',') ===
			Object.keys(json.chrome?.insertDraft ?? {}).sort().join(','),
	);
	check('insert draft exposes Markdown plus complex object choices', fallbackInsertTypes.length === 6, String(fallbackInsertTypes.length));
	check(
		'insert draft type ids match',
		fallbackInsertTypes.map((type) => type.id).join(',') === jsonInsertTypes.map((type: { id: string }) => type.id).join(','),
	);
	check(
		'insert draft type shapes match',
		fallbackInsertTypes.every((type, index) => Object.keys(type).sort().join(',') === Object.keys(jsonInsertTypes[index] ?? {}).sort().join(',')),
	);

	// WP2: transaction timing/grouping knobs mirror DEFAULT_TRANSACTION_CONFIG.
	const fbTxn = Object.keys(DEFAULT_TRANSACTION_CONFIG).sort();
	const jsonTxn = Object.keys(json.transaction ?? {}).filter((k) => !k.startsWith('_')).sort();
	check('transaction keys match', fbTxn.join(',') === jsonTxn.join(','), `fb=${fbTxn.join(',')} json=${jsonTxn.join(',')}`);
	check('transaction values match', (json.transaction?.burstWindowMs ?? null) === DEFAULT_TRANSACTION_CONFIG.burstWindowMs);
	check('transaction scrollGuardGestureWindowMs matches', (json.transaction?.scrollGuardGestureWindowMs ?? null) === DEFAULT_TRANSACTION_CONFIG.scrollGuardGestureWindowMs);

	// Runtime records are DataStore-owned and their retention/compaction knobs
	// stay config-backed rather than becoming logic-file literals.
	const fbStorage = Object.keys(DEFAULT_COMPOSER_STORAGE_CONFIG).sort();
	const jsonStorage = Object.keys(json.storage ?? {}).filter((key) => !key.startsWith('_')).sort();
	check(
		'storage keys match',
		fbStorage.join(',') === jsonStorage.join(','),
		`fb=${fbStorage.join(',')} json=${jsonStorage.join(',')}`,
	);
	check(
		'storage values match',
		fbStorage.every((key) =>
			json.storage?.[key] === DEFAULT_COMPOSER_STORAGE_CONFIG[key as keyof typeof DEFAULT_COMPOSER_STORAGE_CONFIG]),
	);

	// WP6: table + chart block UI copy mirrors the typed fallback.
	const fbTblToolbar = Object.keys(DEFAULT_TABLE_BLOCK_STRINGS.toolbar).sort();
	const jsonTblToolbar = Object.keys(json.table?.toolbar ?? {}).sort();
	check('table.toolbar keys match', fbTblToolbar.join(',') === jsonTblToolbar.join(','), `fb=${fbTblToolbar.length} json=${jsonTblToolbar.length}`);
	const fbTblSel = Object.keys(DEFAULT_TABLE_BLOCK_STRINGS.selection).sort();
	const jsonTblSel = Object.keys(json.table?.selection ?? {}).sort();
	check('table.selection keys match', fbTblSel.join(',') === jsonTblSel.join(','), `fb=${fbTblSel.join(',')} json=${jsonTblSel.join(',')}`);
	const fbChart = Object.keys(DEFAULT_TABLE_BLOCK_STRINGS.chart).sort();
	const jsonChart = Object.keys(json.chart ?? {}).filter((k) => !k.startsWith('_')).sort();
	check('chart keys match', fbChart.join(',') === jsonChart.join(','), `fb=${fbChart.join(',')} json=${jsonChart.join(',')}`);

	console.log(`composer-config: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
