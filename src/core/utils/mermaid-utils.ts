/**
 * Utilities for Mermaid diagram code: normalize to renderable format and fix common LLM syntax errors.
 */

import { SLICE_CAPS } from '@/core/constant';

const MERMAID_FENCE = '```mermaid';

/** Extract inner Mermaid code from optional ```mermaid ... ``` wrapper. */
function extractMermaidCode(text: string): string {
    const s = text.trim();
    const open = '```mermaid';
    const openAlt = '``` mermaid';
    const start = s.startsWith(open)
        ? open.length
        : s.startsWith(openAlt)
            ? openAlt.length
            : -1;
    if (start === -1) return s;
    const rest = s.slice(start).trim();
    const end = rest.indexOf('```');
    return (end >= 0 ? rest.slice(0, end).trim() : rest).trim();
}

/**
 * Extract inner Mermaid code from full block (```mermaid...```). If no fence, return as-is.
 */
export function getMermaidInner(fullOrInner: string): string {
    return extractMermaidCode(fullOrInner.trim());
}

/**
 * Escape text for use inside Mermaid double-quoted node labels (e.g. flowchart LR center["..."]).
 */
export function escapeMermaidQuotedLabel(s: string): string {
    return s.replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').slice(0, SLICE_CAPS.utils.mermaidQuotedLabel);
}

export function wrapMermaidCode(code: string): string {
    return `${MERMAID_FENCE}\n${code}\n\`\`\``;
}
