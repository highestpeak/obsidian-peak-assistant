import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { ChevronRight, MoreHorizontal, Zap, Check, X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { Profile, ProfileKind, SimulatorProfileConfig } from '@/core/profiles/types';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';
import { ModelCombobox } from './ModelCombobox';
import { inspectProviderConnection, type ConnectionEvidence } from '@/core/providers/testProviderConnection';
import { uiHttpClient } from '@/ui/util/uiHttpClient';
import { FieldRow } from './FieldRow';
import {
    SIMULATOR_DEFAULTS,
    SIMULATOR_SCENARIOS,
    SIMULATOR_SPEEDS,
} from '@/core/providers/simulator';
import { DEFAULT_SIMULATOR_PROFILE_CONFIG } from '@/core/profiles/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileCardProps {
    profile: Profile;
    onUpdate: (id: string, updates: Partial<Profile>) => void;
    onDelete: (id: string) => void;
    onToggleEnabled: (id: string) => void;
}

const ALL_KINDS: ProfileKind[] = ['simulator', 'anthropic', 'openai', 'google', 'perplexity', 'ollama', 'lmstudio', 'openrouter', 'litellm', 'custom'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ label }: { label: string }) {
    return (
        <div className="pk-profile-card__section-title pktw-flex pktw-items-center pktw-gap-2 pktw-mt-4 pktw-mb-2">
            <span className="pktw-text-pk-sm pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint pktw-whitespace-nowrap">
                {label}
            </span>
            <div className="pktw-flex-1 pktw-h-px pktw-bg-pk-border" />
        </div>
    );
}

const INPUT_CLS = 'pk-profile-control pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent pktw-transition-colors';

function getCredentialLabel(profile: Profile): string {
    if (profile.kind === 'simulator') return SIMULATOR_DEFAULTS.ui.credentialLabel;
    if (profile.kind === 'ollama' || profile.kind === 'lmstudio') return 'no key needed';
    if (profile.apiKey) return 'API key set';
    return 'no key';
}

function getConnectionFailureMessage(result: ConnectionEvidence): string {
    if (result.authentication.state === 'failed') return result.authentication.message;
    if (result.catalog.state === 'failed') return result.catalog.message;
    if (result.minimumGeneration.state === 'failed') return result.minimumGeneration.message;
    return result.minimumGeneration.message || result.catalog.message || result.authentication.message;
}

function SimulatorFields({
    baseUrl,
    config,
    onBaseUrlChange,
    onChange,
}: {
    baseUrl: string;
    config: SimulatorProfileConfig;
    onBaseUrlChange: (baseUrl: string) => void;
    onChange: (config: SimulatorProfileConfig) => void;
}) {
    return (
        <>
            <SectionTitle label={SIMULATOR_DEFAULTS.ui.sectionTitle} />
            <div className="pktw-space-y-2.5">
                <FieldRow label={SIMULATOR_DEFAULTS.ui.endpointLabel}>
                    <input
                        className={INPUT_CLS}
                        defaultValue={baseUrl}
                        placeholder={SIMULATOR_DEFAULTS.endpoint.defaultBaseUrl}
                        onBlur={(event) => onBaseUrlChange(event.target.value)}
                    />
                </FieldRow>
                <FieldRow label={SIMULATOR_DEFAULTS.ui.scenarioLabel}>
                    <select
                        className={INPUT_CLS}
                        value={config.scenario}
                        onChange={(e) => onChange({
                            ...config,
                            scenario: e.target.value as SimulatorProfileConfig['scenario'],
                        })}
                    >
                        {SIMULATOR_SCENARIOS.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
                        ))}
                    </select>
                </FieldRow>
                <FieldRow label={SIMULATOR_DEFAULTS.ui.speedLabel}>
                    <select
                        className={INPUT_CLS}
                        value={config.speed}
                        onChange={(e) => onChange({
                            ...config,
                            speed: e.target.value as SimulatorProfileConfig['speed'],
                        })}
                    >
                        {SIMULATOR_SPEEDS.map((speed) => (
                            <option key={speed.id} value={speed.id}>{speed.label}</option>
                        ))}
                    </select>
                </FieldRow>
                <FieldRow label={SIMULATOR_DEFAULTS.ui.strictLabel}>
                    <input
                        type="checkbox"
                        checked={config.strict}
                        onChange={(e) => onChange({ ...config, strict: e.target.checked })}
                    />
                </FieldRow>
                <span className="pktw-block pktw-text-pk-sm pktw-text-pk-muted-foreground">
                    {SIMULATOR_DEFAULTS.ui.instruction}
                </span>
            </div>
        </>
    );
}

