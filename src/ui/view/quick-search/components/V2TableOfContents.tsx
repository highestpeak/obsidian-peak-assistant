import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, ChevronRight } from 'lucide-react';

interface Heading {
    text: string;
    level: number;
}

interface V2TableOfContentsProps {
    markdown: string;
    /** Override root element className (default: absolute bottom-right floating button) */
    className?: string;
    /** Initial collapsed state (default: true) */
    initialCollapsed?: boolean;
    /** Called after navigating to a heading — parent can use this to close the TOC */
    onNavigate?: () => void;
}

function parseHeadings(md: string): Heading[] {
    const headings: Heading[] = [];
    for (const line of md.split('\n')) {
        if (line.startsWith('## ')) {
            headings.push({ text: line.slice(3).replace(/[*_`]/g, '').trim(), level: 2 });
        } else if (line.startsWith('### ')) {
            headings.push({ text: line.slice(4).replace(/[*_`]/g, '').trim(), level: 3 });
        }
    }
    return headings;
}

/**
 * Find a heading inside StreamdownIsolated's Shadow DOM by text content
 * and scroll it into view.
 */
function scrollToHeading(headingText: string, level: number) {
    // Find the StreamdownIsolated host element
    const hosts = document.querySelectorAll('[data-streamdown-root][data-streamdown-mode="shadow"]');
    for (const host of hosts) {
        const shadow = host.shadowRoot;
        if (!shadow) continue;

        const tag = level === 2 ? 'h2' : 'h3';
        const headings = shadow.querySelectorAll(tag);
        for (const el of headings) {
            const text = (el.textContent ?? '').trim();
            // Fuzzy match: heading text might have slight differences from markdown
            if (text === headingText || text.includes(headingText) || headingText.includes(text)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
        // Fallback: try all heading levels
        const allHeadings = shadow.querySelectorAll('h1, h2, h3, h4');
        for (const el of allHeadings) {
            const text = (el.textContent ?? '').trim();
            if (text === headingText || text.includes(headingText) || headingText.includes(text)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
    }
}

export const V2TableOfContents: React.FC<V2TableOfContentsProps> = ({ markdown, className, initialCollapsed = true, onNavigate }) => {
    const headings = useMemo(() => parseHeadings(markdown), [markdown]);
    const [collapsed, setCollapsed] = useState(initialCollapsed);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const handleClick = useCallback((heading: Heading) => {
        scrollToHeading(heading.text, heading.level);
        onNavigate?.();
    }, [onNavigate]);

    if (headings.length < 3) return null;

    return (
        <div className={className ?? 'pktw-absolute pktw-right-3 pktw-bottom-3 pktw-z-10'}>
            {/* Collapsed: floating TOC button */}
            {collapsed && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setCollapsed(false)}
                    className="pktw-w-9 pktw-h-9 pktw-rounded-full pktw-bg-[#7c3aed] pktw-shadow-lg pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer pktw-text-white hover:pktw-bg-[#6d28d9] pktw-transition-all"
                    title="Table of Contents"
                >
                    <List className="pktw-w-4 pktw-h-4" />
                </motion.div>
            )}

            {/* Expanded: TOC panel — opens upward from bottom-right */}
            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="pktw-w-64 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-xl pktw-shadow-lg pktw-overflow-hidden pktw-mb-2"
                    >
                        {/* Header */}
                        <div
                            className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2.5 pktw-border-b pktw-border-[#e5e7eb] pktw-cursor-pointer hover:pktw-bg-[#f9fafb] pktw-transition-colors"
                            onClick={() => setCollapsed(true)}
                        >
                            <List className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6b7280]" />
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338] pktw-flex-1">
                                Table of Contents
                            </span>
                            <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
                        </div>

                        {/* Headings */}
                        <nav className="pktw-max-h-[400px] pktw-overflow-y-auto pktw-py-1.5 pktw-px-1.5">
                            {headings.map((heading, i) => (
                                <div
                                    key={i}
                                    className={`pktw-relative pktw-text-xs pktw-py-1 pktw-px-2 pktw-rounded pktw-cursor-pointer pktw-truncate pktw-transition-colors ${
                                        heading.level === 3 ? 'pktw-pl-6' : 'pktw-font-medium'
                                    } pktw-text-[#6b7280] hover:pktw-text-[#7c3aed] hover:pktw-bg-[#f5f3ff]`}
                                    title={heading.text}
                                    onClick={() => handleClick(heading)}
                                    onMouseEnter={() => setHoveredIndex(i)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                >
                                    {heading.text}

                                    {/* Hover preview tooltip for long titles */}
                                    <AnimatePresence>
                                        {hoveredIndex === i && heading.text.length > 25 && (
                                            <motion.div
                                                initial={{ opacity: 0, x: -5 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0 }}
                                                className="pktw-absolute pktw-right-full pktw-top-0 pktw-mr-2 pktw-px-3 pktw-py-2 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-text-xs pktw-text-[#2e3338] pktw-whitespace-nowrap pktw-z-20 pktw-max-w-[250px]"
                                            >
                                                {heading.text}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
