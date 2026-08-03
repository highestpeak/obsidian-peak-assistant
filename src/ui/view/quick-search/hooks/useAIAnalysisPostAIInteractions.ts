/**
 * All post-completion AI requests for search (regenerate overview, save dialog fields,
 * topic analyze, inline follow-ups) should go through this module for consistent context and maintainability.
 */
import { SLICE_CAPS } from '@/core/constant';
import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/core/types/prompt';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { useSharedStore } from '../store/sharedStore';
import { getLastAnalysisHistorySearch, searchCurrentResult } from '../followupContextRuntime';
import { FollowupChatAgent } from '@/service/agents/FollowupChatAgent';
import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { useQuickSearchHost } from './useQuickSearchHost';

/** Sanitize AI-generated filename: remove invalid filesystem chars. */
function sanitizeFilename(s: string): string {
    return s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, SLICE_CAPS.ui.analysisTitleSanitize) || 'untitled';
}

/** Process folder path from AI output. */
function processFolderPath(s: string): string {
    return s.replace(/^\/+|\/+$/g, '').trim().slice(0, SLICE_CAPS.ui.analysisTitlePath);
}

/**
 * Ensure folder is under the configured AI analysis save root so all archives stay in one place.
 * If the AI returns a path outside the root (e.g. sibling "AI-Analysis HH-MM-SS"), use root + last segment.
 */
function normalizeFolderUnderRoot(processed: string, defaultSaveFolder: string): string {
    const base = defaultSaveFolder.replace(/^\/+|\/+$/g, '').trim();
    if (!base) return processed;
    if (!processed) return base;
    const p = processed.replace(/^\/+|\/+$/g, '').trim();
    if (p === base || p.startsWith(base + '/')) return p;
    const lastSegment = p.split('/').pop() || p;
    return lastSegment ? `${base}/${lastSegment}` : base;
}

/** Parent folder of a vault-relative path (no leading/trailing slashes). */
function getParentFolder(path: string): string {
    const p = path.replace(/^\/+|\/+$/g, '').trim();
    if (!p) return '';
    const i = p.lastIndexOf('/');
    return i >= 0 ? p.slice(0, i) : '';
}

const CANDIDATE_FOLDERS_MAX = 12;

/**
 * Stream follow-up response via FollowupChatAgent (search_chat_history + search_current_result + vault tools).
 * Falls back to chatWithPromptStream when agent is unavailable (e.g. mock env).
 * Pass `isMockEnv` explicitly to avoid AppContext.getInstance() at call site.
 */
export async function* streamSearchFollowup(
    manager: AIServiceManager,
    promptId: PromptId,
    variables: Record<string, unknown>,
    isMockEnv: boolean = false
): AsyncGenerator<LLMStreamEvent> {
    try {
        if (isMockEnv) {
            yield* manager.queryStream(promptId, variables as any);
            return;
        }
        const historySearchFn = getLastAnalysisHistorySearch();
        const agent = new FollowupChatAgent(
            manager as any,
            { enableLocalSearch: true },
            historySearchFn,
            searchCurrentResult
        );
        for await (const evt of agent.streamFollowup(promptId, variables)) {
            yield evt;
        }
    } catch {
        yield* manager.queryStream(promptId, variables as any);
        return;
    }
}

/** Handlers for consuming followup stream (same agent events everywhere). */
export type ConsumeFollowupStreamHandlers = {
    onDelta?: (acc: string) => void;
    /** Called when a prompt-stream-result event includes usage (merge with main analysis tokens). */
    onUsage?: (usage: LLMUsage) => void;
};

/**
 * Consume a followup stream (from streamSearchFollowup / FollowupChatAgent) and return final answer.
 * Use this so all followup entry points share the same event loop and capability.
 */
export async function consumeFollowupStream(
    stream: AsyncGenerator<LLMStreamEvent>,
    handlers?: ConsumeFollowupStreamHandlers
): Promise<string> {
    let acc = '';
    for await (const event of stream) {
        // Legacy PromptService events
        if (event.type === 'prompt-stream-delta' && typeof (event as any).delta === 'string') {
            acc += (event as any).delta;
            handlers?.onDelta?.(acc);
        } else if (event.type === 'prompt-stream-result') {
            const ev = event as { output?: unknown; usage?: LLMUsage };
            if (ev.output != null) acc = typeof ev.output === 'string' ? ev.output : acc;
            if (ev.usage) handlers?.onUsage?.(ev.usage);
        // Peak Harness stream events from queryStream.
        } else if (event.type === 'text-delta' && typeof (event as any).text === 'string') {
            acc += (event as any).text;
            handlers?.onDelta?.(acc);
        } else if (event.type === 'complete') {
            const ev = event as { usage?: LLMUsage };
            if (ev.usage) handlers?.onUsage?.(ev.usage);
        } else if (event.type === 'error') {
            throw (event as any).error;
        }
    }
    return acc;
}

