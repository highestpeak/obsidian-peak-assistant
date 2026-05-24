/**
 * Rule-based fallback when the LLM curator fails (no network, model errors,
 * exceeds retry budget). Always returns a *valid* recommendation against the
 * loaded catalog — never throws.
 *
 * See spec §8.
 */

import { filterByTier, lookupModel } from './catalog';
import { CAPABILITY_ORDER, type CapabilityBindings, type Capability, type CuratorContext, type Recommendation } from './types';

interface Score {
    id: string;
    score: number;
}

export function buildFallbackRecommendation(ctx: CuratorContext): Recommendation {
    const bindings: Partial<CapabilityBindings> = {};
    const toDownload = new Set<string>();
    const apiKeysNeeded = new Set<string>();

    for (const cap of CAPABILITY_ORDER) {
        const candidate = pickBestForTier(cap, ctx);
        if (!candidate) continue;
        bindings[cap] = candidate.id;
        const entry = lookupModel(candidate.id);
        if (!entry) continue;
        if (entry.kind === 'ollama' && !ctx.env.ollamaInstalledModels.includes(entry.apiModelId)) {
            toDownload.add(entry.apiModelId);
        }
        if (entry.kind !== 'ollama') {
            const hasKey = ctx.env.profiles.some((p) => p.kind === entry.kind && p.hasCredentials);
            if (!hasKey) apiKeysNeeded.add(entry.kind);
        }
    }

    // Defence in depth — every binding must be set. If a tier had no candidate
    // (e.g. budget=zero on a no-ollama box), reuse the closest filled tier.
    fillMissing(bindings);

    return {
        bindings: bindings as CapabilityBindings,
        cascadeEnabled: bindings.quick !== bindings.deep,
        modelsToDownload: Array.from(toDownload),
        apiKeysNeeded: Array.from(apiKeysNeeded) as Recommendation['apiKeysNeeded'],
        rationale: buildRationale(ctx, bindings as CapabilityBindings),
    };
}

function pickBestForTier(cap: Capability, ctx: CuratorContext): Score | null {
    const candidates = filterByTier(cap)
        .filter((m) => {
            if (m.ramRequiredGB != null && m.ramRequiredGB > ctx.env.ramGB) return false;
            if (ctx.preferences.budget === 'zero' && (m.costPer1MInput > 0 || m.costPer1MOutput > 0)) return false;
            return true;
        })
        .map((m): Score => {
            let s = 0;
            // Base capability score.
            s += cap === 'quick' ? m.bfcl * 0.6 + m.ceval * 0.2 + m.mmlu * 0.2 : m.bfcl * 0.4 + m.ceval * 0.3 + m.mmlu * 0.3;
            // Chinese vault bonus.
            if (ctx.env.chineseRatio >= 0.5 && m.languageStrengths.includes('zh')) s += 0.1;
            // Already-installed local model bonus.
            if (m.kind === 'ollama' && ctx.env.ollamaInstalledModels.includes(m.apiModelId)) s += 0.15;
            // Already-configured provider bonus.
            if (m.kind !== 'ollama' && ctx.env.profiles.some((p) => p.kind === m.kind && p.hasCredentials)) s += 0.1;
            // Budget penalty proportional to cost.
            if (ctx.preferences.budget === 'low' && m.costPer1MInput + m.costPer1MOutput > 10) s -= 0.05;
            // Speed preference.
            if (ctx.preferences.speedQuality === 'speed' && m.latencyClass.startsWith('fast')) s += 0.05;
            if (ctx.preferences.speedQuality === 'quality' && cap === 'premium' && m.bfcl >= 0.95) s += 0.05;
            return { id: m.id, score: s };
        });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
}

function fillMissing(bindings: Partial<CapabilityBindings>): void {
    const filled = CAPABILITY_ORDER.find((c) => bindings[c]);
    if (!filled) return; // Nothing to copy from — caller will see empty bindings; validation will surface it.
    for (const cap of CAPABILITY_ORDER) {
        if (!bindings[cap]) bindings[cap] = bindings[filled];
    }
}

function buildRationale(ctx: CuratorContext, bindings: CapabilityBindings): string {
    const ids = new Set(Object.values(bindings));
    const isLocalHeavy = Array.from(ids).every((id) => lookupModel(id)?.kind === 'ollama');
    const zh = ctx.env.chineseRatio >= 0.5;

    const parts: string[] = [];
    parts.push(`基于规则兜底配置（LLM 配置助手不可用）。`);
    if (isLocalHeavy) {
        parts.push(`全部使用本地模型，离线可用，零成本。`);
    } else if (ctx.preferences.budget === 'zero') {
        parts.push(`预算为 0，优先本地模型。`);
    } else {
        parts.push(`按你的预算和已配 provider 综合选择。`);
    }
    if (zh) parts.push(`检测到 vault 中文为主，已偏向中文表现更好的模型。`);
    parts.push(`稍后可在 Settings 中调整或重跑配置助手。`);
    return parts.join(' ');
}
