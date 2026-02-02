import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';
import { useAIAnalysisStore } from '../store/aiAnalysisStore';
import { useSharedStore } from '../store/sharedStore';

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

// todo prefer all inline followup chat move to this place to process prompt stream chat to get a better code maintainability
