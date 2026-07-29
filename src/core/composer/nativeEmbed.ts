/**
 * A UI-facing, app-owned bridge to Obsidian's registered Markdown embed
 * renderers. The Composer never recreates Base, Canvas, Excalidraw, PDF, or
 * note previews when the host can render the real embed itself.
 */

export type ComposerNativeEmbedKind = 'base' | 'canvas' | 'excalidraw' | 'markdown' | 'attachment';

export interface ComposerNativeEmbedRenderRequest {
	/** The original Composer document path used for Obsidian link resolution. */
	sourcePath: string;
	/** Exact embed source, normally `![[target]]`. */
	markdown: string;
	/** Resolved target used only for diagnostics and DOM identity. */
	target: string;
	kind: ComposerNativeEmbedKind;
}

/**
 * Implemented only in the app layer. `HTMLElement` is intentionally the last
 * UI boundary: service code keeps working with bytes and typed preview states.
 */
export interface ComposerNativeEmbedRendererPort {
	render(request: ComposerNativeEmbedRenderRequest, host: HTMLElement): Promise<() => void>;
}
