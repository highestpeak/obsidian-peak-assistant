import assert from 'node:assert/strict';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import { DEFAULT_FILE_ATLAS_CONFIG } from '@/ui/view/file-atlas/config/fileAtlasConfig';
import {
	applyFileAtlasPresetOverrides,
	decodeFileAtlasPresetOverrides,
	encodeFileAtlasPresetOverrides,
} from '@/ui/view/file-atlas/fileAtlasPresetPreference';

const decoded = decodeFileAtlasPresetOverrides(JSON.stringify({
	overview: [Kind.Paragraph, Kind.Task, Kind.Task, 'not-a-kind'],
	all: [Kind.Task],
	unknown: [Kind.Code],
}), DEFAULT_FILE_ATLAS_CONFIG);

assert.deepEqual(decoded, {
	overview: [Kind.Paragraph, Kind.Task],
});
assert.deepEqual(
	JSON.parse(encodeFileAtlasPresetOverrides(decoded, DEFAULT_FILE_ATLAS_CONFIG)),
	decoded,
);

const applied = applyFileAtlasPresetOverrides(DEFAULT_FILE_ATLAS_CONFIG, decoded);
assert.deepEqual(applied.presets.find((preset) => preset.id === 'overview')?.kinds, [
	Kind.Paragraph,
	Kind.Task,
]);
assert.deepEqual(
	applied.presets.find((preset) => preset.id === 'all')?.kinds,
	DEFAULT_FILE_ATLAS_CONFIG.presets.find((preset) => preset.id === 'all')?.kinds,
	'All elements remains a locked literal escape hatch',
);
assert.deepEqual(
	DEFAULT_FILE_ATLAS_CONFIG.presets.find((preset) => preset.id === 'overview')?.kinds,
	[Kind.Task, Kind.Callout, Kind.Table, Kind.Mermaid, Kind.Image, Kind.Embed, Kind.Attachment, Kind.VaultLink, Kind.ExternalLink, Kind.Footnote],
	'applying overrides must not mutate the built-in config',
);

console.log('PASS: File Atlas preset overrides are validated, persisted, and keep All elements locked');
