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
import type { DashboardBlock, DashboardBlockItem } from "@/service/agents/AISearchAgent";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { PromptId } from "@/service/prompt/PromptId";
import React from "react";
import { StreamdownIsolated } from "@/ui/component/mine";
import { MessageCircle } from "lucide-react";
import { useStreamdownWikilinkClick } from "../../callbacks/useStreamdownWikilinkClick";

export const CompletedAIAnalysis: React.FC<{
    onClose?: () => void;
    /** When provided, [[wikilinks]] in summary and continue sections open in Obsidian. */
    onOpenWikilink?: (path: string) => void | Promise<void>;
    sectionRefs: {
        summaryRef: React.RefObject<HTMLDivElement>;
        topicsRef: React.RefObject<HTMLDivElement>;
        dashboardBlocksRef: React.RefObject<HTMLDivElement>;
        graphSectionRef: React.RefObject<HTMLDivElement>;
        sourcesRef: React.RefObject<HTMLDivElement>;
        continueAnalysisRef: React.RefObject<HTMLDivElement>;
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
        fullAnalysisFollowUp,
        runAnalysisMode,
        getHasGraphData,
    } = useAIAnalysisStore();

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
        topicsRef,
        dashboardBlocksRef,
        graphSectionRef,
        sourcesRef,
        continueAnalysisRef,
    } = sectionRefs;

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
                            title="Ask about Blocks"
                            placeholder="Ask about inspiration, diagrams, or next steps…"
                            promptId={PromptId.AiAnalysisFollowupBlocks}
                            getVariables={(question) => ({
                                question,
                                blocksText: (dashboardBlocks ?? []).map((b) => {
                                    const label = b.title || b.category || 'Block';
                                    const itemsPreview = b.items?.slice(0, 5).map((i) => i.title).join(', ') || '';
                                    const md = (b.markdown || b.mermaidCode || '').slice(0, 200);
                                    return `- ${label}${itemsPreview ? ` (${itemsPreview})` : ''}${md ? `: ${md}` : ''}`;
                                }).join('\n') || '(empty)',
                            })}
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
                            initialQuestion={
                                blocksChatItemContext
                                    ? `Discuss: "${blocksChatItemContext.item.title}". ${blocksChatItemContext.item.description ?? ''}`.trim()
                                    : blocksChatContext
                                        ? `Discuss this: "${blocksChatContext.title || blocksChatContext.category || 'Block'}".`
                                        : undefined
                            }
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
        </div>
    );
};