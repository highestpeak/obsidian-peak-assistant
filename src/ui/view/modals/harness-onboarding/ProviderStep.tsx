/**
 * Provider step for the harness onboarding wizard. Lets the user pick an
 * existing profile or add a new one (form is the shared ProviderForm so
 * behaviour matches the general OnboardingModal).
 *
 * Differs from the general onboarding by emphasising profile selection — the
 * wizard needs ONE selected profile to power the bootstrap model picker.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { cn } from '@/ui/react/lib/utils';
import type { Profile } from '@/core/profiles/types';
import { Trash2 } from 'lucide-react';
import { AddProviderForm, PROVIDER_OPTIONS } from '../onboarding/ProviderForm';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface ProviderStepProps {
    selectedProfileId: string | null;
    onSelect: (profileId: string) => void;
    onClear: () => void;
    onBack: () => void;
    onContinue: () => void;
}

export function ProviderStep({ selectedProfileId, onSelect, onClear, onBack, onContinue }: ProviderStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.provider;
    const [profiles, setProfiles] = useState<Profile[]>(() => ProfileRegistry.getInstance().getAllProfiles());
    const [showForm, setShowForm] = useState(profiles.length === 0);

    const refresh = useCallback(() => {
        setProfiles(ProfileRegistry.getInstance().getAllProfiles());
    }, []);

    // Auto-select the only profile when there's exactly one credentialed entry.
    useEffect(() => {
        if (selectedProfileId) return;
        const usable = profiles.filter((p) => p.kind === 'ollama' || (p.apiKey && p.apiKey.length > 0));
        if (usable.length === 1) {
            onSelect(usable[0].id);
        }
    }, [profiles, selectedProfileId, onSelect]);

    const handleDelete = useCallback(
        (id: string) => {
            ProfileRegistry.getInstance().deleteProfile(id);
            if (selectedProfileId === id) onClear();
            refresh();
        },
        [refresh, selectedProfileId, onClear],
    );

    const handleAdded = useCallback(
        (profileId: string) => {
            refresh();
            setShowForm(false);
            onSelect(profileId);
        },
        [refresh, onSelect],
    );

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

            {/* Saved profiles list — click to select */}
            {profiles.length > 0 && (
                <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
                    {profiles.map((p) => (
                        <SelectableProfileRow
                            key={p.id}
                            profile={p}
                            selected={selectedProfileId === p.id}
                            onSelect={() => onSelect(p.id)}
                            onDelete={() => handleDelete(p.id)}
                            strings={strings}
                        />
                    ))}
                </div>
            )}

            {/* Add form or add button */}
            {showForm ? (
                <AddProviderForm onAdded={handleAdded} setActiveOnFirst={false} autoAssignWebSearch={false} />
            ) : (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowForm(true)}
                    className="pktw-gap-1.5 pktw-self-start"
                >
                    <Plus size={14} /> {strings.actions.addProvider}
                </Button>
            )}

            {/* Actions */}
            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
                    <ChevronLeft size={14} /> {strings.actions.back}
                </Button>
                <Button size="sm" onClick={onContinue} disabled={!selectedProfileId} className="pktw-gap-1">
                    {strings.actions.continue} <ChevronRight size={14} />
                </Button>
            </div>
        </div>
    );
}

interface SelectableRowProps {
    profile: Profile;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    strings: OnboardingStrings;
}

function SelectableProfileRow({ profile, selected, onSelect, onDelete, strings }: SelectableRowProps) {
    const option = PROVIDER_OPTIONS.find((p) => p.kind === profile.kind);
    const Icon = option?.Icon ?? null;
    const hasUsableCredentials = profile.kind === 'ollama' || !!(profile.apiKey && profile.apiKey.length > 0);

    return (
        <div
            className={cn(
                'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2 pktw-rounded-md pktw-border pktw-transition-colors',
                selected
                    ? 'pktw-border-[--interactive-accent] pktw-bg-[--interactive-accent]/10'
                    : 'pktw-border-[--background-modifier-border]',
                hasUsableCredentials ? 'pktw-cursor-pointer hover:pktw-bg-[--background-modifier-hover]' : 'pktw-opacity-60',
            )}
            onClick={hasUsableCredentials ? onSelect : undefined}
        >
            {Icon && <Icon size={14} className="pktw-text-[--text-muted] pktw-shrink-0" />}
            <span className="pktw-flex-1 pktw-text-sm pktw-text-[--text-normal] pktw-truncate">{profile.name}</span>
            {!hasUsableCredentials && (
                <span className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-red-100 pktw-text-red-700">
                    {strings.steps.provider.missingCredentialsChip}
                </span>
            )}
            {selected && <Check size={14} className="pktw-text-[--interactive-accent]" />}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="pktw-p-1 pktw-rounded hover:pktw-bg-[--background-modifier-error] pktw-text-[--text-muted] hover:pktw-text-red-500"
                title={strings.steps.provider.deleteProviderTitle}
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}
