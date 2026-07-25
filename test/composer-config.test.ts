/**
 * Peak Composer — config drift guard (WP1). Keeps templates/config/composer.json
 * shape-compatible with the compiled fallback in composerConfig.ts, so an edit
 * to one without the other is caught. Mirrors test/file-atlas-config.test.ts.
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer/config/composerConfig';
import { DEFAULT_TRANSACTION_CONFIG } from '@/core/composer';

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

	// WP2: transaction timing/grouping knobs mirror DEFAULT_TRANSACTION_CONFIG.
	const fbTxn = Object.keys(DEFAULT_TRANSACTION_CONFIG).sort();
	const jsonTxn = Object.keys(json.transaction ?? {}).filter((k) => !k.startsWith('_')).sort();
	check('transaction keys match', fbTxn.join(',') === jsonTxn.join(','), `fb=${fbTxn.join(',')} json=${jsonTxn.join(',')}`);
	check('transaction values match', (json.transaction?.burstWindowMs ?? null) === DEFAULT_TRANSACTION_CONFIG.burstWindowMs);

	console.log(`composer-config: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
