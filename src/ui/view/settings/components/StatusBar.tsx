import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { RoleModelPicker } from './RoleModelPicker';
import type { Profile, RoleConfig } from '@/core/profiles/types';

type RoleKind = 'agent' | 'agent-fast' | 'chat' | 'copilot' | 'embedding' | 'webSearch';

interface RoleSelectorChipProps {
    role: RoleKind;
    label: string;
    activeConfig: { profile: Profile; modelId: string } | null;
    profiles: Profile[];
    onSelect: (config: RoleConfig) => void;
    onClear: () => void;
    modelFilter?: (modelId: string) => boolean;
}

function RoleSelectorChip({ role, label, activeConfig, profiles, onSelect, onClear, modelFilter }: RoleSelectorChipProps) {
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
                <div className="pktw-absolute pktw-left-0 pktw-top-full pktw-mt-1 pktw-z-50">
                    <RoleModelPicker
                        role={role}
                        activeConfig={activeConfig}
                        profiles={profiles}
                        onSelect={(config) => { onSelect(config); setOpen(false); }}
                        onClear={() => { onClear(); setOpen(false); }}
                        modelFilter={modelFilter}
                    />
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
    const [, setTick] = useState(0);
    const bump = () => setTick(t => t + 1);

    const registry = ProfileRegistry.getInstance();
    const profiles = registry.getAllProfiles();

    const agentConfig = registry.getActiveAgentConfig();
    const agentFastConfig = registry.getActiveAgentFastConfig();
    const chatConfig = registry.getActiveChatConfig();
    const copilotConfig = registry.getActiveCopilotConfig();
    const embeddingConfig = registry.getActiveEmbeddingConfig();
    const webSearchConfig = registry.getActiveWebSearchConfig();

    const sqliteReady = sqliteStoreManager.isInitialized();

    const agentProfiles = profiles.filter(p => p.kind === 'anthropic' || p.kind === 'openrouter');
    // Claude Agent SDK only supports Claude 4.x models; 3.x are rejected with "model not found".
    const agentModelFilter = (modelId: string) => {
        if (modelId.includes('/') && !modelId.startsWith('anthropic/')) return false;
        const base = modelId.startsWith('anthropic/') ? modelId.slice('anthropic/'.length) : modelId;
        return !/^claude-3[-_]/.test(base);
    };

    return (
        <div className="pktw-flex pktw-gap-2.5 pktw-mt-4 pktw-mb-5 pktw-flex-wrap">
            <RoleSelectorChip
                role="agent" label="Agent"
                activeConfig={agentConfig} profiles={agentProfiles}
                onSelect={(config) => { registry.setActiveAgentConfig(config); bump(); }}
                onClear={() => { registry.setActiveAgentConfig(null); bump(); }}
                modelFilter={agentModelFilter}
            />
            <RoleSelectorChip
                role="agent-fast" label="Agent Fast"
                activeConfig={agentFastConfig} profiles={agentProfiles}
                onSelect={(config) => { registry.setActiveAgentFastConfig(config); bump(); }}
                onClear={() => { registry.setActiveAgentFastConfig(null); bump(); }}
                modelFilter={agentModelFilter}
            />
            <RoleSelectorChip
                role="chat" label="Chat"
                activeConfig={chatConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveChatConfig(config); bump(); }}
                onClear={() => { registry.setActiveChatConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="copilot" label="Copilot"
                activeConfig={copilotConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveCopilotConfig(config); bump(); }}
                onClear={() => { registry.setActiveCopilotConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="embedding" label="Embedding"
                activeConfig={embeddingConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveEmbeddingConfig(config); bump(); }}
                onClear={() => { registry.setActiveEmbeddingConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="webSearch" label="Web Search"
                activeConfig={webSearchConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveWebSearchConfig(config); bump(); }}
                onClear={() => { registry.setActiveWebSearchConfig(null); bump(); }}
            />
            <StaticChip ok={sqliteReady} label={sqliteReady ? 'SQLite: ready' : 'SQLite: unavailable'} />
        </div>
    );
}
