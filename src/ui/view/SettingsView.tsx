import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ViewEventType } from '@/core/eventBus';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { SETTINGS_TABS } from '@/core/settings/peakSettingsContract';
import { Button } from '@/ui/components/primitives';
import { useSettingsUpdate } from './settings/hooks/useSettingsUpdate';
import { AIModelsTab } from './settings/tabs/AIModelsTab';
import { AgentsTab } from './settings/tabs/AgentsTab';
import { KnowledgeSearchTab } from './settings/tabs/KnowledgeSearchTab';
import { AdvancedSettingsTab } from './settings/tabs/AdvancedSettingsTab';
import type { TabId } from './settings/types';

export function SettingsRoot({
	initialTab,
	onOpenCommandGateway,
	onOpenAIControlCenter,
	onOpenIndexWorkspace,
}: {
	initialTab?: TabId;
	onOpenCommandGateway: () => void | Promise<void>;
	onOpenAIControlCenter: () => void | Promise<void>;
	onOpenIndexWorkspace: () => void | Promise<void>;
}) {
    const { eventBus, plugin } = useServiceContext();
    const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'aiModels');
    const [settings, setSettings] = useState<MyPluginSettings>(plugin.settings);
	const rootRef = useRef<HTMLDivElement>(null);
	const [modelPickerPortal, setModelPickerPortal] = useState<HTMLElement | null>(null);

	// ReactModalHost renders this tree inside Obsidian's .modal-content. Picker
	// content must stay there too, otherwise Obsidian sees the menu click as an
	// outside interaction and closes the Settings modal.
	useLayoutEffect(() => {
		setModelPickerPortal(rootRef.current?.closest('.modal-content') as HTMLElement | null);
	}, []);

    // Re-sync settings copy when persistence layer dispatches an update event.
    useEffect(() => {
        const unsubscribe = eventBus.on(ViewEventType.SETTINGS_UPDATED, () => {
            setSettings({ ...plugin.settings });
        });
        return unsubscribe;
    }, [eventBus, plugin]);

    const settingsUpdates = useSettingsUpdate(plugin, eventBus, settings);

    return (
        <div ref={rootRef} className="peak-design-root">
            <div className="pk-settings-root">
                <nav className="pk-settings-tabs" role="tablist" aria-label="Peak Assistant settings">
                    {SETTINGS_TABS.map((tab) => (
                        <Button
                            key={tab.id}
                            variant="ghost"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            data-active={activeTab === tab.id ? 'true' : 'false'}
                            className="pk-settings-tabs__tab"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </Button>
                    ))}
                </nav>
                <div className="pk-settings-scroll">
                    {activeTab === 'aiModels' && <AIModelsTab settings={settings} settingsUpdates={settingsUpdates} onOpenAIControlCenter={onOpenAIControlCenter} modelPickerPortal={modelPickerPortal} />}
                    {activeTab === 'agents' && <AgentsTab settings={settings} settingsUpdates={settingsUpdates} onOpenCommandGateway={onOpenCommandGateway} modelPickerPortal={modelPickerPortal} />}
                    {activeTab === 'knowledgeSearch' && <KnowledgeSearchTab settings={settings} settingsUpdates={settingsUpdates} onOpenIndexWorkspace={onOpenIndexWorkspace} modelPickerPortal={modelPickerPortal} />}
                    {activeTab === 'advanced' && <AdvancedSettingsTab settings={settings} settingsUpdates={settingsUpdates} />}
                </div>
            </div>
        </div>
    );
}
