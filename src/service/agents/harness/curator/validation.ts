/**
 * Hard constraints on Curator recommendations. Runs after zod validates shape;
 * any error here triggers a retry with the messages fed back to the LLM.
 *
 * See spec §6.3.
 */

import { lookupModel } from './catalog';
import { CAPABILITY_ORDER, type Capability, type CuratorContext, type Recommendation, type ValidationError } from './types';

export function validateRecommendation(rec: Recommendation, ctx: CuratorContext): ValidationError[] {
    const errs: ValidationError[] = [];
    const { env, preferences } = ctx;

    // 1. Each binding's model must exist in the catalog.
    for (const tier of CAPABILITY_ORDER) {
        const id = rec.bindings[tier];
        if (!id) {
            errs.push({
                type: 'missing_tier',
                tier,
                message: `Tier "${tier}" has no binding. Provide a model id from the catalog.`,
            });
            continue;
        }
        const entry = lookupModel(id);
        if (!entry) {
            errs.push({
                type: 'unknown_model',
                tier,
                id,
                message: `Model "${id}" is not in the catalog. Pick a model id that appears in the catalog JSON.`,
            });
            continue;
        }

        // 2. RAM fit for local models. Allow downloads only if the user has the RAM headroom.
        if (entry.ramRequiredGB != null && entry.ramRequiredGB > env.ramGB) {
            errs.push({
                type: 'insufficient_ram',
                tier,
                id,
                required: entry.ramRequiredGB,
                message: `Model "${id}" requires ~${entry.ramRequiredGB}GB RAM but the user has ${env.ramGB}GB. Pick a smaller model or a hosted one.`,
            });
        }

        // 3. Budget=zero forbids paid models.
        if (preferences.budget === 'zero' && (entry.costPer1MInput > 0 || entry.costPer1MOutput > 0)) {
            errs.push({
                type: 'budget_violation',
                tier,
                id,
                message: `User budget is $0; "${id}" is a paid hosted model (in $${entry.costPer1MInput}/out $${entry.costPer1MOutput} per 1M). Pick a local model.`,
            });
        }

        // 4. Suitability hint — soft mismatch is allowed but the LLM should justify it.
        if (entry.suitableTiers.length > 0 && !entry.suitableTiers.includes(tier)) {
            errs.push({
                type: 'tier_mismatch',
                tier,
                id,
                message: `Model "${id}" is tagged for [${entry.suitableTiers.join(', ')}] in the catalog, you put it in "${tier}". Either pick a better-suited model, or keep it and note why in rationale.`,
            });
        }
    }

    // 5. Empty bindings — at least one binding must exist (defence in depth; zod requires all three but a future schema loosening shouldn't bypass this).
    if (Object.values(rec.bindings).every((v) => !v)) {
        errs.push({ type: 'empty_bindings', message: 'No bindings provided.' });
    }

    return errs;
}

/**
 * Filter validation errors that should trigger an LLM retry vs. ones that are
 * advisory only. Tier mismatch is advisory — the LLM may have a justification.
 */
export function isHardError(err: ValidationError): boolean {
    return err.type !== 'tier_mismatch';
}

export function hardErrors(errs: ValidationError[]): ValidationError[] {
    return errs.filter(isHardError);
}

/**
 * Format validation errors as a single bullet list for LLM retry feedback.
 */
export function formatErrorsForLLM(errs: ValidationError[]): string {
    if (errs.length === 0) return '';
    return errs.map((e) => `- [${e.type}${e.tier ? ` / ${e.tier}` : ''}] ${e.message}`).join('\n');
}

export function summarizeForUI(errs: ValidationError[]): string {
    if (errs.length === 0) return 'Validation passed.';
    const byTier = new Map<string, ValidationError[]>();
    for (const e of errs) {
        const key = e.tier ?? '_global';
        const list = byTier.get(key) ?? [];
        list.push(e);
        byTier.set(key, list);
    }
    const lines: string[] = [];
    for (const [tier, list] of byTier) {
        const label = tier === '_global' ? 'Global' : `Tier "${tier as Capability}"`;
        lines.push(`${label}: ${list.length} issue(s)`);
        for (const e of list) lines.push(`  - ${e.message}`);
    }
    return lines.join('\n');
}
