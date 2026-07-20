/**
 * Shared provider configuration components used by HarnessOnboardingModal
 * (the capability-binding wizard, which is the only onboarding surface
 * post-T11F).
 */

import React, { useState, useCallback } from 'react';
import { Notice } from 'obsidian';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import type { ProfileKind } from '@/core/profiles/types';
import { testProviderConnection } from '@/core/providers/testProviderConnection';
import { uiHttpClient } from '@/ui/util/uiHttpClient';
import { Button } from '@/ui/component/shared-ui/button';
import {
    Shield,
    Globe,
    Zap,
    Settings2,
    Check,
    Loader2,
    X,
    ChevronRight,
    ExternalLink,
    Trash2,
} from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

export interface ProviderOption {
    kind: ProfileKind;
    label: string;
    desc: string;
    Icon: React.FC<{ className?: string; size?: number }>;
    keyUrl: string | null;
    keyUrlLabel: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
    { kind: 'anthropic', label: 'Anthropic', desc: 'Direct API access', Icon: Shield, keyUrl: 'https://console.anthropic.com/settings/keys', keyUrlLabel: 'Get API Key' },
    { kind: 'openai', label: 'OpenAI', desc: 'GPT models', Icon: Zap, keyUrl: 'https://platform.openai.com/api-keys', keyUrlLabel: 'Get API Key' },
    { kind: 'google', label: 'Google AI', desc: 'Gemini + web grounding', Icon: Globe, keyUrl: 'https://aistudio.google.com/apikey', keyUrlLabel: 'Get API Key' },
    { kind: 'openrouter', label: 'OpenRouter', desc: 'Multi-provider + web search', Icon: Globe, keyUrl: 'https://openrouter.ai/keys', keyUrlLabel: 'Get API Key' },
    { kind: 'ollama', label: 'Ollama', desc: 'Local models', Icon: Settings2, keyUrl: 'https://ollama.com/', keyUrlLabel: 'Documentation' },
    { kind: 'perplexity', label: 'Perplexity', desc: 'Search-augmented AI', Icon: Globe, keyUrl: 'https://www.perplexity.ai/settings/api', keyUrlLabel: 'Get API Key' },
    { kind: 'litellm', label: 'LiteLLM', desc: 'Self-hosted proxy', Icon: Zap, keyUrl: 'https://docs.litellm.ai/docs/', keyUrlLabel: 'Documentation' },
    { kind: 'custom', label: 'Custom', desc: 'OpenAI-compatible endpoint', Icon: Settings2, keyUrl: null, keyUrlLabel: '' },
];

export interface AddProviderFormProps {
    /** Called after a new profile is added. */
    onAdded: (profileId: string) => void;
    /** Called when the user cancels (closes the form without adding). */
    onCancel?: () => void;
    /** When true, the new profile is set as active agent profile if no active one exists. */
    setActiveOnFirst?: boolean;
    /** When true, auto-assign web search role for capable providers. */
    autoAssignWebSearch?: boolean;
}

/** Inline form for adding a single provider profile. */
export function AddProviderForm({
    onAdded,
    onCancel: _onCancel,
    setActiveOnFirst = true,
    autoAssignWebSearch = true,
}: AddProviderFormProps) {
    const [selectedKind, setSelectedKind] = useState<ProfileKind>('anthropic');
    const [apiKey, setApiKey] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

    const selectedOption = PROVIDER_OPTIONS.find((p) => p.kind === selectedKind)!;
    const requiresKey = selectedKind !== 'ollama' && selectedKind !== 'custom' && selectedKind !== 'litellm';

    const handleTest = useCallback(async () => {
        setTesting(true);
        setTestResult(null);
        const ok = await testProviderConnection(uiHttpClient, selectedKind, apiKey);
        setTestResult(ok ? 'success' : 'fail');
        setTesting(false);
    }, [apiKey, selectedKind]);

    const handleSave = useCallback(() => {
        if (requiresKey && !apiKey.trim()) return;
        const registry = ProfileRegistry.getInstance();
        const profile = createPresetProfile(selectedKind, { apiKey });
        registry.addProfile(profile);
        if (setActiveOnFirst && !registry.getActiveAgentProfile()) {
            registry.setActiveAgentProfile(profile.id);
        }
        if (
            autoAssignWebSearch
            && !registry.getActiveWebSearchProfile()
            && (selectedKind === 'perplexity' || selectedKind === 'openrouter' || selectedKind === 'google')
        ) {
            registry.setActiveWebSearchProfile(profile.id);
        }
        new Notice(`Profile "${profile.name}" added`);
        setApiKey('');
        setTestResult(null);
        onAdded(profile.id);
    }, [apiKey, selectedKind, onAdded, setActiveOnFirst, autoAssignWebSearch, requiresKey]);

    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-[--background-modifier-border] pktw-bg-[--background-primary-alt]">
            {/* Provider kind selector */}
            <div className="pktw-grid pktw-grid-cols-2 pktw-gap-1.5">
                {PROVIDER_OPTIONS.map(({ kind, label, Icon }) => (
                    <div
                        key={kind}
                        onClick={() => { setSelectedKind(kind); setTestResult(null); }}
                        className={cn(
                            'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors pktw-text-sm',
                            selectedKind === kind
                                ? 'pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent]'
                                : 'pktw-text-[--text-normal] hover:pktw-bg-[--background-modifier-hover]',
                        )}
                    >
                        <Icon size={14} className="pktw-shrink-0" />
                        {label}
                    </div>
                ))}
            </div>

            {/* Platform link */}
            {selectedOption.keyUrl && (
                <a
                    href={selectedOption.keyUrl}
                    className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-text-[--text-accent] hover:pktw-underline pktw-w-fit"
                >
                    <ExternalLink size={11} />
                    {selectedOption.keyUrlLabel} — {selectedOption.label}
                </a>
            )}

            {/* API Key input */}
            <div className="pktw-flex pktw-gap-2">
                <input
                    type="password"
                    placeholder={requiresKey ? 'sk-...' : '(no key required)'}
                    value={apiKey}
                    disabled={!requiresKey}
                    onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                    className="pktw-flex-1 pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent] disabled:pktw-opacity-50"
                />
                <Button variant="ghost" size="sm" onClick={handleTest} disabled={(requiresKey && !apiKey.trim()) || testing} className="pktw-gap-1.5">
                    {testing ? <Loader2 size={14} className="pktw-animate-spin" /> : null}
                    Test
                </Button>
                <Button size="sm" onClick={handleSave} disabled={requiresKey && !apiKey.trim()}>
                    Add
                </Button>
            </div>

            {/* Test result */}
            {testResult === 'success' && (
                <span className="pktw-text-xs pktw-text-pk-success pktw-flex pktw-items-center pktw-gap-1">
                    <Check size={12} /> Connection successful
                </span>
            )}
            {testResult === 'fail' && (
                <span className="pktw-text-xs pktw-text-pk-error pktw-flex pktw-items-center pktw-gap-1">
                    <X size={12} /> Connection failed — check key and try again
                </span>
            )}
        </div>
    );
}

