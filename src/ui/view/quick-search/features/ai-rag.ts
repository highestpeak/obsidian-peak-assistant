import type { AIServiceManager } from '@/service/chat/service-manager';
import type { RagSource } from '@/service/search/types';

/**
 * Pick a usable (provider, model) pair from current plugin settings.
 */
export async function pickDefaultModel(manager: AIServiceManager): Promise<{ provider: string; model: string }> {
	const settings = manager.getSettings();
	const preferredModelId = settings.defaultModelId;
	const models = await manager.getAllAvailableModels();
	if (!models.length) {
		throw new Error('No AI models available. Please configure a provider in settings.');
	}
	const preferred = models.find((m) => m.id === preferredModelId);
	if (preferred) return { provider: preferred.provider, model: preferred.id };
	// Fallback to the first available model.
	return { provider: models[0].provider, model: models[0].id };
}

/**
 * Build a summarization prompt for AI analysis.
 * The actual system prompt is defined in PromptApplicationService; we enforce Chinese output here.
 */
export function buildRagSummarizeText(params: {
	query: string;
	sources: RagSource[];
	webEnabled?: boolean;
}): string {
	const lines: string[] = [];
	lines.push(`User question: ${params.query}`);
	lines.push('');
	lines.push('You must answer in Chinese.');
	if (params.webEnabled) {
		lines.push('Web search is enabled (if you have web results, incorporate them).');
	}
	lines.push('');
	lines.push('Sources (snippets):');
	for (const s of params.sources) {
		lines.push(`- ${s.title} (${s.path})`);
		lines.push(`  ${s.snippet}`.trimEnd());
	}
	lines.push('');
	lines.push('Task: Provide a concise, high-signal answer. Cite sources by file path when appropriate.');
	return lines.join('\n');
}


