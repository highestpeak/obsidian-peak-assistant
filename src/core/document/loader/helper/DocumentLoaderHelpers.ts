import { AppContext } from '@/app/context/AppContext';
import { emptyUsage, mergeTokenUsage, type LLMUsage } from '@/core/providers/types';
import type { Document, ResourceSummary } from '@/core/document/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import type { TextRankTerm } from '@/core/document/loader/helper/textRank';
import type { TextrankSentenceStructured } from '@/core/document/loader/helper/assembleIndexedChunks';

/** Options for index-time tiered summaries (hub vs secondary). */
export type DocumentSummaryOptions = {
	/** Short summary target length (words), defaults to search.shortSummaryLength. */
	shortWordCount?: number;
	/** Full summary target length when generated. */
	fullWordCount?: number;
	/**
	 * `short_only`: one LLM call. `short_then_full_if_long` (default): when content exceeds fullSummaryLength threshold,
	 * short and full run in parallel; full prompt omits the optional one-line gist (see doc-summary-full template).
	 */
	mode?: 'short_only' | 'short_then_full_if_long';
	/** TextRank comma-separated terms (optional; else read from `document.metadata.custom`). */
	textrankKeywords?: string;
	/** TextRank numbered sentences (optional; else read from `document.metadata.custom`). */
	textrankSentences?: string;
};

/** Summary text plus merged LLM usage for index telemetry. */
export type ResourceSummaryWithLlmMeta = ResourceSummary & {
	llmUsage: LLMUsage;
	llmCostUsd: number;
};

type TextrankCustom = {
	/** @deprecated Prefer {@link textrankKeywordsStructured}. */
	textrankKeywords?: string;
	/** @deprecated Prefer {@link textrankSentencesStructured}. */
	textrankSentences?: string;
	textrankKeywordsStructured?: TextRankTerm[];
	textrankSentencesStructured?: TextrankSentenceStructured[];
};

/**
 * Builds prompt strings for summary/tag templates from structured TextRank or legacy string fields.
 */
function resolveTextrankContext(
	document: Document,
	options?: DocumentSummaryOptions,
): { textrankKeywords: string; textrankSentences: string } {
	const custom = document.metadata?.custom as TextrankCustom | undefined;

	let kw: string | undefined = options?.textrankKeywords;
	if (kw === undefined && custom) {
		if (typeof custom.textrankKeywords === 'string') {
			kw = custom.textrankKeywords;
		} else if (Array.isArray(custom.textrankKeywordsStructured) && custom.textrankKeywordsStructured.length) {
			kw = custom.textrankKeywordsStructured.map((t) => t.term).join(', ');
		}
	}
	kw = kw ?? '';

	let sent: string | undefined = options?.textrankSentences;
	if (sent === undefined && custom) {
		if (typeof custom.textrankSentences === 'string') {
			sent = custom.textrankSentences;
		} else if (Array.isArray(custom.textrankSentencesStructured) && custom.textrankSentencesStructured.length) {
			const arr = custom.textrankSentencesStructured;
			sent = arr.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
		}
	}
	sent = sent ?? '';

	return { textrankKeywords: kw, textrankSentences: sent };
}

/**
 * Default implementation of getSummary for document loaders.
 * Uses {@link PromptId.DocSummaryShort} and optionally {@link PromptId.DocSummaryFull} with TextRank context when present.
 */
export async function getDefaultDocumentSummary(
	doc: Document | string,
	aiServiceManager?: AIServiceManager,
	provider?: string,
	modelId?: string,
	options?: DocumentSummaryOptions,
): Promise<ResourceSummaryWithLlmMeta> {
	if (!aiServiceManager) {
		throw new Error('getDefaultDocumentSummary requires AIServiceManager to generate summaries');
	}

	let document: Document;
	if (typeof doc === 'string') {
		document = {
			cacheFileInfo: {
				content: doc,
			},
			sourceFileInfo: {
				content: doc,
			},
			metadata: {
				title: '',
				topicTags: [],
				functionalTagEntries: [],
				keywordTags: [],
			},
		} as unknown as Document;
	} else {
		document = doc;
	}

	const content = document.cacheFileInfo.content || document.sourceFileInfo.content;
	const title = document.metadata.title || document.sourceFileInfo.name;
	const path = document.sourceFileInfo.path;

	const search = AppContext.getInstance().settings.search;
	const shortW = options?.shortWordCount ?? search.shortSummaryLength;
	const fullW = options?.fullWordCount ?? search.fullSummaryLength;
	const mode = options?.mode ?? 'short_then_full_if_long';
	const { textrankKeywords, textrankSentences } = resolveTextrankContext(document, options);

	const shortVars = {
		content,
		title,
		path,
		maxWords: String(shortW),
		...(textrankKeywords.trim() ? { textrankKeywords } : {}),
		...(textrankSentences.trim() ? { textrankSentences } : {}),
	};

	const fullVarsBase = {
		content,
		title,
		path,
		targetWords: String(fullW),
		...(textrankKeywords.trim() ? { textrankKeywords } : {}),
		...(textrankSentences.trim() ? { textrankSentences } : {}),
	};

	const needFull =
		mode === 'short_then_full_if_long' && content.length > search.fullSummaryLength;

	const tSum = Date.now();
	console.info('[MarkdownDocumentLoader] document summary LLM start', {
		path,
		needFull,
		prompts: needFull ? ['DocSummaryShort', 'DocSummaryFull'] : ['DocSummaryShort'],
	});

	let llmUsage = emptyUsage();
	let llmCostUsd = 0;
	let shortSummary: string;
	let fullSummary: string | undefined;

	if (needFull) {
		const [shortRes, fullRes] = await Promise.all([
			aiServiceManager.chatWithPromptWithUsage(PromptId.DocSummaryShort, shortVars, provider, modelId),
			aiServiceManager.chatWithPromptWithUsage(PromptId.DocSummaryFull, fullVarsBase, provider, modelId),
		]);
		shortSummary = shortRes.text;
		fullSummary = fullRes.text;
		llmUsage = mergeTokenUsage(shortRes.usage, fullRes.usage);
		llmCostUsd = shortRes.costUsd + fullRes.costUsd;
	} else {
		const shortRes = await aiServiceManager.chatWithPromptWithUsage(
			PromptId.DocSummaryShort,
			shortVars,
			provider,
			modelId,
		);
		shortSummary = shortRes.text;
		fullSummary = undefined;
		llmUsage = shortRes.usage;
		llmCostUsd = shortRes.costUsd;
	}

	console.info('[MarkdownDocumentLoader] document summary LLM done', {
		path,
		needFull,
		elapsedMs: Date.now() - tSum,
	});

	return { shortSummary, fullSummary, llmUsage, llmCostUsd };
}
