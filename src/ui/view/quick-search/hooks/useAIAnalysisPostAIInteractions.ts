/**
 * All post-completion AI requests for search (regenerate overview, save dialog fields,
 * topic analyze, inline follow-ups) should go through this module for consistent context and maintainability.
 */
import { useCallback, useRef, useState } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import {
    useAIAnalysisRuntimeStore,
    useAIAnalysisResultStore,
    useAIAnalysisSummaryStore,
    useAIAnalysisTopicsStore,
} from '../store/aiAnalysisStore';
import { useSharedStore } from '../store/sharedStore';
import { getLastAnalysisHistorySearch, searchCurrentResult } from '../followupContextRuntime';
import { AppContext } from '@/app/context/AppContext';
import type { UIPreviewGraph } from '@/ui/component/mine/graph-viz/types';
import type { DashboardBlock, DashboardBlockItem } from '@/service/agents/AISearchAgent';
import { FollowupChatAgent } from '@/service/agents/search-agent-helper/FollowupChatAgent';
import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { getMermaidInner, wrapMermaidCode } from '@/core/utils/mermaid-utils';

/** Sanitize AI-generated filename: remove invalid filesystem chars. */
function sanitizeFilename(s: string): string {
    return s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';
}

/** Process folder path from AI output. */
function processFolderPath(s: string): string {
    return s.replace(/^\/+|\/+$/g, '').trim().slice(0, 200);
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
 */
export async function* streamSearchFollowup(
    manager: AIServiceManager,
    promptId: PromptId,
    variables: Record<string, unknown>
): AsyncGenerator<LLMStreamEvent> {
    try {
        if (AppContext.getInstance().isMockEnv) {
            yield* manager.chatWithPromptStream(promptId, variables as any);
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
        yield* manager.chatWithPromptStream(promptId, variables as any);
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
        if (event.type === 'prompt-stream-delta' && typeof (event as any).delta === 'string') {
            acc += (event as any).delta;
            handlers?.onDelta?.(acc);
        } else if (event.type === 'prompt-stream-result') {
            const ev = event as { output?: unknown; usage?: LLMUsage };
            if (ev.output != null) acc = typeof ev.output === 'string' ? ev.output : acc;
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
    searchClient: { search: (q: any, enableLLMRerank?: boolean) => Promise<{ items: Array<{ path: string }> }> } | null,
    searchText: string
): Promise<string[]> {
    if (!searchClient || !searchText.trim()) return [];
    try {
        const res = await searchClient.search(
            {
                text: searchText.trim().slice(0, 300),
                scopeMode: 'vault',
                topK: 24,
                searchMode: 'hybrid',
            },
            false
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
    const { manager, searchClient } = useServiceContext();
    const { searchQuery } = useSharedStore();
    const title = useAIAnalysisRuntimeStore((s) => s.title ?? '');
    const isAnalyzing = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const summary = useAIAnalysisSummaryStore((s) => {
        const chunks = s.summaryChunks ?? [];
        if (s.isSummaryStreaming || (isAnalyzing && chunks.length > 0)) return chunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });

    const generateResultSaveField = useCallback(async (
        promptId: PromptId,
        processResult: (raw: string) => string,
        setTypewriterTarget: (target: string) => void,
        setTypewriterEnabled: (enabled: boolean) => void
    ) => {
        const result = await manager.chatWithPrompt(promptId, {
            query: searchQuery,
            summary: summary ? summary.slice(0, 500) : undefined,
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
        const searchText = [title, searchQuery, summary?.slice(0, 400)].filter(Boolean).join(' ').trim() || searchQuery;
        const candidateFolders = await getCandidateFoldersFromSearch(searchClient, searchText);
        const candidateFoldersFromSearch = candidateFolders.length
            ? candidateFolders.map((f) => `- ${f}`).join('\n')
            : undefined;
        const defaultSaveFolder = AppContext.getInstance().settings.search.aiAnalysisAutoSaveFolder?.trim() || undefined;
        const result = await manager.chatWithPrompt(PromptId.AiAnalysisSaveFolder, {
            query: searchQuery,
            summary: summary ? summary.slice(0, 500) : undefined,
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

export function useAnalyzeTopic() {
    const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);
    const setTopicAnalyzeStreaming = useAIAnalysisTopicsStore((s) => s.setTopicAnalyzeStreaming);
    const setTopicAnalyzeStreamingAppend = useAIAnalysisTopicsStore((s) => s.setTopicAnalyzeStreamingAppend);
    const setTopicModalOpen = useAIAnalysisTopicsStore((s) => s.setTopicModalOpen);
    const summary = (summaryChunks ?? []).join('');
    const { manager } = useServiceContext();
    const topicConfig = useTopicFollowupChatConfig({ summary, topicLabel: null });

    const lastLengthRef = useRef(0);

    const handleStartAnalyze = useCallback(async (topic: string, question: string) => {
        setTopicModalOpen(topic);
        setTopicAnalyzeStreaming({ topic, question, chunks: [] });
        lastLengthRef.current = 0;

        const onDelta = (answerSoFar: string) => {
            const chunk = answerSoFar.length > lastLengthRef.current ? answerSoFar.slice(lastLengthRef.current) : '';
            lastLengthRef.current = answerSoFar.length;
            if (chunk) useAIAnalysisTopicsStore.getState().setTopicAnalyzeStreamingAppend(chunk);
        };

        const variables = topicConfig.getVariables(question);
        const stream = streamSearchFollowup(manager, topicConfig.promptId, variables);
        try {
            const acc = await consumeFollowupStream(stream, {
                onDelta,
                onUsage: (usage) => useAIAnalysisRuntimeStore.getState().accumulateUsage(usage),
            });
            useAIAnalysisTopicsStore.getState().setTopicAnalyzeResult(topic, question, acc);
        } catch (e) {
            console.warn('[useAnalyzeTopic] Analyze failed:', e);
            useAIAnalysisTopicsStore.getState().setTopicAnalyzeResult(
                topic,
                question,
                e instanceof Error ? e.message : String(e)
            );
        } finally {
            useAIAnalysisTopicsStore.getState().setTopicAnalyzeStreaming(null);
        }
    }, [summary, manager, topicConfig, setTopicAnalyzeStreaming, setTopicAnalyzeStreamingAppend, setTopicModalOpen]);

    return { handleStartAnalyze };
}

/**
 * Regenerate overview Mermaid from current analysis context. Uses store only; does not use FollowupChatAgent.
 */
export function useRegenerateOverviewMermaid() {
    const { manager } = useServiceContext();
    const { searchQuery } = useSharedStore();
    const isAnalyzing2 = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const currentSummary = useAIAnalysisSummaryStore((s) => {
        const chunks = s.summaryChunks ?? [];
        if (s.isSummaryStreaming || (isAnalyzing2 && chunks.length > 0)) return chunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const topics = useAIAnalysisResultStore((s) => s.topics ?? []);
    const graph = useAIAnalysisResultStore((s) => s.graph);
    const sources = useAIAnalysisResultStore((s) => s.sources ?? []);
    const dashboardBlocks = useAIAnalysisResultStore((s) => s.dashboardBlocks ?? []);
    const pushOverviewMermaidVersion = useAIAnalysisResultStore((s) => s.pushOverviewMermaidVersion);
    const analysisMode = useAIAnalysisRuntimeStore((s) => s.runAnalysisMode ?? 'vaultFull');

    const [isRegenerating, setIsRegenerating] = useState(false);

    const regenerateOverview = useCallback(async () => {
        setIsRegenerating(true);
        try {
            const topicsText = topics.map((t: { label?: string }) => t.label).join(', ');
            const graphSummary =
                graph?.nodes?.length || graph?.edges?.length
                    ? `Nodes: ${graph?.nodes?.length ?? 0}, Edges: ${graph?.edges?.length ?? 0}. Sample: ${(graph?.nodes ?? []).slice(0, 8).map((n: { title?: string }) => n.title).join(', ')}`
                    : '';
            const sourcesSummary = sources.slice(0, 6).map((s: { title?: string; path?: string }) => s.title || s.path).join(', ') || '';
            const blocksSummary = dashboardBlocks.slice(0, 5).map((b: { title?: string; id: string }) => b.title || b.id).join(', ') || '';
            const currentResultSnapshot = [
                `Summary: ${currentSummary || '(none)'}`,
                `Topics: ${topicsText || '(none)'}`,
                `Graph: ${graphSummary || '(none)'}`,
                `Sources: ${sourcesSummary || '(none)'}`,
                `Blocks: ${blocksSummary || '(none)'}`,
            ].join('\n');
            const variables = {
                originalQuery: searchQuery ?? '',
                analysisMode,
                currentResultSnapshot,
            };
            const stream = manager.chatWithPromptStream(PromptId.AiAnalysisOverviewMermaid, variables as any);
            const raw = (await consumeFollowupStream(stream)).trim();
            const inner = getMermaidInner(raw);
            const code = inner.trim() ? wrapMermaidCode(inner) : '';
            if (code) pushOverviewMermaidVersion(code, { makeActive: true });
        } finally {
            setIsRegenerating(false);
        }
    }, [manager, searchQuery, currentSummary, topics, graph, sources, dashboardBlocks, analysisMode, pushOverviewMermaidVersion]);

    return { regenerateOverview, isRegenerating };
}

/** Config for InlineFollowupChat: promptId + getVariables + optional initialQuestion; title/placeholder required for InlineFollowupChat. */
// todo prompt enginering
export type InlineFollowupChatConfig = {
    promptId: PromptId;
    getVariables: (question: string) => Record<string, unknown>;
    initialQuestion?: string;
    title: string;
    placeholder: string;
    /** Use search agent (slot pipeline + tools) for follow-up answers. */
    useSearchAgent?: boolean;
};

/** Graph follow-up: prompt and variables from uiGraph; initialQuestion from selected node. */
export function useGraphFollowupChatConfig(params: {
    uiGraph: UIPreviewGraph | null;
    graphChatNodeContext: { label: string } | null;
}): InlineFollowupChatConfig {
    const { uiGraph, graphChatNodeContext } = params;
    const { searchQuery } = useSharedStore();
    const isAnalyzing3 = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const mainSummary = useAIAnalysisSummaryStore((s) => {
        const chunks = s.summaryChunks ?? [];
        if (s.isSummaryStreaming || (isAnalyzing3 && chunks.length > 0)) return chunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const promptId = PromptId.AiAnalysisFollowup;
    const getVariables = useCallback((question: string) => {
        const nodeLabels = (uiGraph?.nodes ?? []).slice(0, 30).map(n => `- ${n.label}`).join('\n');
        const contextContent = [
            `Main summary: ${mainSummary ?? ''}`,
            `Nodes: ${(uiGraph?.nodes ?? []).length}, Edges: ${(uiGraph?.edges ?? []).length}`,
            '## Sample nodes',
            nodeLabels || '(empty)',
        ].join('\n\n');
        return { originalQuery: searchQuery ?? '', question, contextContent };
    }, [uiGraph, searchQuery, mainSummary]);
    const initialQuestion = graphChatNodeContext
        ? `Discuss "${graphChatNodeContext.label}" in the graph.`
        : undefined;
    return {
        promptId,
        getVariables,
        initialQuestion,
        title: 'Ask about this Graph',
        placeholder: 'Ask for key nodes, clusters, or next steps…',
        useSearchAgent: true,
    };
}

/** Summary follow-up: variables from current summary text. */
export function useSummaryFollowupChatConfig(params: { summary: string }): InlineFollowupChatConfig {
    const { summary } = params;
    const { searchQuery } = useSharedStore();
    const promptId = PromptId.AiAnalysisFollowup;
    const getVariables = useCallback((question: string) => {
        const contextContent = `Summary (current):\n${summary ?? ''}`;
        return { originalQuery: searchQuery ?? '', question, contextContent };
    }, [summary, searchQuery]);
    return {
        promptId,
        getVariables,
        title: 'Ask about this Summary',
        placeholder: 'Ask for key insights, suggestions, or next steps…',
        useSearchAgent: true,
    };
}

/** Continue analysis (full) follow-up: variables from joined summary chunks. */
export function useContinueAnalysisFollowupChatConfig(params: { summary: string }): InlineFollowupChatConfig {
    const { summary } = params;
    const { searchQuery } = useSharedStore();
    const promptId = PromptId.AiAnalysisFollowup;
    const getVariables = useCallback((question: string) => {
        const contextContent = `Current analysis summary:\n${summary?.length ? summary : '(empty)'}`;
        return { originalQuery: searchQuery ?? '', question, contextContent };
    }, [summary, searchQuery]);
    return {
        promptId,
        getVariables,
        title: 'Continue Analysis',
        placeholder: 'Ask a follow-up about this analysis…',
        useSearchAgent: true,
    };
}

/** Blocks follow-up: variables from dashboardBlocks; initialQuestion from block/item context. */
export function useBlocksFollowupChatConfig(params: {
    dashboardBlocks: DashboardBlock[] | null | undefined;
    blocksChatContext: DashboardBlock | null;
    blocksChatItemContext: { block: DashboardBlock; item: DashboardBlockItem } | null;
}): InlineFollowupChatConfig {
    const { dashboardBlocks, blocksChatContext, blocksChatItemContext } = params;
    const { searchQuery } = useSharedStore();
    const isAnalyzing3 = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const mainSummary = useAIAnalysisSummaryStore((s) => {
        const chunks = s.summaryChunks ?? [];
        if (s.isSummaryStreaming || (isAnalyzing3 && chunks.length > 0)) return chunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const promptId = PromptId.AiAnalysisFollowup;
    const getVariables = useCallback((question: string) => {
        const blocksText = (dashboardBlocks ?? []).map((b) => {
            const label = b.title || 'Block';
            const itemsPreview = b.items?.slice(0, 5).map((i) => i.title).join(', ') || '';
            const md = (b.markdown || b.mermaidCode || '').slice(0, 200);
            return `- ${label}${itemsPreview ? ` (${itemsPreview})` : ''}${md ? `: ${md}` : ''}`;
        }).join('\n') || '(empty)';
        const contextContent = `Main summary: ${mainSummary ?? ''}\n\n## Blocks\n${blocksText}`;
        return { originalQuery: searchQuery ?? '', question, contextContent };
    }, [dashboardBlocks, searchQuery, mainSummary]);
    const initialQuestion = blocksChatItemContext
        ? `Discuss: "${blocksChatItemContext.item.title}". ${blocksChatItemContext.item.description ?? ''}`.trim()
        : blocksChatContext
            ? `Discuss this: "${blocksChatContext.title || 'Block'}".`
            : undefined;
    return {
        promptId,
        getVariables,
        initialQuestion,
        title: 'Ask about Blocks',
        placeholder: 'Ask about inspiration, diagrams, or next steps…',
        useSearchAgent: true,
    };
}

/** Sources follow-up: variables from sources list (title/path). */
export function useSourcesFollowupChatConfig(params: {
    sources: Array<{ title?: string; path?: string }>;
}): InlineFollowupChatConfig {
    const { sources } = params;
    const { searchQuery } = useSharedStore();
    const isAnalyzing3 = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const mainSummary = useAIAnalysisSummaryStore((s) => {
        const chunks = s.summaryChunks ?? [];
        if (s.isSummaryStreaming || (isAnalyzing3 && chunks.length > 0)) return chunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const promptId = PromptId.AiAnalysisFollowup;
    const getVariables = useCallback((question: string) => {
        const sourcesList = sources.slice(0, 10).map((s) => `- ${s.title || s.path}`).join('\n') || '(empty)';
        const contextContent = `Main summary: ${mainSummary ?? ''}\n\n## Sources (sample)\n${sourcesList}`;
        return { originalQuery: searchQuery ?? '', question, contextContent };
    }, [sources, searchQuery, mainSummary]);
    return {
        promptId,
        getVariables,
        title: 'Ask about Sources',
        placeholder: 'Ask to explain why these sources matter…',
        useSearchAgent: true,
    };
}

/** Topic follow-up: same prompt as full; variables from summary; title from topic. */
export function useTopicFollowupChatConfig(params: {
    summary: string;
    topicLabel: string | null;
}): InlineFollowupChatConfig {
    const { summary, topicLabel } = params;
    const { searchQuery } = useSharedStore();
    const promptId = PromptId.AiAnalysisFollowup;
    const getVariables = useCallback((question: string) => {
        const contextContent = `Current analysis summary:\n${summary}`;
        return { originalQuery: searchQuery ?? '', question, contextContent };
    }, [summary, searchQuery]);
    return {
        promptId,
        getVariables,
        title: topicLabel ? `Ask about ${topicLabel}` : 'Ask about topic',
        placeholder: 'Your question…',
        useSearchAgent: true,
    };
}

