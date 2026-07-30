import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import { Button } from '@/ui/component/shared-ui/button';

/** Inline report-tail composer. Submitting starts an appended analysis round. */
export const V2ReportContinueComposer: React.FC = () => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const suggestions = useSearchSessionStore((state) => state.v2FollowUpQuestions);
    const rounds = useSearchSessionStore((state) => state.rounds.length);
    const lastEvent = useUIEventStore((state) => state.lastEvent);

    useEffect(() => {
        if (lastEvent?.type !== 'focus-report-followup') return;
        requestAnimationFrame(() => {
            inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            inputRef.current?.focus();
        });
    }, [lastEvent]);

    const submit = useCallback((suggestion?: string) => {
        const question = (suggestion ?? input).trim();
        if (!question) return;
        useUIEventStore.getState().publish('continue-analysis', { text: question });
        setInput('');
    }, [input]);

    return (
        <div
            data-report-followup-composer
            className="pktw-mt-4 pktw-rounded-xl pktw-border pktw-border-pk-accent/25 pktw-bg-pk-accent-tint/25 pktw-p-4"
        >
            <div className="pktw-flex pktw-items-start pktw-gap-2">
                <div className="pktw-min-w-0 pktw-flex-1">
                    <span className="pktw-block pktw-text-sm pktw-font-semibold pktw-text-pk-text-primary">
                        Continue this report
                    </span>
                    <span className="pktw-block pktw-text-xs pktw-text-pk-foreground-muted pktw-mt-0.5">
                        Ask for another evidence pass. The next round is appended; this report stays intact{rounds > 0 ? ` · ${rounds + 1} rounds so far` : ''}.
                    </span>
                </div>
            </div>
            <div className="pktw-flex pktw-items-end pktw-gap-2 pktw-mt-3">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key !== 'Enter' || event.shiftKey) return;
                        event.preventDefault();
                        submit();
                    }}
                    placeholder="Ask a follow-up that needs more evidence..."
                    className="pktw-flex-1 pktw-min-h-[64px] pktw-resize-y pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-pk-border pktw-rounded-lg pktw-bg-pk-background pktw-outline-none focus:pktw-border-pk-accent"
                />
                <Button
                    size="icon"
                    geometry="action-icon"
                    disabled={!input.trim()}
                    className="!pktw-rounded-full"
                    title="Continue analysis"
                    onClick={() => submit()}
                >
                    <Send className="pktw-w-4 pktw-h-4" />
                </Button>
            </div>
            {suggestions.length > 0 && (
                <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mt-3">
                    {suggestions.slice(0, 4).map((suggestion) => (
                        <Button
                            key={suggestion}
                            variant="outline"
                            size="sm"
                            className="!pktw-h-auto !pktw-min-h-8 !pktw-max-h-none !pktw-px-3 !pktw-py-1.5 pktw-rounded-full pktw-text-sm pktw-font-normal"
                            onClick={() => submit(suggestion)}
                        >
                            {suggestion}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
};
