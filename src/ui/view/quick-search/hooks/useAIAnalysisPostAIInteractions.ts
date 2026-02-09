import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useAIAnalysisStore } from '../store/aiAnalysisStore';
import { useSharedStore } from '../store/sharedStore';
import { AppContext } from '@/app/context/AppContext';
import type { UIPreviewGraph } from '@/ui/component/mine/graph-viz/types';
import type { DashboardBlock, DashboardBlockItem } from '@/service/agents/AISearchAgent';
import { RawSearchAgent } from '@/service/agents/search-agent-helper/RawSearchAgent';
import type { LLMStreamEvent } from '@/core/providers/types';

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
 * Stream follow-up response via RawSearchAgent so search tools and analysis summary are used.
 * Falls back to chatWithPromptStream when RawSearchAgent is unavailable (e.g. mock env).
 */
export async function* streamSearchFollowup(
    manager: { renderPrompt: (id: PromptId, vars: any) => Promise<string>; chatWithPromptStream: (id: PromptId, vars: any) => AsyncGenerator<LLMStreamEvent> },
    promptId: PromptId,
    variables: Record<string, unknown>
): AsyncGenerator<LLMStreamEvent> {
    let rawAgent: RawSearchAgent | null = null;
    try {
        const plugin = AppContext.getInstance().plugin;
        const searchModel = plugin?.settings?.search?.aiAnalysisModel?.searchAgentModel;
        if (!searchModel?.provider || !searchModel?.modelId || AppContext.getInstance().isMockEnv) {
            yield* manager.chatWithPromptStream(promptId, variables);
            return;
        }
        rawAgent = new RawSearchAgent(manager as any, {
            enableLocalSearch: true,
            searchAgentProvider: searchModel.provider,
            searchAgentModel: searchModel.modelId,
        });
    } catch {
        yield* manager.chatWithPromptStream(promptId, variables);
        return;
    }
    const prompt = await manager.renderPrompt(promptId, variables);
    const stream = await rawAgent.streamSearch(prompt);
    let acc = '';
    for await (const evt of stream) {
        if (evt.type === 'text-delta' && typeof (evt as any).text === 'string') {
            acc += (evt as any).text;
            yield { type: 'prompt-stream-delta', id: 'search-followup', promptId, delta: (evt as any).text } as any;
        } else if (evt.type === 'complete' && (evt as any).result) {
            const result = (evt as any).result;
            const final = (result.summary || result.text || acc || '').trim();
            yield { type: 'prompt-stream-result', id: 'search-followup', promptId, output: final } as any;
        } else if (evt.type === 'error') {
            yield { type: 'error', error: (evt as any).error } as any;
        }
    }
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
    const title = useAIAnalysisStore((s) => s.title ?? '');
    const summary = useAIAnalysisStore((s) => {
        if (s.isSummaryStreaming || (s.isAnalyzing && s.summaryChunks.length > 0)) {
            return s.summaryChunks.join('');
        }
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

    const { sources, summaryChunks, setTopicAnalyzeStreaming, setTopicModalOpen } = useAIAnalysisStore();
    const { searchQuery } = useSharedStore();

    const summary = summaryChunks.join('');

    const { manager } = useServiceContext();

    const handleStartAnalyze = useCallback(async (topic: string, question: string) => {
        setTopicModalOpen(topic);
        setTopicAnalyzeStreaming({ topic, question, answerSoFar: '' });
        const variables = { question, summary, originalQuery: searchQuery ?? '' };
        const stream = streamSearchFollowup(manager, PromptId.AiAnalysisFollowupFull, variables);
        try {
            let acc = '';
            for await (const event of stream) {
                if (event.type === 'prompt-stream-delta' && typeof (event as any).delta === 'string') {
                    acc += (event as any).delta;
                    setTopicAnalyzeStreaming({ topic, question, answerSoFar: acc });
                } else if (event.type === 'prompt-stream-result' && (event as any).output != null) {
                    acc = typeof (event as any).output === 'string' ? (event as any).output : acc;
                } else if (event.type === 'error') {
                    throw (event as any).error;
                }
            }
            useAIAnalysisStore.getState().setTopicAnalyzeResult(topic, question, acc);
        } catch (e) {
            console.warn('[TagCloudSection] Analyze failed:', e);
            useAIAnalysisStore.getState().setTopicAnalyzeResult(
                topic,
                question,
                e instanceof Error ? e.message : String(e)
            );
        } finally {
            useAIAnalysisStore.getState().setTopicAnalyzeStreaming(null);
        }
    }, [summary, sources, manager, searchQuery, setTopicAnalyzeStreaming, setTopicModalOpen]);

    return {
        handleStartAnalyze,
    };

}

/** Config for InlineFollowupChat: promptId + getVariables + optional initialQuestion; title/placeholder required for InlineFollowupChat. */
// todo prompt enginering
export type InlineFollowupChatConfig = {
    promptId: PromptId;
    getVariables: (question: string) => Record<string, unknown>;
    initialQuestion?: string;
    title: string;
    placeholder: string;
    /** Use RawSearchAgent so search tools and analysis summary are used for better answers. */
    useSearchAgent?: boolean;
};

/** Graph follow-up: prompt and variables from uiGraph; initialQuestion from selected node. */
export function useGraphFollowupChatConfig(params: {
    uiGraph: UIPreviewGraph | null;
    graphChatNodeContext: { label: string } | null;
}): InlineFollowupChatConfig {
    const { uiGraph, graphChatNodeContext } = params;
    const { searchQuery } = useSharedStore();
    const mainSummary = useAIAnalysisStore((s) => {
        if (s.isSummaryStreaming || (s.isAnalyzing && s.summaryChunks.length > 0)) return s.summaryChunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const promptId = PromptId.AiAnalysisFollowupGraph;
    const getVariables = useCallback((question: string) => {
        const nodeLabels = (uiGraph?.nodes ?? []).slice(0, 30).map(n => `- ${n.label}`).join('\n');
        return {
            question,
            nodeLabels: nodeLabels || '(empty)',
            nodeCount: (uiGraph?.nodes ?? []).length,
            edgeCount: (uiGraph?.edges ?? []).length,
            originalQuery: searchQuery ?? '',
            mainSummary: mainSummary ?? '',
        };
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
    const promptId = PromptId.AiAnalysisFollowupSummary;
    const getVariables = useCallback((question: string) => ({
        question,
        summary: summary ?? '',
        originalQuery: searchQuery ?? '',
    }), [summary, searchQuery]);
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
    const promptId = PromptId.AiAnalysisFollowupFull;
    const getVariables = useCallback((question: string) => ({
        question,
        summary: summary?.length ? summary : '(empty)',
        originalQuery: searchQuery ?? '',
    }), [summary, searchQuery]);
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
    const mainSummary = useAIAnalysisStore((s) => {
        if (s.isSummaryStreaming || (s.isAnalyzing && s.summaryChunks.length > 0)) return s.summaryChunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const promptId = PromptId.AiAnalysisFollowupBlocks;
    const getVariables = useCallback((question: string) => ({
        question,
        blocksText: (dashboardBlocks ?? []).map((b) => {
            const label = b.title || b.category || 'Block';
            const itemsPreview = b.items?.slice(0, 5).map((i) => i.title).join(', ') || '';
            const md = (b.markdown || b.mermaidCode || '').slice(0, 200);
            return `- ${label}${itemsPreview ? ` (${itemsPreview})` : ''}${md ? `: ${md}` : ''}`;
        }).join('\n') || '(empty)',
        originalQuery: searchQuery ?? '',
        mainSummary: mainSummary ?? '',
    }), [dashboardBlocks, searchQuery, mainSummary]);
    const initialQuestion = blocksChatItemContext
        ? `Discuss: "${blocksChatItemContext.item.title}". ${blocksChatItemContext.item.description ?? ''}`.trim()
        : blocksChatContext
            ? `Discuss this: "${blocksChatContext.title || blocksChatContext.category || 'Block'}".`
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
    const mainSummary = useAIAnalysisStore((s) => {
        if (s.isSummaryStreaming || (s.isAnalyzing && s.summaryChunks.length > 0)) return s.summaryChunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });
    const promptId = PromptId.AiAnalysisFollowupSources;
    const getVariables = useCallback((question: string) => ({
        question,
        sourcesList: sources.slice(0, 10).map((s) => `- ${s.title || s.path}`).join('\n') || '(empty)',
        originalQuery: searchQuery ?? '',
        mainSummary: mainSummary ?? '',
    }), [sources, searchQuery, mainSummary]);
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
    const promptId = PromptId.AiAnalysisFollowupFull;
    const getVariables = useCallback((question: string) => ({
        question,
        summary,
        originalQuery: searchQuery ?? '',
    }), [summary, searchQuery]);
    return {
        promptId,
        getVariables,
        title: topicLabel ? `Ask about ${topicLabel}` : 'Ask about topic',
        placeholder: 'Your question…',
        useSearchAgent: true,
    };
}

