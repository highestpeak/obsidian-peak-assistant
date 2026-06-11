/**
 * Tools tab (PR-4, 2026-06-07).
 *
 * Section order (mock-aligned):
 *   1. External tools     — MCP servers (Connected / Needs attention / Off)
 *   2. Web Access         — Provider row + Used-by row
 *   3. Skills             — Skills folder + Installed skills
 *   4. Capture destinations — Inbox folder + Custom prompts folder
 */

import React, { useState } from 'react';
import { ChevronDown, Globe, Sparkles, User } from 'lucide-react';
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
            {/* ── External tools (MCP) ──────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{toolsCopy.externalTools.sectionTitle}</span>
                    <span className="pkset-section__sub">{toolsCopy.externalTools.sectionSub}</span>
                </div>
                <MCPServerSection settings={settings} settingsUpdates={settingsUpdates} />
            </div>

            {/* ── Hooks (advanced) — moved from Advanced > Agent runtime
                because hooks gate tool-use events, not the loop runtime. */}
            <div className="pkset-section">
                <HooksDisclosure settings={settings} />
            </div>

            {/* ── Web Access ────────────────────────────────────────── */}
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
                            {/* TODO: wire to web-access onboarding when chat/
                                web-access worktree lands its picker modal. */}
                            <Pill disabled>{toolsCopy.webAccess.provider.setup}</Pill>
                        </Row.Right>
                    </Row>
                    <Row>
                        <Row.Icon>
                            <User size={16} />
                        </Row.Icon>
                        <Row.Body>
                            <Row.Title>Used by</Row.Title>
                            <Row.Desc>
                                Capabilities that will turn on once Web Access is configured.
                            </Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <span className="pk-pill" data-selected="false">
                                Chat
                            </span>
                            <span className="pk-pill" data-selected="false">
                                Research
                            </span>
                        </Row.Right>
                    </Row>
                </div>
            </div>

            {/* ── Skills ────────────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">Skills</span>
                    <span className="pkset-section__sub">
                        Skills folder lives in Advanced &gt; Storage &gt; Derived folders.
                    </span>
                </div>
                <div className="pkset-row-list">
                    <Row>
                        <Row.Icon>
                            <Sparkles size={16} />
                        </Row.Icon>
                        <Row.Body>
                            <Row.Title>Installed skills</Row.Title>
                            <Row.Desc>Skill packs Peak found in your skills folder.</Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Chip variant="neutral">Inventory coming soon</Chip>
                        </Row.Right>
                    </Row>
                </div>
            </div>

            {/* Capture destinations + folder configs moved to
                Advanced > Storage > Derived folders (single canonical home). */}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Hooks (advanced) — collapsed by default. Migrated from
 * HarnessSettingsSection because hooks are pre/post tool-use rules.
 * ───────────────────────────────────────────────────────────────────────── */

function HooksDisclosure({ settings }: { settings: MyPluginSettings }) {
    const [open, setOpen] = useState(false);
    const hooksEnabled = !!settings.harnessSettings?.hooksEnabled;
    return (
        <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-overflow-hidden">
            <div
                className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent-tint pktw-transition-colors"
                onClick={() => setOpen((v) => !v)}
            >
                <ChevronDown
                    size={14}
                    className={open ? '' : 'pktw--rotate-90 pktw-shrink-0'}
                    style={!open ? { transform: 'rotate(-90deg)' } : undefined}
                />
                <div className="pktw-flex pktw-flex-col pktw-gap-0.5">
                    <span className="pktw-text-sm pktw-font-semibold pktw-text-pk-foreground">
                        Hooks (advanced)
                    </span>
                    <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                        Pre/post tool-use hooks. Configuration DSL still in design.
                    </span>
                </div>
                <span className="pktw-ml-auto pktw-text-[11px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-pk-surface-sunken pktw-text-pk-foreground-faint">
                    Coming soon
                </span>
            </div>
            {open && (
                <div className="pktw-px-4 pktw-pb-4 pktw-pt-3 pktw-border-t pktw-border-pk-border pktw-space-y-2">
                    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-opacity-50 pktw-cursor-not-allowed">
                        <input
                            type="checkbox"
                            checked={hooksEnabled}
                            disabled
                            className="pktw-rounded pktw-border-pk-border"
                        />
                        <span className="pktw-text-xs pktw-text-pk-foreground-faint">
                            Enable pre/post tool-use hooks
                        </span>
                    </div>
                    <span className="pktw-block pktw-text-[11px] pktw-text-pk-foreground-faint">
                        Hook configuration DSL is not yet available. This section will allow
                        defining deny rules and command hooks for pre_tool_use / post_tool_use
                        events.
                    </span>
                </div>
            )}
        </div>
    );
}
