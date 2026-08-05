import type { RawBlockKind } from '@/core/document/atlas/types';
import type { FileAtlasConfig } from './config/fileAtlasConfig';

export type FileAtlasPresetOverrides = Record<string, RawBlockKind[]>;

export const FILE_ATLAS_PRESET_STORAGE_KEY = 'peak-assistant.file-atlas.presets.v1';

const LOCKED_PRESET_IDS = new Set(['all']);

function configurablePresetIds(config: FileAtlasConfig): Set<string> {
	return new Set(
		config.presets
			.filter((preset) => !LOCKED_PRESET_IDS.has(preset.id))
			.map((preset) => preset.id),
	);
}

function filterableKinds(config: FileAtlasConfig): Set<RawBlockKind> {
	return new Set(
		Object.entries(config.kinds)
			.filter(([, kind]) => kind.filterable !== false)
			.map(([kind]) => kind as RawBlockKind),
	);
}

export function decodeFileAtlasPresetOverrides(
	raw: string | null | undefined,
	config: FileAtlasConfig,
): FileAtlasPresetOverrides {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const presetIds = configurablePresetIds(config);
		const kinds = filterableKinds(config);
		const overrides: FileAtlasPresetOverrides = {};
		for (const [presetId, value] of Object.entries(parsed)) {
			if (!presetIds.has(presetId) || !Array.isArray(value)) continue;
			const clean = value.filter(
				(kind): kind is RawBlockKind => typeof kind === 'string' && kinds.has(kind as RawBlockKind),
			);
			overrides[presetId] = [...new Set(clean)];
		}
		return overrides;
	} catch {
		return {};
	}
}

export function encodeFileAtlasPresetOverrides(
	overrides: FileAtlasPresetOverrides,
	config: FileAtlasConfig,
): string {
	return JSON.stringify(decodeFileAtlasPresetOverrides(JSON.stringify(overrides), config));
}

export function applyFileAtlasPresetOverrides(
	config: FileAtlasConfig,
	overrides: FileAtlasPresetOverrides,
): FileAtlasConfig {
	return {
		...config,
		presets: config.presets.map((preset) => {
			if (LOCKED_PRESET_IDS.has(preset.id)) return preset;
			return {
				...preset,
				kinds: overrides[preset.id] ? [...overrides[preset.id]] : preset.kinds,
			};
		}),
	};
}

function resolveStorage(doc: Document | null | undefined): Storage | null {
	try {
		const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
		return win?.localStorage ?? null;
	} catch {
		return null;
	}
}

export function readFileAtlasPresetOverrides(
	config: FileAtlasConfig,
	doc?: Document | null,
): FileAtlasPresetOverrides {
	const storage = resolveStorage(doc ?? (typeof document !== 'undefined' ? document : null));
	if (!storage) return {};
	try {
		return decodeFileAtlasPresetOverrides(storage.getItem(FILE_ATLAS_PRESET_STORAGE_KEY), config);
	} catch {
		return {};
	}
}

export function writeFileAtlasPresetOverrides(
	overrides: FileAtlasPresetOverrides,
	config: FileAtlasConfig,
	doc?: Document | null,
): void {
	const storage = resolveStorage(doc ?? (typeof document !== 'undefined' ? document : null));
	if (!storage) return;
	try {
		storage.setItem(FILE_ATLAS_PRESET_STORAGE_KEY, encodeFileAtlasPresetOverrides(overrides, config));
	} catch {
		// UI preference persistence is best-effort.
	}
}
