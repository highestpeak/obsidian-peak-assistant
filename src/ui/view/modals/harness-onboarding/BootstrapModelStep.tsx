/**
 * Bootstrap model picker — substep of the ai-behavior primary step.
 *
 * Layout (mocked):
 *   - Section title + desc
 *   - List of pkonb-radio-card items, "Recommended" chip on the auto-pick
 *   - Loading spinner / empty hint
 *
 * For Ollama, models come from the live `/api/tags` endpoint rather than the
 * bundled catalog, since users install their own.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Cpu, Check } from 'lucide-react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { modelRegistry } from '@/core/providers/model-registry';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
import { fetchLMStudioModels } from '@/core/providers/lmstudio/fetchLMStudioModels';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { Chip } from '@/ui/components/primitives';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

const PROVIDER_CATALOG: Partial<Record<ProfileKind, string>> = {
    anthropic: 'claude',
    openai: 'openai',
    google: 'gemini',
    perplexity: 'perplexity',
    openrouter: 'openrouter',
};

const RECOMMENDED_BY_KIND: Partial<Record<ProfileKind, RegExp>> = {
    anthropic: /haiku/i,
    openai: /^gpt-[45]-mini$|^o4-mini$|^gpt-5-mini$/i,
    google: /flash/i,
    perplexity: /sonar$/i,
    openrouter: /haiku|mini|flash|3\.5|free/i,
};

const OLLAMA_PREFERRED_RE = /^(qwen3|qwen2\.5|llama3\.[123]|gpt-oss|deepseek-r1|gemma3)/i;
const OLLAMA_RECOMMENDED_RE = /^qwen3:?(4b|7b|8b|14b)/i;

export interface BootstrapModelStepProps {
    profileId: string | null;
    selectedModelId: string | null;
    onSelect: (profileId: string, modelId: string) => void;
    onBack: () => void;
    onContinue: () => void;
}

interface ModelOption {
    id: string;
    displayName: string;
    recommended: boolean;
    hint?: string;
}

export function BootstrapModelStep({
    profileId,
    selectedModelId,
    onSelect,
}: BootstrapModelStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.bootstrap;
    const profile = useMemo(
        () => (profileId ? ProfileRegistry.getInstance().getProfileById(profileId) : null),
        [profileId],
    );

    const [models, setModels] = useState<ModelOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!profile) {
            setModels([]);
            return;
        }
        let cancelled = false;
        async function load(p: Profile) {
            setLoading(true);
            setError(null);
            try {
                const opts = await loadModelsForProfile(p);
                if (!cancelled) setModels(opts);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                    setModels([]);
                }
            }
            if (!cancelled) setLoading(false);
        }
        void load(profile);
        return () => {
            cancelled = true;
        };
    }, [profile]);

    useEffect(() => {
        if (!profile || selectedModelId || models.length === 0) return;
        const rec = models.find((m) => m.recommended) ?? models[0];
        if (rec) onSelect(profile.id, rec.id);
    }, [models, profile, selectedModelId, onSelect]);

    return (
        <div className="pkonb-section">
            <div>
                <div className="pkonb-section__title">{copy.title}</div>
                <div className="pkonb-section__desc">{copy.description}</div>
            </div>

            {!profile && (
                <div className="pkonb-hint">
                    <span>{copy.missingProviderHint}</span>
                </div>
            )}

            {profile && loading && (
                <div className="pkonb-hint">
                    <span className="pkonb-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    <span>{copy.loadingModels}</span>
                </div>
            )}

            {profile && !loading && error && (
                <div className="pkonb-hint pkonb-hint--danger">
                    <span>{error}</span>
                </div>
            )}

            {profile && !loading && !error && models.length === 0 && (
                <div className="pkonb-hint">
                    <span>
                        {profile.kind === 'ollama' ? copy.noLocalModelsHint : copy.noCatalogModelsHint}
                    </span>
                </div>
            )}

            {profile && !loading && models.length > 0 && (
                <div className="pkonb-radio-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {models.map((m) => (
                        <ModelCard
                            key={m.id}
                            option={m}
                            selected={selectedModelId === m.id}
                            onClick={() => onSelect(profile.id, m.id)}
                            strings={strings}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ModelCard({
    option,
    selected,
    onClick,
    strings,
}: {
    option: ModelOption;
    selected: boolean;
    onClick: () => void;
    strings: OnboardingStrings;
}) {
    const showHint = !!option.hint;
    return (
        <button
            type="button"
            className="pkonb-radio-card"
            data-selected={selected ? 'true' : undefined}
            onClick={onClick}
        >
            <span className="pkonb-radio-card__icon">
                <Cpu />
            </span>
            <span className="pkonb-radio-card__body">
                <span className="pkonb-radio-card__title-row">
                    <span className="pkonb-radio-card__title" style={{ fontFamily: 'var(--pk-font-mono)' }}>
                        {option.displayName}
                    </span>
                    {option.recommended && (
                        <Chip variant="accent">
                            <Sparkles />
                            <span>{strings.steps.bootstrap.recommendedChip}</span>
                        </Chip>
                    )}
                </span>
                {showHint && (
                    <span className="pkonb-radio-card__hint">{option.hint}</span>
                )}
            </span>
            <span className="pkonb-radio-card__check">
                <Check />
            </span>
        </button>
    );
}

async function loadModelsForProfile(profile: Profile): Promise<ModelOption[]> {
    if (profile.kind === 'ollama') {
        const installed = await fetchOllamaModels(profile.baseUrl || 'http://localhost:11434');
        return installed
            .filter((name) => OLLAMA_PREFERRED_RE.test(name))
            .sort((a, b) => sizeRank(a) - sizeRank(b))
            .map(
                (name): ModelOption => ({
                    id: name,
                    displayName: name,
                    recommended: OLLAMA_RECOMMENDED_RE.test(name),
                }),
            );
    }

    if (profile.kind === 'lmstudio') {
        const loaded = await fetchLMStudioModels(profile.baseUrl || 'http://127.0.0.1:1234/v1');
        return loaded.map((id) => ({ id, displayName: id, recommended: false }));
    }

	const catalogId = profileModelCatalogId(profile) ?? PROVIDER_CATALOG[profile.kind];
    if (!catalogId) {
        const candidates = [profile.fastModel, profile.primaryModel].filter((m) => !!m);
        return [...new Set(candidates)].map((id) => ({ id, displayName: id, recommended: false }));
    }
    const meta = modelRegistry.getModelsForProvider(catalogId);
    const recRe = RECOMMENDED_BY_KIND[profile.kind];
    return meta
        .filter((m) => (m.modelType ?? 'llm') === 'llm')
        .map(
            (m): ModelOption => ({
                id: m.id,
                displayName: m.displayName || m.id,
                recommended: recRe ? recRe.test(m.id) : false,
                hint: m.costInput && m.costInput !== '0' ? `$${m.costInput}/1M` : undefined,
            }),
        );
}

function sizeRank(name: string): number {
    const m = name.match(/(\d+(?:\.\d+)?)b/i);
    if (!m) return 9999;
    return parseFloat(m[1]);
}
