/**
 * Data-layer validation for AI analysis results: mermaid syntax and per-renderEngine block rules.
 * Used before UI render to catch and fix errors early.
 */
import type { SearchAgentResult, DashboardBlock } from '@/service/agents/AISearchAgent';
import { getMermaidInner, normalizeMermaidNodeStyleColons } from './mermaid-utils';

export interface ValidationReport {
    blockErrors: Array<{ blockId: string; renderEngine: string; errors: string[] }>;
    overviewMermaidError?: string;
    mermaidBlockErrors: Array<{ blockId: string; error: string }>;
}

/** Validate mermaid code. Returns { valid: true } or { valid: false, error }. */
export async function validateMermaidCode(code?: string): Promise<{ valid: true } | { valid: false; error: string }> {
    if (!code || code.trim() === '') return {
        valid: false,
        error: 'Empty mermaid code'
    };
    let inner = getMermaidInner(code || '').trim();
    if (!inner) return { valid: false, error: 'Empty mermaid code' };
    inner = normalizeMermaidNodeStyleColons(inner);
    try {
        const mermaid = await import('mermaid').then((m) => m.default);
        mermaid.initialize?.({ startOnLoad: false, suppressErrorRendering: true });
        // Do not use suppressErrors: true — when invalid, parse throws and we need the message for MermaidFixAgent.
        await mermaid.parse(inner);
        return { valid: true };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e ?? 'Unknown mermaid parse error');
        return { valid: false, error: msg };
    }
}

/** Validate a single dashboard block by renderEngine rules. */
function validateBlock(block: DashboardBlock): string[] {
    const errors: string[] = [];
    const engine = (block.renderEngine || 'MARKDOWN').toUpperCase();
    switch (engine) {
        case 'MERMAID': {
            const content = (block.mermaidCode || block.markdown || '').trim();
            if (!content) errors.push('MERMAID block requires mermaidCode or markdown');
            break;
        }
        case 'TILE':
        case 'ACTION_GROUP': {
            const items = block.items ?? [];
            if (items.length === 0) errors.push(`${engine} block requires non-empty items array`);
            break;
        }
        case 'MARKDOWN': {
            const md = (block.markdown || '').trim();
            if (!md) errors.push('MARKDOWN block requires non-empty markdown');
            break;
        }
        default:
            break;
    }
    return errors;
}

/** Run full validation on agent result. Mermaid blocks and overview are validated async. */
export async function validateAnalysisData(result: SearchAgentResult): Promise<ValidationReport> {
    const blockErrors: ValidationReport['blockErrors'] = [];
    const mermaidBlockErrors: ValidationReport['mermaidBlockErrors'] = [];
    const blocks = result.dashboardBlocks ?? [];

    for (const block of blocks) {
        const engine = (block.renderEngine || 'MARKDOWN').toUpperCase();
        const ruleErrors = validateBlock(block);
        if (ruleErrors.length > 0) {
            blockErrors.push({ blockId: block.id || 'unknown', renderEngine: engine, errors: ruleErrors });
        }
        if (engine === 'MERMAID') {
            const content = (block.mermaidCode || block.markdown || '').trim();
            if (content) {
                const v = await validateMermaidCode(content);
                if (!v.valid) {
                    mermaidBlockErrors.push({ blockId: block.id || 'unknown', error: v.error });
                }
            }
        }
    }

    let overviewMermaidError: string | undefined;
    const overview = (result.evidenceMermaidOverviewAgent ?? '').trim();
    if (overview) {
        const v = await validateMermaidCode(overview);
        if (!v.valid) overviewMermaidError = v.error;
    }

    return { blockErrors, overviewMermaidError, mermaidBlockErrors };
}

/** Build human-readable validation errors string for the review prompt. */
export function validationReportToPromptText(report: ValidationReport): string {
    const parts: string[] = [];
    for (const b of report.blockErrors) {
        parts.push(`Block ${b.blockId} (${b.renderEngine}): ${b.errors.join('; ')}`);
    }
    for (const m of report.mermaidBlockErrors) {
        parts.push(`Block ${m.blockId} mermaid parse: ${m.error}`);
    }
    if (report.overviewMermaidError) {
        parts.push(`overviewMermaid: ${report.overviewMermaidError}`);
    }
    return parts.join(' | ');
}
