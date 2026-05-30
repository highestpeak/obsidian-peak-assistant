/**
 * Tools tab (PR-D).
 *
 * Surfaces:
 *   1. Web Access — placeholder row + setup CTA (real provider picker lands
 *      with the chat/web-access worktree)
 *   2. External Tools — existing MCPServerSection (already vocab-clean in PR-B
 *      as "External tools" / "tool servers")
 *
 * Safety lives in AI Setup (per spec: single canonical home). It is *not*
 * duplicated here.
 */

import React from 'react';
import { Globe } from 'lucide-react';
import { Row, Chip, Pill } from '@/ui/components/primitives';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { MCPServerSection } from '../components/MCPServerSection';
import { useSettingsStrings } from '../settingsStrings';

interface ToolsTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function ToolsTab({ settings, settingsUpdates }: ToolsTabProps) {
    const strings = useSettingsStrings();
    const toolsCopy = strings.tools;

    return (
        <div className="pkset-panel">
            {/* ── Web Access ────────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{toolsCopy.webAccess.sectionTitle}</span>
                </div>
                <div className="pkset-row-list">
                    <Row>
                        <Row.Icon><Globe size={16} /></Row.Icon>
                        <Row.Body>
                            <Row.Title>{toolsCopy.webAccess.provider.title}</Row.Title>
                            <Row.Desc>{toolsCopy.webAccess.provider.desc}</Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Chip variant="neutral">{toolsCopy.webAccess.provider.optional}</Chip>
                            <Row.Meta>{toolsCopy.webAccess.provider.notConfigured}</Row.Meta>
                            {/* TODO: wire to web-access onboarding when chat/
                                web-access worktree lands its picker modal. */}
                            <Pill disabled>{toolsCopy.webAccess.provider.setup}</Pill>
                        </Row.Right>
                    </Row>
                </div>
            </div>

            {/* ── External tools (MCP) ──────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{toolsCopy.externalTools.sectionTitle}</span>
                    <span className="pkset-section__sub">{toolsCopy.externalTools.sectionSub}</span>
                </div>
                <MCPServerSection settings={settings} settingsUpdates={settingsUpdates} />
            </div>
        </div>
    );
}
