import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useAIAnalysisStore } from '../store/aiAnalysisStore';
import { useSharedStore } from '../store/sharedStore';
import type { UIPreviewGraph } from '@/ui/component/mine/graph-viz/types';
import type { DashboardBlock, DashboardBlockItem } from '@/service/agents/AISearchAgent';

/** Sanitize AI-generated filename: remove invalid filesystem chars. */
function sanitizeFilename(s: string): string {
    return s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';
}

/** Process folder path from AI output. */
function processFolderPath(s: string): string {
    return s.replace(/^\/+|\/+$/g, '').trim().slice(0, 200);
}

/**
 * Generic generator for ResultSaveDialog fields (filename/folder).
 * Calls chatWithPrompt with the given promptId and processes the result.
 */
export function useGenerateResultSaveField() {
    const { manager } = useServiceContext();
    const { searchQuery } = useSharedStore();
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
            // todo prompt enginering
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
        generateResultSaveField(
            // todo prompt enginering
            PromptId.AiAnalysisSaveFolder,
            processFolderPath,
            setTypewriterTarget,
            setTypewriterEnabled
        )
    }, [generateResultSaveField]);

    return {
        generateFileName,
        generateFolder,
    };
}

export function useAnalyzeTopic() {

    const { sources, summaryChunks, setTopicAnalyzeStreaming, setTopicModalOpen } = useAIAnalysisStore();

    const summary = summaryChunks.join('');

    const { manager } = useServiceContext();

    const handleStartAnalyze = useCallback(async (topic: string, question: string) => {
        // todo use store to share the state
        setTopicModalOpen(topic);
        setTopicAnalyzeStreaming({ topic, question, answerSoFar: '' });
        try {
            let acc = '';
            for await (const event of manager.chatWithPromptStream(
                // todo prompt engineering
                PromptId.AiAnalysisFollowupFull,
                { question, summary }
            )) {
                if (event.type === 'prompt-stream-delta' && typeof event.delta === 'string') {
                    acc += event.delta;
                    setTopicAnalyzeStreaming({ topic, question, answerSoFar: acc });
                } else if (event.type === 'error') {
                    throw event.error;
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
    }, [summary, sources, manager, setTopicAnalyzeStreaming, setTopicModalOpen]);

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
};

/** Graph follow-up: prompt and variables from uiGraph; initialQuestion from selected node. */
export function useGraphFollowupChatConfig(params: {
    uiGraph: UIPreviewGraph | null;
    graphChatNodeContext: { label: string } | null;
}): InlineFollowupChatConfig {
    const { uiGraph, graphChatNodeContext } = params;
    const promptId = PromptId.AiAnalysisFollowupGraph;
    const getVariables = useCallback((question: string) => {
        const nodeLabels = (uiGraph?.nodes ?? []).slice(0, 30).map(n => `- ${n.label}`).join('\n');
        return {
            question,
            nodeLabels: nodeLabels || '(empty)',
            nodeCount: (uiGraph?.nodes ?? []).length,
            edgeCount: (uiGraph?.edges ?? []).length,
        };
    }, [uiGraph]);
    const initialQuestion = graphChatNodeContext
        ? `Discuss "${graphChatNodeContext.label}" in the graph.`
        : undefined;
    return {
        promptId,
        getVariables,
        initialQuestion,
        title: 'Ask about this Graph',
        placeholder: 'Ask for key nodes, clusters, or next steps…',
    };
}

/** Summary follow-up: variables from current summary text. */
export function useSummaryFollowupChatConfig(params: { summary: string }): InlineFollowupChatConfig {
    const { summary } = params;
    const promptId = PromptId.AiAnalysisFollowupSummary;
    const getVariables = useCallback((question: string) => ({
        question,
        summary: summary ?? '',
    }), [summary]);
    return {
        promptId,
        getVariables,
        title: 'Ask about this Summary',
        placeholder: 'Ask for key insights, suggestions, or next steps…',
    };
}

/** Continue analysis (full) follow-up: variables from joined summary chunks. */
export function useContinueAnalysisFollowupChatConfig(params: { summary: string }): InlineFollowupChatConfig {
    const { summary } = params;
    const promptId = PromptId.AiAnalysisFollowupFull;
    const getVariables = useCallback((question: string) => ({
        question,
        summary: summary?.length ? summary : '(empty)',
    }), [summary]);
    return {
        promptId,
        getVariables,
        title: 'Continue Analysis',
        placeholder: 'Ask a follow-up about this analysis…',
    };
}

/** Blocks follow-up: variables from dashboardBlocks; initialQuestion from block/item context. */
export function useBlocksFollowupChatConfig(params: {
    dashboardBlocks: DashboardBlock[] | null | undefined;
    blocksChatContext: DashboardBlock | null;
    blocksChatItemContext: { block: DashboardBlock; item: DashboardBlockItem } | null;
}): InlineFollowupChatConfig {
    const { dashboardBlocks, blocksChatContext, blocksChatItemContext } = params;
    const promptId = PromptId.AiAnalysisFollowupBlocks;
    const getVariables = useCallback((question: string) => ({
        question,
        blocksText: (dashboardBlocks ?? []).map((b) => {
            const label = b.title || b.category || 'Block';
            const itemsPreview = b.items?.slice(0, 5).map((i) => i.title).join(', ') || '';
            const md = (b.markdown || b.mermaidCode || '').slice(0, 200);
            return `- ${label}${itemsPreview ? ` (${itemsPreview})` : ''}${md ? `: ${md}` : ''}`;
        }).join('\n') || '(empty)',
    }), [dashboardBlocks]);
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
    };
}

/** Sources follow-up: variables from sources list (title/path). */
export function useSourcesFollowupChatConfig(params: {
    sources: Array<{ title?: string; path?: string }>;
}): InlineFollowupChatConfig {
    const { sources } = params;
    const promptId = PromptId.AiAnalysisFollowupSources;
    const getVariables = useCallback((question: string) => ({
        question,
        sourcesList: sources.slice(0, 10).map((s) => `- ${s.title || s.path}`).join('\n') || '(empty)',
    }), [sources]);
    return {
        promptId,
        getVariables,
        title: 'Ask about Sources',
        placeholder: 'Ask to explain why these sources matter…',
    };
}

/** Topic follow-up: same prompt as full; variables from summary; title from topic. */
export function useTopicFollowupChatConfig(params: {
    summary: string;
    topicLabel: string | null;
}): InlineFollowupChatConfig {
    const { summary, topicLabel } = params;
    const promptId = PromptId.AiAnalysisFollowupFull;
    const getVariables = useCallback((question: string) => ({ question, summary }), [summary]);
    return {
        promptId,
        getVariables,
        title: topicLabel ? `Ask about ${topicLabel}` : 'Ask about topic',
        placeholder: 'Your question…',
    };
}
