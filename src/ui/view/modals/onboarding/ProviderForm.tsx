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
    Server,
    Trash2,
} from 'lucide-react';

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
	/** Start directly at a selected provider's connection form. */
	initialKind?: ProfileKind;
}

/** Inline form for adding a single provider profile. */
export function AddProviderForm({
    onAdded,
    onCancel,
	setActiveOnFirst = true,
	autoAssignWebSearch = true,
	allowedKinds,
	initialKind,
}: AddProviderFormProps) {
    const [selectedKind, setSelectedKind] = useState<ProfileKind>(initialKind ?? 'openai');
	const [choosingProvider, setChoosingProvider] = useState(!initialKind);
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

    async function handleTestAndUse() {
        setTesting(true);
        setTestResult(null);
        try {
            const profile = createPresetProfile(effectiveKind, { apiKey: apiKey || null, baseUrl: effectiveBaseUrl });
            const result = await inspectProviderConnection(uiHttpClient, profile);
            setTestResult(result);
            if (!result.ready) return;
            addVerifiedProfile(result);
        } finally {
            setTesting(false);
        }
    }

    function addVerifiedProfile(testResult: ConnectionEvidence) {
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

    if (choosingProvider) {
		return (
			<div className="pk-onboarding-provider-chooser">
				<div className="pk-onboarding-provider-kinds" role="radiogroup" aria-label="Choose an AI service">
                {visibleOptions.map(({ kind, label, desc }) => (
                    <Button
                        key={kind}
                        type="button"
                        variant="ghost"
                        role="radio"
                        aria-checked={effectiveKind === kind}
                        onClick={() => { setSelectedKind(kind); setTestResult(null); setChoosingProvider(false); }}
                        className="pk-onboarding-provider-kind"
                    >
                        <span className="pk-onboarding-provider-monogram">{providerMonogram(kind)}</span>
                        <span><strong>{label}</strong><small>{desc}</small></span>
                        {effectiveKind === kind ? <Check size={16} /> : null}
                    </Button>
                ))}
				</div>
				{onCancel ? <Button variant="ghost" className="pk-onboarding-provider-cancel" onClick={onCancel}>Back to saved connections</Button> : null}
			</div>
		);
    }

    return (
        <section className="pk-onboarding-connection-card">
			<header className="pk-onboarding-connection-card__header">
				<Button variant="ghost" className="pk-onboarding-connection-back" onClick={() => setChoosingProvider(true)}>‹ Back</Button>
                <span className="pk-onboarding-provider-monogram">{providerMonogram(effectiveKind)}</span>
				<span><strong>Connect {selectedOption.label}</strong><small>{requiresKey ? 'Paste a key, then run the same safe connection check.' : 'Peak will verify this local or authenticated connection.'}</small></span>
			</header>

            {requiresKey ? <label className="pk-onboarding-connection-field">
				<span>API key</span>
                <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                />
			</label> : <div className="pk-onboarding-connection-local-note">
				<Server size={18} />
				<span><strong>{selectedOption.label} connection</strong><small>No API key is required. Peak will verify the local or authenticated adapter.</small></span>
			</div>}

			{(effectiveKind === 'custom' || effectiveKind === 'litellm') ? <label className="pk-onboarding-connection-field">
				<span>Base URL</span>
				<input
					type="url"
					value={effectiveBaseUrl}
					onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null); }}
				/>
			</label> : null}

            {/* Test result */}
            {testResult?.ready && (
                <span className="pk-onboarding-connection-result" data-state="ready">
                    <Check size={12} /> Connection successful
                </span>
            )}
            {testResult && !testResult.ready && (
                <span className="pk-onboarding-connection-result" data-state="error">
                    <X size={12} /> {testResult.catalog.message || testResult.authentication.message}
                </span>
            )}
			<footer className="pk-onboarding-connection-card__footer">
				<span>No Vault content is used by this connection test.</span>
				<Button variant="primary" className="pk-onboarding-connection-submit" onClick={() => void handleTestAndUse()} disabled={(requiresKey && !apiKey.trim()) || !effectiveBaseUrl || testing}>
					{testing ? <Loader2 size={14} className="pk-spin" /> : null}
					Test and use
				</Button>
			</footer>
        </section>
    );
}

function providerMonogram(kind: ProfileKind): string {
	if (kind === 'openai') return 'OA';
	if (kind === 'anthropic') return 'AN';
	if (kind === 'openrouter') return 'OR';
	if (kind === 'ollama') return 'OL';
	if (kind === 'codex') return 'CX';
	if (kind === 'claude-code') return 'CC';
	return kind.slice(0, 2).toUpperCase();
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
        <div className="pk-onboarding-saved-profile">
            {/* Header row — click to expand */}
            <div
				data-selected={selected ? 'true' : 'false'}
                className="pk-onboarding-saved-profile__header"
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
				<span className="pk-onboarding-saved-profile__name">{profile.name}</span>
				<span className="pk-onboarding-provider-state" data-state={status}>{status === 'checking' ? 'Checking' : status === 'ready' ? 'Ready' : status === 'error' ? 'Needs attention' : isActive ? 'Default' : 'Not tested'}</span>
				</Button>
				<Button variant="ghost" className="pk-onboarding-provider-edit" data-expanded={expanded ? 'true' : 'false'} aria-label={expanded ? `Cancel editing ${profile.name}` : `Edit ${profile.name}`} onClick={() => expanded ? cancelEdit() : setExpanded(true)}><ChevronRight size={16} /></Button>
            </div>

            {/* Expanded edit form */}
            {expanded && (
                <div className="pk-onboarding-saved-profile__body">
                    {option?.keyUrl && (
                        <a href={option.keyUrl} className="pk-onboarding-saved-profile__link">
                            {option.keyUrlLabel}
                        </a>
                    )}
					<label className="pk-onboarding-saved-profile__field"><span>API key</span>
						<div className="pk-onboarding-saved-profile__control-row">
                        <input
                            type="password"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                        />
						<Button variant="secondary" size="sm" className="pk-onboarding-saved-profile__action" onClick={() => void handleTest()} disabled={testing}>
							{testing ? <Loader2 size={12} className="pk-spin" /> : null}
                            Test
                        </Button>
						<Button variant="primary" size="sm" className="pk-onboarding-saved-profile__action" onClick={handleSave} disabled={!testResult?.ready}>Save</Button>
						</div>
					</label>
					<label className="pk-onboarding-saved-profile__field"><span>Base URL</span><input type="url" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null); }} /></label>
                    {testResult?.ready && (
						<span className="pk-onboarding-connection-result" data-state="ready"><Check size={12} /> OK</span>
                    )}
                    {testResult && !testResult.ready && (
						<span className="pk-onboarding-connection-result" data-state="error"><X size={12} /> {testResult.catalog.message}</span>
                    )}
					<div className="pk-onboarding-saved-profile__footer">
						<Button variant="ghost" size="sm" className="pk-onboarding-saved-profile__footer-action" onClick={cancelEdit}>Cancel</Button>
                        {!isActive && (
                            <Button variant="ghost" size="sm" className="pk-onboarding-saved-profile__footer-action" onClick={handleSetActive}>Set Active</Button>
                        )}
                        {onDelete && <Button variant="ghost" size="sm" data-tone="danger" className="pk-onboarding-saved-profile__footer-action" onClick={onDelete}>
                            <Trash2 size={12} /> Delete
						</Button>}
                    </div>
                </div>
            )}
        </div>
    );
}
