import { SLICE_CAPS } from '@/core/constant';
import { refreshableMemoizeSupplier } from '@/core/utils/functions';
import {
	useAIAnalysisTopicsStore,
	useAIAnalysisInteractionsStore,
} from './store/aiAnalysisStore';
import { useSearchSessionStore } from './store/searchSessionStore';

const DEFAULT_MAX_CHARS = 4000;
const CONTEXT_LINES = 2;

type HistorySearchFn = (query: string, options?: { maxChars?: number }) => string;

let lastHistorySearch: { fn: HistorySearchFn; runId: string | null } | null = null;

/** Bump to invalidate both core and followups caches (e.g. when starting a new analysis). */
let resultIndexInvalidateSeed = 0;

/** State for core index (Title, Summary, Sources, Sections, Steps). */
function getResultIndexStateCore() {
    const ss = useSearchSessionStore.getState();
    return {
        seed: resultIndexInvalidateSeed,
        runId: ss.id ?? '',
        summaryLen: ss.v2Summary?.length ?? 0,
        sourcesLen: ss.v2Sources?.length ?? 0,
        sectionsLen: ss.v2PlanSections?.length ?? 0,
        stepsLen: ss.v2Steps?.length ?? 0,
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
        last.summaryLen !== cur.summaryLen ||
        last.sourcesLen !== cur.sourcesLen ||
        last.sectionsLen !== cur.sectionsLen ||
        last.stepsLen !== cur.stepsLen
    );
}

/** State for followups index only (changes often with Q&A). */
function getResultIndexStateFollowups() {
    const interactions = useAIAnalysisInteractionsStore.getState();
    const topics = useAIAnalysisTopicsStore.getState();
    return {
        seed: resultIndexInvalidateSeed,
        followUpLen: interactions.fullAnalysisFollowUp?.length ?? 0,
        topicResultsKeys: Object.keys(topics.topicAnalyzeResults ?? {}).length,
        graphFollowupLen: interactions.graphFollowupHistory?.length ?? 0,
        sourcesFollowupLen: interactions.sourcesFollowupHistory?.length ?? 0,
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

/** Build core index (Title, Summary, Sources, Sections, Steps). */
function buildResultIndexCore(): string {
    const ss = useSearchSessionStore.getState();
    const lines: string[] = [];

    lines.push('[Title]');
    lines.push(ss.title ?? '');

    lines.push('');
    lines.push('[Summary]');
    lines.push(ss.v2Summary ?? '');

    lines.push('');
    lines.push('[Sources]');
    for (const src of ss.v2Sources ?? []) {
        lines.push(`- ${src.title ?? ''} | ${src.path ?? ''}`);
        if (src.reasoning) lines.push(`  ${src.reasoning}`);
    }

    lines.push('');
    lines.push('[Sections]');
    for (const sec of ss.v2PlanSections ?? []) {
        const label = sec.title ?? sec.id ?? 'Section';
        lines.push(`- ${label}`);
        const content = (sec.content ?? '').slice(0, SLICE_CAPS.ui.followupMarkdown);
        if (content) lines.push(`  ${content}`);
    }

    lines.push('');
    lines.push('[Steps]');
    for (const step of ss.v2Steps ?? []) {
        const text = step.summary?.slice(0, SLICE_CAPS.ui.followupAnswer) ?? '';
        lines.push(`- ${step.displayName}: ${text}`);
    }

    return lines.join('\n');
}

/** Build followups-only index (changes often with Q&A). */
function buildResultIndexFollowups(): string {
    const interactions = useAIAnalysisInteractionsStore.getState();
    const topics = useAIAnalysisTopicsStore.getState();
    const lines: string[] = [];

    lines.push('[Followups]');
    for (const f of interactions.fullAnalysisFollowUp ?? []) {
        lines.push(`Q: ${f.title ?? ''}`);
        lines.push(`A: ${(f.content ?? '').slice(0, SLICE_CAPS.ui.followupAnswer)}`);
    }
    const topicResults = topics.topicAnalyzeResults ?? {};
    for (const [topic, arr] of Object.entries(topicResults)) {
        for (const item of arr ?? []) {
            lines.push(`Topic[${topic}] Q: ${item.question}`);
            lines.push(`A: ${(item.answer ?? '').slice(0, SLICE_CAPS.ui.followupAnswer)}`);
        }
    }
    for (const item of interactions.graphFollowupHistory ?? []) {
        lines.push(`Graph Q: ${item.question}`);
        lines.push(`A: ${(item.answer ?? '').slice(0, SLICE_CAPS.ui.followupAnswer)}`);
    }
    for (const item of interactions.sourcesFollowupHistory ?? []) {
        lines.push(`Sources Q: ${item.question}`);
        lines.push(`A: ${(item.answer ?? '').slice(0, SLICE_CAPS.ui.followupAnswer)}`);
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
