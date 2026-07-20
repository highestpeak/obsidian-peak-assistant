import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { modelRegistry } from '@/core/providers/model-registry';
import { ProviderIcon } from './ProviderIcon';
import { CapTags, highlightMatch } from './model-display-utils';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import type { ModelCapabilities } from '@/core/providers/types';

const EXPENSIVE_FAST_MODEL_RE = /\b(sonnet|opus)\b/i;
function isExpensiveForFast(modelId: string): boolean {
    return EXPENSIVE_FAST_MODEL_RE.test(modelId);
}

// Map provider kind → catalog id for model lookup
const PROVIDER_CATALOG: Record<string, string | null> = {
    anthropic: 'claude', openai: 'openai', google: 'gemini',
    perplexity: 'perplexity', ollama: 'ollama', openrouter: 'openrouter',
    litellm: null, custom: null,
};

interface PickerItem {
    profileId: string;
    profileName: string;
    profileKind: string;
    modelId: string;
    capabilities?: ModelCapabilities;
}

function buildPickerItems(profiles: Profile[], modelFilter?: (modelId: string) => boolean): PickerItem[] {
    const items: PickerItem[] = [];
    for (const profile of profiles) {
        if (profile.enabled === false) continue;
        const catalogId = PROVIDER_CATALOG[profile.kind];
        if (!catalogId) continue;
        const models = modelRegistry.getModelsForProvider(catalogId);
        for (const model of models) {
            if (modelFilter && !modelFilter(model.id)) continue;
            items.push({
                profileId: profile.id,
                profileName: profile.name,
                profileKind: profile.kind,
                modelId: model.id,
                capabilities: model.capabilities,
            });
        }
    }
    return items;
}

export interface RoleModelPickerProps {
    role?: string;
    activeConfig: { profile: Profile; modelId: string } | null;
    profiles: Profile[];
    onSelect: (config: RoleConfig) => void;
    onClear: () => void;
    modelFilter?: (modelId: string) => boolean;
}