export interface SavedProfileRowProps {
    profile: { id: string; name: string; kind: ProfileKind; apiKey: string | null; baseUrl: string };
    onDelete: () => void;
    onChange: () => void;
}

/** Expandable row for an already-saved profile — click to edit. */
export function SavedProfileRow({ profile, onDelete, onChange }: SavedProfileRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [apiKey, setApiKey] = useState(profile.apiKey ?? '');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

    const option = PROVIDER_OPTIONS.find((p) => p.kind === profile.kind);
    const Icon = option?.Icon ?? Settings2;
    const isActive = ProfileRegistry.getInstance().getActiveAgentProfile()?.id === profile.id;

    const handleSave = useCallback(() => {
        ProfileRegistry.getInstance().updateProfile(profile.id, { apiKey: apiKey || null });
        new Notice('Profile updated');
        setExpanded(false);
        onChange();
    }, [apiKey, profile.id, onChange]);

    const handleTest = useCallback(async () => {
        if (!apiKey.trim()) return;
        setTesting(true);
        setTestResult(null);
        const ok = await testProviderConnection(uiHttpClient, profile.kind, apiKey);
        setTestResult(ok ? 'success' : 'fail');
        setTesting(false);
    }, [apiKey, profile.kind]);

    const handleSetActive = useCallback(() => {
        ProfileRegistry.getInstance().setActiveAgentProfile(profile.id);
        onChange();
    }, [profile.id, onChange]);

    return (
        <div className="pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-overflow-hidden">
            {/* Header row — click to expand */}
            <div
                onClick={() => setExpanded(!expanded)}
                className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-[--background-modifier-hover] pktw-transition-colors"
            >
                <Icon size={14} className="pktw-text-[--text-muted] pktw-shrink-0" />
                <span className="pktw-flex-1 pktw-text-sm pktw-text-[--text-normal] pktw-truncate">{profile.name}</span>
                {isActive && (
                    <span className="pktw-text-pk-xs pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-pk-success-bg pktw-text-pk-success-text">active</span>
                )}
                <ChevronRight size={13} className={cn('pktw-text-[--text-muted] pktw-transition-transform', expanded && 'pktw-rotate-90')} />
            </div>

            {/* Expanded edit form */}
            {expanded && (
                <div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-px-3 pktw-pb-3 pktw-pt-1 pktw-border-t pktw-border-[--background-modifier-border]">
                    {option?.keyUrl && (
                        <a href={option.keyUrl} className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-text-[--text-accent] hover:pktw-underline pktw-w-fit">
                            <ExternalLink size={11} />
                            {option.keyUrlLabel}
                        </a>
                    )}
                    <div className="pktw-flex pktw-gap-2">
                        <input
                            type="password"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                            className="pktw-flex-1 pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
                        />
                        <Button variant="ghost" size="sm" onClick={handleTest} disabled={!apiKey.trim() || testing} className="pktw-gap-1">
                            {testing ? <Loader2 size={12} className="pktw-animate-spin" /> : null}
                            Test
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={!apiKey.trim()}>Save</Button>
                    </div>
                    {testResult === 'success' && (
                        <span className="pktw-text-xs pktw-text-pk-success pktw-flex pktw-items-center pktw-gap-1"><Check size={12} /> OK</span>
                    )}
                    {testResult === 'fail' && (
                        <span className="pktw-text-xs pktw-text-pk-error pktw-flex pktw-items-center pktw-gap-1"><X size={12} /> Failed</span>
                    )}
                    <div className="pktw-flex pktw-gap-2 pktw-pt-1">
                        {!isActive && (
                            <Button variant="ghost" size="sm" onClick={handleSetActive} className="pktw-text-xs">Set Active</Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={onDelete} className="pktw-text-xs pktw-text-pk-error hover:pktw-text-pk-error-text pktw-gap-1">
                            <Trash2 size={12} /> Delete
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
