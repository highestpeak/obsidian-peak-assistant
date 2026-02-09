/**
 * Utilities for Mermaid diagram code: normalize to renderable format and fix common LLM syntax errors.
 */

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
 * Normalize Mermaid content to renderable format. Apply once when storing; render directly to Streamdown.
 * Streamdown handles unclosed fences during streaming.
 */
export function normalizeMermaidForDisplay(raw: string): string {
    const code = extractMermaidCode(raw);
    const sanitized = sanitizeMermaidOverview(code);
    if (!sanitized) return '';
    return `${MERMAID_FENCE}\n${sanitized}\n\`\`\``;
}

/**
 * Fix common LLM Mermaid syntax errors:
 * - Unbalanced quotes in node labels (text") -> (text)
 * - Invalid "from" syntax (Mermaid has no such keyword)
 * - Malformed link targets like learn: "xxx"
 */
export function sanitizeMermaidOverview(code: string): string {
    let s = code.trim();
    if (!s) return s;

    const lines = s.split(/\r?\n/);
    const out: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Convert invalid "from" syntax to proper arrows: NODE[text] from A,B,C -> A --> NODE, B --> NODE, etc.
        const fromMatch = line.match(/^\s*(\w+)(\[[^\]]*\]|\([^)]*\))\s+from\s+([A-Za-z0-9_,\s]+)\s*$/i);
        if (fromMatch) {
            const nodeId = fromMatch[1];
            const nodeShape = fromMatch[2];
            const sources = fromMatch[3].split(/[,\s]+/).filter(Boolean);
            out.push(`${nodeId}${nodeShape}`);
            for (const src of sources) {
                out.push(`${src} --> ${nodeId}`);
            }
            continue;
        }
        // Fix orphan " before ) in parentheses: (text") -> (text)
        line = line.replace(/\(([^"]*)"\)/g, '($1)');
        // Fix orphan " before ] in brackets: [text"] -> [text]
        line = line.replace(/\[([^"]*)"\]/g, '[$1]');
        // Remove malformed link lines: A --- learn: "xxx" (target looks like label, not node id)
        const linkMatch = line.match(/^\s*(\w+)\s+(-{2,3})\s+(.+)$/);
        if (linkMatch) {
            const target = linkMatch[3].trim();
            if (target.includes('"') || (target.includes(':') && /^[a-z]+:\s*["']/.test(target))) {
                continue;
            }
        }
        // Fix malformed node lines: NODE["label"] - descriptive text (parser expects link target, not free text)
        // Truncate trailing " - text" when it looks like prose, not a node id
        const badTrailingMatch = line.match(/^(\s*\w+(\[[^\]]*\]|\([^)]*\)|\{[^}]*\}))\s+-+\s+(.+)$/);
        if (badTrailingMatch) {
            const afterDash = badTrailingMatch[3].trim();
            if (/\s/.test(afterDash) || /^[a-z]/.test(afterDash)) {
                line = badTrailingMatch[1];
            }
        }
        out.push(line);
    }
    return out.join('\n').trim();
}
