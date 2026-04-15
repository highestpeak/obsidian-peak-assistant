import React from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, FileText, Search, Brain } from 'lucide-react';
import type { V2ToolStep } from '../../types/search-steps';

interface V2StepCardProps {
    step: V2ToolStep;
}

function getToolIcon(toolName: string) {
    const short = toolName.replace(/^mcp__vault__/, '');
    if (short === 'vault_grep') return <Search className="pktw-w-3.5 pktw-h-3.5" />;
    if (short === 'vault_submit_plan') return <Brain className="pktw-w-3.5 pktw-h-3.5" />;
    return <FileText className="pktw-w-3.5 pktw-h-3.5" />;
}

export const V2StepCard: React.FC<V2StepCardProps> = ({ step }) => {
    const isRunning = step.status === 'running';
    const isSubmitPlan = step.toolName.endsWith('vault_submit_plan');

    return (
        <div className="pktw-flex pktw-gap-3">
            {/* Status indicator */}
            <div className="pktw-flex-none pktw-mt-0.5">
                {isRunning ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="pktw-w-5 pktw-h-5 pktw-rounded-full pktw-bg-purple-100 pktw-flex pktw-items-center pktw-justify-center"
                    >
                        <Loader2 className="pktw-w-3 pktw-h-3 pktw-text-[#7c3aed]" />
                    </motion.div>
                ) : (
                    <div className="pktw-w-5 pktw-h-5 pktw-rounded-full pktw-bg-green-100 pktw-flex pktw-items-center pktw-justify-center">
                        <Check className="pktw-w-3 pktw-h-3 pktw-text-green-600" />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="pktw-flex-1">
                <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-0.5">
                    <div className="pktw-text-[#7c3aed]">
                        {getToolIcon(step.toolName)}
                    </div>
                    <span className="pktw-text-xs pktw-font-medium pktw-text-[#2e3338]">
                        {step.displayName}
                    </span>
                    {!isRunning && step.summary && (
                        <span className="pktw-text-xs pktw-text-[#9ca3af] pktw-ml-auto pktw-shrink-0">
                            {step.summary}
                        </span>
                    )}
                    {!isRunning && step.endedAt && step.startedAt && (
                        <span className="pktw-text-xs pktw-text-[#9ca3af] pktw-font-mono pktw-tabular-nums pktw-shrink-0">
                            {((step.endedAt - step.startedAt) / 1000).toFixed(1)}s
                        </span>
                    )}
                </div>

                {/* submit_plan progress bar */}
                {isRunning && isSubmitPlan && (
                    <div className="pktw-mt-2">
                        <div className="pktw-h-1 pktw-bg-gray-200 pktw-rounded-full pktw-overflow-hidden">
                            <motion.div
                                className="pktw-h-full pktw-bg-[#7c3aed]"
                                initial={{ width: '0%' }}
                                animate={{ width: '70%' }}
                                transition={{ duration: 2, ease: 'easeInOut' }}
                            />
                        </div>
                        <span className="pktw-text-xs pktw-text-[#9ca3af] pktw-mt-1.5 pktw-block">
                            Analyzing evidence and structuring report...
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
