import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { Chunk } from '@/service/search/index/types';

/**
 * Applies a final chunk length guard after loader chunking.
 * Any oversized chunk is split with overlap so embedding input stays within limits.
 */
export function enforceChunkLengthWithOverlap(
	chunks: Chunk[],
	settings: ChunkingSettings,
): Chunk[] {
	const maxChars = Math.max(1, Number(settings.maxChunkSize ?? 1000));
	const overlap = normalizeOverlap(settings.chunkOverlap ?? 200, maxChars);
	const out: Chunk[] = [];

	for (const chunk of chunks) {
		const content = chunk.content ?? '';
		if (content.length <= maxChars) {
			out.push({ ...chunk });
			continue;
		}

		const splitParts = splitTextWithOverlap(content, maxChars, overlap);
		for (const part of splitParts) {
			if (!part.trim()) continue;
			out.push({
				...chunk,
				content: part,
				chunkId: generateUuidWithoutHyphens(),
			});
		}
	}

	for (let i = 0; i < out.length; i++) {
		out[i].chunkIndex = i;
	}
	return out;
}

function normalizeOverlap(overlap: number, maxChars: number): number {
	const raw = Number.isFinite(overlap) ? Math.max(0, Math.floor(overlap)) : 0;
	if (maxChars <= 1) return 0;
	return Math.min(raw, Math.max(0, maxChars - 1));
}

function splitTextWithOverlap(text: string, maxChars: number, overlap: number): string[] {
	const parts: string[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		const hardEnd = Math.min(cursor + maxChars, text.length);
		if (hardEnd >= text.length) {
			parts.push(text.slice(cursor));
			break;
		}

		const splitAt = findSplitPoint(text, cursor, hardEnd);
		parts.push(text.slice(cursor, splitAt));

		const nextCursor = splitAt - overlap;
		cursor = nextCursor > cursor ? nextCursor : splitAt;
	}

	return parts;
}

/**
 * Prefer newline/space boundaries near the end window.
 */
function findSplitPoint(text: string, start: number, hardEnd: number): number {
	const window = Math.max(32, Math.floor((hardEnd - start) * 0.2));
	const softStart = Math.max(start + 1, hardEnd - window);
	for (let i = hardEnd; i >= softStart; i--) {
		const ch = text[i - 1];
		if (ch === '\n' || ch === ' ' || ch === '\t') {
			return i;
		}
	}
	return hardEnd;
}
