/**
 * Framework-neutral file-view and navigation contracts for Peak Composer.
 *
 * `DefaultDocumentView` is a workspace policy for future opens. It is not the
 * same state as `ComposerDisplayMode`, which only controls the current
 * Composer leaf's presentation.
 */

export type DefaultDocumentView = 'markdown' | 'composer';
export type ComposerDisplayMode = 'edit' | 'clean';
export type ComposerOpenDisposition =
	| 'reuse-existing'
	| 'replace-current'
	| 'new-tab'
	| 'split';

export interface ComposerViewStateV2 {
	version: 2;
	filePath: string;
	displayMode: ComposerDisplayMode;
	selectedBlockId?: string;
	scrollAnchor?: unknown;
}

export interface ComposerOpenRequest {
	filePath: string;
	view?: DefaultDocumentView;
	disposition: ComposerOpenDisposition;
	reason:
		| 'command'
		| 'file-atlas'
		| 'search'
		| 'wikilink'
		| 'recent'
		| 'view-conversion'
		| 'host-file-open';
}

const LEGACY_FILE_KEYS = ['filePath', 'file'] as const;

/** Read old workspace states once, but always return the V2 two-state truth. */
export function normalizeComposerViewState(
	value: unknown,
	fallbackFilePath?: string | null,
): ComposerViewStateV2 | null {
	const raw = asRecord(value);
	const filePath = readFilePath(raw) ?? normalizePath(fallbackFilePath);
	if (!filePath) return null;

	const displayMode = normalizeDisplayMode(
		raw.displayMode ?? raw.displayState ?? raw.mode,
	);
	const selectedBlockId =
		typeof raw.selectedBlockId === 'string' && raw.selectedBlockId.trim()
			? raw.selectedBlockId
			: undefined;

	return {
		version: 2,
		filePath,
		displayMode,
		...(selectedBlockId ? { selectedBlockId } : {}),
		...(raw.scrollAnchor !== undefined ? { scrollAnchor: raw.scrollAnchor } : {}),
	};
}

export function normalizeDefaultDocumentView(value: unknown): DefaultDocumentView {
	return value === 'composer' ? 'composer' : 'markdown';
}

export function normalizeComposerDisplayMode(value: unknown): ComposerDisplayMode {
	return normalizeDisplayMode(value);
}

function normalizeDisplayMode(value: unknown): ComposerDisplayMode {
	// Legacy `work` and `all` both mean the new editable projection.
	return value === 'clean' ? 'clean' : 'edit';
}

function readFilePath(raw: Record<string, unknown>): string | null {
	for (const key of LEGACY_FILE_KEYS) {
		const path = normalizePath(raw[key]);
		if (path) return path;
	}
	return null;
}

function normalizePath(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object'
		? value as Record<string, unknown>
		: {};
}
