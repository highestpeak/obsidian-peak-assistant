/**
 * File Atlas — config drift guard.
 *
 * Asserts templates/config/file-atlas.json and the compiled fallback
 * DEFAULT_FILE_ATLAS_CONFIG stay shape-compatible (same kinds, groups, presets,
 * string keys). Also checks every preset/kind references a real kind and that
 * every kind has an icon in the icon map.
 *
 * Run: npm run test -- test/file-atlas-config.test.ts
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_FILE_ATLAS_CONFIG } from '@/ui/view/file-atlas/config/fileAtlasConfig';
import { iconForKind } from '@/ui/view/file-atlas/config/kindIcons';
import { RawBlockKind } from '@/core/document/atlas/types';

let passed = 0;
function ok(label: string, fn: () => void): void {
	fn();
	passed += 1;
	console.log(`PASS: ${label}`);
}

console.log('=== File Atlas config drift guard ===');

const jsonPath = path.join(__dirname, '..', 'templates', 'config', 'file-atlas.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

ok('kind keys identical between JSON and fallback', () => {
	const jsonKinds = Object.keys(json.kinds).sort();
	const fbKinds = Object.keys(DEFAULT_FILE_ATLAS_CONFIG.kinds).sort();
	assert.deepStrictEqual(jsonKinds, fbKinds, 'kind maps must match');
});

ok('each kind has identical label/badge/type/category/group', () => {
	for (const key of Object.keys(json.kinds)) {
		assert.deepStrictEqual(
			json.kinds[key],
			DEFAULT_FILE_ATLAS_CONFIG.kinds[key],
			`kind "${key}" must match between JSON and fallback`
		);
	}
});

ok('preset ids and kinds match', () => {
	const jsonPresets = json.presets.map((p: any) => ({ id: p.id, label: p.label, kinds: p.kinds }));
	const fbPresets = DEFAULT_FILE_ATLAS_CONFIG.presets.map((p) => ({ id: p.id, label: p.label, kinds: p.kinds }));
	assert.deepStrictEqual(jsonPresets, fbPresets, 'presets must match');
});

ok('filter groups match', () => {
	assert.deepStrictEqual(json.filterGroups, DEFAULT_FILE_ATLAS_CONFIG.filterGroups);
});

ok('display identity config matches', () => {
	assert.deepStrictEqual(json.identity, DEFAULT_FILE_ATLAS_CONFIG.identity);
});

ok('rail settings match', () => {
	assert.deepStrictEqual(json.rail, DEFAULT_FILE_ATLAS_CONFIG.rail);
});

ok('string keys match', () => {
	assert.deepStrictEqual(
		Object.keys(json.strings).sort(),
		Object.keys(DEFAULT_FILE_ATLAS_CONFIG.strings).sort(),
		'string key sets must match'
	);
});

ok('every preset kind references a real kind', () => {
	const known = new Set(Object.keys(DEFAULT_FILE_ATLAS_CONFIG.kinds));
	for (const preset of DEFAULT_FILE_ATLAS_CONFIG.presets) {
		for (const k of preset.kinds) {
			assert.ok(known.has(k), `preset "${preset.id}" references unknown kind "${k}"`);
		}
	}
});

ok('every kind belongs to a declared filter group', () => {
	const groups = new Set(DEFAULT_FILE_ATLAS_CONFIG.filterGroups.map((g) => g.id));
	for (const [k, cfg] of Object.entries(DEFAULT_FILE_ATLAS_CONFIG.kinds)) {
		assert.ok(groups.has(cfg.group), `kind "${k}" in undeclared group "${cfg.group}"`);
	}
});

ok('Phase 1 excludes insight/issue kinds from presets', () => {
	const insightish = ['claim', 'evidence', 'example', 'action', 'decision', 'question', 'issue'];
	for (const preset of DEFAULT_FILE_ATLAS_CONFIG.presets) {
		for (const bad of insightish) {
			assert.ok(!preset.kinds.includes(bad as any), `preset "${preset.id}" must not include "${bad}" in Phase 1`);
		}
	}
});

ok('every raw block kind (except file-root) has an icon', () => {
	for (const kind of Object.values(RawBlockKind)) {
		if (kind === RawBlockKind.FileRoot) continue;
		const Icon = iconForKind(kind);
		assert.ok(typeof Icon === 'function' || typeof Icon === 'object', `kind "${kind}" has no icon`);
	}
});

console.log(`\n=== All ${passed} File Atlas config tests passed ===`);
