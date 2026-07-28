/**
 * Peak Composer — focus → frozen run context (WP9 integration, handoff §12.2).
 *
 * The Sidecar's Copilot run must freeze a snapshot of the REAL focused block at
 * send time (not a document-level fallback). The DOM focus lookup lives in the
 * chrome (`ComposerRoot` reads `document.activeElement`), but the snapshot itself
 * is assembled here from the current parsed document — a PURE function so it is
 * unit-testable in node without a DOM and so the intelligence layer keeps its
 * zero-obsidian boundary (this file imports only neutral `@/core/composer` types).
 */

import type {
	ComposerBlock,
	ComposerContextSnapshot,
	ComposerDocumentSnapshot,
} from '@/core/composer';

/** Bounded surrounding-source window (chars) captured around the focus block. */
const NEARBY_WINDOW = 400;
/** Bounded document excerpt (chars) used when no single block owns the focus. */
const DOCUMENT_EXCERPT = 800;

/**
 * Assemble the immutable run context for the focused block. When `focusedBlockId`
 * resolves to a block, the target is that block (verbatim source + bounded
 * nearby); otherwise it degrades to a document-level target carrying a bounded
 * document excerpt so a run still has context. Returns the context plus the
 * verbatim `targetQuote` used for the receipt's clickable body reference.
 */
export function buildFocusRunContext(
	snapshot: ComposerDocumentSnapshot | null,
	focusedBlockId: string | null,
): { snapshot: ComposerContextSnapshot; targetQuote: string } {
	if (!snapshot) {
		return {
			snapshot: {
				documentId: 'document',
				revision: 'r0',
				target: { kind: 'document', documentId: 'document' },
				targetSource: '',
				nearby: { before: '', after: '' },
			},
			targetQuote: '',
		};
	}
	const block = focusedBlockId ? findBlock(snapshot, focusedBlockId) : undefined;
	if (!block) {
		const excerpt = snapshot.sourceText.slice(0, DOCUMENT_EXCERPT);
		return {
			snapshot: {
				documentId: snapshot.documentId,
				revision: snapshot.revision,
				target: { kind: 'document', documentId: snapshot.documentId },
				targetSource: excerpt,
				nearby: { before: '', after: '' },
			},
			targetQuote: excerpt.trim(),
		};
	}
	const targetSource = snapshot.sourceText.slice(block.source.from, block.source.to);
	return {
		snapshot: {
			documentId: snapshot.documentId,
			revision: snapshot.revision,
			target: { kind: 'block', blockId: block.blockId },
			targetSource,
			nearby: {
				before: snapshot.sourceText.slice(Math.max(0, block.source.from - NEARBY_WINDOW), block.source.from),
				after: snapshot.sourceText.slice(block.source.to, block.source.to + NEARBY_WINDOW),
			},
		},
		targetQuote: targetSource.trim(),
	};
}

/**
 * Resolve the related-material focus for the current chrome focus: the anchor id
 * (the focused block id, or the document id for a whole-document focus), the real
 * document id, and the query text the related-search runs against. Pure.
 */
export function resolveRelatedFocus(
	snapshot: ComposerDocumentSnapshot | null,
	focusedBlockId: string | null,
): { anchorId: string; documentId: string; focusText: string; label: string } {
	if (!snapshot) return { anchorId: 'document', documentId: 'document', focusText: '', label: 'document' };
	const block = focusedBlockId ? findBlock(snapshot, focusedBlockId) : undefined;
	if (!block) {
		return {
			anchorId: snapshot.documentId,
			documentId: snapshot.documentId,
			focusText: snapshot.sourceText.slice(0, DOCUMENT_EXCERPT),
			label: documentLabel(snapshot.filePath, snapshot.documentId),
		};
	}
	const focusText = snapshot.sourceText.slice(block.source.from, block.source.to);
	return {
		anchorId: block.blockId,
		documentId: snapshot.documentId,
		focusText,
		label: sourceLabel(focusText, documentLabel(snapshot.filePath, snapshot.documentId)),
	};
}

/** Source-derived labels keep the Brief status truthful without a second title model. */
function sourceLabel(source: string, fallback: string): string {
	const firstLine = source.split('\n', 1)[0]?.trim() ?? '';
	if (!firstLine) return fallback;
	return firstLine;
}

function documentLabel(filePath: string, documentId: string): string {
	const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	return filePath.slice(slash + 1) || documentId;
}

/** Locate a block by exact id, falling back to the stable kind-ordinal prefix. */
function findBlock(snapshot: ComposerDocumentSnapshot, blockId: string): ComposerBlock | undefined {
	const exact = snapshot.blocks.find((b) => b.blockId === blockId);
	if (exact) return exact;
	const prefix = blockId.split('-').slice(0, -1).join('-') + '-';
	return snapshot.blocks.find((b) => b.blockId.startsWith(prefix));
}
