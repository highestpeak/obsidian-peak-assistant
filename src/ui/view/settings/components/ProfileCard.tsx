import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { ChevronRight, MoreHorizontal, Zap, Check, X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';
import { ModelCombobox } from './ModelCombobox';
import { testProviderConnection } from '@/core/providers/testProviderConnection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileCardProps {
    profile: Profile;
    onUpdate: (id: string, updates: Partial<Profile>) => void;
    onDelete: (id: string) => void;
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
                        className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-cursor-pointer pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors hover:pktw-bg-pk-accent-muted"
                        onClick={(e) => { e.stopPropagation(); onToggleEnabled(profile.id); setOpen(false); }}
                    >
                        {profile.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                        type="button"
                        className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-red-500 pktw-cursor-pointer pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors hover:pktw-bg-pk-error-muted"
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
    onUpdate,
    onDelete,
    onToggleEnabled,
}: ProfileCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
    const allowFreeText = profile.kind === 'custom' || profile.kind === 'litellm' || profile.kind === 'ollama';
    const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${profile.apiKey ? 'API key set' : 'no key'}`;

    const handleTest = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setTesting(true);
        setTestResult(null);
        const ok = await testProviderConnection(profile);
        setTestResult(ok ? 'success' : 'fail');
        setTesting(false);
    };

    const update = (updates: Partial<Profile>) => onUpdate(profile.id, updates);

    return (
        <div className={cn(
            'pktw-border pktw-rounded-lg pktw-transition-all pktw-border-pk-border',
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
                    </div>
                    <span className="pktw-text-[11px] pktw-text-pk-muted-foreground pktw-truncate pktw-block">{subtitle}</span>
                </div>

                <Button
                    variant="ghost" size="sm"
                    className={cn(
                        'pktw-text-xs pktw-gap-1 pktw-shrink-0',
                        testResult === 'success' && 'pktw-text-green-500',
                        testResult === 'fail' && 'pktw-text-red-500',
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

                </div>
            )}
        </div>
    );
}
