/**
 * Tests for the Curator catalog + validation + fallback. Does not touch the
 * LLM call path (covered by integration in PR3). Uses an inline catalog
 * fixture so we don't depend on TemplateManager.
 */

import {
    _resetCatalogForTests,
} from '@/service/agents/harness/curator/catalog';
import { hydrateCatalog, lookupModel, filterByTier } from '@/service/agents/harness/curator/catalog';
import { validateRecommendation, hardErrors } from '@/service/agents/harness/curator/validation';
import { buildFallbackRecommendation } from '@/service/agents/harness/curator/fallback';
import { RecommendationSchema } from '@/service/agents/harness/curator/schema';
import type {
    CatalogFile,
} from '@/service/agents/harness/curator/catalog';
import type {
    CuratorContext,
    Recommendation,
} from '@/service/agents/harness/curator/types';

const FIXTURE_CATALOG: CatalogFile = {
    version: 1,
    updatedAt: '2026-05-25',
    models: {
        'qwen3:14b': {
            kind: 'ollama',
            displayName: 'Qwen3 14B (local)',
            providerId: 'ollama',
            apiModelId: 'qwen3:14b',
            params: '14B',
            ramRequiredGB: 10,
            bfcl: 0.86,
            ceval: 0.76,
            mmlu: 0.72,
            costPer1MInput: 0,
            costPer1MOutput: 0,
            latencyClass: 'slow-local',
            languageStrengths: ['zh', 'en'],
            suitableTiers: ['quick', 'deep'],
            notes: 'Sweet-spot local.',
        },
        'qwen3:32b': {
            kind: 'ollama',
            displayName: 'Qwen3 32B (local)',
            providerId: 'ollama',
            apiModelId: 'qwen3:32b',
            params: '32B',
            ramRequiredGB: 20,
            bfcl: 0.92,
            ceval: 0.82,
            mmlu: 0.78,
            costPer1MInput: 0,
            costPer1MOutput: 0,
            latencyClass: 'slow-local',
            languageStrengths: ['zh', 'en'],
            suitableTiers: ['deep'],
            notes: 'Strong local.',
        },
        'claude-haiku-4-5': {
            kind: 'anthropic',
            displayName: 'Claude Haiku 4.5',
            providerId: 'anthropic',
            apiModelId: 'claude-haiku-4-5',
            params: null,
            ramRequiredGB: null,
            bfcl: 0.91,
            ceval: 0.74,
            mmlu: 0.78,
            costPer1MInput: 1.0,
            costPer1MOutput: 5.0,
            latencyClass: 'fast-online',
            languageStrengths: ['en', 'zh'],
            suitableTiers: ['quick', 'deep'],
            notes: 'Cheap fast hosted.',
        },
        'claude-sonnet-4-6': {
            kind: 'anthropic',
            displayName: 'Claude Sonnet 4.6',
            providerId: 'anthropic',
            apiModelId: 'claude-sonnet-4-6',
            params: null,
            ramRequiredGB: null,
            bfcl: 0.96,
            ceval: 0.78,
            mmlu: 0.85,
            costPer1MInput: 3.0,
            costPer1MOutput: 15.0,
            latencyClass: 'fast-online',
            languageStrengths: ['en', 'zh'],
            suitableTiers: ['deep', 'premium'],
            notes: 'Premium tier.',
        },
    },
};

function ctx(
    overrides: { ramGB?: number; budget?: 'zero' | 'low' | 'high'; chineseRatio?: number; installed?: string[]; hasAnthropic?: boolean } = {},
): CuratorContext {
    return {
        env: {
            ramGB: overrides.ramGB ?? 32,
            ollamaRunning: true,
            ollamaInstalledModels: overrides.installed ?? [],
            profiles: overrides.hasAnthropic
                ? [{ id: 'p1', kind: 'anthropic', name: 'Anthropic', hasCredentials: true }]
                : [],
            chineseRatio: overrides.chineseRatio ?? 0,
            capturedAt: Date.now(),
            isMobile: false,
        },
        preferences: {
            budget: overrides.budget ?? 'low',
            speedQuality: 'balanced',
        },
    };
}

const VALID_REC: Recommendation = {
    bindings: {
        quick: 'claude-haiku-4-5',
        deep: 'claude-sonnet-4-6',
        premium: 'claude-sonnet-4-6',
    },
    cascadeEnabled: true,
    modelsToDownload: [],
    apiKeysNeeded: ['anthropic'],
    rationale: '基于你的环境推荐 Haiku 做 Quick，Sonnet 做 Deep / Premium。',
};

interface Case {
    name: string;
    run: () => boolean;
}

const cases: Case[] = [];
function test(name: string, run: () => boolean): void {
    cases.push({ name, run });
}

