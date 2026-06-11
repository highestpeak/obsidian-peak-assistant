/**
 * Recommended setup preset grid (PR-2, 2026-06-07).
 *
 * Four cards: Balanced / Lowest cost / Research quality / Local-private.
 * Selecting a preset is informational only in this PR — the actual harness
 * tier-binding mutation will land with the per-preset apply logic that PR-2's
 * follow-up will wire in. For now, selection state is local + cosmetic so the
 * user can see the affordance.
 *
 * Mock anchor: docs/gstack/settings-redesign-2026-05-29/index.html#aiSetup
 * lines 177-202. CSS lives in src/styles/peak-components.css under
 * `.pkset-preset-grid` / `.pkset-preset` / `.pkset-preset__check`.
 */

import React, { useState } from 'react';
import { Check, Microscope, Scale, Shield, Sliders, Zap } from 'lucide-react';
import { useSettingsStrings } from '../settingsStrings';

type PresetKey = 'balanced' | 'lowestCost' | 'researchQuality' | 'localPrivate' | 'manual';

const ICON_FOR_PRESET: Record<PresetKey, React.ElementType> = {
    balanced: Scale,
    lowestCost: Zap,
    researchQuality: Microscope,
    localPrivate: Shield,
    manual: Sliders,
};

interface RecommendedSetupGridProps {
    /** When true, force selection to "Manual" — set by the parent whenever the
     *  user has customized individual tier bindings outside of preset defaults. */
    manual?: boolean;
}

export function RecommendedSetupGrid({ manual = false }: RecommendedSetupGridProps) {
    const strings = useSettingsStrings();
    const copy = strings.aiSetup.recommendedSetup;
    const [selected, setSelected] = useState<PresetKey>('balanced');
    const effectiveSelected: PresetKey = manual ? 'manual' : selected;

    const presets: Array<{ key: PresetKey; title: string; desc: string }> = [
        { key: 'balanced', title: copy.balanced.title, desc: copy.balanced.desc },
        { key: 'lowestCost', title: copy.lowestCost.title, desc: copy.lowestCost.desc },
        {
            key: 'researchQuality',
            title: copy.researchQuality.title,
            desc: copy.researchQuality.desc,
        },
        { key: 'localPrivate', title: copy.localPrivate.title, desc: copy.localPrivate.desc },
        {
            key: 'manual',
            title: 'Manual',
            desc: 'Your own tier bindings. Picked via Change buttons below.',
        },
    ];

    return (
        <div
            className="pkset-preset-grid"
            role="radiogroup"
            style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
        >
            {presets.map(({ key, title, desc }) => {
                const Icon = ICON_FOR_PRESET[key];
                const isSelected = effectiveSelected === key;
                const isManualSlot = key === 'manual';
                return (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-selected={isSelected ? 'true' : 'false'}
                        className="pkset-preset"
                        disabled={isManualSlot}
                        onClick={() => {
                            if (!isManualSlot) setSelected(key);
                        }}
                        style={isManualSlot ? { cursor: 'default' } : undefined}
                    >
                        <span className="pkset-preset__check">
                            <Check size={12} />
                        </span>
                        <span className="pkset-preset__icon">
                            <Icon size={16} />
                        </span>
                        <span className="pkset-preset__title">{title}</span>
                        <span className="pkset-preset__desc">{desc}</span>
                    </button>
                );
            })}
        </div>
    );
}
