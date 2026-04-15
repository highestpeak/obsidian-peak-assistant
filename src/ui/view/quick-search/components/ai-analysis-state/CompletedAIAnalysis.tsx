import { convertSourcesToSearchResultItems } from "../../hooks/useAIAnalysisResult";
import {
    useAIAnalysisRuntimeStore,
    useAIAnalysisSummaryStore,
    useAIAnalysisResultStore,
    useAIAnalysisInteractionsStore,
    useAIAnalysisStepsStore,
} from "../../store/aiAnalysisStore";
import { useMemo, useState, useEffect } from "react";
import { IntelligenceFrame } from "../../../../component/mine/IntelligenceFrame";
import { SummaryContent } from "../ai-analysis-sections/SummarySection";
import { TopicSection } from "../ai-analysis-sections/TopicSection";
import { MermaidMindFlowSection } from "@/ui/view/quick-search/components/ai-analysis-sections/MermaidMindFlowSection";
import { OverviewMermaidSection } from "@/ui/view/quick-search/components/ai-analysis-sections/OverviewMermaidSection";
import { TopSourcesSection } from "../ai-analysis-sections/SourcesSection";
import { InlineFollowupChat } from "../../../../component/mine/InlineFollowupChat";
import { DashboardBlocksSection } from "../ai-analysis-sections/DashboardBlocksSection";
import { FollowupQuestionsBlock } from "../ai-analysis-sections/FollowupQuestionsBlock";
import type { DashboardBlock, DashboardBlockItem } from "@/service/agents/shared-types";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { useBlocksFollowupChatConfig, useRegenerateOverviewMermaid } from "../../hooks/useAIAnalysisPostAIInteractions";
import React from "react";
import { StreamdownIsolated } from "@/ui/component/mine";
import { MessageCircle, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useStreamdownWikilinkClick } from "../../callbacks/useStreamdownWikilinkClick";
import { useSharedStore } from "../../store/sharedStore";
import { Button } from "@/ui/component/shared-ui/button";
import { StreamingStepsDisplay } from "../ai-analysis-sections/StepsDisplay";
import { AppContext } from "@/app/context/AppContext";
import { copyText } from "@/ui/view/shared/common-utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/component/shared-ui/collapsible";
import { AIGraphView } from "../ai-graph-view/AIGraphView";

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

    const analysisStartedAtMs = useAIAnalysisRuntimeStore((s) => s.analysisStartedAtMs);
    const duration = useAIAnalysisRuntimeStore((s) => s.duration);
    const runAnalysisMode = useAIAnalysisRuntimeStore((s) => s.runAnalysisMode);

    const summaryChunks = useAIAnalysisSummaryStore((s) => s.summaryChunks);
    const getSummary = useAIAnalysisSummaryStore((s) => s.getSummary);

    const topics = useAIAnalysisResultStore((s) => s.topics);
    const dashboardBlocks = useAIAnalysisResultStore((s) => s.dashboardBlocks);
    const sources = useAIAnalysisResultStore((s) => s.sources);
    const evidenceIndex = useAIAnalysisResultStore((s) => s.evidenceIndex);
    const overviewMermaidVersions = useAIAnalysisResultStore((s) => s.overviewMermaidVersions);
    const overviewMermaidActiveIndex = useAIAnalysisResultStore((s) => s.overviewMermaidActiveIndex);
    const setOverviewMermaidActiveIndex = useAIAnalysisResultStore((s) => s.setOverviewMermaidActiveIndex);
    const mindflowMermaid = useAIAnalysisResultStore((s) => s.mindflowMermaid);
    const graph = useAIAnalysisResultStore((s) => s.graph);

    const setContextChatModal = useAIAnalysisInteractionsStore((s) => s.setContextChatModal);
    const appendBlocksFollowup = useAIAnalysisInteractionsStore((s) => s.appendBlocksFollowup);
    const blocksFollowupHistoryByBlockId = useAIAnalysisInteractionsStore((s) => s.blocksFollowupHistoryByBlockId);
    const contextChatModal = useAIAnalysisInteractionsStore((s) => s.contextChatModal);
    const fullAnalysisFollowUp = useAIAnalysisInteractionsStore((s) => s.fullAnalysisFollowUp);
    const followUpStreaming = useAIAnalysisInteractionsStore((s) => s.followUpStreaming);

    const steps = useAIAnalysisStepsStore((s) => s.steps);
    const { regenerateOverview, isRegenerating } = useRegenerateOverviewMermaid();
    const settings = AppContext.getInstance().settings;
    const [showBlocksFollowup, setShowBlocksFollowup] = useState(false);
    const [blocksChatContext, setBlocksChatContext] = useState<DashboardBlock | null>(null);
    const [blocksChatItemContext, setBlocksChatItemContext] = useState<{ block: DashboardBlock; item: DashboardBlockItem } | null>(null);
    const [copiedContinueIndex, setCopiedContinueIndex] = useState<number | null>(null);
    const [mindflowOpen, setMindflowOpen] = useState(false);

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

    // AI Graph mode: render dedicated graph view instead of normal report
    if (runAnalysisMode === 'aiGraph') {
        return (
            <div className="pktw-space-y-4 pktw-p-4">
                <AIGraphView onOpenPath={(path) => {
                    const app = AppContext.getInstance().app;
                    const file = app.vault.getAbstractFileByPath(path);
                    if (file) app.workspace.getLeaf().openFile(file as any);
                }} />
            </div>
        );
    }

    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4">
            {/* MindFlow (collapsible, default collapsed, before Summary) */}
            {(mindflowMermaid ?? '').trim() ? (
                <Collapsible open={mindflowOpen} onOpenChange={setMindflowOpen}>
                    <CollapsibleTrigger className="pktw-w-full pktw-group pktw-shadow-none">
                        <div className="pktw-w-full pktw-flex pktw-items-center pktw-justify-start pktw-gap-2 pktw-py-1.5 pktw-transition-colors hover:pktw-bg-muted/50 pktw-rounded-md pktw-px-1">
                            {mindflowOpen ? (
                                <ChevronDown className="pktw-size-3.5 pktw-text-muted-foreground" />
                            ) : (
                                <ChevronRight className="pktw-size-3.5 pktw-text-muted-foreground" />
                            )}
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">Mind Flow</span>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="pktw-mt-2">
                            <MermaidMindFlowSection
                                mindflowMermaid={mindflowMermaid ?? ''}
                                maxHeightClassName="pktw-min-h-[120px]"
                                containerClassName=""
                            />
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            ) : null}

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

            {/* Overview (Mermaid) */}
            {(displayOverview?.trim() || isRegenerating) && (
                <div ref={overviewRef} className="pktw-scroll-mt-24">
                    <OverviewMermaidSection
                        overviewProp={displayOverview}
                        overviewMermaidVersions={overviewMermaidVersions}
                        overviewMermaidActiveIndex={overviewMermaidActiveIndex}
                        setOverviewMermaidActiveIndex={setOverviewMermaidActiveIndex}
                        regenerateOverview={regenerateOverview}
                        isRegenerating={isRegenerating}
                    />
                </div>
            )}

            {/* Topics */}
            {dedupedTopics.length > 0 && (
                <div ref={topicsRef} className="pktw-scroll-mt-24">
                    <TopicSection
                        topics={dedupedTopics}
                        onClose={onClose}
                    />
                </div>
            )}

            {/* Dashboard Blocks (consulting order: after Topics, before Sources) */}
            {(dashboardBlocks?.length ?? 0) > 0 && (
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

            {/* Sources (consulting order: last in main report) */}
            {(dedupedSources.length > 0 || Object.keys(evidenceIndex).some((p) => ((evidenceIndex[p]?.summaries?.length ?? 0) + (evidenceIndex[p]?.facts?.length ?? 0)) > 0)) && (
                <div ref={sourcesRef} className="pktw-scroll-mt-24">
                    <TopSourcesSection
                        sources={convertSourcesToSearchResultItems(dedupedSources)}
                        onOpen={createOpenSourceCallback(onClose)}
                        skipAnimation={true}
                        evidenceIndex={evidenceIndex}
                        graph={graph}
                    />
                </div>
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
            <FollowupQuestionsBlock summary={getSummary?.() ?? ''} onClose={onClose} />

            {/* Only debug mode shows. And all steps including UISkipSteps */}
            {settings.enableDevTools && (steps?.length ?? 0) > 0 ? (
                <div ref={stepsRef} className="pktw-scroll-mt-24">
                    <StreamingStepsDisplay
                        steps={steps ?? []}
                        startedAtMs={analysisStartedAtMs}
                        isRunning={false}
                        finalDurationMs={duration}
                    />
                </div>
            ) : null}
        </div>
    );
};
