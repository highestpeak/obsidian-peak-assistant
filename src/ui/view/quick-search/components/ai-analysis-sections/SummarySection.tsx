import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, MessageCircle, Copy, Check } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { AnalysisTimer } from '../../../../component/mine/IntelligenceFrame';
import { StreamdownIsolated } from '@/ui/component/mine';
import { Button } from '@/ui/component/shared-ui/button';
import { InlineFollowupChat } from '../../../../component/mine/InlineFollowupChat';
import { useAIAnalysisRuntimeStore, useAIAnalysisSummaryStore } from '../../store/aiAnalysisStore';
import { useSummaryFollowupChatConfig } from '../../hooks/useAIAnalysisPostAIInteractions';
import { useStreamdownWikilinkClick } from '../../callbacks/useStreamdownWikilinkClick';
import { copyText } from '@/ui/view/shared/common-utils';

/**
 * Summary content component - displays the AI analysis summary with incremental rendering
 */
export const SummaryContent: React.FC<{
    startedAtMs?: number | null;
    finalDurationMs?: number | null;
    /**
     * Optional follow-up entry point in the section header.
     * Typically used to toggle an inline follow-up chat panel.
     */
    onToggleFollowup?: () => void;
    /**
     * Optional handler for opening Obsidian wikilinks (vault-relative).
     * If provided, SummaryContent will render `[[...]]` as clickable links.
     */
    onOpenWikilink?: (path: string) => void | Promise<void>;
}> = ({ startedAtMs, finalDurationMs, onToggleFollowup, onOpenWikilink }) => {

    const handleStreamdownClick = useStreamdownWikilinkClick(onOpenWikilink);

    const isAnalyzing = useAIAnalysisRuntimeStore((s) => s.isAnalyzing);
    const analysisCompleted = useAIAnalysisRuntimeStore((s) => s.analysisCompleted);
    const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);

    // Memoize summary text calculation to avoid unnecessary joins on every render
    const baseSummary = useMemo(() => summaryChunks.join(''), [summaryChunks]);
    const [summaryVersions, setSummaryVersions] = useState<string[]>(() => (baseSummary ? [baseSummary] : []));
    const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);

    useEffect(() => {
        if (baseSummary && summaryVersions.length === 0) {
            setSummaryVersions([baseSummary]);
        }
    }, [baseSummary]);
    // Freeze final summary into version 0 when streaming completes
    useEffect(() => {
        if (!analysisCompleted || !baseSummary) return;
        setSummaryVersions((prev) => {
            if (prev.length === 0) return [baseSummary];
            if (prev[0] === baseSummary) return prev;
            return [baseSummary, ...prev.slice(1)];
        });
    }, [analysisCompleted, baseSummary]);
    const summary = baseSummary;

    const [streamingReplace, setStreamingReplace] = useState<string | null>(null);

    const currentSummary = summaryVersions[activeSummaryIndex] ?? summary ?? '';
    const summaryFollowupConfig = useSummaryFollowupChatConfig({ summary: currentSummary });

    const onStreamingReplace = useCallback((text: string | null) => {
        setStreamingReplace(text !== null && text !== undefined ? text : null);
    }, []);

    const onApply = useCallback((answer: string, mode: 'append' | 'replace') => {
        if (mode === 'replace') {
            setSummaryVersions((prev) => [...prev, answer]);
            setActiveSummaryIndex((prev) => prev + 1);
        }
        setStreamingReplace(null);
    }, []);

    // During streaming, always show live baseSummary; after completion use summaryVersions for history.
    const displaySummary = streamingReplace != null
        ? streamingReplace
        : (isAnalyzing && !analysisCompleted)
            ? summary
            : (summaryVersions?.length && summaryVersions.length > 0)
                ? (summaryVersions[activeSummaryIndex] ?? summary)
                : summary;
    // Wikilinks [[...]] are parsed by remarkWikilink in StreamdownIsolated; click handled by handleStreamdownClick.
    const renderedSummary = displaySummary;

    const [showSummaryFollowup, setShowSummaryFollowup] = useState(false);
    const localToggleFollowup = useCallback(() => {
        setShowSummaryFollowup(prev => !prev);
        onToggleFollowup?.();
    }, [onToggleFollowup]);

    const [copied, setCopied] = useState(false);
    const handleCopySummary = useCallback(async () => {
        if (!displaySummary) return;
        await copyText(displaySummary);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [displaySummary]);

    return (
        <div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3 pktw-group">
                <Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">AI Analysis</span>
                <div className="pktw-flex-1" />
                {displaySummary ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="pktw-shadow-none pktw-rounded-md pktw-opacity-70 hover:pktw-opacity-100"
                        title={copied ? 'Copied' : 'Copy summary'}
                        onClick={() => void handleCopySummary()}
                    >
                        {copied ? <Check className="pktw-w-4 pktw-h-4 pktw-text-green-600" /> : <Copy className="pktw-w-4 pktw-h-4 pktw-text-[#6c757d]" />}
                    </Button>
                ) : null}
                {summaryVersions ? (
                    <HoverCard openDelay={100} closeDelay={150}>
                        <HoverCardTrigger asChild>
                            {/* Chat Again. Follow-up chat panel. */}
                            <Button
                                variant="ghost"
                                style={{ cursor: 'pointer' }}
                                onClick={localToggleFollowup}
                                className={`pktw-shadow-none pktw-rounded-md pktw-border pktw-opacity-40`}
                                size="icon"
                                title={showSummaryFollowup ? 'Hide follow-up' : 'Open follow-up'}
                            >
                                <MessageCircle className="pktw-w-5 pktw-h-5" />
                            </Button>
                        </HoverCardTrigger>
                        {/* Version history */}
                        <HoverCardContent align="end" className="pktw-w-48 pktw-p-1 pktw-z-[10000] pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
                            {summaryVersions.map((_, idx) => (
                                <Button
                                    key={idx}
                                    variant="ghost"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setActiveSummaryIndex(idx)}
                                    className={`pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none ${idx === activeSummaryIndex ? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]' : ''}`}
                                >
                                    {idx === 0 ? 'Original' : `After Q${idx}`}
                                </Button>
                            ))}
                        </HoverCardContent>
                    </HoverCard>
                ) : null}

                {/* Analysis timer */}
                {startedAtMs && isAnalyzing && !analysisCompleted && (
                    <AnalysisTimer
                        startedAtMs={startedAtMs}
                        isRunning={isAnalyzing && !analysisCompleted}
                        finalDurationMs={finalDurationMs ?? undefined}
                    />
                )}
            </div>

            {/* Follow-up inline chat */}
            {showSummaryFollowup ? (
                <div className="pktw-mb-3">
                    <InlineFollowupChat
                        {...summaryFollowupConfig}
                        applyMode="replace"
                        onStreamingReplace={onStreamingReplace}
                        onApply={onApply}
                    />
                </div>
            ) : null}

            {/* Summary content */}
            <div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
                {renderedSummary ? (
                    <StreamdownIsolated
                        className="pktw-select-text pktw-break-words"
                        isAnimating={!!streamingReplace}
                        onClick={handleStreamdownClick}
                    >
                        {renderedSummary}
                    </StreamdownIsolated>
                ) : (
                    <span className="pktw-text-[#999999]">No summary available.</span>
                )}
            </div>
        </div>
    );
};