/**
 * Knowledge Index tab (PR-D).
 *
 * Reuses the existing `SearchTab` content (index status, depth selector,
 * rebuild CTA, chunking, AI Analysis). The 5-tab IA pulls all search/embedding
 * config under this one tab; existing SearchTab already groups them by
 * subsection so PR-D does not need to rewire field-level UI.
 *
 * PR-E follow-up: replace static section header with `CapabilityRegistry`
 * readiness for the Knowledge Index surface (a single row at the top showing
 * "Ready / Needs attention / Not ready" plus repair pills).
 */

import React from 'react';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { SearchTab } from '../SearchTab';

interface KnowledgeIndexTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function KnowledgeIndexTab({ settings, settingsUpdates }: KnowledgeIndexTabProps) {
    return (
        <div className="pkset-panel">
            <SearchTab settings={settings} settingsUpdates={settingsUpdates} />
        </div>
    );
}
