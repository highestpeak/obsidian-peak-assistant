import type { DocumentLoaderReadOptions } from './types';
import type { DocumentType, Document, ResourceSummary } from '@/core/document/types';
import { parseMarkdownWithRemark } from '@/core/utils/markdown-utils';
import { hashString } from '@/core/utils/hash-utils';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk } from '@/core/search/indexTypes';
import type { ChunkingSettings } from '@/core/config/settingsTypes';
import { generateUuidWithoutHyphens, generateDocIdFromPath } from '@/core/utils/id-utils';
import type { IDocSummarizer } from '@/core/llm/IDocSummarizer';
import type { IDocTagClassifier } from '@/core/llm/IDocTagClassifier';
import { emptyUsage, mergeTokenUsage } from '@/core/providers/types';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { VaultMetadataResolverPort } from '@/core/ports/VaultMetadataResolverPort';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import {
	getDefaultDocumentSummary,
	type ResourceSummaryWithLlmMeta,
	type DocumentSummaryConfig,
} from './helper/DocumentLoaderHelpers';
import { preprocessMarkdownForChunking } from '@/core/utils/markdown-utils';
import { extractTopicAndFunctionalTags, type DocLlmTagResult } from '@/core/document/helper/TagService';
import { computeKeywordTagBundles, extractTextRankFeatures, stripForTextRank } from '@/core/document/loader/helper/textRank';
import { resolveTextRankLocaleFromStripped } from '@/core/utils/stopword-utils';
import { assembleIndexedChunks, type TextrankSentenceStructured } from './helper/assembleIndexedChunks';
import { BaseDocumentLoader } from './BaseDocumentLoader';

/** Re-export for callers that import from this module. */
export { assembleIndexedChunks, type TextrankSentenceStructured };

/**
 * Markdown document loader.
 *
 * Runs on the main thread because it depends on the vault metadata
 * resolver port (Obsidian's metadataCache, behind the port). Worker
 * code must never import this module.
 */
export class MarkdownDocumentLoader extends BaseDocumentLoader {
	constructor(
		vault: DocumentVaultReaderPort,
		private readonly metadata: VaultMetadataResolverPort,
		summaryConfig: DocumentSummaryConfig,
		aiServiceManager?: IDocSummarizer & IDocTagClassifier,
	) {
		super(vault, summaryConfig, aiServiceManager);
	}

	getDocumentType(): DocumentType {
		return 'markdown';
	}

	getSupportedExtensions(): string[] {
		return ['md', 'markdown'];
	}

