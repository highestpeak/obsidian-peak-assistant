/**
 * Shared provider configuration components used by HarnessOnboardingModal
 * (the capability-binding wizard, which is the only onboarding surface
 * post-T11F).
 */

import React, { useEffect, useState } from 'react';
import { Notice } from 'obsidian';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { inspectProviderConnection, type ConnectionEvidence } from '@/core/providers/testProviderConnection';
import { uiHttpClient } from '@/ui/util/uiHttpClient';
import { Button } from '@/ui/components/primitives';
import { ProviderIcon } from '@/ui/view/settings/components/ProviderIcon';
import {
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
    keyUrl: string | null;
    keyUrlLabel: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
    { kind: 'openai', label: 'OpenAI', desc: 'GPT models', keyUrl: 'https://platform.openai.com/api-keys', keyUrlLabel: 'Get API Key' },
    { kind: 'anthropic', label: 'Anthropic', desc: 'Claude models', keyUrl: 'https://console.anthropic.com/settings/keys', keyUrlLabel: 'Get API Key' },
    { kind: 'openrouter', label: 'OpenRouter', desc: 'Many model providers', keyUrl: 'https://openrouter.ai/keys', keyUrlLabel: 'Get API Key' },
    { kind: 'ollama', label: 'Ollama', desc: 'Models on this computer', keyUrl: 'https://ollama.com/', keyUrlLabel: 'Documentation' },
	{ kind: 'codex', label: 'Codex', desc: 'Peak execution gateway', keyUrl: null, keyUrlLabel: '' },
	{ kind: 'claude-code', label: 'Claude Code', desc: 'Peak execution gateway', keyUrl: null, keyUrlLabel: '' },
	{ kind: 'google', label: 'Google AI', desc: 'Gemini models', keyUrl: 'https://aistudio.google.com/apikey', keyUrlLabel: 'Get API Key' },
    { kind: 'perplexity', label: 'Perplexity', desc: 'Search-first models', keyUrl: 'https://www.perplexity.ai/settings/api', keyUrlLabel: 'Get API Key' },
    { kind: 'litellm', label: 'LiteLLM', desc: 'Self-hosted gateway', keyUrl: 'https://docs.litellm.ai/docs/', keyUrlLabel: 'Documentation' },
    { kind: 'custom', label: 'Custom', desc: 'OpenAI-compatible API', keyUrl: null, keyUrlLabel: '' },
];

export interface AddProviderFormProps {
    /** Called after a new profile is added. */
    onAdded: (profileId: string, evidence: ConnectionEvidence) => void;
    /** Called when the user cancels (closes the form without adding). */
    onCancel?: () => void;
    /** When true, the new profile is set as active agent profile if no active one exists. */
    setActiveOnFirst?: boolean;
    /** When true, auto-assign web search role for capable providers. */
    autoAssignWebSearch?: boolean;
	/** Limit the first-use chooser without removing additional providers from Settings. */
	allowedKinds?: ProfileKind[];
}