/**
 * Run semantic search and return unique parent folders of hits (candidates for save location).
 */
async function getCandidateFoldersFromSearch(
    searchClient: { search: (q: any) => Promise<{ items: Array<{ path: string }> }> } | null,
    searchText: string
): Promise<string[]> {
    if (!searchClient || !searchText.trim()) return [];
    try {
        const res = await searchClient.search(
            {
                text: searchText.trim().slice(0, SLICE_CAPS.ui.analysisSearchText),
                scopeMode: 'all',
                topK: 24,
                searchMode: 'hybrid',
            }
        );
        const seen = new Set<string>();
        const folders: string[] = [];
        for (const item of res.items ?? []) {
            const folder = getParentFolder(item.path ?? '');
            if (folder && !seen.has(folder)) {
                seen.add(folder);
                folders.push(folder);
                if (folders.length >= CANDIDATE_FOLDERS_MAX) break;
            }
        }
        return folders;
    } catch {
        return [];
    }
}

/**
 * Generic generator for ResultSaveDialog fields (filename/folder).
 * Calls chatWithPrompt with the given promptId and processes the result.
 */
export function useGenerateResultSaveField() {
    const host = useQuickSearchHost();
    const { manager, searchClient } = useServiceContext();
    const { searchQuery } = useSharedStore();
    const title = useSearchSessionStore((s) => s.title ?? '');
    const summary = useSearchSessionStore((s) => s.v2Summary);

    const generateResultSaveField = useCallback(async (
        promptId: PromptId,
        processResult: (raw: string) => string,
        setTypewriterTarget: (target: string) => void,
        setTypewriterEnabled: (enabled: boolean) => void
    ) => {
        const result = await manager.queryText(promptId, {
            query: searchQuery,
            summary: summary ? summary.slice(0, SLICE_CAPS.ui.analysisSummary) : undefined,
        });
        const processed = processResult(result);
        if (processed) {
            setTypewriterTarget(processed);
            setTypewriterEnabled(true);
        }
    }, [manager, searchQuery, summary])

    const generateFileName = useCallback(async (
        setTypewriterTarget: (target: string) => void,
        setTypewriterEnabled: (enabled: boolean) => void
    ) => {
        generateResultSaveField(
            PromptId.AiAnalysisSaveFileName,
            sanitizeFilename,
            setTypewriterTarget,
            setTypewriterEnabled
        )
    }, [generateResultSaveField]);
    const generateFolder = useCallback(async (
        setTypewriterTarget: (target: string) => void,
        setTypewriterEnabled: (enabled: boolean) => void
    ) => {
        const searchText = [title, searchQuery, summary?.slice(0, SLICE_CAPS.ui.analysisSummaryInSearch)].filter(Boolean).join(' ').trim() || searchQuery;
        const candidateFolders = await getCandidateFoldersFromSearch(searchClient, searchText);
        const candidateFoldersFromSearch = candidateFolders.length
            ? candidateFolders.map((f) => `- ${f}`).join('\n')
            : undefined;
        const defaultSaveFolder = host.autoSaveFolder || undefined;
        const result = await manager.queryText(PromptId.AiAnalysisSaveFolder, {
            query: searchQuery,
            summary: summary ? summary.slice(0, SLICE_CAPS.ui.analysisSummary) : undefined,
            candidateFoldersFromSearch,
            defaultSaveFolder,
        });
        const processed = processFolderPath(result);
        const folderUnderRoot = defaultSaveFolder
            ? normalizeFolderUnderRoot(processed, defaultSaveFolder)
            : processed;
        if (folderUnderRoot) {
            setTypewriterTarget(folderUnderRoot);
            setTypewriterEnabled(true);
        }
    }, [manager, searchClient, searchQuery, summary]);

    return {
        generateFileName,
        generateFolder,
    };
}