	/**
	 * Splits markdown body with RecursiveCharacterTextSplitter, then appends summary / TextRank chunks for indexing.
	 */
	override async chunkContent(
		doc: Document,
		settings: ChunkingSettings,
	): Promise<Chunk[]> {
		let content = doc.sourceFileInfo.content;
		const minSize = settings.minDocumentSizeForChunking;

		// If content is too small, return as single chunk
		if (content.length <= minSize) {
			return assembleIndexedChunks(
				doc,
				[
					{
						docId: doc.id,
						chunkType: 'body_raw',
						content: content,
					},
				],
				settings,
			);
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

		return assembleIndexedChunks(doc, chunks, settings);
	}

	/**
	 * Read a markdown file and convert to core Document model.
	 * TextRank always runs. LLM tag/summary runs only when {@link DocumentLoaderReadOptions} allows (default: on).
	 */
	protected async readFile(
		file: VaultFileRef,
		_genCacheContent?: boolean,
		readOptions?: DocumentLoaderReadOptions,
	): Promise<Document | null> {
		const includeLlmTags = readOptions?.includeLlmTags ?? true;
		const includeLlmSummary = readOptions?.includeLlmSummary ?? true;
		return this.readMarkdownFile(file, {
			includeLlmTags,
			includeLlmSummary,
			onLlmIndexingComplete: readOptions?.onLlmIndexingComplete,
			onLlmIndexingProgress: readOptions?.onLlmIndexingProgress,
			llmRoute: readOptions?.llmRoute,
		});
	}

	private async readMarkdownFile(
		file: VaultFileRef,
		readOptions: DocumentLoaderReadOptions & { includeLlmTags: boolean; includeLlmSummary: boolean },
	): Promise<Document | null> {
		const tRead = Date.now();
		try {
			const content = await this.vault.readText(file);
			const contentHash = hashString(content, 8);

			// Parse markdown using remark; resolve wiki link targets to full vault paths
			const parseResult = await parseMarkdownWithRemark(content, {
				resolveWikiLinkToPath: (linkText: string) => {
					return this.metadata.resolveLinkPath(linkText, file.path);
				},
			});

			// Extract title from parsed result or fallback to filename
			let title = parseResult.title || file.basename;

			// User tags: frontmatter `tags` + inline #hashtags (see parseMarkdownWithRemark `tags`).
			const userKeywordTags = [...new Set(parseResult.tags.map((t) => String(t).trim()).filter(Boolean))];

			// textrank + merged keywords for FTS; graph keyword edges use userKeywordTags only.
			let mergedKeywordTags = userKeywordTags;
			let textrankKeywordTerms: string[] = [];
			const localeForTextRank = resolveTextRankLocaleFromStripped(stripForTextRank(content));
			const textRankSnapshot = extractTextRankFeatures(content, { locale: localeForTextRank });
			const bundles = computeKeywordTagBundles(userKeywordTags, textRankSnapshot.topTerms);
			mergedKeywordTags = bundles.mergedKeywordTags;
			textrankKeywordTerms = bundles.textrankKeywordTerms;
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
			const runTagLlm = readOptions.includeLlmTags && Boolean(this.aiServiceManager);
			const runSummaryLlm = readOptions.includeLlmSummary && Boolean(this.aiServiceManager);
			const tLlm = Date.now();
			if (runTagLlm || runSummaryLlm) {
				console.info('[MarkdownDocumentLoader] readMarkdownFile: LLM batch start', {
					path: file.path,
					contentChars: content.length,
					elapsedSinceReadMs: tLlm - tRead,
					runTagLlm,
					runSummaryLlm,
				});
			}
			const emptyTag: DocLlmTagResult = {
				topicTagEntries: [],
				topicTags: [] as string[],
				functionalTagEntries: [],
				timeTags: [] as string[],
				geoTags: [] as string[],
				personTags: [] as string[],
				llmTagRunStatus: 'failed',
			};
			const failedTag: DocLlmTagResult = { ...emptyTag, llmTagRunStatus: 'failed' };
			const skippedTag: DocLlmTagResult = { ...emptyTag, llmTagRunStatus: 'skipped' };
			const reportProgress = (operation: 'summary' | 'tags', phase: 'request-started' | 'response-received' | 'failed' | 'committed', text: string) => {
				readOptions.onLlmIndexingProgress?.({ path: file.path, operation, phase, text, updatedAt: Date.now() });
			};
			if (runTagLlm) reportProgress('tags', 'request-started', 'AI Tags request sent to the selected model.');
			if (runSummaryLlm) reportProgress('summary', 'request-started', 'Summary request sent to the selected model.');
			const tagTask = runTagLlm
				? extractTopicAndFunctionalTags(content, this.aiServiceManager!, {
						title,
						existingUserTags: userKeywordTags.length ? userKeywordTags.join(', ') : undefined,
						textrankKeywords: textrankKeywordsForLlm || undefined,
						textrankSentences: textrankSentencesForLlm || undefined,
						provider: readOptions.llmRoute?.provider,
						profileId: readOptions.llmRoute?.profileId,
						modelId: readOptions.llmRoute?.modelId,
					}).then((result) => {
						reportProgress('tags', 'response-received', 'AI Tags response received; validating the structured labels.');
						return result;
					}).catch((err) => {
						reportProgress('tags', 'failed', `AI Tags failed: ${err instanceof Error ? err.message : String(err)}`);
						console.warn('[MarkdownDocumentLoader] extractTopicAndFunctionalTags failed:', err);
						return failedTag;
					})
				: Promise.resolve(skippedTag);
			const summaryTask = runSummaryLlm
				? getDefaultDocumentSummary(
					summaryDocStub,
					this.summaryConfig,
					this.aiServiceManager!,
					readOptions.llmRoute?.provider,
					readOptions.llmRoute?.modelId,
					{ profileId: readOptions.llmRoute?.profileId, modelId: readOptions.llmRoute?.modelId },
				).then((result) => {
					reportProgress('summary', 'response-received', 'Summary response received; validating and committing the generated text.');
					return result;
				}).catch((err) => {
					reportProgress('summary', 'failed', `Summary failed: ${err instanceof Error ? err.message : String(err)}`);
					throw err;
				})
				: Promise.resolve<ResourceSummaryWithLlmMeta>({
						shortSummary: '',
						fullSummary: undefined,
						llmUsage: emptyUsage(),
						llmCostUsd: 0,
					});
			const [tagRes, summaryContent]: [
				DocLlmTagResult,
				ResourceSummaryWithLlmMeta | { shortSummary: string; fullSummary?: undefined },
			] = await Promise.all([tagTask, summaryTask]);
			if (runTagLlm || runSummaryLlm) {
				console.info('[MarkdownDocumentLoader] readMarkdownFile: LLM batch done', {
					path: file.path,
					llmBatchMs: Date.now() - tLlm,
					elapsedSinceReadMs: Date.now() - tRead,
				});
			}

			if (readOptions.onLlmIndexingComplete && (runTagLlm || runSummaryLlm)) {
				let mergedUsage = emptyUsage();
				let mergedCostUsd = 0;
				if (runTagLlm && tagRes.llmUsage) {
					mergedUsage = mergeTokenUsage(mergedUsage, tagRes.llmUsage);
					mergedCostUsd += tagRes.llmCostUsd ?? 0;
				}
				if (runSummaryLlm && 'llmUsage' in summaryContent) {
					mergedUsage = mergeTokenUsage(mergedUsage, summaryContent.llmUsage);
					mergedCostUsd += summaryContent.llmCostUsd;
				}
				readOptions.onLlmIndexingComplete({
					path: file.path,
					durationMs: Date.now() - tLlm,
					usage: mergedUsage,
					costUsd: mergedCostUsd,
					status: (!runTagLlm || tagRes.llmTagRunStatus === 'success') && (!runSummaryLlm || Boolean(summaryContent.shortSummary))
						? 'produced'
						: (runTagLlm && tagRes.llmTagRunStatus === 'success') || (runSummaryLlm && Boolean(summaryContent.shortSummary))
							? 'partial'
							: 'failed',
					outputs: {
						tags: !runTagLlm ? 'not-requested' : tagRes.llmTagRunStatus === 'success' ? 'produced' : 'failed',
						summary: !runSummaryLlm ? 'not-requested' : summaryContent.shortSummary ? 'produced' : 'failed',
					},
					outputUsage: {
						tags: runTagLlm && tagRes.llmUsage ? tagRes.llmUsage : emptyUsage(),
						summary: runSummaryLlm && 'llmUsage' in summaryContent ? summaryContent.llmUsage : emptyUsage(),
					},
					generatedKnowledge: {
						summary: runSummaryLlm && summaryContent.shortSummary?.trim()
							? summaryContent.shortSummary.trim()
							: null,
						tags: runTagLlm
							? [...new Set([
								...tagRes.topicTags,
								...tagRes.functionalTagEntries.map((entry) => entry.label?.trim() || entry.id),
								...tagRes.timeTags,
								...tagRes.geoTags,
								...tagRes.personTags,
							].filter(Boolean))].slice(0, 12)
							: [],
					},
				});
				if (runTagLlm && tagRes.llmTagRunStatus === 'success') reportProgress('tags', 'committed', 'AI Tags validated and committed to Peak-owned Index data.');
				if (runSummaryLlm && summaryContent.shortSummary) reportProgress('summary', 'committed', 'Summary committed to Peak-owned Index data.');
			}

			const functionalTagStatus: 'pending' | 'failed' | 'success-empty' | 'success' =
				!runTagLlm
					? 'pending'
					: tagRes.llmTagRunStatus === 'failed' || tagRes.functionalTagEntries.length === 0
						? 'failed'
						: 'success';

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
					topicTags: runTagLlm ? tagRes.topicTags : [],
					topicTagEntries: runTagLlm && tagRes.topicTagEntries.length ? tagRes.topicTagEntries : undefined,
					functionalTagEntries: runTagLlm ? tagRes.functionalTagEntries : [],
					keywordTags: mergedKeywordTags,
					userKeywordTags,
					...(textrankKeywordTerms.length ? { textrankKeywordTerms } : {}),
					timeTags: runTagLlm ? tagRes.timeTags : [],
					geoTags: runTagLlm ? tagRes.geoTags : [],
					personTags: runTagLlm ? tagRes.personTags : [],
					...(runTagLlm &&
					tagRes.inferCreatedAtMs !== undefined &&
					Number.isFinite(tagRes.inferCreatedAtMs)
						? { inferCreatedAt: tagRes.inferCreatedAtMs }
						: {}),
					frontmatter: parseResult.frontmatter
						? ({ ...parseResult.frontmatter } as Record<string, unknown>)
						: undefined,
					custom: {
						textrankKeywordsStructured,
						textrankSentencesStructured,
						llmTagRunStatus: tagRes.llmTagRunStatus,
						functionalTagStatus,
					},
				},
				...(runSummaryLlm
					? {
							summary: summaryContent.shortSummary?.trim() ? summaryContent.shortSummary : null,
							fullSummary: summaryContent.fullSummary ?? null,
						}
					: {}),
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
	override async getSummary(
		source: Document | string,
		provider?: string,
		modelId?: string
	): Promise<ResourceSummary> {
		return getDefaultDocumentSummary(source, this.summaryConfig, this.aiServiceManager, provider, modelId);
	}
}
