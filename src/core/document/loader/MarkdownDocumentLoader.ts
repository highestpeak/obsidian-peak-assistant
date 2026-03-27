import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { DocumentLoader } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { parseMarkdownWithRemark } from '@/core/utils/markdown-utils';
import { generateContentHash } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { getDefaultDocumentSummary } from './helper/DocumentLoaderHelpers';
import { preprocessMarkdownForChunking } from '@/core/utils/markdown-utils';
import { extractTopicAndFunctionalTags, type DocLlmTagResult } from '@/core/document/helper/TagService';
import {
	EMPTY_TEXTRANK_RESULT,
	computeKeywordTagBundles,
	extractTextRankFeatures,
	type TextRankResult,
} from '@/core/document/loader/helper/textRank';
import { assembleIndexedChunks, type TextrankSentenceStructured } from './helper/assembleIndexedChunks';

/** Re-export for callers that import from this module. */
export { assembleIndexedChunks, type TextrankSentenceStructured };

/**
 * Markdown document loader.
 *
 * This runs on the main thread because it uses Obsidian APIs.
 * Worker code must never import this module.
 */
export class MarkdownDocumentLoader implements DocumentLoader {
	constructor(
		private readonly app: App,
		private readonly aiServiceManager?: AIServiceManager
	) { }

	getDocumentType(): DocumentType {
		return 'markdown';
	}

	getSupportedExtensions(): string[] {
		return ['md', 'markdown'];
	}

