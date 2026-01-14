import { AppContext } from '@/app/context/AppContext';
import type { Document, ResourceSummary } from '@/core/document/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';

/**
 * Default implementation of getSummary for document loaders.
 * Uses DocSummary prompt to generate summaries from document content.
 * 
 * @param doc - Document to summarize
 * @param aiServiceManager - AI service manager for generating summaries
 * @param provider - LLM provider
 * @param modelId - LLM model ID
 * @returns Resource summary with short and optional full summary
 */
export async function getDefaultDocumentSummary(
	doc: Document | string,
	aiServiceManager?: AIServiceManager,
	provider?: string,
	modelId?: string
): Promise<ResourceSummary> {
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
		} as Document;
	} else {
		document = doc;
	}

	// Use cacheFileInfo.content if available (for binary files like PDF, Image),
	// otherwise use sourceFileInfo.content (for text files)
	const content = document.cacheFileInfo.content || document.sourceFileInfo.content;
	const title = document.metadata.title || document.sourceFileInfo.name;
	const path = document.sourceFileInfo.path;

	const shortSummary = await aiServiceManager.chatWithPrompt(
		PromptId.DocSummary,
		{ content, title, path, wordCount: AppContext.getInstance().settings.search.shortSummaryLength.toString() },
		provider,
		modelId
	);

	let fullSummary: string | undefined;
	if (content.length > AppContext.getInstance().settings.search.fullSummaryLength) {
		fullSummary = await aiServiceManager.chatWithPrompt(
			PromptId.DocSummary,
			{ content, title, path, wordCount: AppContext.getInstance().settings.search.fullSummaryLength.toString() },
			provider,
			modelId
		);
	}

	return { shortSummary, fullSummary };
}

