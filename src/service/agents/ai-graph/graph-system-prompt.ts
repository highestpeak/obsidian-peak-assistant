/**
 * System prompt builder for the GraphAgent. Constructs a prompt that instructs
 * the LLM to read source documents and produce a structured knowledge graph.
 *
 * T11Y-6: prompt body moved to templates/prompts/graph-agent-system.md
 * (PromptId.GraphAgentSystem). This function now only formats the
 * sourcesTable then delegates to TemplateManager.
 */

import { PromptId } from '@/core/prompt/PromptId';
import { TemplateManager } from '@/core/template/TemplateManager';

export async function buildGraphSystemPrompt(searchQuery: string, sourcesMeta: Array<{
    path: string;
    folder: string;
    filename: string;
    createdAt?: number;
    modifiedAt?: number;
    relevanceScore?: number;
}>): Promise<string> {
    const sourcesTable = sourcesMeta.map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : 'unknown';
        return `- ${s.filename} (${s.folder}) — created: ${date}, relevance: ${(s.relevanceScore ?? 0).toFixed(2)}`;
    }).join('\n');

    const tm = TemplateManager.getInstance();
    if (!tm) throw new Error('TemplateManager not bound — cannot render graph agent system prompt.');
    return tm.render(PromptId.GraphAgentSystem, { searchQuery, sourcesTable });
}
