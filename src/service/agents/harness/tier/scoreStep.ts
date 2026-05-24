/**
 * Step-level confidence scoring. Drives auto-escalation in TierController.
 *
 * M1 keeps this lightweight (rule-based on schema validity + tool error rate +
 * heuristic uncertainty markers). M5+ may replace with an LLM judge.
 */

import type { StepResult } from '../trace/events';

const UNCERTAIN_PATTERNS: RegExp[] = [
    /\bi['’]?m not sure\b/i,
    /\bi cannot\b/i,
    /\bi can['’]?t\b/i,
    /\bunable to\b/i,
    /\bi don['’]?t know\b/i,
];

export interface ScoreStepOptions {
    /** Explicit override (e.g. agent invoked escalate()). 0 forces upgrade. */
    forcedScore?: number;
}

export function scoreStep(step: StepResult, opts: ScoreStepOptions = {}): number {
    if (typeof opts.forcedScore === 'number') return clamp01(opts.forcedScore);

    const tc = step.toolCalls.length;
    const tr = step.toolResults.length;

    // Schema failure: tool call emitted but no result resolved (or all failed).
    const failed = step.toolResults.filter((r) => !r.ok).length;
    const schemaPassRate = tc === 0 ? 1 : Math.max(0, tr - failed) / tc;

    // Uncertainty markers in text output.
    const text = step.text ?? '';
    const uncertain = UNCERTAIN_PATTERNS.some((re) => re.test(text));

    // Weighted signals: schema=0.5, tool-success=0.3, language=0.2.
    const toolSuccess = tr === 0 ? 1 : (tr - failed) / tr;
    const language = uncertain ? 0 : 1;

    const score = 0.5 * schemaPassRate + 0.3 * toolSuccess + 0.2 * language;
    return clamp01(score);
}

function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
