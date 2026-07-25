/**
 * Temporary compatibility re-export. The snippet highlight renderers moved to
 * the shared Result Browser package
 * (`@/ui/component/result-browser/list/renderSnippetHighlights`) in the
 * 2026-07-21 extraction. The inspector side panel resolves through this shim.
 */
export {
	capSpans,
	renderHighlightSpans,
	renderLegacyHighlights,
	renderSnippetContent,
} from '@/ui/component/result-browser/list/renderSnippetHighlights';
