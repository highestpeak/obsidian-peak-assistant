/**
 * Tools tab.
 *
 * Section order:
 *   1. External tools — MCP servers (Connected / Needs attention / Off)
 *   2. Web Access     — Provider row
 */

import React from 'react';
import { Globe } from 'lucide-react';
import { Row, Chip } from '@/ui/components/primitives';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { MCPServerSection } from '../components/MCPServerSection';
import { useSettingsStrings } from '../settingsStrings';
import { PluginCommandGatewaySection } from '../components/PluginCommandGatewaySection';

interface ToolsTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function ToolsTab({ settings, settingsUpdates }: ToolsTabProps) {
    const strings = useSettingsStrings();
    const toolsCopy = strings.tools;

    return (
        <div className="pkset-panel">
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{toolsCopy.externalTools.sectionTitle}</span>
                    <span className="pkset-section__sub">{toolsCopy.externalTools.sectionSub}</span>
                </div>
                <MCPServerSection settings={settings} settingsUpdates={settingsUpdates} />
            </div>

            <PluginCommandGatewaySection />

            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{toolsCopy.webAccess.sectionTitle}</span>
                </div>
                <div className="pkset-row-list">
                    <Row>
                        <Row.Icon>
                            <Globe size={16} />
                        </Row.Icon>
                        <Row.Body>
                            <Row.Title>{toolsCopy.webAccess.provider.title}</Row.Title>
                            <Row.Desc>{toolsCopy.webAccess.provider.desc}</Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Chip variant="neutral">{toolsCopy.webAccess.provider.optional}</Chip>
                            <Row.Meta>{toolsCopy.webAccess.provider.notConfigured}</Row.Meta>
                        </Row.Right>
                    </Row>
                </div>
            </div>
        </div>
    );
}
