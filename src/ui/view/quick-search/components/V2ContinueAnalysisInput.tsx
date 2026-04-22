import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { useUIEventStore } from '@/ui/store/uiEventStore';

interface V2ContinueAnalysisInputProps {
    onClose: () => void;
}

export const V2ContinueAnalysisInput: React.FC<V2ContinueAnalysisInputProps> = ({ onClose }) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestions = useSearchSessionStore((s) => s.v2FollowUpQuestions);

    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const handleSubmit = useCallback((question?: string) => {
        const q = (question || input).trim();
        if (!q) return;
        // Fire UIEvent — tab-AISearch's InlineFollowupChat handles the actual LLM call
        useUIEventStore.getState().publish('continue-analysis', { text: q });
        onClose();
    }, [input, onClose]);

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pktw-fixed pktw-inset-0 pktw-bg-black/20 pktw-backdrop-blur-sm pktw-z-[9998]"
                onClick={onClose}
            />

            {/* Floating input panel */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ ease: [0.22, 1, 0.36, 1] }}
                className="pktw-fixed pktw-bottom-16 pktw-left-1/2 pktw--translate-x-1/2 pktw-w-full pktw-max-w-2xl pktw-px-6 pktw-z-[9999]"
            >
                <div className="pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-xl pktw-shadow-lg pktw-overflow-hidden">
                    {/* Header */}
                    <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-3 pktw-border-b pktw-border-pk-border">
                        <span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338]">
                            Continue Analysis
                        </span>
                        <div
                            onClick={onClose}
                            className="pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground-muted pktw-transition-colors pktw-cursor-pointer"
                        >
                            <X className="pktw-w-4 pktw-h-4" />
                        </div>
                    </div>

                    {/* Input */}
                    <div className="pktw-p-4">
                        <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-mb-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit();
                                    }
                                }}
                                placeholder="Ask a follow-up question..."
                                className="pktw-flex-1 pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-pk-border pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50 focus:pktw-border-transparent"
                            />
                            <div
                                onClick={() => handleSubmit()}
                                className={`pktw-flex-none pktw-p-2 pktw-rounded-lg pktw-transition-colors pktw-cursor-pointer ${
                                    input.trim()
                                        ? 'pktw-text-white pktw-bg-pk-accent hover:pktw-bg-[#6d28d9]'
                                        : 'pktw-text-pk-foreground-muted pktw-bg-gray-100'
                                }`}
                            >
                                <Send className="pktw-w-4 pktw-h-4" />
                            </div>
                        </div>

                        {/* Suggestion chips */}
                        {suggestions.length > 0 && (
                            <div className="pktw-space-y-2">
                                <span className="pktw-text-xs pktw-text-pk-foreground-muted">Suggested questions:</span>
                                <div className="pktw-flex pktw-flex-wrap pktw-gap-2">
                                    {suggestions.slice(0, 4).map((s, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.05 }}
                                            onClick={() => handleSubmit(s)}
                                            className="pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-pk-foreground-muted pktw-bg-gray-100 hover:pktw-bg-purple-100 hover:pktw-text-pk-accent pktw-rounded-full pktw-transition-colors pktw-cursor-pointer"
                                        >
                                            {s}
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </>
    );
};