/** Inline form for adding a single provider profile. */
export function AddProviderForm({
    onAdded,
    onCancel,
    setActiveOnFirst = true,
    autoAssignWebSearch = true,
	allowedKinds,
}: AddProviderFormProps) {
    const [selectedKind, setSelectedKind] = useState<ProfileKind>('openai');
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<ConnectionEvidence | null>(null);

	const visibleOptions = allowedKinds
		? PROVIDER_OPTIONS.filter((option) => allowedKinds.includes(option.kind))
		: PROVIDER_OPTIONS;
	const effectiveKind = visibleOptions.some((option) => option.kind === selectedKind)
		? selectedKind
		: visibleOptions[0]?.kind ?? 'openai';
    const selectedOption = PROVIDER_OPTIONS.find((p) => p.kind === effectiveKind)!;
    const requiresKey = !['ollama', 'custom', 'litellm', 'codex', 'claude-code'].includes(effectiveKind);
    const preset = createPresetProfile(effectiveKind);
    const effectiveBaseUrl = baseUrl || preset.baseUrl;

	useEffect(() => {
		setBaseUrl(createPresetProfile(effectiveKind).baseUrl);
		setApiKey('');
		setTestResult(null);
	}, [effectiveKind]);

    async function handleTest() {
        setTesting(true);
        setTestResult(null);
        try {
            const profile = createPresetProfile(effectiveKind, { apiKey: apiKey || null, baseUrl: effectiveBaseUrl });
            setTestResult(await inspectProviderConnection(uiHttpClient, profile));
        } finally {
            setTesting(false);
        }
    }

    function handleSave() {
        if (!testResult?.ready) return;
        const registry = ProfileRegistry.getInstance();
        const profile = createPresetProfile(effectiveKind, { apiKey: apiKey || null, baseUrl: effectiveBaseUrl });
        registry.addProfile(profile);
        if (setActiveOnFirst && !registry.getActiveAgentProfile()) {
            registry.setActiveAgentProfile(profile.id);
        }
        if (
            autoAssignWebSearch
            && !registry.getActiveWebSearchProfile()
            && (effectiveKind === 'perplexity' || effectiveKind === 'openrouter' || effectiveKind === 'google')
        ) {
            registry.setActiveWebSearchProfile(profile.id);
        }
        new Notice(`Profile "${profile.name}" added`);
        setApiKey('');
        setTestResult(null);
        onAdded(profile.id, { ...testResult, profileId: profile.id });
    }

    return (
        <div className="pk-onboarding-provider-form">
            {/* Provider kind selector */}
            <div className="pk-onboarding-provider-kinds" role="radiogroup" aria-label="AI service">
                {visibleOptions.map(({ kind, label, desc }) => (
                    <Button
                        key={kind}
                        type="button"
                        variant="ghost"
                        role="radio"
                        aria-checked={effectiveKind === kind}
                        onClick={() => { setSelectedKind(kind); setTestResult(null); }}
                        className="pk-onboarding-provider-kind"
                    >
                        <ProviderIcon kind={kind} size={32} />
                        <span><strong>{label}</strong><small>{desc}</small></span>
                        {effectiveKind === kind ? <Check size={16} /> : null}
                    </Button>
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
                <Button variant="secondary" size="sm" onClick={() => void handleTest()} disabled={(requiresKey && !apiKey.trim()) || !effectiveBaseUrl || testing} className="pktw-gap-1.5">
                    {testing ? <Loader2 size={14} className="pktw-animate-spin" /> : null}
                    Test
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!testResult?.ready}>
                    Add
                </Button>
            </div>

            <label className="pktw-flex pktw-flex-col pktw-gap-1">
				<span className="pktw-text-xs pktw-text-[--text-muted]">Base URL</span>
				<input
					type="url"
					value={effectiveBaseUrl}
					onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null); }}
					className="pktw-w-full pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-bg-[--background-primary] pktw-text-[--text-normal]"
				/>
			</label>

            {/* Test result */}
            {testResult?.ready && (
                <span className="pktw-text-xs pktw-text-pk-success pktw-flex pktw-items-center pktw-gap-1">
                    <Check size={12} /> Connection successful
                </span>
            )}
            {testResult && !testResult.ready && (
                <span className="pktw-text-xs pktw-text-pk-error pktw-flex pktw-items-center pktw-gap-1">
                    <X size={12} /> {testResult.catalog.message || testResult.authentication.message}
                </span>
            )}
			{onCancel && <Button variant="ghost" className="pk-onboarding-provider-cancel" onClick={onCancel}>Back to saved connections</Button>}
        </div>
    );
}

export interface SavedProfileRowProps {
    profile: Profile;
    onDelete?: () => void;
    onChange: () => void;
	onSelect?: () => void;
	selected?: boolean;
	status?: 'idle' | 'checking' | 'ready' | 'error';
	onEvidence?: (evidence: ConnectionEvidence) => void;
}

