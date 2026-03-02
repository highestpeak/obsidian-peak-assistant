import type { SearchAgentResult, AISearchSource, AISearchTopic, DashboardBlock } from '../../AISearchAgent';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { AgentTemplateId } from '@/core/template/TemplateRegistry';

const MAX_TOPICS = 12;
const MAX_SOURCES = 15;
const MAX_BLOCK_ITEMS = 5;
const REASONING_MAX_CHARS = 120;
const SUMMARY_EXCERPT_MAX_CHARS = 500;

/**
 * Build a dense text snapshot of the current result for the summary prompt.
 * Uses TemplateManager; reduces token noise and focuses on topics, sources, and blocks.
 */
export async function buildMinifiedResultSnapshot(
    result: SearchAgentResult,
    templateManager: TemplateManager,
): Promise<string> {
    const topics = (result.topics ?? []).slice(0, MAX_TOPICS).map((t: AISearchTopic) => ({
        label: t.label,
        weight: t.weight,
        suggestQuestionsLine: (t.suggestQuestions ?? []).slice(0, 2).join('; ') || undefined,
    }));

    const sources = (result.sources ?? []).slice(0, MAX_SOURCES).map((s: AISearchSource) => ({
        path: s.path,
        title: s.title,
        reasoningShort: (s.reasoning ?? '').slice(0, REASONING_MAX_CHARS),
        scoreAvg: s.score?.average ?? s.score?.physical ?? 0,
    }));

    const blocks = (result.dashboardBlocks ?? []).slice(0, 10).map((b: DashboardBlock) => ({
        title: b.title ?? b.id ?? '(block)',
        renderEngine: b.renderEngine,
        contentHint: b.markdown ? '[markdown]' : b.mermaidCode ? '[mermaid]' : '',
        itemsSummary: (b.items ?? []).slice(0, MAX_BLOCK_ITEMS).map((i) => i.title || i.id).filter(Boolean).join(', ') || undefined,
    }));

    const payload = {
        title: result.title?.trim() || undefined,
        topics,
        sources,
        blocks,
        summaryExcerpt: result.summary?.trim() ? result.summary.trim().slice(0, SUMMARY_EXCERPT_MAX_CHARS) : undefined,
    };

    return templateManager.render(AgentTemplateId.ResultSnapshot, payload);
}
