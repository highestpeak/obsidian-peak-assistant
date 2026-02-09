import { convertSourcesToSearchResultItems } from "../../hooks/useAIAnalysisResult";
import { useAIAnalysisStore } from "../../store";
import { useMemo, useState, useEffect, useCallback } from "react";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { TopicSection } from "../ai-analysis-sections/TopicSection";
import { KnowledgeGraphSection } from "../ai-analysis-sections/KnowledgeGraphSection";
import { TopSourcesSection } from "../ai-analysis-sections/SourcesSection";
import { InlineFollowupChat } from "../../../../component/mine/InlineFollowupChat";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import type { DashboardBlock, DashboardBlockItem } from "@/service/agents/AISearchAgent";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { useBlocksFollowupChatConfig } from "../../hooks/useAIAnalysisPostAIInteractions";
import React from "react";
import { StreamdownIsolated } from "@/ui/component/mine";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useStreamdownWikilinkClick } from "../../callbacks/useStreamdownWikilinkClick";
import { useServiceContext } from "@/ui/context/ServiceContext";
import { PromptId } from "@/service/prompt/PromptId";
import { useSharedStore } from "../../store/sharedStore";
import { Button } from "@/ui/component/shared-ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/ui/component/shared-ui/hover-card";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import { StepsUISkipShouldSkip } from "../../store/aiAnalysisStore";

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
        overviewMermaid,
        setOverviewMermaid,
        fullAnalysisFollowUp,
        runAnalysisMode,
        getHasGraphData,
        graph,
        steps,
        currentStep,
        stepTrigger,
    } = useAIAnalysisStore();
    const { manager } = useServiceContext();
    const { searchQuery } = useSharedStore();

    const isSimpleMode = runAnalysisMode === 'simple';

    const [showBlocksFollowup, setShowBlocksFollowup] = useState(false);
    const [blocksChatContext, setBlocksChatContext] = useState<DashboardBlock | null>(null);
    const [blocksChatItemContext, setBlocksChatItemContext] = useState<{ block: DashboardBlock; item: DashboardBlockItem } | null>(null);

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

    const [overviewRegenerating, setOverviewRegenerating] = useState(false);
    const [overviewVersions, setOverviewVersions] = useState<string[]>([]);
    const [activeOverviewIndex, setActiveOverviewIndex] = useState(0);
    const currentSummary = useAIAnalysisStore((s) => {
        if (s.isSummaryStreaming || (s.isAnalyzing && s.summaryChunks.length > 0)) return s.summaryChunks.join('');
        const list = s.summaries;
        const idx = (s.summaryVersion ?? 1) - 1;
        return list[idx] ?? list[0] ?? '';
    });

    const handleRegenerateOverview = useCallback(async () => {
        const current = overviewMermaid?.trim();
        if (current) setOverviewVersions((prev) => [...prev, current]);
        setActiveOverviewIndex(0);
        setOverviewRegenerating(true);
        try {
            const topicsText = (topics ?? []).map((t) => t.label).join(', ');
            const graphSummary =
                graph?.nodes?.length || graph?.edges?.length
                    ? `Nodes: ${graph?.nodes?.length ?? 0}, Edges: ${graph?.edges?.length ?? 0}. Sample: ${(graph?.nodes ?? []).slice(0, 8).map((n) => n.title).join(', ')}`
                    : '';
            const sourcesSummary = (sources ?? []).slice(0, 6).map((s) => s.title || s.path).join(', ') || '';
            const blocksSummary = (dashboardBlocks ?? []).slice(0, 5).map((b) => b.title || b.category || b.id).join(', ') || '';
            const variables = {
                originalQuery: searchQuery ?? '',
                summary: currentSummary || '(none)',
                topicsText: topicsText || '(none)',
                graphSummary: graphSummary || '(none)',
                sourcesSummary: sourcesSummary || '(none)',
                blocksSummary: blocksSummary || '(none)',
            };
            let acc = '';
            for await (const event of manager.chatWithPromptStream(PromptId.AiAnalysisOverviewMermaid, variables)) {
                if (event.type === 'prompt-stream-delta' && typeof event.delta === 'string') acc += event.delta;
                else if (event.type === 'prompt-stream-result') acc = String(event.output ?? '');
            }
            const raw = (acc || '').trim();
            const { normalizeMermaidForDisplay } = await import('@/core/utils/mermaid-utils');
            const code = normalizeMermaidForDisplay(raw);
            setOverviewMermaid(code || null);
        } finally {
            setOverviewRegenerating(false);
        }
    }, [manager, searchQuery, currentSummary, topics, graph, sources, dashboardBlocks, setOverviewMermaid, overviewMermaid]);

    const displayOverview = activeOverviewIndex === 0
        ? (overviewMermaid ?? '')
        : (overviewVersions[overviewVersions.length - activeOverviewIndex] ?? overviewMermaid ?? '');

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

            {/* Overview (Mermaid) between Summary and Topics */}
            {(overviewMermaid?.trim() || overviewRegenerating) && (
                <div ref={overviewRef} className="pktw-scroll-mt-24">
                    <div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-flex pktw-flex-col pktw-gap-2">
                        <div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2">
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Overview</span>
                            <div className="pktw-flex pktw-items-center pktw-gap-1">
                                {(overviewVersions.length > 0 || overviewMermaid?.trim()) && (
                                    <HoverCard openDelay={100} closeDelay={150}>
                                        <HoverCardTrigger asChild>
                                            <Button variant="ghost" size="sm" className="pktw-h-7 pktw-px-2 pktw-text-xs">
                                                {activeOverviewIndex === 0 ? 'Current' : `Previous ${activeOverviewIndex}`}
                                            </Button>
                                        </HoverCardTrigger>
                                        <HoverCardContent align="end" className="pktw-w-48 pktw-p-1 pktw-z-[10000]">
                                            <Button
                                                variant="ghost"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => setActiveOverviewIndex(0)}
                                                className={`pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none ${activeOverviewIndex === 0 ? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]' : ''}`}
                                            >
                                                Current
                                            </Button>
                                            {overviewVersions.map((_, idx) => {
                                                const targetIndex = idx + 1;
                                                return (
                                                    <Button
                                                        key={idx}
                                                        variant="ghost"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => setActiveOverviewIndex(targetIndex)}
                                                        className={`pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none ${activeOverviewIndex === targetIndex ? 'pktw-bg-[#7c3aed]/10 pktw-text-[#7c3aed]' : ''}`}
                                                    >
                                                        Previous {targetIndex}
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
                                    onClick={handleRegenerateOverview}
                                    disabled={overviewRegenerating}
                                >
                                    <RefreshCw className={`pktw-w-3.5 pktw-h-3.5 pktw-mr-1 ${overviewRegenerating ? 'pktw-animate-spin' : ''}`} />
                                    {overviewRegenerating ? 'Generating…' : 'Regenerate'}
                                </Button>
                            </div>
                        </div>
                        {displayOverview?.trim() ? (
                            <StreamdownIsolated
                                className="pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none"
                                isAnimating={false}
                            >
                                {displayOverview}
                            </StreamdownIsolated>
                        ) : overviewRegenerating ? (
                            <span className="pktw-text-xs pktw-text-[#6b7280]">Generating overview diagram…</span>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Topics (before Blocks, hidden in simple mode) */}
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

            {/* Continue Analysis follow-up (full width, each question as section) */}
            {(fullAnalysisFollowUp?.length ?? 0) > 0 ? (
                <div ref={continueAnalysisRef} className="pktw-scroll-mt-24 pktw-space-y-4">
                    {(fullAnalysisFollowUp ?? []).map((section, i) => (
                        <div key={i} id={`continue-section-${i}`} className="pktw-scroll-mt-4 pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
                            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
                                <MessageCircle className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                                <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
                                    {(section.title || `Continue ${i + 1}`).replace(/^#+\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim() || `Continue ${i + 1}`}
                                </span>
                            </div>
                            <StreamdownIsolated
                                className="pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none"
                                isAnimating={false}
                                onClick={handleStreamdownClick}
                            >
                                {section.content}
                            </StreamdownIsolated>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Steps (completed analysis execution steps: tool calls, thinking, etc.) */}
            {(steps?.filter(s => !StepsUISkipShouldSkip.has(s.type)).length ?? 0) > 0 ? (
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