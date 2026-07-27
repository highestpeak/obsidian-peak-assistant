/**
 * Composer table/chart runtime config contract.
 *
 * The template owns user-facing table/chart copy. This verifies the config
 * loader's merge seam rather than a component-local fallback, so a production
 * ComposerRoot receives the Chinese template values and partial templates keep
 * compiled defaults for omitted keys.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	DEFAULT_COMPOSER_CONFIG,
	mergeComposerConfig,
	type ComposerConfigPatch,
} from '@/ui/view/composer/config/composerConfig';

function main(): void {
	const jsonPath = path.join(process.cwd(), 'templates', 'config', 'composer.json');
	const template = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as ComposerConfigPatch;
	const resolved = mergeComposerConfig(template);

	assert.strictEqual(resolved.table.toolbar.format, template.table?.toolbar.format);
	assert.strictEqual(resolved.table.toolbar.mergedCells, template.table?.toolbar.mergedCells);
	assert.strictEqual(resolved.table.selection.cellsSelected, template.table?.selection.cellsSelected);
	assert.strictEqual(resolved.chart.typeSwitchLabel, template.chart?.typeSwitchLabel);

	const partial = mergeComposerConfig({
		table: { toolbar: { format: 'Custom format' } },
		chart: { bar: 'Custom bar' },
	});
	assert.strictEqual(partial.table.toolbar.format, 'Custom format');
	assert.strictEqual(partial.table.toolbar.mergedCells, DEFAULT_COMPOSER_CONFIG.table.toolbar.mergedCells);
	assert.strictEqual(partial.table.selection.none, DEFAULT_COMPOSER_CONFIG.table.selection.none);
	assert.strictEqual(partial.chart.bar, 'Custom bar');
	assert.strictEqual(partial.chart.typeSwitchLabel, DEFAULT_COMPOSER_CONFIG.chart.typeSwitchLabel);

	console.log('composer-table-chart-runtime-config: template and fallback merge contract passed');
}

main();
