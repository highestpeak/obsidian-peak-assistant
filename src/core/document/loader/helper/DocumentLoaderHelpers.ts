import type { Document, ResourceSummary } from '@/core/document/types';
import { PromptId } from '@/service/prompt/PromptId';

/**
 * Default implementation of getSummary for document loaders.
 * Uses DocSummary prompt to generate summaries from document content.
 * 
 * @param doc - Document to summarize
 * @param promptService - Prompt service for generating summaries
 * @param provider - LLM provider
 * @param modelId - LLM model ID
 * @returns Resource summary with short and optional full summary
 */
export async function getDefaultDocumentSummary(
	doc: Document,
	promptService: { chatWithPrompt: (promptId: string, variables: any, provider: string, model: string) => Promise<string> },
	provider: string,
	modelId: string
): Promise<ResourceSummary> {
	// Use cacheFileInfo.content if available (for binary files like PDF, Image),
	// otherwise use sourceFileInfo.content (for text files)
	const content = doc.cacheFileInfo.content || doc.sourceFileInfo.content;
	const title = doc.metadata.title || doc.sourceFileInfo.name;
	const path = doc.sourceFileInfo.path;

	const shortSummary = await promptService.chatWithPrompt(
		PromptId.DocSummary,
		{ content, title, path },
		provider,
		modelId
	);

	let fullSummary: string | undefined;
	if (content.length > 2000) {
		fullSummary = await promptService.chatWithPrompt(
			PromptId.DocSummary,
			{ content, title, path },
			provider,
			modelId
		);
	}

	return { shortSummary, fullSummary };
}

