import { convertSourcesToSearchResultItems } from "../../hooks/useAIAnalysisResult";
import { useAIAnalysisStore } from "../../store";
import { useMemo, useState, useEffect } from "react";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { TopicSection } from "../ai-analysis-sections/TopicSection";
import { KnowledgeGraphSection } from "../ai-analysis-sections/KnowledgeGraphSection";
import { TopSourcesSection } from "../ai-analysis-sections/SourcesSection";
import { InlineFollowupChat } from "../../../../component/mine/InlineFollowupChat";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import { FollowupQuestionsBlock } from "../ai-analysis-sections/FollowupQuestionsBlock";
import type { DashboardBlock, DashboardBlockItem } from "@/service/agents/AISearchAgent";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { useBlocksFollowupChatConfig, useRegenerateOverviewMermaid } from "../../hooks/useAIAnalysisPostAIInteractions";
import React from "react";
import { StreamdownIsolated } from "@/ui/component/mine";
import { MessageCircle, RefreshCw, Copy, Check } from "lucide-react";
import { useStreamdownWikilinkClick } from "../../callbacks/useStreamdownWikilinkClick";
import { useSharedStore } from "../../store/sharedStore";
import { Button } from "@/ui/component/shared-ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/ui/component/shared-ui/hover-card";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import { AppContext } from "@/app/context/AppContext";
import { copyText } from "@/ui/view/shared/common-utils";

