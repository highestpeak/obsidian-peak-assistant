/**
 * Bootstrap model picker — Step 3 of the Harness Onboarding wizard.
 *
 * The user picks ONE model from their selected provider to power the Curator
 * agent (PR3). We mark a "recommended" model per provider — typically the
 * cheapest viable one — so the user can click through quickly.
 *
 * For Ollama, models come from the live `/api/tags` endpoint rather than the
 * bundled catalog, since users install their own.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { modelRegistry } from '@/core/providers/model-registry';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
import { cn } from '@/ui/react/lib/utils';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

const PROVIDER_CATALOG: Partial<Record<ProfileKind, string>> = {
    anthropic: 'claude',
    openai: 'openai',
    google: 'gemini',
    perplexity: 'perplexity',
    openrouter: 'openrouter',
};

/** Provider-specific recommended starter models (cheapest viable for tool-calling JSON). */
const RECOMMENDED_BY_KIND: Partial<Record<ProfileKind, RegExp>> = {
    anthropic: /haiku/i,
    openai: /^gpt-[45]-mini$|^o4-mini$|^gpt-5-mini$/i,
    google: /flash/i,
    perplexity: /sonar$/i,
    openrouter: /haiku|mini|flash|3\.5|free/i,
};

/** Ollama models with strong tool-calling that work as a bootstrap LLM. */
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
    onBack,
    onContinue,
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

    // Auto-pick the recommended model when nothing is selected yet.
    useEffect(() => {
        if (!profile || selectedModelId || models.length === 0) return;
        const rec = models.find((m) => m.recommended) ?? models[0];
        if (rec) onSelect(profile.id, rec.id);
    }, [models, profile, selectedModelId, onSelect]);

    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    {copy.title}
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    {copy.description}
                </span>
            </div>

            {!profile && (
                <span className="pktw-text-sm pktw-text-[--text-muted]">
                    {copy.missingProviderHint}
                </span>
            )}

            {profile && loading && (
                <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-sm pktw-text-[--text-muted] pktw-py-4">
                    <Loader2 size={14} className="pktw-animate-spin" /> {copy.loadingModels}
                </div>
            )}

            {profile && !loading && error && (
                <div className="pktw-text-sm pktw-text-red-500 pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded-md pktw-px-3 pktw-py-2">
                    {error}
                </div>
            )}

            {profile && !loading && !error && models.length === 0 && (
                <div className="pktw-text-sm pktw-text-[--text-muted] pktw-bg-[--background-primary-alt] pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-px-3 pktw-py-3">
                    {profile.kind === 'ollama' ? copy.noLocalModelsHint : copy.noCatalogModelsHint}
                </div>
            )}

            {profile && !loading && models.length > 0 && (
                <div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-max-h-72 pktw-overflow-y-auto">
                    {models.map((m) => (
                        <ModelRow
                            key={m.id}
                            option={m}
                            selected={selectedModelId === m.id}
                            onClick={() => onSelect(profile.id, m.id)}
                            strings={strings}
                        />
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
                    <ChevronLeft size={14} /> {strings.actions.back}
                </Button>
                <Button
                    size="sm"
                    onClick={onContinue}
                    disabled={!selectedModelId}
                    className="pktw-gap-1"
                >
                    <Wand2 size={14} /> {strings.actions.runCurator} <ChevronRight size={14} />
                </Button>
            </div>
        </div>
    );
}

function ModelRow({
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
    return (
        <div
            onClick={onClick}
            className={cn(
                'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-rounded-md pktw-border pktw-cursor-pointer pktw-transition-colors',
                selected
                    ? 'pktw-border-[--interactive-accent] pktw-bg-[--interactive-accent]/10'
                    : 'pktw-border-[--background-modifier-border] hover:pktw-bg-[--background-modifier-hover]',
            )}
        >
            <span className="pktw-flex-1 pktw-text-sm pktw-text-[--text-normal] pktw-font-mono">
                {option.displayName}
            </span>
            {option.recommended && (
                <span className="pktw-text-[10px] pktw-flex pktw-items-center pktw-gap-1 pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[--interactive-accent]/15 pktw-text-[--interactive-accent]">
                    <Sparkles size={10} /> {strings.steps.bootstrap.recommendedChip}
                </span>
            )}
            {option.hint && (
                <span className="pktw-text-[10px] pktw-text-[--text-muted]">{option.hint}</span>
            )}
        </div>
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

    const catalogId = PROVIDER_CATALOG[profile.kind];
    if (!catalogId) {
        // litellm / custom — surface profile-level defaults if any.
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

/**
 * Order Ollama models smallest-first so the recommended (small) ones float to
 * the top. Falls back to alphabetical when the size can't be parsed.
 */
function sizeRank(name: string): number {
    const m = name.match(/(\d+(?:\.\d+)?)b/i);
    if (!m) return 9999;
    return parseFloat(m[1]);
}
