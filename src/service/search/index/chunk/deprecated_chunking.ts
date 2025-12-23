/**
 * Actually this is not used. Deprecated. We may use for default text chunking. Currently we ignore this file but not delete it.
 * 
 * Document chunking using LangChain's RecursiveCharacterTextSplitter strategy.
 * 
 * This implementation follows LangChain's proven approach:
 * - Recursively tries different separators in order of preference
 * - Respects semantic boundaries (paragraphs > sentences > words > characters)
 * - Handles multiple languages properly
 * - Supports configurable chunk size and overlap
 * 
 * Reference: LangChain's RecursiveCharacterTextSplitter
 * https://github.com/langchain-ai/langchain/blob/main/libs/langchain/langchain/text_splitter.py
 */

import type { Document } from '@/core/document/types';
import type { DocumentChunkingOptions } from '../types';
import type { ChunkingSettings } from '@/app/settings/types';
import type { Chunk } from '../types';
import { DEFAULT_CHUNKING_SETTINGS } from '@/app/settings/types';
import { generateUuidWithoutHyphens } from '@/service/chat/utils';

/**
 * Default separators in order of preference (most specific first).
 * LangChain's RecursiveCharacterTextSplitter uses similar approach.
 */
const DEFAULT_SEPARATORS = [
	'\n\n',      // Paragraphs (double newline)
	'\n',        // Lines (single newline)
	'. ',        // Sentences (period + space)
	'。',        // Chinese sentence end
	'！',        // Chinese exclamation
	'？',        // Chinese question mark
	'! ',        // English exclamation
	'? ',        // English question mark
	'; ',        // Semicolon
	', ',        // Comma
	' ',         // Words (space)
	'',          // Characters (fallback - split by character)
];

/**
 * Recursively split text using separators in order of preference.
 * 
 * This follows LangChain's RecursiveCharacterTextSplitter algorithm:
 * 1. Try to split by the first separator
 * 2. If chunks are too large, recursively split each chunk with next separator
 * 3. Continue until chunks are appropriately sized
 * 
 * @param text - Text to split
 * @param separators - Separators to try (in order)
 * @param chunkSize - Maximum chunk size
 * @param chunkOverlap - Overlap between chunks
 * @returns Array of text chunks
 */
function recursiveSplit(
	text: string,
	separators: string[],
	chunkSize: number,
	chunkOverlap: number,
): string[] {
	// If text is small enough, return as single chunk
	if (text.length <= chunkSize) {
		return [text];
	}

	// If no more separators, split by character
	if (separators.length === 0) {
		return splitByCharacter(text, chunkSize, chunkOverlap);
	}

	const separator = separators[0];
	const remainingSeparators = separators.slice(1);

	// Split by current separator
	const splits = text.split(separator);

	// If separator didn't split anything, try next separator
	if (splits.length === 1) {
		return recursiveSplit(text, remainingSeparators, chunkSize, chunkOverlap);
	}

	// Process each split
	const chunks: string[] = [];
	let currentChunk = '';

	for (let i = 0; i < splits.length; i++) {
		const split = splits[i];
		const textToAdd = i === 0 ? split : separator + split;

		// If adding this split would exceed chunk size
		if (currentChunk && (currentChunk.length + textToAdd.length) > chunkSize) {
			// Finalize current chunk
			if (currentChunk.trim()) {
				chunks.push(currentChunk.trim());
			}

			// Start new chunk with overlap
			const overlap = getOverlapText(currentChunk, chunkOverlap);
			currentChunk = overlap + textToAdd;
		} else {
			currentChunk += textToAdd;
		}

		// If current chunk is still too large, recursively split it
		if (currentChunk.length > chunkSize) {
			const subChunks = recursiveSplit(currentChunk, remainingSeparators, chunkSize, chunkOverlap);
			// Add all but last sub-chunk
			for (let j = 0; j < subChunks.length - 1; j++) {
				chunks.push(subChunks[j]);
			}
			// Keep last sub-chunk as current (with overlap)
			if (subChunks.length > 0) {
				const lastChunk = subChunks[subChunks.length - 1];
				const overlap = getOverlapText(currentChunk, chunkOverlap);
				currentChunk = overlap + lastChunk;
			}
		}
	}

	// Add remaining chunk
	if (currentChunk.trim()) {
		chunks.push(currentChunk.trim());
	}

	return chunks;
}

/**
 * Split text by character (fallback when no separators work).
 */
function splitByCharacter(text: string, chunkSize: number, chunkOverlap: number): string[] {
	const chunks: string[] = [];
	let offset = 0;

	while (offset < text.length) {
		const end = Math.min(offset + chunkSize, text.length);
		const chunk = text.slice(offset, end);
		chunks.push(chunk);
		offset = end - chunkOverlap; // Move back for overlap
	}

	return chunks;
}

/**
 * Get overlap text from the end of a chunk.
 */
function getOverlapText(text: string, overlapSize: number): string {
	if (text.length <= overlapSize) return text;
	
	// Try to break at word boundary
	const overlap = text.slice(-overlapSize);
	const firstSpace = overlap.indexOf(' ');
	if (firstSpace > 0 && firstSpace < overlapSize * 0.3) {
		return overlap.slice(firstSpace + 1);
	}
	return overlap;
}

/**
 * Chunk content string using LangChain's RecursiveCharacterTextSplitter strategy.
 * 
 * @param content - Content string to chunk
 * @param documentId - Document ID for chunk identifiers
 * @param settings - Chunking settings
 * @returns Array of chunks
 */
export async function chunkContent(
	content: string,
	documentId: string,
	settings: ChunkingSettings,
): Promise<Chunk[]> {
	const minSize = settings.minDocumentSizeForChunking;

	// If content is too small, return as single chunk
	if (content.length <= minSize) {
		return [{
			docId: documentId,
			content: content,
		}];
	}

	// Use recursive splitting strategy (LangChain's approach)
	const chunkTexts = recursiveSplit(
		content,
		DEFAULT_SEPARATORS,
		settings.maxChunkSize,
		settings.chunkOverlap,
	);

	// Convert to Chunk format
	const chunks: Chunk[] = [];

	for (let i = 0; i < chunkTexts.length; i++) {
		const chunkText = chunkTexts[i];

		chunks.push({
			docId: documentId,
			content: chunkText,
			chunkId: generateUuidWithoutHyphens(),
			chunkIndex: i,
		});
	}

	return chunks;
}
