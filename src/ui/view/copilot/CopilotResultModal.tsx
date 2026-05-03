// src/ui/view/copilot/CopilotResultModal.tsx
import { Modal, type App, type TFile } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { ReviewResult, LinkSuggestions, SplitPlan, TagSuggestions } from '@/service/copilot/copilot-schemas';
import { AuthenticationError } from '@/core/errors/llm-errors';
import { Loader2, AlertTriangle, Settings2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';

export type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split' | 'suggest-tags';

export interface CopilotResultProps {
    type: CopilotResultType;
    result?: string | ReviewResult | LinkSuggestions | SplitPlan | TagSuggestions;
    file: TFile;
    scope: 'full' | 'selection';
    originalContent: string;
    selectedText?: string;
    onClose: () => void;
}

type ModalPhase =
    | { phase: 'loading'; progressText?: string; startTime: number }
    | { phase: 'result'; data: any }
    | { phase: 'error'; error: Error };

const ACTION_LABELS: Record<CopilotResultType, string> = {
    'polish': 'Polishing document',
    'review': 'Reviewing article',
    'suggest-links': 'Analyzing links',
    'split': 'Analyzing structure',
    'suggest-tags': 'Suggesting tags',
};

const LoadingView: React.FC<{ type: CopilotResultType; startTime: number; progressText?: string }> = ({ type, startTime, progressText }) => {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [startTime]);
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
            <Loader2 className="pktw-w-8 pktw-h-8 pktw-animate-spin pktw-text-accent" />
            <span className="pktw-text-sm pktw-font-medium">{ACTION_LABELS[type]}...</span>
            <span className="pktw-text-xs pktw-text-muted-foreground">{elapsed}s</span>
            {progressText && (
                <div className="pktw-w-full pktw-max-h-[200px] pktw-overflow-y-auto pktw-mt-4 pktw-px-4 pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap">
                    {progressText}
                </div>
            )}
        </div>
    );
};

const ErrorView: React.FC<{ error: Error; onClose: () => void }> = ({ error, onClose }) => {
    const isAuth = error instanceof AuthenticationError;
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
            <AlertTriangle className="pktw-w-8 pktw-h-8 pktw-text-destructive" />
            <span className="pktw-text-sm pktw-font-medium">Something went wrong</span>
            <span className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-max-w-md">{error.message}</span>
            <div className="pktw-flex pktw-gap-2 pktw-mt-2">
                {isAuth && (
                    <Button variant="outline" size="sm" onClick={() => {
                        const { SettingsModal } = require('@/ui/view/SettingsModal');
                        new SettingsModal(AppContext.getInstance()).open();
                    }}>
                        <Settings2 className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
                        Open Settings
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
        </div>
    );
};

// Use a module-level ref for imperative phase updates from the Modal class
let _currentSetPhase: ((phase: ModalPhase) => void) | null = null;

const CopilotResultContent: React.FC<CopilotResultProps & { initialPhase: ModalPhase }> = (props) => {
    const [phase, setPhase] = useState<ModalPhase>(props.initialPhase);

    useEffect(() => {
        _currentSetPhase = setPhase;
        return () => { _currentSetPhase = null; };
    }, []);

    if (phase.phase === 'loading') {
        return <LoadingView type={props.type} startTime={phase.startTime} progressText={phase.progressText} />;
    }
    if (phase.phase === 'error') {
        return <ErrorView error={phase.error} onClose={props.onClose} />;
    }

    const { type } = props;
    const result = phase.data;
    switch (type) {
        case 'polish': {
            const { PolishPanel } = require('./panels/PolishPanel');
            return <PolishPanel {...props} result={result as string} />;
        }
        case 'review': {
            const { ReviewPanel } = require('./panels/ReviewPanel');
            return <ReviewPanel {...props} result={result as ReviewResult} />;
        }
        case 'suggest-links': {
            const { LinkSuggestPanel } = require('./panels/LinkSuggestPanel');
            return <LinkSuggestPanel {...props} result={result as LinkSuggestions} />;
        }
        case 'split': {
            const { SplitPanel } = require('./panels/SplitPanel');
            return <SplitPanel {...props} result={result as SplitPlan} />;
        }
        case 'suggest-tags': {
            const { TagSuggestionPanel } = require('./panels/TagSuggestionPanel');
            return <TagSuggestionPanel result={result as TagSuggestions} file={props.file} onClose={props.onClose} />;
        }
    }
};

export class CopilotResultModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(
        app: App,
        private props: Omit<CopilotResultProps, 'onClose'>,
    ) {
        super(app);
    }

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('peak-copilot-modal');
        this.contentEl.addClass('pktw-root');
        this.modalEl.style.width = '720px';
        this.modalEl.style.maxWidth = '90vw';

        const initialPhase: ModalPhase = this.props.result != null
            ? { phase: 'result', data: this.props.result }
            : { phase: 'loading', startTime: Date.now() };

        const appContext = AppContext.getInstance();
        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                CopilotResultContent,
                { ...this.props, onClose: () => this.close(), initialPhase },
                appContext,
            ),
        );
    }

    setResult(data: any): void {
        _currentSetPhase?.({ phase: 'result', data });
    }

    setError(error: Error): void {
        _currentSetPhase?.({ phase: 'error', error });
    }

    updateProgress(text: string): void {
        _currentSetPhase?.({ phase: 'loading', progressText: text, startTime: Date.now() });
    }

    onClose(): void {
        _currentSetPhase = null;
        const r = this.reactRenderer;
        this.reactRenderer = null;
        if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
        else this.contentEl.empty();
    }
}
