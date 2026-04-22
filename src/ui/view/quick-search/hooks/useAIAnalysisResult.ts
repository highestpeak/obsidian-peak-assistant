import { useCallback } from "react";
import {
	type CompletedAnalysisSnapshot,
	useAIAnalysisRuntimeStore,
	useAIAnalysisResultStore,
	useAIAnalysisTopicsStore,
	useAIAnalysisSummaryStore,
	useAIAnalysisStepsStore,
	buildCompletedAnalysisSnapshot,
	type SectionAnalyzeResult,
} from "../store/aiAnalysisStore";
import type { GraphPreview } from "@/core/storage/graph/types";
import { AppContext } from "@/app/context/AppContext";
import { useSearchSessionStore, buildV2AnalysisSnapshot } from "../store/searchSessionStore";
import { useSharedStore } from "../store/sharedStore";
import { buildAiAnalyzeMarkdown, saveAiAnalyzeResultToMarkdown, type BuildAiAnalyzeMarkdownParams } from "../callbacks/save-ai-analyze-to-md";
import type { AISearchSource } from "@/service/agents/shared-types";
import { CHAT_VIEW_TYPE } from "../../ChatView";
import { EventBus, SelectionChangedEvent } from "@/core/eventBus";
import type { SearchResultItem } from "@/service/search/types";

/**
 * Merge V2 session data into a V1 CompletedAnalysisSnapshot.
 * No-op if V2 is not active.
 */
function mergeV2IntoSnapshot(snapshot: CompletedAnalysisSnapshot): void {
    const v2 = buildV2AnalysisSnapshot();
    if (!v2) return;
    snapshot.v2ProcessLog = v2.v2ProcessLog;
    snapshot.v2PlanOutline = v2.v2PlanOutline;
    snapshot.v2ReportSections = v2.v2ReportSections;
    snapshot.v2FollowUpQuestions = v2.v2FollowUpQuestions;
    snapshot.v2GraphJson = v2.v2GraphJson;
    if (v2.v2Summary) {
        snapshot.summaries = [v2.v2Summary];
        snapshot.summaryVersion = 1;
    }
    if (v2.v2Sources?.length && !snapshot.sources?.length) {
        snapshot.sources = v2.v2Sources.map((s, i) => ({
            id: `v2-src-${i}`,
            path: s.path,
            title: s.title,
            score: { average: 0, physical: 0, semantic: 0 },
            reasoning: s.reasoning ?? '',
            badges: [],
        }));
    }
}

// Convert AISearchSource[] to SearchResultItem[] with extended fields for TopSourcesSection
export const convertSourcesToSearchResultItems = (aiSources: AISearchSource[]): SearchResultItem[] => {
    return aiSources.map(source => {
        const score = source.score ?? { average: 0, physical: 0, semantic: 0 };
        return {
            id: source.id,
            type: 'markdown' as const,
            title: source.title,
            path: source.path,
            lastModified: Date.now(),
            content: source.reasoning, // Used for reasoning display
            score: score.average ?? 0,
            source: 'local' as const,
            badges: source.badges,
            scoreDetail: {
                physical: score.physical ?? 0,
                semantic: score.semantic ?? 0,
                average: score.average ?? 0
            }
        };
    });
};

