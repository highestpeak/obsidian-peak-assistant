import { useCallback } from "react";
import { AppContext } from "@/app/context/AppContext";
import { useSearchSessionStore } from "../store/searchSessionStore";
import { useSharedStore } from "../store/sharedStore";
import { saveAiAnalyzeResultToMarkdown } from "../callbacks/save-ai-analyze-to-md";
import { CHAT_VIEW_TYPE } from "../../ChatView";
import { EventBus, SelectionChangedEvent } from "@/core/eventBus";

export function useAIAnalysisResult() {
    const { searchQuery } = useSharedStore();

    const webEnabled = useSearchSessionStore((s) => s.webEnabled);
    const analysisRunId = useSearchSessionStore((s) => s.id);
    const autoSaveState = useSearchSessionStore((s) => s.autoSaveState);
    const setAutoSaveState = useSearchSessionStore((s) => s.setAutoSaveState);
    const recordError = useSearchSessionStore((s) => s.recordError);

    const sources = useSearchSessionStore((s) => s.v2Sources);
    const summary = useSearchSessionStore((s) => s.v2Summary);

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
        const sessionState = useSearchSessionStore.getState();
        const reportText = sessionState.v2ProposedOutline
            ?? sessionState.v2ReportChunks.join('');
        await navigator.clipboard.writeText(reportText);
    }, []);

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

        const { snapshotFromState } = await import('../store/sessionSnapshot');
        const { persistSessionToVault } = await import('@/service/search/analysisDocPersistence');
        const store = useSearchSessionStore.getState();
        const snapshot = snapshotFromState(store);
        // Override the auto-save folder path for manual save-to-file
        await saveAiAnalyzeResultToMarkdown({
            folderPath: normalizedFolder,
            fileName: fileName,
            query: searchQuery,
            snapshot: snapshot as any,
            webEnabled,
        });
    }, [searchQuery, webEnabled]);

    // Use custom hook for opening in chat (raw sources; hook maps to manager format)
    const handleOpenInChat = useCallback(async (
        onClose?: () => void
    ) => {
        try {
            const mappedSources = sources.map(s => ({
                path: s.path,
                title: s.title,
                content: s.reasoning,
            }));

            const conversation = await AppContext.getInstance().manager.createConvFromSearchAIAnalysis({
                query: searchQuery,
                summary: summary,
                sources: mappedSources,
            });
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    setTimeout(() => resolve(), 50);
                });
            });
            if (AppContext.getInstance().viewManager) {
                const handler = AppContext.getInstance().viewManager.getViewSwitchConsistentHandler();
                if (handler) {
                    await handler.activateChatView();
                } else {
                    console.warn('[AISearchTab] ViewSwitchConsistentHandler not available');
                }
            } else {
                console.warn('[AISearchTab] ViewManager not available');
            }

            let retries = 0;
            let chatViewReady = false;
            while (retries < 20) { // Increased retries for more reliable loading
                const chatLeaves = AppContext.getInstance().app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
                if (chatLeaves.length > 0 && chatLeaves[0]?.view) {
                    chatViewReady = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
                retries++;
            }
            if (!chatViewReady) {
                console.warn('[AISearchTab] Chat view not ready after 20 retries');
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            const eventBus = EventBus.getInstance(AppContext.getInstance().app);
            eventBus.dispatch(new SelectionChangedEvent({
                conversationId: conversation.meta.id,
                projectId: conversation.meta.projectId ?? null,
            }));
            await new Promise(resolve => setTimeout(resolve, 100));

            onClose?.();
        } catch (e) {
            console.error('[AISearchTab] Open in chat failed:', e);
            recordError(e instanceof Error ? e.message : 'Failed to open in chat');
        }
    }, [searchQuery, summary, sources]);

    return {
        handleAutoSave,
        handleSaveToFile,
        handleCopyAll,
        handleOpenInChat,
    }
}

