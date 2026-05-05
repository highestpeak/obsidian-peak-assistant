import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { ChevronRight, MoreHorizontal, Zap } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';
import { ModelCombobox } from './ModelCombobox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileCardProps {
    profile: Profile;
    isActiveAgent: boolean;
    isActiveEmbedding: boolean;
    isActiveWebSearch: boolean;
    onUpdate: (id: string, updates: Partial<Profile>) => void;
    onDelete: (id: string) => void;
    onToggleAgent: (id: string) => void;
    onToggleEmbedding: (id: string) => void;
    onToggleWebSearch: (id: string) => void;
    onToggleEnabled: (id: string) => void;
}

const ALL_KINDS: ProfileKind[] = ['anthropic', 'openai', 'google', 'perplexity', 'ollama', 'openrouter', 'litellm', 'custom'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ label }: { label: string }) {
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-4 pktw-mb-2">
            <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint pktw-whitespace-nowrap">
                {label}
            </span>
            <div className="pktw-flex-1 pktw-h-px pktw-bg-pk-border" />
        </div>
    );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="pktw-grid pktw-items-center pktw-gap-3" style={{ gridTemplateColumns: '130px 1fr' }}>
            <span className="pktw-text-xs pktw-text-pk-foreground-faint">{label}</span>
            {children}
        </div>
    );
}

function RoleBadge({ label, active }: { label: string; active: boolean }) {
    if (!active) return null;
    const color = label === 'Agent'
        ? 'pktw-bg-purple-500/15 pktw-text-purple-600 dark:pktw-text-purple-400'
        : 'pktw-bg-blue-500/15 pktw-text-blue-600 dark:pktw-text-blue-400';
    return (
        <span className={cn('pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[10px] pktw-font-medium pktw-leading-none', color)}>
            {label}
        </span>
    );
}

