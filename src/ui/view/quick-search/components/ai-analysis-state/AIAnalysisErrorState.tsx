import { AlertTriangle, Copy } from "lucide-react";
import { useState } from "react";
import React from "react";
import { Button } from "@/ui/component/shared-ui/button";

/** Detect schema/object validation errors from streamObject (e.g. AI SDK). */
function isSchemaMismatchError(error: string): boolean {
    return /no object generated|response did not match schema|did not match schema/i.test(error);
}

/**
 * Error state component for AI search failures
 */
export const AIAnalysisErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const friendlyMessage = isSchemaMismatchError(error)
        ? 'The model response did not match the expected format. You can try again or save the current analysis below.'
        : error;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(error);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy error:', err);
        }
    };

    return (
        <div className="pktw-w-full pktw-bg-pk-error-bg pktw-border pktw-border-[var(--pk-error-border)] pktw-rounded-lg pktw-p-3 pktw-mb-2">
            <div className="pktw-flex pktw-items-start pktw-gap-2">
                <div className="pktw-mt-0.5 pktw-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-h-7 pktw-rounded pktw-bg-pk-background/70 pktw-border pktw-border-[var(--pk-error-border)]">
                    <AlertTriangle className="pktw-w-4 pktw-h-4 pktw-text-pk-error" />
                </div>
                <div className="pktw-flex-1 pktw-min-w-0">
                    <div className="pktw-flex pktw-items-center pktw-gap-2">
                        <span className="pktw-font-semibold pktw-text-pk-text-primary pktw-text-sm">
                            Oops! Something went wrong
                        </span>
                        <Button
                            onClick={() => setExpanded(v => !v)}
                            variant="ghost"
                            size="sm"
                            className="pktw-shadow-none pktw-h-7 pktw-px-2 pktw-text-xs pktw-cursor-pointer"
                        >
                            {expanded ? 'Hide details' : 'Show details'}
                        </Button>
                        <div className="pktw-flex-1" />
                        <Button
                            onClick={handleCopy}
                            variant="ghost"
                            size="sm"
                            className="pktw-shadow-none pktw-shrink-0 pktw-p-1 pktw-h-7 pktw-w-7 pktw-cursor-pointer"
                            title={copied ? 'Copied!' : 'Copy error'}
                        >
                            <Copy className={`pktw-w-3.5 pktw-h-3.5 ${copied ? 'pktw-text-pk-success' : 'pktw-text-pk-text-secondary'}`} />
                        </Button>
                        <Button
                            onClick={onRetry}
                            className="pktw-shadow-none pktw-h-7 pktw-px-3 pktw-bg-pk-accent pktw-text-white hover:pktw-bg-pk-accent-hover !pktw-rounded-md pktw-text-xs pktw-cursor-pointer"
                        >
                            Try Again
                        </Button>
                    </div>
                    <div className="pktw-text-xs pktw-text-pk-text-secondary pktw-mt-1 pktw-line-clamp-2">
                        {friendlyMessage}
                    </div>
                    {expanded ? (
                        <pre className="pktw-mt-2 pktw-text-pk-sm pktw-leading-relaxed pktw-bg-pk-background/70 pktw-border pktw-border-[var(--pk-error-border)] pktw-rounded pktw-p-2 pktw-max-h-40 pktw-overflow-auto pktw-whitespace-pre-wrap pktw-break-words">
                            {error}
                        </pre>
                    ) : null}
                </div>
            </div>
        </div>
    );
};