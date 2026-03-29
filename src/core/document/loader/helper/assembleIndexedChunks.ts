import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { SLICE_CAPS } from '@/core/constant';
import type { Document } from '@/core/document/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkType } from '@/service/search/index/chunkTypes';
import type { ChunkingSettings } from '@/app/settings/types';

/** Structured TextRank sentences stored on {@link Document} metadata when indexed from markdown. */
export type TextrankSentenceStructured = { text: string; score: number; index: number };

/** Budget for splitting LLM summary text into index-sized segments. */
type AssembleIndexedChunkBudget = Pick<ChunkingSettings, 'maxChunkSize' | 'chunkOverlap'>;

/**
 * Splits summary text with the same markdown splitter as {@link MarkdownDocumentLoader.chunkContent}.
 */
async function splitSummaryWithMarkdownSplitter(
	text: string,
	maxChunkSize: number,
	chunkOverlap: number,
): Promise<string[]> {
	const s = text.trim();
	if (!s.length) return [];
	if (maxChunkSize < 1) return [s];

	const splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
		chunkSize: maxChunkSize,
		chunkOverlap,
	});
	const docs = await splitter.createDocuments([s]);
	return docs.map((d) => d.pageContent.trim()).filter(Boolean);
}

/**
 * Appends summary and TextRank chunks after loader-produced body chunks.
 * Shared by all document loaders; re-exported from {@link MarkdownDocumentLoader} for a single entry point.
 *
 * @param chunking — `maxChunkSize` / `chunkOverlap` for LangChain markdown splitting (same as body in {@link MarkdownDocumentLoader}).
 */
export async function assembleIndexedChunks(
	doc: Document,
	bodyChunks: Chunk[],
	chunking: AssembleIndexedChunkBudget,
): Promise<Chunk[]> {
	const maxChunkSize = chunking.maxChunkSize!;
	const chunkOverlap = chunking.chunkOverlap!;
	const out: Chunk[] = bodyChunks.map((c, i) => ({
		...c,
		chunkType: (c.chunkType ?? 'body_raw') as ChunkType,
		chunkIndex: c.chunkIndex ?? i,
	}));

	let idx = out.length;

	const summarySources: Array<{ chunkType: 'summary_short' | 'summary_full'; text: string; baseTitle: string }> = [];
	const short = doc.summary?.trim();
	if (short) summarySources.push({ chunkType: 'summary_short', text: short, baseTitle: 'Short summary' });
	const full = doc.fullSummary?.trim();
	if (full) summarySources.push({ chunkType: 'summary_full', text: full, baseTitle: 'Full summary' });

	for (const src of summarySources) {
		const slices = await splitSummaryWithMarkdownSplitter(src.text, maxChunkSize, chunkOverlap);
		const n = slices.length;
		for (let si = 0; si < n; si++) {
			out.push({
				docId: doc.id,
				chunkType: src.chunkType,
				content: slices[si],
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: idx++,
				title: n > 1 ? `${src.baseTitle} (${si + 1}/${n})` : src.baseTitle,
				chunkMeta:
					n > 1
						? { summarySource: 'llm', summarySliceIndex: si, summarySliceCount: n }
						: { summarySource: 'llm' },
			});
		}
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