export function useAIAnalysisResult() {
    const { searchQuery } = useSharedStore();

    const webEnabled = useAIAnalysisRuntimeStore((s) => s.webEnabled);
    const analysisStartedAtMs = useAIAnalysisRuntimeStore((s) => s.analysisStartedAtMs);
    const usage = useAIAnalysisRuntimeStore((s) => s.usage);
    const duration = useAIAnalysisRuntimeStore((s) => s.duration);
    const analysisRunId = useAIAnalysisRuntimeStore((s) => s.analysisRunId);
    const autoSaveState = useAIAnalysisRuntimeStore((s) => s.autoSaveState);
    const setAutoSaveState = useAIAnalysisRuntimeStore((s) => s.setAutoSaveState);
    const recordError = useAIAnalysisRuntimeStore((s) => s.recordError);

    const graph = useAIAnalysisResultStore((s) => s.graph);
    const topics = useAIAnalysisResultStore((s) => s.topics);
    const sources = useAIAnalysisResultStore((s) => s.sources);

    const topicInspectResults = useAIAnalysisTopicsStore((s) => s.topicInspectResults);

    const isAnalyzing = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const summary = useAIAnalysisSummaryStore((s) => {
        const chunks = s.summaryChunks ?? [];
        if (s.isSummaryStreaming || (isAnalyzing && chunks.length > 0)) return chunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });

    // Early-save: called from tab-AISearch when plan sections first appear.
    // Creates the file so "Open in File" works before completion.
    // The service-layer persistence (persistSessionToVault) handles the
    // milestone-based final save at completion time — see useSearchSession.ts.
    const handleAutoSave = useCallback(async () => {
        // Guard: check both stores to avoid double-save race
        if (autoSaveState?.lastSavedPath) return;
        if (useSearchSessionStore.getState().autoSaveState.lastSavedPath) return;

        const store = useSearchSessionStore.getState();
        const { snapshotFromState } = await import('../store/sessionSnapshot');
        const { persistSessionToVault } = await import('@/service/search/analysisDocPersistence');
        const snapshot = snapshotFromState(store);
        const result = await persistSessionToVault(snapshot);
        if (result) {
            setAutoSaveState({ lastRunId: analysisRunId, lastSavedPath: result.path });
            useSearchSessionStore.getState().setAutoSaveState({ lastSavedPath: result.path });
        }
    }, [searchQuery, autoSaveState, analysisRunId, setAutoSaveState]);

    // NOTE: Incremental persist effect removed. Persistence is now handled at
    // completion milestones in useSearchSession.ts and BackgroundSessionManager.ts.
    // This avoids frequent vault writes during streaming that trigger re-indexing.

    const handleCopyAll = useCallback(async () => {
        // V2 path: prefer proposed_outline, fallback to timeline
        const sessionState = useSearchSessionStore.getState();
        if (sessionState.v2Active) {
            const reportText = sessionState.v2ProposedOutline
                ?? sessionState.v2ReportChunks.join('');
            await navigator.clipboard.writeText(reportText);
            return;
        }

        // V1 path
        const steps = useAIAnalysisStepsStore.getState().steps;
        const topicsState = useAIAnalysisTopicsStore.getState() as Record<string, unknown>;
        const topicAnalyze = (topicsState["topicAnalyzeResults"] as Record<string, SectionAnalyzeResult[]> | undefined) ?? {};
        const topicGraph = (topicsState["topicGraphResults"] as Record<string, GraphPreview | null> | undefined) ?? {};
        const markdown = buildAiAnalyzeMarkdown(
            {
                query: searchQuery,
                webEnabled,
                summary,
                topics,
                sources: sources.map(s => ({
                    path: s.path,
                    title: s.title,
                    score: s.score?.average,
                    content: s.reasoning,
                })),
                topicInspectResults: topicInspectResults ?? {},
                topicAnalyzeResults: topicAnalyze,
                // @ts-ignore - BuildAiAnalyzeMarkdownParams has topicGraphResults; TS can infer result store type in this scope
                topicGraphResults: topicGraph,
                estimatedTokens: usage?.totalTokens ?? 0,
            } as BuildAiAnalyzeMarkdownParams,
            graph ?? undefined
        );

        const enableDevTools = AppContext.getInstance().plugin?.settings?.enableDevTools ?? false;
        let textToCopy = markdown;
        if (enableDevTools && (steps?.length ?? 0) > 0) {
            const stepsSection = steps!
                .map((step, i) => {
                    const title = `### Step ${i + 1}: ${step.title}`;
                    const body = (step.description ?? '').trim();
                    return body ? `${title}\n\n${body}` : title;
                })
                .join('\n\n');
            textToCopy = `${markdown}\n\n---\n\n## Steps (Dev)\n\n${stepsSection}`;
        }
        await navigator.clipboard.writeText(textToCopy);
    }, [searchQuery, webEnabled, summary, topics, sources, graph, topicInspectResults, usage]);

    const handleSaveToFile = useCallback(async (folderPath: string, fileName: string) => {
        const root = AppContext.getInstance().settings.search.aiAnalysisAutoSaveFolder?.trim() || '';
        const normalizedFolder = root
            ? (() => {
                const base = root.replace(/^\/+|\/+$/g, '').trim();
                const p = (folderPath || '').replace(/^\/+|\/+$/g, '').trim();
                if (!base || !p || p === base || p.startsWith(base + '/')) return p || base;
                const last = p.split('/').pop() || p;
                return last ? `${base}/${last}` : base;
            })()
            : folderPath;

        const snapshot = buildCompletedAnalysisSnapshot();
        mergeV2IntoSnapshot(snapshot);

        await saveAiAnalyzeResultToMarkdown({
            folderPath: normalizedFolder,
            fileName: fileName,
            query: searchQuery,
            snapshot,
            webEnabled,
        });
    }, [searchQuery, webEnabled, summary, analysisStartedAtMs, duration, usage]);

    // Use custom hook for opening in chat (raw sources; hook maps to manager format)
    const handleOpenInChat = useCallback(async (
        onClose?: () => void
    ) => {
        try {
            console.debug('[AISearchTab] handleOpenInChat called', {
                query: searchQuery,
                sourcesCount: sources.length,
                topicsCount: topics.length,
            });

            const mappedSources = sources.map(s => ({
                path: s.path,
                title: s.title,
                content: 'reasoning' in s ? (s as AISearchSource).reasoning : (s as { content?: string }).content,
            }));

            // Step 1: Create conversation from search analysis
            console.debug('[AISearchTab] Step 1: Creating conversation from search analysis...');
            const conversation = await AppContext.getInstance().manager.createConvFromSearchAIAnalysis({
                query: searchQuery,
                summary: summary,
                sources: mappedSources,
                topics: topics.length > 0 ? topics : undefined,
            });
            console.debug('[AISearchTab] Conversation created', {
                conversationId: conversation.meta.id,
                projectId: conversation.meta.projectId ?? null,
            });

            // Step 2: Wait for conversation to be fully persisted
            console.debug('[AISearchTab] Step 2: Waiting for conversation persistence...');
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    setTimeout(() => resolve(), 50);
                });
            });
            console.debug('[AISearchTab] Conversation persistence wait completed');

            // Step 3: Activate chat view
            console.debug('[AISearchTab] Step 3: Activating chat view...');
            if (AppContext.getInstance().viewManager) {
                const handler = AppContext.getInstance().viewManager.getViewSwitchConsistentHandler();
                if (handler) {
                    await handler.activateChatView();
                    console.debug('[AISearchTab] Chat view activated');
                } else {
                    console.warn('[AISearchTab] ViewSwitchConsistentHandler not available');
                }
            } else {
                console.warn('[AISearchTab] ViewManager not available');
            }

            // Step 4: Wait for chat view to be ready
            console.debug('[AISearchTab] Step 4: Waiting for chat view to be ready...');
            let retries = 0;
            let chatViewReady = false;
            while (retries < 20) { // Increased retries for more reliable loading
                const chatLeaves = AppContext.getInstance().app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
                if (chatLeaves.length > 0 && chatLeaves[0]?.view) {
                    console.debug('[AISearchTab] Chat view is ready', { retries });
                    chatViewReady = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
                retries++;
            }
            if (!chatViewReady) {
                console.warn('[AISearchTab] Chat view not ready after 20 retries');
            }

            // Step 5: Wait a bit more to ensure view is fully initialized
            await new Promise(resolve => setTimeout(resolve, 200));

            // Step 6: Dispatch selection change event
            console.debug('[AISearchTab] Step 6: Dispatching SelectionChangedEvent...');
            const eventBus = EventBus.getInstance(AppContext.getInstance().app);
            eventBus.dispatch(new SelectionChangedEvent({
                conversationId: conversation.meta.id,
                projectId: conversation.meta.projectId ?? null,
            }));
            console.debug('[AISearchTab] SelectionChangedEvent dispatched successfully');

            // Step 7: Wait a bit more to ensure event is processed
            await new Promise(resolve => setTimeout(resolve, 100));

            // Step 8: Close the search modal
            console.debug('[AISearchTab] Step 8: Closing search modal...');
            onClose?.();
        } catch (e) {
            console.error('[AISearchTab] Open in chat failed:', e);
            recordError(e instanceof Error ? e.message : 'Failed to open in chat');
        }
    }, [searchQuery, summary, sources, topics]);

    return {
        handleAutoSave,
        handleSaveToFile,
        handleCopyAll,
        handleOpenInChat,
    }
}

