/**
 * Advanced tab (PR-D).
 *
 * Per spec the Advanced tab is the ONLY place internal vocabulary ("Harness",
 * runtime backend selectors, hooks DSL, diagnostics) is allowed to surface.
 *
 * Sections:
 *   1. Intro / re-run setup wizard banner
 *   2. Agent runtime (raw HarnessSettingsSection — backend + escalation +
 *      tier bindings + hooks)
 *   3. Storage + General (existing GeneralTab content)
 *   4. Diagnostics / maintenance actions (existing MaintenanceTab content)
 */

import React from 'react';
import { FileText, Wand2 } from 'lucide-react';
import { Pill } from '@/ui/components/primitives';
import { Button } from '@/ui/component/shared-ui/button';
import { openHarnessSetupWizard, openPromptTemplates } from '@/app/commands/PeakCommandActions';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { HarnessSettingsSection } from '../components/HarnessSettingsSection';
import { SettingCard } from '../components/SettingCard';
import { GeneralTab } from '../GeneralTab';
import { MaintenanceTab } from '../MaintenanceTab';
import { useSettingsStrings } from '../settingsStrings';

interface AdvancedTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function AdvancedTab({ settings, settingsUpdates }: AdvancedTabProps) {
    const strings = useSettingsStrings();
    const advCopy = strings.advanced;

    return (
        <div className="pkset-panel">
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{advCopy.intro.sectionTitle}</span>
                    <span className="pkset-section__sub">{advCopy.intro.sectionSub}</span>
                </div>

                <div className="pkset-banner">
                    <Wand2 className="pkset-banner__icon" size={18} />
                    <div className="pkset-banner__body">
                        <span className="pkset-banner__title">{advCopy.reRun.title}</span>
                        <span className="pkset-banner__desc">{advCopy.reRun.desc}</span>
                    </div>
                    <Pill onClick={openHarnessSetupWizard}>{advCopy.reRun.cta}</Pill>
                </div>
            </div>

            <div className="pkset-section">
                <HarnessSettingsSection settings={settings} settingsUpdates={settingsUpdates} />
            </div>

            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{advCopy.general.sectionTitle}</span>
                </div>
                <GeneralTab settings={settings} settingsUpdates={settingsUpdates} />
            </div>

            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">Prompt Templates</span>
                    <span className="pkset-section__sub">Manage custom prompts loaded from your prompts folder.</span>
                </div>
                <SettingCard
                    label="Open Prompt Templates"
                    description="Browse, edit, and reload custom Copilot prompts."
                >
                    <Button variant="outline" size="sm" onClick={openPromptTemplates}>
                        <FileText className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                        Open
                    </Button>
                </SettingCard>
            </div>

            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{advCopy.diagnostics.sectionTitle}</span>
                    <span className="pkset-section__sub">{advCopy.diagnostics.sectionSub}</span>
                </div>
                <MaintenanceTab />
            </div>
        </div>
    );
}
