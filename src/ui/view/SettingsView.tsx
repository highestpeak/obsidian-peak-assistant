/**
 * SettingsRoot — 5-tab IA settings panel (PR-D, 2026-05-30).
 *
 * Tabs (per docs/superpowers/specs/2026-05-29-settings-interface-design.md):
 *   1. Overview        — readiness rows (hardcoded in PR-D, swapped to
 *                        CapabilityRegistry.getAll() in PR-E)
 *   2. AI Setup        — Providers + AI Behavior tier summary + Safety
 *   3. Knowledge Index — vault index status + repair + chunking + AI Analysis
 *   4. Tools           — Web Access + External Tools (MCP)
 *   5. Advanced        — raw HarnessSettings + Storage + Diagnostics
 *
 * Vocabulary contract: "Harness" / "Quick" / "Deep" appear ONLY inside the
 * Advanced tab. All user-visible strings come from `useSettingsStrings()`.
 */

import React, { useState, useEffect } from 'react';
import { ViewEventType } from '@/core/eventBus';
import type { MyPluginSettings } from '@/app/settings/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useSettingsUpdate } from './settings/hooks/useSettingsUpdate';
import {
    DEFAULT_SETTINGS_STRINGS,
    SettingsStringsProvider,
    loadSettingsStrings,
    type SettingsStrings,
} from './settings/settingsStrings';
import { OverviewTab } from './settings/tabs/OverviewTab';
import { AISetupTab } from './settings/tabs/AISetupTab';
import { KnowledgeIndexTab } from './settings/tabs/KnowledgeIndexTab';
import { ToolsTab } from './settings/tabs/ToolsTab';
import { AdvancedTab } from './settings/tabs/AdvancedTab';
import type { TabId } from './settings/types';

export function SettingsRoot() {
    const { eventBus, plugin } = useServiceContext();
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [settings, setSettings] = useState<MyPluginSettings>(plugin.settings);
    const [strings, setStrings] = useState<SettingsStrings>(DEFAULT_SETTINGS_STRINGS);

    // Load externalised strings from templates/config/settings.json on mount.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const loaded = await loadSettingsStrings();
            if (!cancelled) setStrings(loaded);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Re-sync settings copy when persistence layer dispatches an update event.
    useEffect(() => {
        const unsubscribe = eventBus.on(ViewEventType.SETTINGS_UPDATED, () => {
            setSettings({ ...plugin.settings });
        });
        return unsubscribe;
    }, [eventBus, plugin]);

    const settingsUpdates = useSettingsUpdate(plugin, eventBus, settings);

    const tabs: Array<{ id: TabId; label: string }> = [
        { id: 'overview', label: strings.tabs.overview },
        { id: 'aiSetup', label: strings.tabs.aiSetup },
        { id: 'knowledgeIndex', label: strings.tabs.knowledgeIndex },
        { id: 'tools', label: strings.tabs.tools },
        { id: 'advanced', label: strings.tabs.advanced },
    ];

    /**
     * PR-E note: Overview-row CTAs are no longer dispatched centrally — each
     * surface's CapabilityStatus.repair.action is invoked directly by the
     * OverviewTab (adapters self-supply the right repair UX, e.g. opening
     * the Obsidian settings modal). Removed the surface-id → tab switch
     * map that PR-D used while the stub was the data source.
     */

    return (
        <SettingsStringsProvider strings={strings}>
            <div className="peak-design-root">
                <div className="pkset-root">
                    {/* Tab bar */}
                    <div className="pkset-tabs" role="tablist">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.id}
                                data-active={activeTab === tab.id ? 'true' : 'false'}
                                className="pkset-tabs__tab"
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    {activeTab === 'overview' && (
                        <OverviewTab settings={settings} onSwitchTab={setActiveTab} />
                    )}
                    {activeTab === 'aiSetup' && (
                        <AISetupTab settings={settings} settingsUpdates={settingsUpdates} />
                    )}
                    {activeTab === 'knowledgeIndex' && (
                        <KnowledgeIndexTab settings={settings} settingsUpdates={settingsUpdates} />
                    )}
                    {activeTab === 'tools' && (
                        <ToolsTab settings={settings} settingsUpdates={settingsUpdates} />
                    )}
                    {activeTab === 'advanced' && (
                        <AdvancedTab settings={settings} settingsUpdates={settingsUpdates} />
                    )}
                </div>
            </div>
        </SettingsStringsProvider>
    );
}
