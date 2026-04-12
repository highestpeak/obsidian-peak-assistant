import React, { useState } from 'react';
import type { V2ToolStep } from '../../types/search-steps';

interface V2StepCardProps {
    step: V2ToolStep;
}

export const V2StepCard: React.FC<V2StepCardProps> = ({ step }) => {
    const [expanded, setExpanded] = useState(false);
    const isRunning = step.status === 'running';

    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-py-1.5">
            <div
                className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer pktw-select-none"
                onClick={() => !isRunning && step.resultPreview && setExpanded(!expanded)}
            >
                {/* Status indicator */}
                <span className="pktw-text-sm pktw-shrink-0">
                    {isRunning ? (
                        <span className="pktw-inline-block pktw-animate-spin pktw-text-blue-500">⟳</span>
                    ) : (
                        <span>{step.icon}</span>
                    )}
                </span>

                {/* Title */}
                <span className={`pktw-text-xs pktw-font-medium ${isRunning ? 'pktw-text-blue-600' : 'pktw-text-gray-700'}`}>
                    {step.displayName}{isRunning ? '...' : ''}
                </span>

                {/* Summary */}
                {step.summary && (
                    <span className="pktw-text-[10px] pktw-text-gray-400 pktw-ml-auto pktw-shrink-0">
                        {step.summary}
                    </span>
                )}

                {/* Duration */}
                {step.endedAt && step.startedAt && (
                    <span className="pktw-text-[10px] pktw-text-gray-300 pktw-font-mono pktw-tabular-nums pktw-shrink-0">
                        {((step.endedAt - step.startedAt) / 1000).toFixed(1)}s
                    </span>
                )}

                {/* Expand indicator */}
                {!isRunning && step.resultPreview && (
                    <span className="pktw-text-[10px] pktw-text-gray-300 pktw-shrink-0">
                        {expanded ? '▾' : '▸'}
                    </span>
                )}
            </div>

            {/* Expanded result preview */}
            {expanded && step.resultPreview && (
                <div className="pktw-ml-6 pktw-mt-1 pktw-p-2 pktw-rounded pktw-bg-gray-50 pktw-border pktw-border-gray-100 pktw-overflow-x-auto">
                    <pre className="pktw-text-[10px] pktw-text-gray-500 pktw-whitespace-pre-wrap pktw-break-words pktw-max-h-40 pktw-overflow-y-auto">
                        {step.resultPreview}
                    </pre>
                </div>
            )}
        </div>
    );
};
