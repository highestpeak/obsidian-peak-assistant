/**
 * Product-level Command Center retrieval defaults. Keeping these limits out of
 * UI and adapter logic gives a future config template one stable seam.
 */
export const COMMAND_CENTER_CATALOG_DEFAULTS = {
	searchDebounceMs: 160,
	submenuHoverOpenDelayMs: 100,
	submenuHoverCloseDelayMs: 220,
	launcherCommandPreviewLimit: 6,
	minimumDocumentQueryLength: 2,
	maximumDocumentResults: 80,
	documentExtensions: new Set(['md', 'canvas', 'base', 'pdf']),
} as const;
