import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { modelRegistry } from '@/core/providers/model-registry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';
import type { Profile, RoleConfig } from '@/core/profiles/types';

// Map provider kind → catalog id for model lookup
const PROVIDER_CATALOG: Record<string, string | null> = {
    anthropic: 'claude', openai: 'openai', google: 'gemini',
    perplexity: 'perplexity', ollama: 'ollama', openrouter: 'openrouter',
    litellm: null, custom: null,
};

function getModelsForProfile(profile: Profile): string[] {
    const catalogId = PROVIDER_CATALOG[profile.kind];
    if (catalogId) {
        const models = modelRegistry.getModelsForProvider(catalogId);
        if (models.length > 0) return models.map(m => m.id);
    }
    // Fallback: catalog or runtime models will provide the list
    return [];
}

type RoleKind = 'agent' | 'chat' | 'embedding' | 'webSearch';

interface RoleSelectorChipProps {
    role: RoleKind;
    label: string;
    activeConfig: { profile: Profile; modelId: string } | null;
    profiles: Profile[];
    onSelect: (config: RoleConfig) => void;
    onClear: () => void;
}

function RoleSelectorChip({ role, label, activeConfig, profiles, onSelect, onClear }: RoleSelectorChipProps) {
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

    const ok = !!activeConfig;
    const displayText = activeConfig
        ? `${label}: ${activeConfig.modelId}`
        : `${label}: Not configured`;

    return (
        <div ref={ref} className="pktw-relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-full pktw-text-xs pktw-cursor-pointer pktw-transition-colors pktw-border-0',
                    ok ? 'pktw-bg-pk-success-muted pktw-text-pk-success hover:pktw-bg-pk-success-muted/80'
                       : 'pktw-bg-pk-error-muted pktw-text-pk-error hover:pktw-bg-pk-error-muted/80',
                )}
            >
                <div className={cn('pktw-w-1.5 pktw-h-1.5 pktw-rounded-full', ok ? 'pktw-bg-pk-success' : 'pktw-bg-pk-error')} />
                {displayText}
                <ChevronDown className={cn('pktw-w-3 pktw-h-3 pktw-transition-transform', open && 'pktw-rotate-180')} />
            </button>

            {open && (
                <div className="pktw-absolute pktw-left-0 pktw-top-full pktw-mt-1 pktw-z-50 pktw-min-w-[260px] pktw-max-h-[320px] pktw-overflow-y-auto pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-popover pktw-shadow-lg pktw-py-1">
                    {profiles.filter(p => p.enabled !== false).map(profile => {
                        const models = getModelsForProfile(profile);
                        const isActiveProfile = activeConfig?.profile.id === profile.id;

                        return (
                            <div key={profile.id}>
                                {/* Profile header */}
                                <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-2 pktw-pb-1">
                                    <ProviderIcon kind={profile.kind} size={16} />
                                    <span className="pktw-text-[11px] pktw-font-semibold pktw-text-pk-foreground-faint pktw-uppercase pktw-tracking-wider">
                                        {profile.name}
                                    </span>
                                </div>
                                {/* Model options */}
                                {models.map(modelId => {
                                    const isSelected = isActiveProfile && activeConfig?.modelId === modelId;
                                    return (
                                        <button
                                            key={`${profile.id}-${modelId}`}
                                            type="button"
                                            className={cn(
                                                'pktw-w-full pktw-text-left pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1 pktw-text-xs pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors',
                                                isSelected
                                                    ? 'pktw-bg-pk-accent-muted pktw-text-pk-accent pktw-font-medium'
                                                    : 'pktw-text-pk-foreground hover:pktw-bg-gray-50 dark:hover:pktw-bg-white/5',
                                            )}
                                            onClick={() => {
                                                onSelect({ profileId: profile.id, modelId });
                                                setOpen(false);
                                            }}
                                        >
                                            <span className="pktw-pl-3 pktw-flex-1 pktw-truncate">{modelId}</span>
                                            {isSelected && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}

                    {activeConfig && (
                        <>
                            <div className="pktw-border-t pktw-border-pk-border pktw-my-1" />
                            <button
                                type="button"
                                className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-pk-muted-foreground pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none hover:pktw-bg-gray-50 dark:hover:pktw-bg-white/5"
                                onClick={() => { onClear(); setOpen(false); }}
                            >
                                Clear selection
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function StaticChip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className={cn(
            'pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-full pktw-text-xs',
            ok ? 'pktw-bg-pk-success-muted pktw-text-pk-success' : 'pktw-bg-pk-error-muted pktw-text-pk-error',
        )}>
            <div className={cn('pktw-w-1.5 pktw-h-1.5 pktw-rounded-full', ok ? 'pktw-bg-pk-success' : 'pktw-bg-pk-error')} />
            {label}
        </div>
    );
}

export function StatusBar() {
    // Force re-render on selection change
    const [, setTick] = useState(0);
    const bump = () => setTick(t => t + 1);

    const registry = ProfileRegistry.getInstance();
    const profiles = registry.getAllProfiles();

    const agentConfig = registry.getActiveAgentConfig();
    const agentFastConfig = registry.getActiveAgentFastConfig();
    const chatConfig = registry.getActiveChatConfig();
    const embeddingConfig = registry.getActiveEmbeddingConfig();
    const webSearchConfig = registry.getActiveWebSearchConfig();

    const sqliteReady = sqliteStoreManager.isInitialized();

    return (
        <div className="pktw-flex pktw-gap-2.5 pktw-mt-4 pktw-mb-5 pktw-flex-wrap">
            <RoleSelectorChip
                role="agent"
                label="Agent"
                activeConfig={agentConfig}
                profiles={profiles}
                onSelect={(config) => { registry.setActiveAgentConfig(config); bump(); }}
                onClear={() => { registry.setActiveAgentConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="agent"
                label="Agent Fast"
                activeConfig={agentFastConfig}
                profiles={profiles}
                onSelect={(config) => { registry.setActiveAgentFastConfig(config); bump(); }}
                onClear={() => { registry.setActiveAgentFastConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="chat"
                label="Chat"
                activeConfig={chatConfig}
                profiles={profiles}
                onSelect={(config) => { registry.setActiveChatConfig(config); bump(); }}
                onClear={() => { registry.setActiveChatConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="embedding"
                label="Embedding"
                activeConfig={embeddingConfig}
                profiles={profiles}
                onSelect={(config) => { registry.setActiveEmbeddingConfig(config); bump(); }}
                onClear={() => { registry.setActiveEmbeddingConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="webSearch"
                label="Web Search"
                activeConfig={webSearchConfig}
                profiles={profiles}
                onSelect={(config) => { registry.setActiveWebSearchConfig(config); bump(); }}
                onClear={() => { registry.setActiveWebSearchConfig(null); bump(); }}
            />
            <StaticChip ok={sqliteReady} label={sqliteReady ? 'SQLite: ready' : 'SQLite: unavailable'} />
        </div>
    );
}