	/**
	 * Read a markdown document by its path.
	 * Returns core Document model.
	 */
	async readByPath(path: string, genCacheContent?: boolean): Promise<Document | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return null;
		if (!this.getSupportedExtensions().includes(file.extension.toLowerCase())) return null;
		return await this.readMarkdownFile(file, genCacheContent);
	}

	/**
	 * Splits markdown body with RecursiveCharacterTextSplitter, then appends summary / TextRank chunks for indexing.
	 */
	async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		let content = doc.sourceFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		// If content is too small, return as single chunk
		if (content.length <= minSize) {
			return assembleIndexedChunks(doc, [{
				docId: doc.id,
				chunkType: 'body_raw',
				content: content,
			}]);
		}

		content = preprocessMarkdownForChunking(content, settings);

		// Use LangChain's RecursiveCharacterTextSplitter for markdown
		// the splitter will automatically split on headings and code blocks
		const splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
			chunkSize: settings.maxChunkSize,
			chunkOverlap: settings.chunkOverlap,
		});

		// Create documents using LangChain's API (expects array of strings)
		const langchainDocs = await splitter.createDocuments([content]);

		// Convert LangChain documents to Chunk format
		const chunks: Chunk[] = [];
		for (let i = 0; i < langchainDocs.length; i++) {
			const langchainDoc = langchainDocs[i];
			chunks.push({
				docId: doc.id,
				chunkType: 'body_raw',
				content: langchainDoc.pageContent,
				chunkId: generateUuidWithoutHyphens(),
				chunkIndex: i,
			});
		}

		return assembleIndexedChunks(doc, chunks);
	}

	/**
	 * Scan markdown documents metadata without loading content.
	 * Returns lightweight metadata: path, mtime, type.
	 */
	async *scanDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>> {
		const limit = params?.limit ?? Infinity;
		const batchSize = params?.batchSize ?? 100;

		const supportedExts = this.getSupportedExtensions();
		const files = this.app.vault.getFiles()
			.filter(f => supportedExts.includes(f.extension.toLowerCase()))
			.slice(0, limit);
		let batch: Array<{ path: string; mtime: number; type: DocumentType }> = [];

		for (const file of files) {
			batch.push({
				path: file.path,
				mtime: file.stat.mtime,
				type: 'markdown',
			});
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
	}

	/**
	 * Read a markdown file and convert to core Document model.
	 */
	private async readMarkdownFile(file: TFile, genCacheContent?: boolean): Promise<Document | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const contentHash = generateContentHash(content);

			// Parse markdown using remark; resolve wiki link targets to full vault paths
			const parseResult = await parseMarkdownWithRemark(content, {
				resolveWikiLinkToPath: (linkText: string) => {
					const dest = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
					return dest?.path ?? null;
				},
			});

			// Extract title from parsed result or fallback to filename
			let title = parseResult.title || file.basename;

			// User tags: frontmatter `tags` + inline #hashtags (see parseMarkdownWithRemark `tags`).
			const userKeywordTags = [...new Set(parseResult.tags.map((t) => String(t).trim()).filter(Boolean))];

			// textrank + merged keywords for FTS; graph keyword edges use userKeywordTags only.
			let mergedKeywordTags = userKeywordTags;
			let textrankKeywordTerms: string[] = [];
			let textRankSnapshot: TextRankResult = EMPTY_TEXTRANK_RESULT;
			if (!genCacheContent) {
				textRankSnapshot = extractTextRankFeatures(content);
				const bundles = computeKeywordTagBundles(userKeywordTags, textRankSnapshot.topTerms);
				mergedKeywordTags = bundles.mergedKeywordTags;
				textrankKeywordTerms = bundles.textrankKeywordTerms;
			}
			const textrankKeywordsStructured = textRankSnapshot.topTerms.map(({ term, score }) => ({ term, score }));
			const textrankSentencesStructured = textRankSnapshot.topSentences.map((s) => ({
				text: s.text,
				score: s.score,
				index: s.index,
			}));
			// Comma-separated / numbered lines for LLM prompts only (metadata stores structured arrays).
			const textrankKeywordsForLlm = textrankKeywordsStructured.map((t) => t.term).join(', ');
			const textrankSentencesForLlm = textrankSentencesStructured.length
				? textrankSentencesStructured.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
				: '';

			// tag and summary gen by llm
			const summaryDocStub = {
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content,
				},
				cacheFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content,
				},
				metadata: {
					title,
					topicTags: [] as string[],
					topicTagEntries: [],
					functionalTagEntries: [],
					keywordTags: mergedKeywordTags,
					userKeywordTags,
					...(textrankKeywordTerms.length ? { textrankKeywordTerms } : {}),
					custom: {
						textrankKeywordsStructured,
						textrankSentencesStructured,
					},
				},
			} as unknown as Document;
			const [tagRes, summaryContent]: [DocLlmTagResult, ResourceSummary] = await Promise.all([
				this.aiServiceManager && !genCacheContent ? extractTopicAndFunctionalTags(content, this.aiServiceManager, {
					title,
					existingUserTags: userKeywordTags.length ? userKeywordTags.join(', ') : undefined,
					textrankKeywords: textrankKeywordsForLlm || undefined,
					textrankSentences: textrankSentencesForLlm || undefined,
				}).catch((err) => {
					console.warn('[MarkdownDocumentLoader] extractTopicAndFunctionalTags failed:', err);
					return {
						topicTagEntries: [],
						topicTags: [] as string[],
						functionalTagEntries: [],
						timeTags: [] as string[],
						geoTags: [] as string[],
						personTags: [] as string[],
					};
				}) : Promise.resolve({
					topicTagEntries: [],
					topicTags: [] as string[],
					functionalTagEntries: [],
					timeTags: [] as string[],
					geoTags: [] as string[],
					personTags: [] as string[],
				}),
				genCacheContent || !this.aiServiceManager
					? Promise.resolve<ResourceSummary>({ shortSummary: '', fullSummary: undefined })
					: getDefaultDocumentSummary(summaryDocStub, this.aiServiceManager)
			]);

			return {
				id: generateDocIdFromPath(file.path),
				type: 'markdown',
				sourceFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content,
				},
				cacheFileInfo: {
					path: file.path,
					name: file.name,
					extension: file.extension,
					size: file.stat.size,
					mtime: file.stat.mtime,
					ctime: file.stat.ctime,
					content,
				},
				metadata: {
					title,
					topicTags: tagRes.topicTags,
					topicTagEntries: tagRes.topicTagEntries.length ? tagRes.topicTagEntries : undefined,
					functionalTagEntries: tagRes.functionalTagEntries,
					keywordTags: mergedKeywordTags,
					userKeywordTags,
					...(textrankKeywordTerms.length ? { textrankKeywordTerms } : {}),
					timeTags: tagRes.timeTags,
					geoTags: tagRes.geoTags,
					personTags: tagRes.personTags,
					inferCreatedAt: tagRes.inferCreatedAtMs ?? null,
					frontmatter: parseResult.frontmatter
						? ({ ...parseResult.frontmatter } as Record<string, unknown>)
						: undefined,
					custom: {
						textrankKeywordsStructured,
						textrankSentencesStructured,
					},
				},
				summary: summaryContent.shortSummary?.trim() ? summaryContent.shortSummary : null,
				fullSummary: summaryContent.fullSummary ?? null,
				contentHash,
				references: parseResult.references,
				lastProcessedAt: Date.now(),
			};
		} catch (error) {
			console.error('Error reading markdown file:', error);
			// Ignore read errors; indexing should be best-effort.
			return null;
		}
	}

	/**
	 * Get summary for a markdown document
	 * // todo implement getSummary. many types: raw knowledge base markdown, conv and project markdown, resources markdown
	 */
	async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
	}
}