export function useAnalyzeTopicResults() {
    const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);
    const sources = useAIAnalysisResultStore((s) => s.sources);
    const topicInspectResults = useAIAnalysisTopicsStore((s) => s.topicInspectResults);
    const setTopicInspectResults = useAIAnalysisTopicsStore((s) => s.setTopicInspectResults);
    const setTopicInspectLoading = useAIAnalysisTopicsStore((s) => s.setTopicInspectLoading);

    const summary = (summaryChunks ?? []).join('');

    const handleCopyTopicInfo = useCallback(async (topic: string) => {
        const inspectList = topicInspectResults[topic] ?? [];
        const lines: string[] = [
            `# Topic: ${topic}`,
            '',
            '## Summary',
            summary || '(empty)',
            '',
            '## Sources',
            ...sources.map((s) => `- [[${s.path}|${s.title}]]`),
            '',
        ];
        if (inspectList.length > 0) {
            lines.push('## Inspect results');
            inspectList.forEach((item) => lines.push(`- [[${item.path}|${item.title}]]`));
            lines.push('');
        }
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
        } catch (e) {
            console.warn('Copy topic info failed:', e);
        }
    }, [summary, sources, topicInspectResults]);

    // todo we need to use simple search agent to inspect the topic
    const handleInspectTopic = useCallback(async (topic: string) => {
        setTopicInspectLoading(topic);
        try {
            const tm = AppContext.getInstance().manager.getTemplateManager?.();
            const tool = localSearchWholeVaultTool(tm);
            const out = await tool.execute({
                query: topic,
                searchMode: 'hybrid',
                scopeMode: 'vault',
                limit: 10,
                response_format: 'structured',
            });
            const raw = (out as any)?.result ?? out;
            const results = Array.isArray(raw?.results) ? raw.results : [];
            const items: SearchResultItem[] = results.map((r: any) => ({
                id: r.id ?? r.path ?? `inspect:${r.path}`,
                type: (r.type as SearchResultItem['type']) ?? 'markdown',
                title: r.title ?? r.path ?? '',
                path: r.path ?? '',
                lastModified: r.lastModified ?? Date.now(),
                score: r.score ?? r.finalScore,
                source: 'local',
                scoreDetail: r.scoreDetail,
            }));
            setTopicInspectResults(topic, items);
        } catch (e) {
            console.warn('[TagCloudSection] Inspect topic failed:', e);
            setTopicInspectResults(topic, []);
        } finally {
            setTopicInspectLoading(null);
        }
    }, [setTopicInspectResults, setTopicInspectLoading]);

    return {
        handleCopyTopicInfo,
        handleInspectTopic,
    };
}

