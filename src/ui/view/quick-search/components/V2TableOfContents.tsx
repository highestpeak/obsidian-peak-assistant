import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import {
	PEAK_KEYBOARD_A11Y_STRINGS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

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
    /** Called by the expanded panel's close control. */
    onClose?: () => void;
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
function scrollToHeading(ownerDocument: Document, headingText: string, level: number) {
    // For level-2 headings: search section card titles (rendered as spans in React, not in Shadow DOM)
    if (level === 2) {
        const sectionBlocks = ownerDocument.querySelectorAll('[data-section-id]');
        for (const block of sectionBlocks) {
            const titleEl = block.querySelector('.pktw-font-semibold');
            const text = (titleEl?.textContent ?? '').trim();
            if (text === headingText || text.includes(headingText) || headingText.includes(text)) {
                block.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
    }

    // For level-3+ headings: search inside Shadow DOM
    const hosts = ownerDocument.querySelectorAll('[data-streamdown-root][data-streamdown-mode="shadow"]');
    for (const host of hosts) {
        const shadow = host.shadowRoot;
        if (!shadow) continue;

        const headings = shadow.querySelectorAll('h1, h2, h3, h4');
        for (const el of headings) {
            const text = (el.textContent ?? '').trim();
            if (text === headingText || text.includes(headingText) || headingText.includes(text)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
    }
}

export const V2TableOfContents: React.FC<V2TableOfContentsProps> = ({
    markdown,
    className,
    initialCollapsed = true,
    onNavigate,
    onClose,
}) => {
    const headings = useMemo(() => parseHeadings(markdown), [markdown]);
    const [collapsed, setCollapsed] = useState(initialCollapsed);
    const rootRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLElement>(null);
    useRovingComposite(navRef, {
        itemSelector: '[role="button"]',
        orientation: 'vertical',
    });

    const handleClick = useCallback((heading: Heading) => {
        const ownerDocument = rootRef.current?.ownerDocument;
        if (!ownerDocument) return;
        scrollToHeading(ownerDocument, heading.text, heading.level);
        onNavigate?.();
    }, [onNavigate]);

    if (headings.length < 3) return null;

    return (
        <div
            ref={rootRef}
            className={className ?? 'pktw-absolute pktw-right-3 pktw-bottom-3 pktw-z-10'}
            role={!collapsed ? 'dialog' : undefined}
            aria-label={!collapsed ? PEAK_KEYBOARD_A11Y_STRINGS.tableOfContents : undefined}
            data-peak-keyboard-zone={!collapsed ? 'as-outline' : undefined}
            data-peak-keyboard-zone-label={
                !collapsed ? PEAK_KEYBOARD_ZONE_LABELS['as-outline'] : undefined
            }
            data-peak-keyboard-order={!collapsed ? '4' : undefined}
        >
            {/* Collapsed: floating TOC button */}
            {collapsed && (
                <Button
                    variant="unstyled"
                    onClick={() => setCollapsed(false)}
                    className="pktw-w-9 pktw-h-9 pktw-rounded-full pktw-bg-pk-accent pktw-shadow-lg pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer pktw-text-pk-text-inverted hover:pktw-bg-pk-accent-hover pktw-transition-all"
                    title={PEAK_KEYBOARD_A11Y_STRINGS.tableOfContents}
                    aria-label={PEAK_KEYBOARD_A11Y_STRINGS.openTableOfContents}
                >
                    <List className="pktw-w-4 pktw-h-4" />
                </Button>
            )}

            {/* Expanded: TOC panel — opens upward from bottom-right */}
            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="pktw-w-64 pktw-max-h-[60vh] pktw-border pktw-border-pk-border pktw-rounded-xl pktw-shadow-xl pktw-overflow-hidden pktw-mb-2 pktw-bg-pk-background"
                    >
                        {/* Header */}
                        <Button
                            variant="unstyled"
                            className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2.5 pktw-border-b pktw-border-pk-border pktw-cursor-pointer hover:pktw-bg-pk-background pktw-transition-colors"
                            onClick={() => {
                                if (onClose) {
                                    onClose();
                                    return;
                                }
                                setCollapsed(true);
                            }}
                            aria-label={PEAK_KEYBOARD_A11Y_STRINGS.closeTableOfContents}
                            data-peak-toc-close
                        >
                            <List className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-pk-text-primary pktw-flex-1">
                                Table of Contents
                            </span>
                            <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />
                        </Button>

                        {/* Headings */}
                        <nav
                            ref={navRef}
                            className="pktw-max-h-[50vh] pktw-overflow-y-auto pktw-py-1.5 pktw-px-1.5"
                            aria-label={PEAK_KEYBOARD_A11Y_STRINGS.reportHeadings}
                        >
                            {headings.map((heading, i) => (
                                <Button
                                    variant="unstyled"
                                    key={i}
                                    role="button"
                                    tabIndex={i === 0 ? 0 : -1}
                                    data-peak-focus-id={`report-heading-${i}`}
                                    className={`pktw-text-xs pktw-py-1 pktw-px-2 pktw-rounded pktw-cursor-pointer pktw-truncate pktw-transition-colors ${
                                        heading.level === 3 ? 'pktw-pl-6' : 'pktw-font-medium'
                                    } pktw-text-pk-foreground-muted hover:pktw-text-pk-accent hover:pktw-bg-pk-highlight`}
                                    title={heading.text}
                                    onClick={() => handleClick(heading)}
                                >
                                    {heading.text}
                                </Button>
                            ))}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
