import { SLICE_CAPS } from '@/core/constant';
import type { Document } from '@/core/document/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkType } from '@/service/search/index/chunkTypes';

/** Structured TextRank sentences stored on {@link Document} metadata when indexed from markdown. */
export type TextrankSentenceStructured = { text: string; score: number; index: number };

/**
 * Appends summary and TextRank chunks after loader-produced body chunks.
 * Shared by all document loaders; re-exported from {@link MarkdownDocumentLoader} for a single entry point.
 */
export function assembleIndexedChunks(doc: Document, bodyChunks: Chunk[]): Chunk[] {
	const out: Chunk[] = bodyChunks.map((c, i) => ({
		...c,
		chunkType: (c.chunkType ?? 'body_raw') as ChunkType,
		chunkIndex: c.chunkIndex ?? i,
	}));

	let idx = out.length;
	const short = doc.summary?.trim();
	if (short) {
		out.push({
			docId: doc.id,
			chunkType: 'summary_short',
			content: short,
			chunkId: generateUuidWithoutHyphens(),
			chunkIndex: idx++,
			title: 'Short summary',
			chunkMeta: { summarySource: 'llm' },
		});
	}
	const full = doc.fullSummary?.trim();
	if (full) {
		out.push({
			docId: doc.id,
			chunkType: 'summary_full',
			content: full,
			chunkId: generateUuidWithoutHyphens(),
			chunkIndex: idx++,
			title: 'Full summary',
			chunkMeta: { summarySource: 'llm' },
		});
	}

	const structured = doc.metadata?.custom?.textrankSentencesStructured as TextrankSentenceStructured[] | undefined;
	if (Array.isArray(structured) && structured.length) {
		const top = structured.slice(0, SLICE_CAPS.indexing.structuredChunkTop);
		for (const s of top) {
			const t = s.text?.trim();
			if (!t) continue;
			out.push({
				docId: doc.id,
				chunkType: 'salient_textrank_sentence',
				content: t,
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: idx++,
				chunkMeta: { textrankScore: s.score, textrankIndex: s.index },
			});
		}
	}

	return out;
}