export const CompletedAIAnalysis: React.FC<{
    onClose?: () => void;
    /** When provided, [[wikilinks]] in summary and continue sections open in Obsidian. */
    onOpenWikilink?: (path: string) => void | Promise<void>;
    sectionRefs: {
        summaryRef: React.RefObject<HTMLDivElement>;
        overviewRef: React.RefObject<HTMLDivElement>;
        topicsRef: React.RefObject<HTMLDivElement>;
        dashboardBlocksRef: React.RefObject<HTMLDivElement>;
        graphSectionRef: React.RefObject<HTMLDivElement>;
        sourcesRef: React.RefObject<HTMLDivElement>;
        continueAnalysisRef: React.RefObject<HTMLDivElement>;
        stepsRef: React.RefObject<HTMLDivElement>;
    };
}> = ({ onClose, onOpenWikilink, sectionRefs }) => {

    const handleStreamdownClick = useStreamdownWikilinkClick(onOpenWikilink);

    const {
        setContextChatModal,
        appendBlocksFollowup,
        blocksFollowupHistoryByBlockId,
        contextChatModal,
        summaryChunks,
        analysisStartedAtMs,
        duration,
        topics,
        dashboardBlocks,
        sources,
        overviewMermaidVersions,
        overviewMermaidActiveIndex,
        setOverviewMermaidActiveIndex,
        pushOverviewMermaidVersion,
        fullAnalysisFollowUp,
        followUpStreaming,
        runAnalysisMode,
        getHasGraphData,
        graph,
        steps,
        currentStep,
        stepTrigger,
        getSummary,
    } = useAIAnalysisStore();
    const { searchQuery } = useSharedStore();
    const { regenerateOverview, isRegenerating } = useRegenerateOverviewMermaid();
    const settings = AppContext.getInstance().settings;
    const isSimpleMode = runAnalysisMode === 'docSimple' || runAnalysisMode === 'vaultSimple';

    const [showBlocksFollowup, setShowBlocksFollowup] = useState(false);
    const [blocksChatContext, setBlocksChatContext] = useState<DashboardBlock | null>(null);
    const [blocksChatItemContext, setBlocksChatItemContext] = useState<{ block: DashboardBlock; item: DashboardBlockItem } | null>(null);
    const [overviewCopied, setOverviewCopied] = useState(false);
    const [copiedContinueIndex, setCopiedContinueIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!showBlocksFollowup) {
            setBlocksChatContext(null);
            setBlocksChatItemContext(null);
        }
    }, [showBlocksFollowup]);

    // Defensive dedupe for completed view (tool/agent may still emit duplicates).
    const dedupedTopics = useMemo(() => {
        const seen = new Set<string>();
        return topics.filter((t) => {
            const key = String((t as any)?.label ?? '').trim().toLowerCase();
            if (!key) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [topics]);

    const dedupedSources = useMemo(() => {
        const seen = new Set<string>();
        return sources.filter((s: any) => {
            const path = String(s?.path ?? '').trim();
            const id = String(s?.id ?? '').trim();
            const key = path ? `path:${path}` : (id ? `id:${id}` : '');
            if (!key) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [sources]);

    const {
        summaryRef,
        overviewRef,
        topicsRef,
        dashboardBlocksRef,
        graphSectionRef,
        sourcesRef,
        continueAnalysisRef,
        stepsRef,
    } = sectionRefs;

    const displayOverview = (overviewMermaidVersions ?? [])[overviewMermaidActiveIndex ?? 0] ?? '';

    const blocksFollowupConfig = useBlocksFollowupChatConfig({
        dashboardBlocks,
        blocksChatContext,
        blocksChatItemContext,
    });

    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4">
            {/* Summary: only this area should have the frame */}
            {summaryChunks && summaryChunks.length > 0 ? (
                <div ref={summaryRef} className="pktw-scroll-mt-24">
                    <IntelligenceFrame isActive={true} className="pktw-mb-1">
                        <SummaryContent
                            startedAtMs={analysisStartedAtMs}
                            finalDurationMs={duration}
                            onOpenWikilink={onOpenWikilink}
                        />
                    </IntelligenceFrame>
                </div>
            ) : null}

            {/* Overview (Mermaid): full mode only; simple mode is chat-with-doc + raw search, no overview */}
            {!isSimpleMode && (displayOverview?.trim() || isRegenerating) && (
                <div ref={overviewRef} className="pktw-scroll-mt-24">
                    <div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2">
                        <div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2">
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Overview</span>
                            <div className="pktw-flex pktw-items-center pktw-gap-1">
                                {displayOverview?.trim() ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="pktw-h-7 pktw-w-7 pktw-shadow-none"
                                        title={overviewCopied ? 'Copied' : 'Copy overview'}
                                        onClick={async () => {
                                            await copyText(displayOverview);
                                            setOverviewCopied(true);
                                            setTimeout(() => setOverviewCopied(false), 1500);
                                        }}
                                    >
                                        {overviewCopied ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />}
                                    </Button>
                                ) : null}
                                {((overviewMermaidVersions?.length ?? 0) > 1 || displayOverview?.trim()) && (
                                    <HoverCard openDelay={100} closeDelay={150}>
                                        <HoverCardTrigger asChild>
                                            <Button variant="ghost" size="sm" className="pktw-h-7 pktw-px-2 pktw-text-xs">
                                                {(overviewMermaidActiveIndex ?? 0) === (overviewMermaidVersions?.length ?? 1) - 1
                                                    ? 'Current'
                                                    : `Previous ${(overviewMermaidVersions?.length ?? 0) - 1 - (overviewMermaidActiveIndex ?? 0)}`}
                                            </Button>
                                        </HoverCardTrigger>
                                        <HoverCardContent align="end" className="pktw-w-48 pktw-p-1 pktw-z-[10000] pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
                                            {(overviewMermaidVersions ?? []).map((_, idx) => {
                                                const len = overviewMermaidVersions!.length;
                                                const targetIndex = len - 1 - idx;
                                                const isCurrent = idx === 0;
                                                const label = isCurrent ? 'Current' : `Previous ${idx}`;
                                                return (
                                                    <Button
                                                        key={idx}
                                                        variant="ghost"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => setOverviewMermaidActiveIndex(targetIndex)}
                                                        className={`pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none ${(overviewMermaidActiveIndex ?? 0) === targetIndex ? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]' : ''}`}
                                                    >
                                                        {label}
                                                    </Button>
                                                );
                                            })}
                                        </HoverCardContent>
                                    </HoverCard>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="pktw-h-7 pktw-px-2 pktw-text-xs"
                                    onClick={regenerateOverview}
                                    disabled={isRegenerating}
                                >
                                    <RefreshCw className={`pktw-w-3.5 pktw-h-3.5 pktw-mr-1 ${isRegenerating ? 'pktw-animate-spin' : ''}`} />
                                    {isRegenerating ? 'Generating…' : 'Regenerate'}
                                </Button>
                            </div>
                        </div>
                        {displayOverview?.trim() ? (
                            <StreamdownIsolated
                                className="pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
                                isAnimating={false}
                            >
                                {displayOverview}
                            </StreamdownIsolated>
                        ) : isRegenerating ? (
                            <span className="pktw-text-xs pktw-text-[#6b7280]">Generating overview diagram…</span>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Topics: full mode only; simple mode has no key topics */}
            {!isSimpleMode && dedupedTopics.length > 0 && (
                <div ref={topicsRef} className="pktw-scroll-mt-24">
                    <TopicSection
                        topics={dedupedTopics}
                        onClose={onClose}
                    />
                </div>
            )}

            {/* Graph (hidden in simple mode) */}
            {!isSimpleMode && getHasGraphData() && (
                <div ref={graphSectionRef} className="pktw-scroll-mt-24">
                    <KnowledgeGraphSection
                        onClose={onClose}
                    />
                </div>
            )}

            {/* Sources (full width) */}
            {dedupedSources.length > 0 && (
                <div ref={sourcesRef} className="pktw-scroll-mt-24">
                    <TopSourcesSection
                        sources={convertSourcesToSearchResultItems(dedupedSources)}
                        onOpen={createOpenSourceCallback(onClose)}
                        skipAnimation={true}
                    />
                </div>
            )}

            {/* Dashboard Blocks (before Topics, hidden in simple mode) */}
            {!isSimpleMode && (dashboardBlocks?.length ?? 0) > 0 && (
                <DashboardBlocksSection
                    blocks={dashboardBlocks ?? []}
                    blockRef={dashboardBlocksRef}
                    isStreaming={false}
                    followupOpen={showBlocksFollowup}
                    anchor={
                        showBlocksFollowup
                            ? blocksChatItemContext
                                ? { blockId: blocksChatItemContext.block.id, itemId: blocksChatItemContext.item.id }
                                : blocksChatContext
                                    ? { blockId: blocksChatContext.id }
                                    : null
                            : null
                    }
                    onOpenChatForBlock={(block) => {
                        if (showBlocksFollowup && blocksChatContext?.id === block.id && !blocksChatItemContext) {
                            setShowBlocksFollowup(false);
                            setBlocksChatContext(null);
                        } else {
                            setShowBlocksFollowup(true);
                            setBlocksChatContext(block);
                            setBlocksChatItemContext(null);
                        }
                    }}
                    onOpenChatForItem={(block, item) => {
                        if (showBlocksFollowup && blocksChatItemContext?.block.id === block.id && blocksChatItemContext?.item.id === item.id) {
                            setShowBlocksFollowup(false);
                            setBlocksChatItemContext(null);
                        } else {
                            setShowBlocksFollowup(true);
                            setBlocksChatItemContext({ block, item });
                            setBlocksChatContext(null);
                        }
                    }}
                    followupSlot={
                        <InlineFollowupChat
                            {...blocksFollowupConfig}
                            outputPlace="modal"
                            onOpenModal={(question) => {
                                const blockId = blocksChatContext?.id ?? '';
                                const messages = blocksFollowupHistoryByBlockId?.[blockId] ?? [];
                                setContextChatModal((prev) => {
                                    if (prev && prev.type === 'blocks' && prev.blockId === blockId) {
                                        return { ...prev, streamingQuestion: question, streamingText: '' };
                                    }
                                    return { type: 'blocks', blockId, streamingQuestion: question, streamingText: '', title: 'Blocks Follow-up', messages };
                                });
                            }}
                            onStreamingReplace={(streamingText) => setContextChatModal((prev) => prev ? { ...prev, streamingText: streamingText ?? '' } : null)}
                            onApply={(acc, _mode, q) => {
                                const blockId = contextChatModal?.type === 'blocks' ? contextChatModal.blockId : blocksChatContext?.id;
                                if (blockId) appendBlocksFollowup(blockId, q ?? '', acc);
                                setContextChatModal((prev) => prev ? {
                                    ...prev,
                                    messages: [...(prev.messages ?? []), { question: q ?? '', answer: acc }],
                                    streamingQuestion: '',
                                    streamingText: '',
                                } : null);
                            }}
                        />
                    }
                />
            )}

            {/* Continue Analysis: history + streaming (above Follow-up Questions so new answers appear here) */}
            {(fullAnalysisFollowUp?.length ?? 0) > 0 || followUpStreaming ? (
                <div ref={continueAnalysisRef} className="pktw-scroll-mt-24 pktw-space-y-4">
                    {(fullAnalysisFollowUp ?? []).map((section, i) => (
                        <div id={`continue-section-${i}`} className="pktw-scroll-mt-4 pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2">
                            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
                                <MessageCircle className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                                <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
                                    {(section.title || `Continue ${i + 1}`).replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim() || `Continue ${i + 1}`}
                                </span>
                                <div className="pktw-flex-1" />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="pktw-h-7 pktw-w-7 pktw-shadow-none"
                                    title={copiedContinueIndex === i ? 'Copied' : 'Copy'}
                                    onClick={async () => {
                                        await copyText(section.content ?? '');
                                        setCopiedContinueIndex(i);
                                        setTimeout(() => setCopiedContinueIndex(null), 1500);
                                    }}
                                >
                                    {copiedContinueIndex === i ? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" /> : <Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />}
                                </Button>
                            </div>
                            <StreamdownIsolated
                                className="pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
                                isAnimating={false}
                                onClick={handleStreamdownClick}
                            >
                                {section.content}
                            </StreamdownIsolated>
                        </div>
                    ))}
                    {followUpStreaming ? (
                        <IntelligenceFrame isActive={true} className="pktw-mb-1">
                            <div id="continue-section-streaming" className="pktw-scroll-mt-4 pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border-0 pktw-flex pktw-flex-col pktw-gap-2">
                                <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
                                    <MessageCircle className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                                    <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
                                        {(followUpStreaming.question || 'Continue').replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim() || 'Continue'}
                                    </span>
                                    <span className="pktw-text-[11px] pktw-text-[#9ca3af]">Streaming…</span>
                                    <div className="pktw-flex-1" />
                                    {(followUpStreaming.content ?? '').trim() ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="pktw-h-7 pktw-w-7 pktw-shadow-none"
                                            title="Copy"
                                            onClick={async () => {
                                                await copyText(followUpStreaming.content ?? '');
                                            }}
                                        >
                                            <Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
                                        </Button>
                                    ) : null}
                                </div>
                                <StreamdownIsolated
                                    className="pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none pktw-select-text"
                                    isAnimating={true}
                                    onClick={handleStreamdownClick}
                                >
                                    {followUpStreaming.content || ''}
                                </StreamdownIsolated>
                            </div>
                        </IntelligenceFrame>
                    ) : null}
                </div>
            ) : null}

            {/* Follow-up Questions: always last so new analysis appears above */}
            {!isSimpleMode ? (
                <FollowupQuestionsBlock summary={getSummary?.() ?? ''} onClose={onClose} />
            ) : null}

            {/* Only debug mode shows. And all steps including UISkipSteps */}
            {settings.enableDevTools && (steps?.length ?? 0) > 0 ? (
                <div ref={stepsRef} className="pktw-scroll-mt-24">
                    <StreamingStepsDisplay
                        steps={steps ?? []}
                        currentStep={currentStep}
                        stepTrigger={stepTrigger}
                        registerCurrentStepRender={undefined}
                        startedAtMs={analysisStartedAtMs}
                        isRunning={false}
                        finalDurationMs={duration}
                    />
                </div>
            ) : null}
        </div>
    );
};
