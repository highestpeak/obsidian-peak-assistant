import { useCallback } from "react";
import { useSearchSessionStore } from "../store/searchSessionStore";
import { useSharedStore } from "../store/sharedStore";
import { openConversationInChat } from '@/ui/view/chat-view/chatNavigation';
import { useQuickSearchHost } from './useQuickSearchHost';

export function useAIAnalysisResult() {
    const host = useQuickSearchHost();
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
        const root = host.autoSaveFolder;
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
        await host.saveAnalysisToVault({
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

            const conversation = await host.createConvFromAnalysis({
                query: searchQuery,
                summary: summary,
                sources: mappedSources,
            });
            await openConversationInChat(conversation);
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