export function useAnalyzeGraphResults() {

    const publishToolCall = (toolName: string, toolCallId: string, input: any) => {
        useUIEventStore.getState().publish('ui:tool-call', {
            triggerName: 'graph-ui',
            toolName,
            toolCallId,
            input,
        });
    };

    const publishToolResult = (toolName: string, toolCallId: string, output: any) => {
        useUIEventStore.getState().publish('ui:tool-result', {
            triggerName: 'graph-ui',
            toolName,
            toolCallId,
            output,
        });
    };

    const runGraphTool = async <TOutput,>(toolName: 'inspect_note_context' | 'graph_traversal' | 'find_path' | 'find_key_nodes', input: any) => {
        const toolCallId = `graph-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        publishToolCall(toolName, toolCallId, input);
        try {
            let output: any = null;
            if (toolName === 'inspect_note_context') {
                output = await inspectNoteContextTool().execute({
                    note_path: input.note_path,
                    limit: 15,
                    include_semantic_paths: true,
                    response_format: 'structured',
                });
            } else if (toolName === 'graph_traversal') {
                output = await graphTraversalTool().execute({
                    start_note_path: input.start_note_path,
                    hops: input.hops ?? 1,
                    limit: input.limit ?? 15,
                    include_semantic_paths: input.include_semantic_paths !== false,
                    response_format: 'structured',
                });
            } else if (toolName === 'find_path') {
                output = await findPathTool().execute({
                    start_note_path: input.start_note_path,
                    end_note_path: input.end_note_path,
                    limit: 15,
                    include_semantic_paths: true,
                    response_format: 'structured',
                });
            } else if (toolName === 'find_key_nodes') {
                output = await findKeyNodesTool().execute(input);
            }
            publishToolResult(toolName, toolCallId, output);
            return output as TOutput;
        } catch (e) {
            console.warn('[KnowledgeGraphSection] graph tool failed:', toolName, e);
            publishToolResult(toolName, toolCallId, { error: e instanceof Error ? e.message : String(e) });
            throw e;
        }
    };

    return {
        runGraphTool
    };
}