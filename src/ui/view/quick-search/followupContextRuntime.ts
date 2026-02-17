import { refreshableMemoizeSupplier } from '@/core/utils/functions';
import { useAIAnalysisStore } from './store';

const DEFAULT_MAX_CHARS = 4000;
const CONTEXT_LINES = 2;
const MAX_NODES_PREVIEW = 30;
const STEP_TEXT_MAX = 200;

type HistorySearchFn = (query: string, options?: { maxChars?: number }) => string;

let lastHistorySearch: { fn: HistorySearchFn; runId: string | null } | null = null;

/** Bump to invalidate both core and followups caches (e.g. when starting a new analysis). */
let resultIndexInvalidateSeed = 0;

/** State for core index (Title, Summary, Topics, Sources, Blocks, Graph, Steps). */
function getResultIndexStateCore() {
    const s = useAIAnalysisStore.getState();
    return {
        seed: resultIndexInvalidateSeed,
        runId: s.analysisRunId ?? '',
        summaryVersion: s.summaryVersion ?? 0,
        summariesLen: s.summaries?.length ?? 0,
        summaryChunksLen: s.summaryChunks?.length ?? 0,
        topicsLen: s.topics?.length ?? 0,
        sourcesLen: s.sources?.length ?? 0,
        blocksLen: s.dashboardBlocks?.length ?? 0,
        graphNodes: s.graph?.nodes?.length ?? 0,
        graphEdges: s.graph?.edges?.length ?? 0,
        stepsLen: s.steps?.length ?? 0,
    };
}

function coreStateChanged(
    last: ReturnType<typeof getResultIndexStateCore> | undefined,
    cur: ReturnType<typeof getResultIndexStateCore>
): boolean {
    if (!last) return true;
    return (
        last.seed !== cur.seed ||
        last.runId !== cur.runId ||
        last.summaryVersion !== cur.summaryVersion ||
        last.summariesLen !== cur.summariesLen ||
        last.summaryChunksLen !== cur.summaryChunksLen ||
        last.topicsLen !== cur.topicsLen ||
        last.sourcesLen !== cur.sourcesLen ||
        last.blocksLen !== cur.blocksLen ||
        last.graphNodes !== cur.graphNodes ||
        last.graphEdges !== cur.graphEdges ||
        last.stepsLen !== cur.stepsLen
    );
}

/** State for followups index only (changes often with Q&A). */
function getResultIndexStateFollowups() {
    const s = useAIAnalysisStore.getState();
    return {
        seed: resultIndexInvalidateSeed,
        followUpLen: s.fullAnalysisFollowUp?.length ?? 0,
        topicResultsKeys: Object.keys(s.topicAnalyzeResults ?? {}).length,
        graphFollowupLen: s.graphFollowupHistory?.length ?? 0,
        sourcesFollowupLen: s.sourcesFollowupHistory?.length ?? 0,
    };
}

function followupsStateChanged(
    last: ReturnType<typeof getResultIndexStateFollowups> | undefined,
    cur: ReturnType<typeof getResultIndexStateFollowups>
): boolean {
    if (!last) return true;
    return (
        last.seed !== cur.seed ||
        last.followUpLen !== cur.followUpLen ||
        last.topicResultsKeys !== cur.topicResultsKeys ||
        last.graphFollowupLen !== cur.graphFollowupLen ||
        last.sourcesFollowupLen !== cur.sourcesFollowupLen
    );
}

/**
 * Set the history search function after an analysis run completes.
 * Pass null to clear (e.g. on cancel or error).
 */
export function setLastAnalysisHistorySearch(
    fn: HistorySearchFn | null,
    runId?: string | null
): void {
    lastHistorySearch = fn ? { fn, runId: runId ?? null } : null;
}

/**
 * Get the history search function for the last completed analysis.
 * Returns a no-op (empty string) when no session is available.
 */
export function getLastAnalysisHistorySearch(): HistorySearchFn {
    if (!lastHistorySearch) {
        return () => '';
    }
    return lastHistorySearch.fn;
}

/**
 * Clear in-memory follow-up context when starting a new analysis (avoids leaking previous agent and cache).
 */
export function invalidateFollowupContextCache(): void {
    lastHistorySearch = null;
    resultIndexInvalidateSeed += 1;
}

