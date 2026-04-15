import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface V2ScrollButtonsProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const V2ScrollButtons: React.FC<V2ScrollButtonsProps> = ({ containerRef }) => {
    const [showTop, setShowTop] = useState(false);
    const [showBottom, setShowBottom] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            setShowTop(scrollTop > 100);
            setShowBottom(scrollTop + clientHeight < scrollHeight - 100);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => container.removeEventListener('scroll', handleScroll);
    }, [containerRef]);

    return (
        <div className="pktw-absolute pktw-right-6 pktw-bottom-4 pktw-flex pktw-flex-col pktw-gap-2 pktw-z-30">
            <AnimatePresence>
                {showTop && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="pktw-w-10 pktw-h-10 pktw-rounded-full pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-shadow-lg pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] hover:pktw-text-[#7c3aed] hover:pktw-border-[#7c3aed]/30 pktw-transition-colors pktw-cursor-pointer"
                        title="Scroll to top"
                    >
                        <ChevronUp className="pktw-w-5 pktw-h-5" />
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showBottom && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })}
                        className="pktw-w-10 pktw-h-10 pktw-rounded-full pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-shadow-lg pktw-flex pktw-items-center pktw-justify-center pktw-text-[#6b7280] hover:pktw-text-[#7c3aed] hover:pktw-border-[#7c3aed]/30 pktw-transition-colors pktw-cursor-pointer"
                        title="Scroll to bottom"
                    >
                        <ChevronDown className="pktw-w-5 pktw-h-5" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
