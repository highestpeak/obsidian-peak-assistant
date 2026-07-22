/**
 * Pure classifier for the input-image cluster layout (MSG-02 of the
 * 2026-07-15 Chat Studio spec). Extracted from MessageAttachmentsList so
 * `test/attachment-image-layout.test.ts` can import it without dragging in
 * the React + Streamdown transitive graph.
 */

export type ImageLayoutKind =
	| 'single'
	| 'grid-2'
	| 'grid-3'
	| 'grid-2x2'
	| 'hero-thumbs'
	| 'grid-2x2-overflow';

export interface ImageLayoutDecision {
	kind: ImageLayoutKind;
	/** Number of tiles actually rendered before folding. */
	visibleCount: number;
	/** `+N` overlay on the last visible tile — 0 when there is no overflow. */
	overflowCount: number;
	/** Grid template class token. */
	template: 'single' | 'cols-2' | 'cols-3' | 'cols-4' | 'hero';
}

export function decideImageLayout(n: number): ImageLayoutDecision {
	if (n <= 0) return { kind: 'single', visibleCount: 0, overflowCount: 0, template: 'single' };
	if (n === 1) return { kind: 'single', visibleCount: 1, overflowCount: 0, template: 'single' };
	if (n === 2) return { kind: 'grid-2', visibleCount: 2, overflowCount: 0, template: 'cols-2' };
	if (n === 3) return { kind: 'grid-3', visibleCount: 3, overflowCount: 0, template: 'cols-3' };
	if (n === 4) return { kind: 'grid-2x2', visibleCount: 4, overflowCount: 0, template: 'cols-2' };
	if (n <= 7) {
		// hero + up to 4 thumbs
		const thumbs = Math.min(n - 1, 4);
		return {
			kind: 'hero-thumbs',
			visibleCount: 1 + thumbs,
			overflowCount: 0,
			template: 'hero',
		};
	}
	// 8+ → 4 tiles, last with "+N"
	return {
		kind: 'grid-2x2-overflow',
		visibleCount: 4,
		overflowCount: n - 4,
		template: 'cols-2',
	};
}
