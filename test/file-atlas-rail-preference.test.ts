import assert from 'assert';
import {
	decodeFileRailPreference,
	defaultFileRailPreference,
	encodeFileRailPreference,
} from '@/ui/view/file-atlas/fileRailPreference';
import type { FileAtlasRailConfig } from '@/ui/view/file-atlas/config/fileAtlasConfig';

const config: FileAtlasRailConfig = {
	capacity: 24,
	defaultWidthPx: 300,
	minWidthPx: 260,
	maxWidthPx: 420,
	frequencyHalfLifeDays: 30,
};

assert.deepStrictEqual(
	decodeFileRailPreference(null, config),
	defaultFileRailPreference(config),
);
assert.deepStrictEqual(
	decodeFileRailPreference('{"sortMode":"frequent","widthPx":999}', config),
	{ sortMode: 'frequent', widthPx: 420 },
);
assert.deepStrictEqual(
	decodeFileRailPreference('{"sortMode":"unknown","widthPx":100}', config),
	{ sortMode: 'frequent', widthPx: 260 },
);
assert.deepStrictEqual(
	decodeFileRailPreference('{"sortMode":"recent","widthPx":300}', config),
	{ sortMode: 'frequent', widthPx: 300 },
	'legacy recent preference migrates to the stable Most used mode',
);
assert.deepStrictEqual(
	JSON.parse(encodeFileRailPreference({ sortMode: 'name', widthPx: 320.4 }, config)),
	{ sortMode: 'name', widthPx: 320 },
);

console.log('PASS: File Atlas rail preference decoding and clamping');
