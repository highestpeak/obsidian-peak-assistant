import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import { PromptId } from '@/core/types/prompt';
import {
	extractCitedWebSources,
	type CitedWebSource,
} from '@/core/web/sourceExtraction';
import { runHarnessText } from '@/service/agents/harness/HarnessModelRunner';
import type { DebugTracePort } from '@/core/debug-trace';

export interface WebSearchQueryResult {
	query: string;
	answer: string;
	sources: CitedWebSource[];
}

/**
 * Shared provider-backed Web search fallback. The caller must obtain explicit
 * user permission before invoking it. Only URLs cited by the provider response
 * become sources; the synthesized answer itself is never promoted to evidence.
 */
export async function runWebSearchQuery(
	query: string,
	debugTrace: DebugTracePort | null = null,
): Promise<WebSearchQueryResult> {
	const binding = ProfileRegistry.getInstance().getActiveWebSearchConfig();
	if (!binding) throw new Error('No Web Search profile is configured.');
	const templates = TemplateManager.getInstance();
	if (!templates) throw new Error('Web Search templates are unavailable.');
	const systemPrompt = await templates.render(PromptId.WebSearchToolSystem, {});
	const { text } = await runHarnessText({
		loopId: `ai-graph-web-search-${crypto.randomUUID()}`,
		profile: binding.profile,
		modelId: binding.modelId,
		prompt: query,
		systemPrompt,
		maxSteps: 1,
		debugTrace,
		debugSurface: 'agent',
		debugCapabilityId: 'search.web-query',
	});
	const answer = text?.trim() ?? '';
	return {
		query,
		answer,
		sources: extractCitedWebSources(answer),
	};
}
