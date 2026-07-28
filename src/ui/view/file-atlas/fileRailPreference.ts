import type { FileAtlasRailConfig } from './config/fileAtlasConfig';
import type { FileRailSortMode } from './fileRailModel';

export interface FileRailPreference {
	sortMode: FileRailSortMode;
	widthPx: number;
}

export const FILE_ATLAS_RAIL_STORAGE_KEY = 'peak-assistant.file-atlas.rail.v1';

const SORT_MODES = new Set<FileRailSortMode>(['frequent', 'name']);

function clampWidth(widthPx: number, config: FileAtlasRailConfig): number {
	if (!Number.isFinite(widthPx)) return config.defaultWidthPx;
	return Math.round(Math.min(config.maxWidthPx, Math.max(config.minWidthPx, widthPx)));
}

export function defaultFileRailPreference(config: FileAtlasRailConfig): FileRailPreference {
	return { sortMode: 'frequent', widthPx: config.defaultWidthPx };
}

export function decodeFileRailPreference(
	raw: string | null | undefined,
	config: FileAtlasRailConfig,
): FileRailPreference {
	const fallback = defaultFileRailPreference(config);
	if (!raw) return fallback;
	try {
		const parsed = JSON.parse(raw) as Partial<FileRailPreference> | null;
		if (!parsed || typeof parsed !== 'object') return fallback;
		const storedSortMode = (parsed as { sortMode?: string }).sortMode;
		const sortMode: FileRailSortMode = storedSortMode === 'recent'
			? 'frequent'
			: SORT_MODES.has(storedSortMode as FileRailSortMode)
				? storedSortMode as FileRailSortMode
				: fallback.sortMode;
		return {
			sortMode,
			widthPx: clampWidth(Number(parsed.widthPx), config),
		};
	} catch {
		return fallback;
	}
}

export function encodeFileRailPreference(
	preference: FileRailPreference,
	config: FileAtlasRailConfig,
): string {
	return JSON.stringify({
		sortMode: SORT_MODES.has(preference.sortMode) ? preference.sortMode : 'frequent',
		widthPx: clampWidth(preference.widthPx, config),
	});
}

function resolveStorage(doc: Document | null | undefined): Storage | null {
	try {
		const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
		return win?.localStorage ?? null;
	} catch {
		return null;
	}
}

export function readFileRailPreference(
	config: FileAtlasRailConfig,
	doc?: Document | null,
): FileRailPreference {
	const storage = resolveStorage(doc ?? (typeof document !== 'undefined' ? document : null));
	if (!storage) return defaultFileRailPreference(config);
	try {
		return decodeFileRailPreference(storage.getItem(FILE_ATLAS_RAIL_STORAGE_KEY), config);
	} catch {
		return defaultFileRailPreference(config);
	}
}

export function writeFileRailPreference(
	preference: FileRailPreference,
	config: FileAtlasRailConfig,
	doc?: Document | null,
): void {
	const storage = resolveStorage(doc ?? (typeof document !== 'undefined' ? document : null));
	if (!storage) return;
	try {
		storage.setItem(FILE_ATLAS_RAIL_STORAGE_KEY, encodeFileRailPreference(preference, config));
	} catch {
		// UI preference persistence is best-effort.
	}
}
