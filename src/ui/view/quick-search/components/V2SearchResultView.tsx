import React, { useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { V2ProcessView } from './V2ProcessView';
import { V2ReportView } from './V2ReportView';
import { V2SourcesView } from './V2SourcesView';
import { V2ScrollButtons } from './V2ScrollButtons';

interface V2SearchResultViewProps {
    onClose?: () => void;
    onRetry?: () => void;
    onApprove?: () => void;
    onRegenerateSection?: (id: string, prompt?: string) => void;
    onAskSection?: (id: string, question: string, onDelta?: (answer: string) => void) => Promise<string>;
}

/**
 * V2 search result — no footer (footer is rendered by tab-AISearch).
 * View state is driven by searchSessionStore.v2View.
 */
export const V2SearchResultView: React.FC<V2SearchResultViewProps> = ({ onClose, onApprove, onRegenerateSection, onAskSection }) => {
    const v2View = useSearchSessionStore((s) => s.v2View);
    const containerRef = useRef<HTMLDivElement>(null);
    const previousViewRef = useRef(v2View);

    // The approve action owns the Activity -> Report transition. Never force a
    // streaming session back to Activity: report sections stream in their final
    // positions while Activity remains available through the footer.
    const activeView = v2View;

    useEffect(() => {
        if (previousViewRef.current === v2View) return;
        previousViewRef.current = v2View;
        requestAnimationFrame(() => {
            containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        });
    }, [v2View]);

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full pktw-relative">
            <div ref={containerRef} className="pktw-flex-1 pktw-overflow-y-auto pktw-min-h-0">
                <AnimatePresence mode="wait">
                    {activeView === 'process' && <V2ProcessView key="process" onApprove={onApprove} />}
                    {activeView === 'report' && <V2ReportView key="report" onRegenerateSection={onRegenerateSection} onAskSection={onAskSection} />}
                    {activeView === 'sources' && <V2SourcesView key="sources" onClose={onClose} />}
                </AnimatePresence>
            </div>
            <V2ScrollButtons containerRef={containerRef} />
        </div>
    );
};
