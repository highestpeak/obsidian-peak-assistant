import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { V2ToolStep } from '../../types/search-steps';

interface V2StepCardProps {
    step: V2ToolStep;
}

export const V2StepCard: React.FC<V2StepCardProps> = ({ step }) => {
    const [expanded, setExpanded] = useState(false);
    const isRunning = step.status === 'running';

    return (
        <motion.div
            className="pktw-flex pktw-flex-col pktw-gap-1 pktw-py-1.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
        >
            <div
                className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer pktw-select-none"
                onClick={() => !isRunning && step.resultPreview && setExpanded(!expanded)}
            >
                {/* Status indicator */}
                <span className="pktw-text-sm pktw-shrink-0">
                    {isRunning ? (
                        <motion.span
                            className="pktw-inline-block pktw-text-blue-500"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                            ⟳
                        </motion.span>
                    ) : (
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        >
                            {step.icon}
                        </motion.span>
                    )}
                </span>

                {/* Title */}
                <span className={`pktw-text-xs pktw-font-medium ${isRunning ? 'pktw-text-blue-600' : 'pktw-text-gray-700'}`}>
                    {step.displayName}{isRunning ? '...' : ''}
                </span>

                {/* Summary — fade in when it appears */}
                {step.summary && (
                    <motion.span
                        className="pktw-text-[10px] pktw-text-gray-400 pktw-ml-auto pktw-shrink-0"
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {step.summary}
                    </motion.span>
                )}

                {/* Duration */}
                {step.endedAt && step.startedAt && (
                    <span className="pktw-text-[10px] pktw-text-gray-300 pktw-font-mono pktw-tabular-nums pktw-shrink-0">
                        {((step.endedAt - step.startedAt) / 1000).toFixed(1)}s
                    </span>
                )}

                {/* Expand indicator */}
                {!isRunning && step.resultPreview && (
                    <motion.span
                        className="pktw-text-[10px] pktw-text-gray-300 pktw-shrink-0"
                        animate={{ rotate: expanded ? 90 : 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        ▸
                    </motion.span>
                )}
            </div>

            {/* Expanded result preview */}
            <AnimatePresence>
                {expanded && step.resultPreview && (
                    <motion.div
                        key="preview"
                        className="pktw-ml-6 pktw-mt-1 pktw-p-2 pktw-rounded pktw-bg-gray-50 pktw-border pktw-border-gray-100 pktw-overflow-x-auto"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <pre className="pktw-text-[10px] pktw-text-gray-500 pktw-whitespace-pre-wrap pktw-break-words pktw-max-h-40 pktw-overflow-y-auto">
                            {step.resultPreview}
                        </pre>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