/** Build core index (Title, Summary, Topics, Sources, Blocks, Graph, Steps). */
function buildResultIndexCore(): string {
    const s = useAIAnalysisStore.getState();
    const lines: string[] = [];

    lines.push('[Title]');
    lines.push(s.title ?? '');

    const summary =
        s.summaries?.length && s.summaryVersion != null
            ? s.summaries[(s.summaryVersion ?? 1) - 1] ?? s.summaries[0] ?? ''
            : s.summaryChunks?.join('') ?? '';
    lines.push('');
    lines.push('[Summary]');
    lines.push(summary);

    lines.push('');
    lines.push('[Topics]');
    for (const t of s.topics ?? []) {
        lines.push(`- ${t.label}`);
        if (t.suggestQuestions?.length) {
            t.suggestQuestions.forEach((q) => lines.push(`  ? ${q}`));
        }
    }

    lines.push('');
    lines.push('[Sources]');
    for (const src of s.sources ?? []) {
        lines.push(`- ${src.title ?? ''} | ${src.path ?? ''}`);
        if (src.reasoning) lines.push(`  ${src.reasoning}`);
        if (src.badges?.length) lines.push(`  badges: ${src.badges.join(', ')}`);
    }

    lines.push('');
    lines.push('[Blocks]');
    for (const b of s.dashboardBlocks ?? []) {
        const label = b.title ?? b.id ?? 'Block';
        lines.push(`- ${label} (${b.renderEngine ?? ''})`);
        const md = (b.markdown ?? b.mermaidCode ?? '').slice(0, 300);
        if (md) lines.push(`  ${md}`);
    }

    lines.push('');
    lines.push('[Graph]');
    const g = s.graph;
    if (g) {
        lines.push(`nodes: ${g.nodes?.length ?? 0}, edges: ${g.edges?.length ?? 0}`);
        const nodes = (g.nodes ?? []).slice(0, MAX_NODES_PREVIEW);
        for (const n of nodes) {
            lines.push(`- ${n.title ?? n.id ?? ''} | ${n.type ?? ''} | ${n.path ?? ''}`);
        }
    } else {
        lines.push('(empty)');
    }

    lines.push('');
    lines.push('[Steps]');
    for (const step of s.steps ?? []) {
        const text = step.description?.slice(0, STEP_TEXT_MAX) ?? '';
        lines.push(`- ${step.title}: ${text}`);
    }

    return lines.join('\n');
}

/** Build followups-only index (changes often with Q&A). */
function buildResultIndexFollowups(): string {
    const s = useAIAnalysisStore.getState();
    const lines: string[] = [];

    lines.push('[Followups]');
    for (const f of s.fullAnalysisFollowUp ?? []) {
        lines.push(`Q: ${f.title ?? ''}`);
        lines.push(`A: ${(f.content ?? '').slice(0, 200)}`);
    }
    const topicResults = s.topicAnalyzeResults ?? {};
    for (const [topic, arr] of Object.entries(topicResults)) {
        for (const item of arr ?? []) {
            lines.push(`Topic[${topic}] Q: ${item.question}`);
            lines.push(`A: ${(item.answer ?? '').slice(0, 200)}`);
        }
    }
    for (const item of s.graphFollowupHistory ?? []) {
        lines.push(`Graph Q: ${item.question}`);
        lines.push(`A: ${(item.answer ?? '').slice(0, 200)}`);
    }
    for (const item of s.sourcesFollowupHistory ?? []) {
        lines.push(`Sources Q: ${item.question}`);
        lines.push(`A: ${(item.answer ?? '').slice(0, 200)}`);
    }

    return lines.join('\n');
}

const resultIndexCoreSupplier = refreshableMemoizeSupplier(
    buildResultIndexCore,
    getResultIndexStateCore,
    coreStateChanged
);

const resultIndexFollowupsSupplier = refreshableMemoizeSupplier(
    buildResultIndexFollowups,
    getResultIndexStateFollowups,
    followupsStateChanged
);

/**
 * Search the current analysis result (store snapshot) by query.
 * Used by followup agent tool search_current_result.
 */
export function searchCurrentResult(
    query: string,
    options?: { maxChars?: number }
): string {
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const core = resultIndexCoreSupplier();
    const followups = resultIndexFollowupsSupplier();
    const fullText = followups ? `${core}\n\n${followups}` : core;
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return fullText.slice(0, maxChars);
    const lines = fullText.split(/\r?\n/);
    const matches: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
            const start = Math.max(0, i - CONTEXT_LINES);
            const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
            matches.push(lines.slice(start, end).join('\n'));
        }
    }
    const result = matches.length > 0 ? matches.join('\n---\n') : fullText.slice(0, maxChars);
    return result.slice(0, maxChars);
}
