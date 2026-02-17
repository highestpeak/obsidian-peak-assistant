import Handlebars from 'handlebars';
import type { SearchAgentResult, AISearchSource, AISearchTopic, DashboardBlock, AISearchNode } from '../AISearchAgent';
import { template as RESULT_SNAPSHOT_TEMPLATE } from './templates/result-snapshot';

const MAX_TOPICS = 12;
const MAX_SOURCES = 15;
const MAX_BLOCK_ITEMS = 5;
const MAX_NODES = 20;
const REASONING_MAX_CHARS = 120;
const SUMMARY_EXCERPT_MAX_CHARS = 500;

/**
 * Build a dense text snapshot of the current result for the summary prompt.
 * Uses a Handlebars template; reduces token noise and focuses on topics, sources, blocks, and key graph nodes.
 */
export function buildMinifiedResultSnapshot(result: SearchAgentResult): string {
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

    const nodes = result.graph?.nodes ?? [];
    const edges = result.graph?.edges ?? [];
    const topNodes = nodes
        .filter((n: AISearchNode) => n.title || n.id)
        .slice(0, MAX_NODES)
        .map((n: AISearchNode) => (n.path ? `[[${n.path}]]` : n.title || n.id));
    const keyNodesLine = topNodes.length > 0 ? topNodes.join(', ') : undefined;

    const payload = {
        title: result.title?.trim() || undefined,
        topics,
        sources,
        blocks,
        graphNodeCount: nodes.length,
        graphEdgeCount: edges.length,
        keyNodesLine,
        summaryExcerpt: result.summary?.trim() ? result.summary.trim().slice(0, SUMMARY_EXCERPT_MAX_CHARS) : undefined,
    };

    return Handlebars.compile(RESULT_SNAPSHOT_TEMPLATE)(payload);
}