function expect(actual: unknown, expected: unknown, msg: string): boolean {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        console.log(`    ✗ ${msg} — expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
    return ok;
}

function expectTrue(actual: boolean, msg: string): boolean {
    if (!actual) console.log(`    ✗ ${msg}`);
    return actual;
}

// ─── catalog ────────────────────────────────────────────────────

test('catalog hydrate exposes entries by id', () => {
    _resetCatalogForTests();
    hydrateCatalog(FIXTURE_CATALOG);
    return expectTrue(lookupModel('qwen3:14b') !== undefined, 'lookupModel finds qwen3:14b')
        && expectTrue(lookupModel('qwen3:14b')?.params === '14B', 'params field populated')
        && expectTrue(lookupModel('does-not-exist') === undefined, 'missing model returns undefined');
});

test('filterByTier returns only suitable models', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const quick = filterByTier('quick').map((m) => m.id).sort();
    const premium = filterByTier('premium').map((m) => m.id).sort();
    return expect(quick, ['claude-haiku-4-5', 'qwen3:14b'], 'quick tier candidates')
        && expect(premium, ['claude-sonnet-4-6'], 'premium tier candidates');
});

// ─── schema ─────────────────────────────────────────────────────

test('schema accepts a valid recommendation', () => {
    const r = RecommendationSchema.safeParse(VALID_REC);
    return expectTrue(r.success, 'valid rec parses');
});

test('schema rejects missing bindings', () => {
    const bad = { ...VALID_REC, bindings: { quick: '', deep: 'x', premium: 'y' } };
    const r = RecommendationSchema.safeParse(bad);
    return expectTrue(!r.success, 'empty quick binding rejected');
});

test('schema rejects unknown apiKeysNeeded provider', () => {
    const bad = { ...VALID_REC, apiKeysNeeded: ['bogus'] };
    const r = RecommendationSchema.safeParse(bad);
    return expectTrue(!r.success, 'unknown provider rejected');
});

// ─── validation ─────────────────────────────────────────────────

test('validateRecommendation accepts well-formed rec', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const errs = validateRecommendation(VALID_REC, ctx({ hasAnthropic: true }));
    const blocking = hardErrors(errs);
    return expectTrue(blocking.length === 0, `no blocking errors expected; got ${JSON.stringify(blocking)}`);
});

test('validateRecommendation flags unknown model id', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const bad: Recommendation = {
        ...VALID_REC,
        bindings: { ...VALID_REC.bindings, quick: 'unknown-model' },
    };
    const errs = validateRecommendation(bad, ctx());
    return expectTrue(errs.some((e) => e.type === 'unknown_model' && e.tier === 'quick'), 'unknown_model error raised');
});

test('validateRecommendation flags insufficient RAM', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const bad: Recommendation = {
        ...VALID_REC,
        bindings: { quick: 'qwen3:32b', deep: 'qwen3:32b', premium: 'qwen3:32b' },
    };
    const errs = validateRecommendation(bad, ctx({ ramGB: 8 }));
    return expectTrue(errs.filter((e) => e.type === 'insufficient_ram').length === 3, 'RAM error for each tier');
});

test('validateRecommendation flags budget=zero with paid model', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const errs = validateRecommendation(VALID_REC, ctx({ budget: 'zero' }));
    return expectTrue(errs.some((e) => e.type === 'budget_violation'), 'budget violation raised');
});

test('tier_mismatch is advisory not blocking', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const bad: Recommendation = {
        ...VALID_REC,
        bindings: { quick: 'qwen3:32b', deep: 'claude-sonnet-4-6', premium: 'claude-sonnet-4-6' },
    };
    const errs = validateRecommendation(bad, ctx({ hasAnthropic: true }));
    const mismatch = errs.some((e) => e.type === 'tier_mismatch' && e.tier === 'quick');
    const blocking = hardErrors(errs);
    return expectTrue(mismatch, 'tier_mismatch raised for qwen3:32b in quick')
        && expectTrue(blocking.length === 0, 'tier_mismatch alone is not blocking');
});

// ─── fallback ───────────────────────────────────────────────────

test('fallback returns valid recommendation for default user', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const rec = buildFallbackRecommendation(ctx({ hasAnthropic: true, installed: ['qwen3:14b'] }));
    const parsed = RecommendationSchema.safeParse(rec);
    const validErrs = hardErrors(validateRecommendation(rec, ctx({ hasAnthropic: true, installed: ['qwen3:14b'] })));
    return expectTrue(parsed.success, 'fallback rec parses against schema')
        && expectTrue(validErrs.length === 0, `fallback rec has no hard errors; got ${JSON.stringify(validErrs)}`)
        && expectTrue(rec.bindings.quick.length > 0, 'quick binding set')
        && expectTrue(rec.bindings.deep.length > 0, 'deep binding set')
        && expectTrue(rec.bindings.premium.length > 0, 'premium binding set');
});

test('fallback prefers installed local model for quick tier', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const rec = buildFallbackRecommendation(
        ctx({ ramGB: 32, installed: ['qwen3:14b'], hasAnthropic: false, budget: 'zero' }),
    );
    return expectTrue(rec.bindings.quick === 'qwen3:14b', `expected qwen3:14b; got ${rec.bindings.quick}`);
});

test('fallback respects budget=zero (no paid models)', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const rec = buildFallbackRecommendation(ctx({ ramGB: 32, installed: [], budget: 'zero' }));
    const ids = Object.values(rec.bindings);
    const anyPaid = ids.some((id) => {
        const m = lookupModel(id);
        return m && (m.costPer1MInput > 0 || m.costPer1MOutput > 0);
    });
    return expectTrue(!anyPaid, `no paid models expected for budget=zero; got ${JSON.stringify(rec.bindings)}`);
});

test('fallback respects RAM constraint', () => {
    hydrateCatalog(FIXTURE_CATALOG);
    const rec = buildFallbackRecommendation(ctx({ ramGB: 8, installed: ['qwen3:14b'], budget: 'zero' }));
    for (const id of Object.values(rec.bindings)) {
        const m = lookupModel(id);
        if (m?.ramRequiredGB != null && m.ramRequiredGB > 8) return false;
    }
    return true;
});

// ─── run ────────────────────────────────────────────────────────

function runTests(): boolean {
    let passed = 0;
    let failed = 0;
    for (const c of cases) {
        try {
            const ok = c.run();
            if (ok) {
                console.log(`  ✓ ${c.name}`);
                passed++;
            } else {
                console.log(`  ✗ ${c.name}`);
                failed++;
            }
        } catch (e) {
            console.log(`  ✗ ${c.name} — threw: ${(e as Error).message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    return failed === 0;
}

export { runTests };

if (typeof window === 'undefined') {
    const ok = runTests();
    if (!ok) process.exit(1);
}
