import React, { useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { V2ProcessView } from './V2ProcessView';
import { V2ReportView } from './V2ReportView';
import { V2SourcesView } from './V2SourcesView';
import { V2ScrollButtons } from './V2ScrollButtons';
import { V2TableOfContents } from './V2TableOfContents';
import { V2SectionNav } from './V2SectionNav';

interface V2SearchResultViewProps {
    onClose?: () => void;
    onRetry?: () => void;
    onApprove?: () => void;
    onRegenerateSection?: (id: string, prompt?: string) => void;
}

/**
 * V2 search result — no footer (footer is rendered by tab-AISearch).
 * View state is driven by searchSessionStore.v2View.
 */
export const V2SearchResultView: React.FC<V2SearchResultViewProps> = ({ onClose, onApprove, onRegenerateSection }) => {
    const isStreaming = useSearchSessionStore((s) => s.status === 'streaming');
    const isCompleted = useSearchSessionStore((s) => s.status === 'completed');
    const v2View = useSearchSessionStore((s) => s.v2View);
    const proposedOutline = useSearchSessionStore((s) => s.v2ProposedOutline);
    const containerRef = useRef<HTMLDivElement>(null);

    // During streaming, force process view
    const activeView = isStreaming ? 'process' : v2View;
    const showToc = isCompleted && activeView === 'report' && !!proposedOutline;

    // Reset to process when streaming starts
    useEffect(() => {
        if (isStreaming) {
            useSearchSessionStore.getState().setV2View('process');
        }
    }, [isStreaming]);

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full pktw-relative">
            {/* Section navigation — always visible when sections exist */}
            <V2SectionNav containerRef={containerRef} />
            <div ref={containerRef} className="pktw-flex-1 pktw-overflow-y-auto pktw-min-h-0">
                <AnimatePresence mode="wait">
                    {activeView === 'process' && <V2ProcessView key="process" onApprove={onApprove} />}
                    {activeView === 'report' && <V2ReportView key="report" onClose={onClose} onApprove={onApprove} onRegenerateSection={onRegenerateSection} />}
                    {activeView === 'sources' && <V2SourcesView key="sources" onClose={onClose} />}
                </AnimatePresence>
            </div>
            <V2ScrollButtons containerRef={containerRef} />
            {/* TOC rendered outside scroll container so it stays fixed on scroll */}
            {showToc && <V2TableOfContents markdown={proposedOutline!} />}
        </div>
    );
};