const INPUT_CLS = 'pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent/60 pktw-transition-colors';

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
        <div ref={ref} className="pktw-relative">
            <Button
                variant="ghost" size="icon"
                className="pktw-size-7 pktw-text-pk-muted-foreground"
                onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            >
                <MoreHorizontal size={14} />
            </Button>
            {open && (
                <div className="pktw-absolute pktw-right-0 pktw-top-full pktw-mt-1 pktw-z-50 pktw-min-w-[130px] pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-popover pktw-shadow-lg pktw-py-1">
                    <button
                        type="button"
                        className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none hover:pktw-bg-pk-accent/10 pktw-transition-colors"
                        onClick={(e) => { e.stopPropagation(); onToggleEnabled(profile.id); setOpen(false); }}
                    >
                        {profile.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                        type="button"
                        className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-red-500 pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none hover:pktw-bg-red-500/10 pktw-transition-colors"
                        onClick={(e) => { e.stopPropagation(); onDelete(profile.id); setOpen(false); }}
                    >
                        Delete
                    </button>
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
    isActiveAgent,
    isActiveEmbedding,
    isActiveWebSearch,
    onUpdate,
    onDelete,
    onToggleAgent,
    onToggleEmbedding,
    onToggleWebSearch,
    onToggleEnabled,
}: ProfileCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [testing, setTesting] = useState(false);

    const isActive = isActiveAgent || isActiveEmbedding || isActiveWebSearch;
    const allowFreeText = profile.kind === 'custom' || profile.kind === 'litellm';
    const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${profile.primaryModel || '—'} · ${profile.apiKey ? 'API key set' : 'no key'}`;

    const handleTest = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setTesting(true);
        // TODO: wire to real connectivity test
        setTimeout(() => setTesting(false), 1500);
    };

    const update = (updates: Partial<Profile>) => onUpdate(profile.id, updates);

    return (
        <div className={cn(
            'pktw-border pktw-rounded-lg pktw-transition-all',
            isActive ? 'pktw-border-pk-accent' : 'pktw-border-pk-border',
            !profile.enabled && 'pktw-opacity-45',
        )}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <div
                className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent/5 pktw-transition-colors"
                onClick={() => setIsExpanded((v) => !v)}
            >
                <ProviderIcon kind={profile.kind} size={30} />

                <div className="pktw-flex-1 pktw-min-w-0">
                    <div className="pktw-flex pktw-items-center pktw-gap-2">
                        <span className="pktw-text-sm pktw-font-bold pktw-truncate">{profile.name}</span>
                        <RoleBadge label="Agent" active={isActiveAgent} />
                        <RoleBadge label="Embedding" active={isActiveEmbedding} />
                        <RoleBadge label="Web Search" active={isActiveWebSearch} />
                    </div>
                    <span className="pktw-text-[11px] pktw-text-pk-muted-foreground pktw-truncate pktw-block">{subtitle}</span>
                </div>

                <Button
                    variant="ghost" size="sm"
                    className="pktw-text-xs pktw-gap-1 pktw-text-pk-muted-foreground pktw-shrink-0"
                    onClick={handleTest}
                    disabled={testing}
                >
                    <Zap size={12} />
                    {testing ? 'Testing…' : 'Test'}
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
                <div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border">
                    {/* Connection */}
                    <SectionTitle label="Connection" />
                    <div className="pktw-space-y-2.5">
                        <FieldRow label="Type">
                            <select
                                className={INPUT_CLS}
                                value={profile.kind}
                                onChange={(e) => update({ kind: e.target.value as ProfileKind })}
                            >
                                {ALL_KINDS.map((k) => (
                                    <option key={k} value={k}>{PROVIDER_LABELS[k].label}</option>
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

                    {/* Models */}
                    <SectionTitle label="Models" />
                    <div className="pktw-grid pktw-grid-cols-2 pktw-gap-3">
                        <ModelCombobox
                            label="Primary Model"
                            value={profile.primaryModel}
                            onChange={(id) => update({ primaryModel: id })}
                            providerKind={profile.kind}
                            allowFreeText={allowFreeText}
                        />
                        <ModelCombobox
                            label="Fast Model"
                            value={profile.fastModel}
                            onChange={(id) => update({ fastModel: id })}
                            providerKind={profile.kind}
                            allowFreeText={allowFreeText}
                        />
                    </div>

                    {/* Embedding */}
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
                                allowFreeText={allowFreeText}
                            />
                        </FieldRow>
                    </div>

                    {/* Role selectors */}
                    <div className="pktw-flex pktw-flex-wrap pktw-gap-3 pktw-mt-4 pktw-pt-3 pktw-border-t pktw-border-pk-border">
                        <RoleSelector
                            label="Use as Agent"
                            active={isActiveAgent}
                            selectedModel={ProfileRegistry.getInstance().getActiveAgentConfig()?.modelId}
                            providerKind={profile.kind}
                            onToggle={() => onToggleAgent(profile.id)}
                            onModelChange={(modelId) => ProfileRegistry.getInstance().setActiveAgentConfig({ profileId: profile.id, modelId })}
                        />
                        <RoleSelector
                            label="Use as Embedding"
                            active={isActiveEmbedding}
                            selectedModel={ProfileRegistry.getInstance().getActiveEmbeddingConfig()?.modelId}
                            providerKind={profile.kind}
                            onToggle={() => onToggleEmbedding(profile.id)}
                            onModelChange={(modelId) => ProfileRegistry.getInstance().setActiveEmbeddingConfig({ profileId: profile.id, modelId })}
                        />
                        <RoleSelector
                            label="Use as Web Search"
                            active={isActiveWebSearch}
                            selectedModel={ProfileRegistry.getInstance().getActiveWebSearchConfig()?.modelId}
                            providerKind={profile.kind}
                            onToggle={() => onToggleWebSearch(profile.id)}
                            onModelChange={(modelId) => ProfileRegistry.getInstance().setActiveWebSearchConfig({ profileId: profile.id, modelId })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Role selector (toggle + model dropdown)
// ---------------------------------------------------------------------------

function RoleSelector({ label, active, selectedModel, providerKind, onToggle, onModelChange }: {
    label: string; active: boolean; selectedModel?: string;
    providerKind: ProfileKind; onToggle: () => void; onModelChange: (modelId: string) => void;
}) {
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2">
            <button
                type="button"
                onClick={onToggle}
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-text-xs pktw-font-medium pktw-transition-all pktw-cursor-pointer pktw-border',
                    active
                        ? 'pktw-border-purple-500/60 pktw-bg-purple-500/10 pktw-text-purple-600 dark:pktw-text-purple-400'
                        : 'pktw-border-pk-border pktw-text-pk-muted-foreground hover:pktw-border-pk-accent/40',
                )}
            >
                <span className={cn(
                    'pktw-w-3.5 pktw-h-3.5 pktw-rounded pktw-border pktw-flex pktw-items-center pktw-justify-center pktw-transition-colors',
                    active ? 'pktw-border-purple-500 pktw-bg-purple-500' : 'pktw-border-pk-border',
                )}>
                    {active && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </span>
                {label}
            </button>
            {active && (
                <ModelCombobox
                    value={selectedModel ?? ''}
                    onChange={onModelChange}
                    providerKind={providerKind}
                    allowFreeText
                    placeholder="Select model..."
                />
            )}
        </div>
    );
}
