/**
 * Provider step for the harness onboarding wizard.
 *
 * Layout (mocked):
 *   - Saved providers list (pk-row + chip + delete icon-btn)
 *   - "Add a new provider" 4-col chip grid (pkonb-provider-grid)
 *   - Inline AddProviderForm reused from the general onboarding modal
 *
 * Visual: design-token only, accent-soft selected state with check icon.
 * Strings: useOnboardingStrings (vocabulary contract: "Provider", not "Profile").
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import { Row, Chip, Button, IconButton } from '@/ui/components/primitives';
import { AddProviderForm, PROVIDER_OPTIONS } from '../onboarding/ProviderForm';
import { useOnboardingStrings, type OnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface ProviderStepProps {
    selectedProfileId: string | null;
    onSelect: (profileId: string) => void;
    onClear: () => void;
    onBack: () => void;
    onContinue: () => void;
}

export function ProviderStep({ selectedProfileId, onSelect, onClear }: ProviderStepProps) {
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
        <div className="pkonb-section">
            <div>
                <div className="pkonb-section__title">{copy.title}</div>
                <div className="pkonb-section__desc">{copy.description}</div>
            </div>

            {profiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pk-space-2)' }}>
                    {profiles.map((p) => (
                        <SavedProviderRow
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

            {showForm ? (
                <AddProviderForm onAdded={handleAdded} setActiveOnFirst={false} autoAssignWebSearch={false} />
            ) : (
                <Button
                    variant="secondary"
                    onClick={() => setShowForm(true)}
                    style={{ alignSelf: 'flex-start' }}
                >
                    <Plus />
                    <span>{strings.actions.addProvider}</span>
                </Button>
            )}
        </div>
    );
}

interface SavedProviderRowProps {
    profile: Profile;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    strings: OnboardingStrings;
}

function SavedProviderRow({ profile, selected, onSelect, onDelete, strings }: SavedProviderRowProps) {
    const option = PROVIDER_OPTIONS.find((p) => p.kind === profile.kind);
    const Icon = option?.Icon ?? null;
    const hasUsableCredentials = profile.kind === 'ollama' || !!(profile.apiKey && profile.apiKey.length > 0);

    return (
        <Row
            onClick={hasUsableCredentials ? onSelect : undefined}
            style={{
                cursor: hasUsableCredentials ? 'pointer' : 'default',
                ...(selected ? { borderColor: 'var(--pk-accent)', background: 'var(--pk-accent-soft)' } : {}),
            }}
        >
            <Row.Icon>{Icon ? <Icon /> : null}</Row.Icon>
            <Row.Body>
                <Row.Title>{profile.name}</Row.Title>
                <Row.Desc>{option?.desc ?? ''}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {!hasUsableCredentials && (
                    <Chip variant="danger">{strings.steps.provider.missingCredentialsChip}</Chip>
                )}
                {hasUsableCredentials && selected && (
                    <Chip variant="success">
                        <Check />
                        <span>Selected</span>
                    </Chip>
                )}
                <IconButton
                    label={strings.steps.provider.deleteProviderTitle}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 />
                </IconButton>
            </Row.Right>
        </Row>
    );
}