function ProviderConnectionFields({
    profile,
    allowFreeText,
    update,
}: {
    profile: Profile;
    allowFreeText: boolean;
    update: (updates: Partial<Profile>) => void;
}) {
    return (
        <>
            <SectionTitle label="Connection" />
            <div className="pktw-space-y-2.5">
                <FieldRow label="Type">
                    <select
                        className={INPUT_CLS}
                        value={profile.kind}
                        onChange={(e) => update({ kind: e.target.value as ProfileKind })}
                    >
                        {ALL_KINDS.map((kind) => (
                            <option key={kind} value={kind}>{PROVIDER_LABELS[kind].label}</option>
                        ))}
                    </select>
                </FieldRow>
                <FieldRow label="Base URL">
                    <input
                        className={INPUT_CLS}
                        defaultValue={profile.baseUrl}
                        placeholder="https://api.example.com"
                        onBlur={(e) => update({ baseUrl: e.target.value })}
                    />
                </FieldRow>
                <FieldRow label="API Key">
                    <input
                        type="password"
                        className={INPUT_CLS}
                        defaultValue={profile.apiKey ?? ''}
                        placeholder="sk-..."
                        onBlur={(e) => update({ apiKey: e.target.value || null })}
                    />
                </FieldRow>
            </div>

            <SectionTitle label="Embedding" />
            <div className="pktw-space-y-2.5">
                <FieldRow label="Endpoint">
                    <input
                        className={INPUT_CLS}
                        defaultValue={profile.embeddingEndpoint ?? ''}
                        placeholder="Leave empty = use Base URL"
                        onBlur={(e) => update({ embeddingEndpoint: e.target.value || null })}
                    />
                </FieldRow>
                <FieldRow label="API Key">
                    <input
                        type="password"
                        className={INPUT_CLS}
                        defaultValue={profile.embeddingApiKey ?? ''}
                        placeholder="Leave empty = use main key"
                        onBlur={(e) => update({ embeddingApiKey: e.target.value || null })}
                    />
                </FieldRow>
                <FieldRow label="Model">
                    <ModelCombobox
                        value={profile.embeddingModel ?? ''}
                        onChange={(id) => update({ embeddingModel: id || null })}
                        providerKind={profile.kind}
						profile={profile}
                        allowFreeText={allowFreeText}
                    />
                </FieldRow>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Dropdown menu (⋯ button)
// ---------------------------------------------------------------------------

function MoreMenu({ profile, onToggleEnabled, onDelete }: {
    profile: Profile;
    onToggleEnabled: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} className="pk-profile-card__menu pktw-relative">
            <Button
                variant="ghost" size="icon"
                className="pk-profile-card__menu-trigger pktw-size-7 pktw-text-pk-muted-foreground"
                onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            >
                <MoreHorizontal size={14} />
            </Button>
            {open && (
                <div className="pk-profile-card__menu-popover pktw-absolute pktw-right-0 pktw-top-full pktw-mt-1 pktw-z-50 pktw-min-w-[130px] pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-popover pktw-shadow-lg pktw-py-1">
                    <Button
                        variant="unstyled"
                        size="xs"
                        className="pk-profile-card__menu-item pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-cursor-pointer pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors hover:pktw-bg-pk-accent-muted"
                        onClick={(e) => { e.stopPropagation(); onToggleEnabled(profile.id); setOpen(false); }}
                    >
                        {profile.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                        variant="unstyled"
                        size="xs"
                        className="pk-profile-card__menu-item pk-profile-card__menu-item--danger pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-pk-error pktw-cursor-pointer pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors hover:pktw-bg-pk-error-muted"
                        onClick={(e) => { e.stopPropagation(); onDelete(profile.id); setOpen(false); }}
                    >
                        Delete
                    </Button>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ProfileCard
// ---------------------------------------------------------------------------

export function ProfileCard({
    profile,
    onUpdate,
    onDelete,
    onToggleEnabled,
}: ProfileCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [testing, setTesting] = useState(false);
    const [connectionEvidence, setConnectionEvidence] = useState<ConnectionEvidence | null>(null);
    const testResult = connectionEvidence ? (connectionEvidence.ready ? 'success' : 'fail') : null;
    const allowFreeText = profile.kind === 'custom' || profile.kind === 'litellm' || profile.kind === 'ollama' || profile.kind === 'lmstudio';
    const isSimulator = profile.kind === 'simulator';
    const simulatorConfig = {
        ...DEFAULT_SIMULATOR_PROFILE_CONFIG,
        ...profile.simulatorConfig,
    };
    const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${getCredentialLabel(profile)}`;

    const handleTest = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setTesting(true);
        setConnectionEvidence(null);
        try {
            setConnectionEvidence(await inspectProviderConnection(uiHttpClient, profile));
        } finally {
            setTesting(false);
        }
    };

    const update = (updates: Partial<Profile>) => onUpdate(profile.id, updates);

    return (
        <div className={cn(
            'pk-profile-card pktw-border pktw-rounded-lg pktw-transition-all pktw-border-pk-border',
            !profile.enabled && 'pktw-opacity-45',
        )}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <div
                className="pk-profile-card__header pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent-tint pktw-transition-colors"
                onClick={() => setIsExpanded((v) => !v)}
            >
                <ProviderIcon kind={profile.kind} size={30} />

                <div className="pk-profile-card__summary pktw-flex-1 pktw-min-w-0">
                    <div className="pktw-flex pktw-items-center pktw-gap-2">
                        <span className="pktw-text-sm pktw-font-bold pktw-truncate">{profile.name}</span>
                    </div>
                    <span className="pktw-text-pk-sm pktw-text-pk-muted-foreground pktw-truncate pktw-block">{subtitle}</span>
                    {connectionEvidence && !connectionEvidence.ready && (
                        <span className="pktw-text-pk-sm pktw-text-pk-error pktw-truncate pktw-block">
                            {getConnectionFailureMessage(connectionEvidence)}
                        </span>
                    )}
                </div>

                <Button
                    variant="ghost" size="sm"
                    className={cn(
                        'pk-profile-card__test pktw-text-xs pktw-gap-1 pktw-shrink-0',
                        testResult === 'success' && 'pktw-text-pk-success',
                        testResult === 'fail' && 'pktw-text-pk-error',
                        !testResult && 'pktw-text-pk-muted-foreground',
                    )}
                    onClick={handleTest}
                    disabled={testing}
                >
                    {testing ? <Zap size={12} className="pktw-animate-pulse" /> :
                     testResult === 'success' ? <Check size={12} /> :
                     testResult === 'fail' ? <X size={12} /> :
                     <Zap size={12} />}
                    {testing ? 'Testing…' :
                     testResult === 'success' ? 'Connected' :
                     testResult === 'fail' ? 'Failed' :
                     'Test'}
                </Button>

                <MoreMenu profile={profile} onToggleEnabled={onToggleEnabled} onDelete={onDelete} />

                <ChevronRight
                    size={14}
                    className={cn(
                        'pktw-text-pk-muted-foreground pktw-shrink-0 pktw-transition-transform pktw-duration-200',
                        isExpanded && 'pktw-rotate-90',
                    )}
                />
            </div>

            {/* ── Body (expanded) ─────────────────────────────────────── */}
            {isExpanded && (
                <div className="pk-profile-card__body pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border">
                    {isSimulator ? (
                        <SimulatorFields
                            baseUrl={profile.baseUrl}
                            config={simulatorConfig}
                            onBaseUrlChange={(baseUrl) => update({ baseUrl })}
                            onChange={(next) => update({ simulatorConfig: next })}
                        />
                    ) : (
                        <ProviderConnectionFields
                            profile={profile}
                            allowFreeText={allowFreeText}
                            update={update}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
