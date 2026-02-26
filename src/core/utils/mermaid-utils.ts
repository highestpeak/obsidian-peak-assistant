/**
 * Utilities for Mermaid diagram code: normalize to renderable format and fix common LLM syntax errors.
 */

import mermaid from 'mermaid';

// Prevent Mermaid from adding a window.load listener (avoids zombie listeners on plugin reload)
mermaid.initialize?.({ startOnLoad: false });

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
 * Validate Mermaid diagram syntax using mermaid.parse(). Use to trigger retry on invalid output.
 * @returns { valid: true } or { valid: false, message } with parse error description.
 */
export async function validateMermaid(definition: string): Promise<{ valid: true } | { valid: false; message: string }> {
    const code = getMermaidInner(definition);
    if (!code.trim()) {
        return { valid: false, message: 'Mermaid definition is empty.' };
    }
    try {
        await mermaid.parse(code);
        return { valid: true };
    } catch (err: unknown) {
        const msg = err && typeof (err as { str?: string }).str === 'string'
            ? (err as { str: string }).str
            : err instanceof Error
                ? err.message
                : String(err);
        return { valid: false, message: msg };
    }
}

export function wrapMermaidCode(code: string): string {
    return `${MERMAID_FENCE}\n${code}\n\`\`\``;
}

/** Decode common HTML entities in Mermaid labels. */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** Replace wikilink [[path]] or [[path|label]] with plain label or path. */
function replaceWikilinks(text: string): string {
    return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path, label) => label?.trim() || path?.trim() || '');
}

/**
 * Fix common LLM Mermaid syntax errors:
 * - HTML entity decode, subgraph id[label] rewrite, & expand, brackets/quotes, wikilink replacement
 */
export function sanitizeMermaidOverview(code: string): string {
    let s = code.trim();
    if (!s) return s;
    s = decodeHtmlEntities(s);

    const lines = s.split(/\r?\n/);
    const out: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Remove lines that are Mermaid error messages (LLM sometimes mixes them in)
        if (line.trim().startsWith('Mermaid Error:') || line.trim().toLowerCase().startsWith('mermaid error:')) continue;
        // Fix node ids containing dots (Mermaid ids must not have . unless quoted): B1.1 -> B1_1
        line = line.replace(/(^|\s)([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z0-9_.]+)(\s*[[({])/g, (_, pre, id, suf) => {
            return pre + id.replace(/\./g, '_') + suf;
        });
        // Force-quote labels in node shapes to avoid parse errors: A[Label] -> A["Label"], B(Label) -> B("Label"), D{Label} -> D{"Label"}
        const quoteLabel = (inner: string): string => {
            const trimmed = inner.trim();
            if (!trimmed) return inner;
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return inner;
            return `"${trimmed.replace(/"/g, '\\"')}"`;
        };
        line = line.replace(/(\w+)(\[)([^\]]*)(\])/g, (_, id, open, inner, close) => id + open + quoteLabel(inner) + close);
        line = line.replace(/(\w+)(\()([^)]*)(\))/g, (_, id, open, inner, close) => id + open + quoteLabel(inner) + close);
        line = line.replace(/(\w+)(\{)([^}]*)(\})/g, (_, id, open, inner, close) => id + open + quoteLabel(inner) + close);
        // Expand A & B & C merge syntax into separate nodes (not supported in flowchart subgraph)
        if (line.includes('&') && /[\w\s&]+\[[^\]]*\]/.test(line)) {
            const nodePart = line.match(/^(\s*)([\w\s&]+)(\[[^\]]*\]|\([^)]*\))(.*)$/);
            if (nodePart) {
                const ids = nodePart[2].split(/\s*&\s*/).map((x) => x.trim()).filter(Boolean);
                if (ids.length > 1) {
                    const shape = nodePart[3];
                    const rest = nodePart[4].trim();
                    for (const id of ids) {
                        out.push(`${nodePart[1]}${id}${shape}${rest ? ' ' + rest : ''}`);
                    }
                    continue;
                }
            }
        }
        // Normalize subgraph: subgraph id["label"] or subgraph id[label] (ensure id is safe)
        const subgraphMatch = line.match(/^\s*subgraph\s+([^\s["]+)\s*\[([^\]]*)\]\s*$/);
        if (subgraphMatch) {
            const id = subgraphMatch[1].trim();
            let label = subgraphMatch[2].trim();
            label = replaceWikilinks(label);
            if (!/^".*"$/.test(label) && label.length > 0) label = `"${label.replace(/"/g, '\\"')}"`;
            out.push(`subgraph ${id}[${label}]`);
            continue;
        }
        // Convert invalid "from" syntax
        const fromMatch = line.match(/^\s*(\w+)(\[[^\]]*\]|\([^)]*\))\s+from\s+([A-Za-z0-9_,\s]+)\s*$/i);
        if (fromMatch) {
            const nodeId = fromMatch[1];
            const nodeShape = fromMatch[2];
            const sources = fromMatch[3].split(/[,\s]+/).filter(Boolean);
            out.push(`${nodeId}${nodeShape}`);
            for (const src of sources) out.push(`${src} --> ${nodeId}`);
            continue;
        }
        // Fix orphan " before ) or ]
        line = line.replace(/\(([^"]*)"\)/g, '($1)').replace(/\[([^"]*)"\]/g, '[$1]');
        // Replace wikilinks in labels
        line = line.replace(/\[([^\]]+)\]/g, (m, inner) => `[${replaceWikilinks(inner)}]`);
        line = line.replace(/\(([^)]+)\)/g, (m, inner) => `(${replaceWikilinks(inner)})`);
        // Remove malformed link lines
        const linkMatch = line.match(/^\s*(\w+)\s+(-{2,3})\s+(.+)$/);
        if (linkMatch) {
            const target = linkMatch[3].trim();
            if (target.includes('"') || (target.includes(':') && /^[a-z]+:\s*["']/.test(target))) continue;
        }
        // Truncate trailing " - text" prose
        const badTrailingMatch = line.match(/^(\s*\w+(\[[^\]]*\]|\([^)]*\)|\{[^}]*\}))\s+-+\s+(.+)$/);
        if (badTrailingMatch) {
            const afterDash = badTrailingMatch[3].trim();
            if (/\s/.test(afterDash) || /^[a-z]/.test(afterDash)) line = badTrailingMatch[1];
        }
        out.push(line);
    }
    return out.join('\n').trim();
}