/** Expandable row for an already-saved profile — click to edit. */
export function SavedProfileRow({ profile, onDelete, onChange, onSelect, selected = false, status = 'idle', onEvidence }: SavedProfileRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [apiKey, setApiKey] = useState(profile.apiKey ?? '');
	const [baseUrl, setBaseUrl] = useState(profile.baseUrl);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<ConnectionEvidence | null>(null);

    const option = PROVIDER_OPTIONS.find((p) => p.kind === profile.kind);
    const isActive = ProfileRegistry.getInstance().getActiveAgentProfile()?.id === profile.id;

    function handleSave() {
        if (!testResult?.ready) return;
        ProfileRegistry.getInstance().updateProfile(profile.id, { apiKey: apiKey || null, baseUrl });
        new Notice('Profile updated');
        setExpanded(false);
		onEvidence?.({ ...testResult, profileId: profile.id });
        onChange();
    }

    function cancelEdit() {
        setApiKey(profile.apiKey ?? '');
        setBaseUrl(profile.baseUrl);
        setTestResult(null);
        setExpanded(false);
    }

    async function handleTest() {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await inspectProviderConnection(uiHttpClient, { ...profile, apiKey: apiKey || null, baseUrl });
            setTestResult(result);
        } finally {
            setTesting(false);
        }
    }

    function handleSetActive() {
        ProfileRegistry.getInstance().setActiveAgentProfile(profile.id);
        onChange();
    }

    return (
        <div className="pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-overflow-hidden">
            {/* Header row — click to expand */}
            <div
				data-selected={selected ? 'true' : 'false'}
                className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-[--background-modifier-hover] pktw-transition-colors"
            >
				<Button
					variant="ghost"
					className="pk-onboarding-provider-select"
					onClick={() => {
						onSelect?.();
						setExpanded(true);
					}}
					aria-pressed={selected}
				>
                <ProviderIcon kind={profile.kind} size={32} />
                <span className="pktw-flex-1 pktw-text-sm pktw-text-[--text-normal] pktw-truncate">{profile.name}</span>
				<span className="pk-onboarding-provider-state" data-state={status}>{status === 'checking' ? 'Checking' : status === 'ready' ? 'Ready' : status === 'error' ? 'Needs attention' : isActive ? 'Default' : 'Not tested'}</span>
				</Button>
				<Button variant="ghost" className="pk-onboarding-provider-edit" aria-label={expanded ? `Cancel editing ${profile.name}` : `Edit ${profile.name}`} onClick={() => expanded ? cancelEdit() : setExpanded(true)}><ChevronRight size={16} className={cn('pktw-transition-transform', expanded && 'pktw-rotate-90')} /></Button>
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
                        <Button variant="secondary" size="sm" onClick={() => void handleTest()} disabled={testing} className="pktw-gap-1">
                            {testing ? <Loader2 size={12} className="pktw-animate-spin" /> : null}
                            Test
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={!testResult?.ready}>Save</Button>
                    </div>
                    <input type="url" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null); }} className="pktw-w-full pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-bg-[--background-primary]" />
                    {testResult?.ready && (
                        <span className="pktw-text-xs pktw-text-pk-success pktw-flex pktw-items-center pktw-gap-1"><Check size={12} /> OK</span>
                    )}
                    {testResult && !testResult.ready && (
                        <span className="pktw-text-xs pktw-text-pk-error pktw-flex pktw-items-center pktw-gap-1"><X size={12} /> {testResult.catalog.message}</span>
                    )}
                    <div className="pktw-flex pktw-gap-2 pktw-pt-1">
						<Button variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Button>
                        {!isActive && (
                            <Button variant="ghost" size="sm" onClick={handleSetActive} className="pktw-text-xs">Set Active</Button>
                        )}
                        {onDelete && <Button variant="ghost" size="sm" onClick={onDelete} className="pktw-text-xs pktw-text-pk-error hover:pktw-text-pk-error-text pktw-gap-1">
                            <Trash2 size={12} /> Delete
						</Button>}
                    </div>
                </div>
            )}
        </div>
    );
}
