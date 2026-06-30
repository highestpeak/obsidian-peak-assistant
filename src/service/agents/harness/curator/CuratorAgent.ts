/**
 * Curator Agent — runs the LLM that picks model bindings for the three
 * capability tiers. Uses the bootstrap binding (the profile/model the user
 * just configured) to drive a `generateText`+JSON.parse round trip, validates
 * the response against the catalog, retries up to MAX_ATTEMPTS, and falls back
 * to the rule-based recommendation on persistent failure.
 *
 * See spec §6.
 */

import type { Profile } from '@/core/profiles/types';
import { vercelGenerateText } from '@/core/providers/vercel';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { isCatalogLoaded } from './catalog';
import { buildFallbackRecommendation } from './fallback';
import { buildCuratorPrompt, getCuratorSystemPrompt } from './prompt';
import { RecommendationSchema } from './schema';
import type {
    CuratorAttempt,
    CuratorContext,
    CuratorResult,
    Recommendation,
    ValidationError,
} from './types';
import { hardErrors, validateRecommendation } from './validation';

const MAX_ATTEMPTS = 3;

export interface BootstrapBinding {
    profile: Profile;
    modelId: string;
}

export interface RunCuratorOptions {
    ctx: CuratorContext;
    bootstrap: BootstrapBinding;
    /** Optional user follow-up note for "再来一次". */
    userFollowup?: string;
    /** Abort signal — passes through to underlying fetch where possible. */
    signal?: AbortSignal;
}

/**
 * Run the Curator. Never throws under normal failure modes — the fallback
 * always returns a usable recommendation. Throws only when the catalog hasn't
 * been hydrated (programmer error).
 */
export async function runCurator(opts: RunCuratorOptions): Promise<CuratorResult> {
    if (!isCatalogLoaded()) {
        throw new Error('Curator catalog not loaded. Call loadCuratorCatalog() during plugin boot.');
    }

    const attempts: CuratorAttempt[] = [];
    let priorErrors: ValidationError[] | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (opts.signal?.aborted) break;

        const userPrompt = buildCuratorPrompt({
            ctx: opts.ctx,
            priorErrors,
            userFollowup: opts.userFollowup,
        });

        let rawJsonText: string;
        try {
            rawJsonText = await invokeLLM(opts.bootstrap, userPrompt);
        } catch (e) {
            attempts.push({
                attempt,
                raw: null,
                errors: [],
                error: e instanceof Error ? e.message : String(e),
            });
            continue; // Retry on transient LLM/network failure.
        }

        let parsedJson: unknown;
        try {
            parsedJson = parseLLMJson(rawJsonText);
        } catch (e) {
            attempts.push({
                attempt,
                raw: rawJsonText,
                errors: [
                    {
                        type: 'unknown_model',
                        message: `Response was not valid JSON: ${(e as Error).message}. Return a JSON object only — no markdown, no explanation.`,
                    },
                ],
                error: 'invalid_json',
            });
            priorErrors = attempts[attempts.length - 1].errors;
            continue;
        }

        const schemaResult = RecommendationSchema.safeParse(parsedJson);
        if (!schemaResult.success) {
            const errs: ValidationError[] = schemaResult.error.issues.map((iss) => ({
                type: 'unknown_model',
                message: `Schema violation at ${iss.path.join('.') || '(root)'}: ${iss.message}`,
            }));
            attempts.push({ attempt, raw: parsedJson, errors: errs });
            priorErrors = errs;
            continue;
        }

        const candidate: Recommendation = schemaResult.data as Recommendation;
        const validationErrs = validateRecommendation(candidate, opts.ctx);
        const blocking = hardErrors(validationErrs);
        attempts.push({ attempt, raw: parsedJson, errors: validationErrs });

        if (blocking.length === 0) {
            return { recommendation: candidate, fromLLM: true, attempts };
        }
        priorErrors = blocking;
    }

    return {
        recommendation: buildFallbackRecommendation(opts.ctx),
        fromLLM: false,
        attempts,
    };
}

async function invokeLLM(bootstrap: BootstrapBinding, userPrompt: string): Promise<string> {
    const systemPrompt = await getCuratorSystemPrompt();
    const { text } = await vercelGenerateText(
        bootstrap.profile,
        bootstrap.modelId,
        [
            { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
            { role: 'user', content: [{ type: 'text', text: userPrompt }] },
        ],
    );
    if (!text || text.trim().length === 0) {
        throw new Error('LLM returned empty response');
    }
    return text;
}

/**
 * Strip ```json fences if present, then parse. The system prompt forbids
 * markdown but models occasionally violate it.
 */
function parseLLMJson(raw: string): unknown {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    return JSON.parse(candidate);
}

/**
 * Convenience: resolve a BootstrapBinding from a profileId + modelId. Returns
 * null when the profile no longer exists.
 */
export function resolveBootstrap(profileId: string, modelId: string): BootstrapBinding | null {
    const profile = ProfileRegistry.getInstance().getProfileById(profileId);
    if (!profile) return null;
    return { profile, modelId };
}