export function RoleModelPicker({ role, activeConfig, profiles, onSelect, onClear, modelFilter }: RoleModelPickerProps) {
    const isFastRole = role === 'agent-fast';
    const guardedSelect = (config: RoleConfig) => {
        if (isFastRole && isExpensiveForFast(config.modelId)) {
            const ok = window.confirm(
                `${config.modelId} is much more expensive than Haiku for the Fast role.\n\n` +
                `Haiku is roughly 12× cheaper and is usually sufficient for tool-call loops.\n\n` +
                `Use ${config.modelId} for Agent Fast anyway?`,
            );
            if (!ok) return;
        }
        onSelect(config);
    };
    const [query, setQuery] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const allItems = useMemo(() => buildPickerItems(profiles, modelFilter), [profiles, modelFilter]);

    const filtered = useMemo(() => {
        if (!query) return allItems;
        const q = query.toLowerCase();
        return allItems.filter(item => item.modelId.toLowerCase().includes(q) || item.profileName.toLowerCase().includes(q));
    }, [allItems, query]);

    // Group by profile
    const groups = useMemo(() => {
        const map = new Map<string, { profile: { id: string; name: string; kind: string }; items: PickerItem[] }>();
        for (const item of filtered) {
            let group = map.get(item.profileId);
            if (!group) {
                group = { profile: { id: item.profileId, name: item.profileName, kind: item.profileKind }, items: [] };
                map.set(item.profileId, group);
            }
            group.items.push(item);
        }
        return Array.from(map.values());
    }, [filtered]);

    // Flat list for keyboard nav
    const flatFiltered = useMemo(() => groups.flatMap(g => g.items), [groups]);

    // Auto-focus
    useEffect(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    // Scroll highlighted into view
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [highlightIdx]);

    // Reset highlight on query change
    useEffect(() => { setHighlightIdx(0); }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx(i => Math.min(i + 1, flatFiltered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = flatFiltered[highlightIdx];
            if (item) guardedSelect({ profileId: item.profileId, modelId: item.modelId });
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // Parent handles close via onClear or click-outside
        }
    };

    const isSelected = (item: PickerItem) =>
        activeConfig?.profile.id === item.profileId && activeConfig?.modelId === item.modelId;

    let flatIdx = 0;

    return (
        <div className="pktw-w-[320px] pktw-max-h-[380px] pktw-flex pktw-flex-col pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-popover pktw-shadow-lg">
            {isFastRole && (
                <div className="pktw-flex pktw-items-start pktw-gap-2 pktw-px-3 pktw-py-2 pktw-text-pk-sm pktw-bg-pk-warning-bg pktw-text-pk-warning-text pktw-border-b pktw-border-pk-border">
                    <AlertTriangle className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-mt-px" />
                    <span>Use <b>Haiku</b> here — roughly 12× cheaper than Sonnet for the Fast role.</span>
                </div>
            )}
            {/* Search input */}
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-border-b pktw-border-pk-border">
                <Search className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-muted-foreground pktw-shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search models..."
                    className="pktw-flex-1 pktw-bg-transparent pktw-border-0 pktw-outline-none pktw-text-xs pktw-text-pk-foreground placeholder:pktw-text-pk-muted-foreground"
                />
            </div>

            {/* Model list */}
            <div ref={listRef} className="pktw-flex-1 pktw-overflow-y-auto pktw-py-1">
                {groups.map(group => (
                    <div key={group.profile.id}>
                        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-2 pktw-pb-1">
                            <ProviderIcon kind={group.profile.kind as any} size={14} />
                            <span className="pktw-text-pk-xs pktw-font-semibold pktw-text-pk-foreground-faint pktw-uppercase pktw-tracking-wider">
                                {group.profile.name}
                            </span>
                        </div>
                        {group.items.map(item => {
                            const idx = flatIdx++;
                            const selected = isSelected(item);
                            return (
                                <button
                                    key={`${item.profileId}-${item.modelId}`}
                                    type="button"
                                    data-idx={idx}
                                    onMouseEnter={() => setHighlightIdx(idx)}
                                    onClick={() => guardedSelect({ profileId: item.profileId, modelId: item.modelId })}
                                    className={cn(
                                        'pktw-w-full pktw-text-left pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors pktw-cursor-pointer',
                                        idx === highlightIdx && 'pktw-bg-pk-accent-tint',
                                        selected && 'pktw-font-semibold',
                                    )}
                                >
                                    <span className="pktw-pl-2 pktw-flex-1 pktw-truncate pktw-font-mono">
                                        {highlightMatch(item.modelId, query)}
                                    </span>
                                    {isFastRole && isExpensiveForFast(item.modelId) && (
                                        <span
                                            title="Expensive for Fast role"
                                            className="pktw-shrink-0 pktw-text-[9px] pktw-font-semibold pktw-tracking-wider pktw-px-1.5 pktw-py-px pktw-rounded pktw-bg-pk-warning-bg pktw-text-pk-warning-text"
                                        >$$$</span>
                                    )}
                                    <CapTags caps={item.capabilities} />
                                    {selected && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-pk-accent" />}
                                </button>
                            );
                        })}
                    </div>
                ))}

                {flatFiltered.length === 0 && (
                    <div className="pktw-px-3 pktw-py-4 pktw-text-xs pktw-text-pk-muted-foreground pktw-text-center">
                        No models found
                    </div>
                )}
            </div>

            {/* Clear selection */}
            {activeConfig && (
                <>
                    <div className="pktw-border-t pktw-border-pk-border" />
                    <button
                        type="button"
                        className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-pk-muted-foreground pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none hover:pktw-bg-pk-accent-tint pktw-transition-colors pktw-cursor-pointer"
                        onClick={onClear}
                    >
                        Clear selection
                    </button>
                </>
            )}
        </div>
    );
}
