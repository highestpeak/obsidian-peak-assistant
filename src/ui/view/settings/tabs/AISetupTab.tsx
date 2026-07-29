/**
 * AI Setup tab (PR-2, updated 2026-06-10).
 *
 * Section order:
 *   1. Recommended setup — 4-up preset grid + auto-Manual when bindings diverge
 *   2. AI behavior       — Conversation / Fast Lookup / Research / Stronger / KI.
 *                          Change pill opens an inline model picker; selection
 *                          writes straight into harnessSettings (no wizard hop).
 *   3. Providers         — connected provider list + Custom endpoints + Advanced
 *                          model controls disclosure (all carried by ProfilesTab)
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu, Database, Info, MessageSquare, Search as SearchIcon, Shield, Sparkle, Zap } from 'lucide-react';
import { Row, Chip, Segmented } from '@/ui/components/primitives';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { RoleModelPicker } from '../components/RoleModelPicker';
import { DEFAULT_HARNESS_SETTINGS, type MyPluginSettings, type HarnessSettings } from '@/core/config/settingsTypes';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import { ProfilesTab } from '../ProfilesTab';
import { RecommendedSetupGrid } from '../components/RecommendedSetupGrid';
import { useSettingsStrings } from '../settingsStrings';
import { SettingsRow, SettingsSection } from '../components/SettingsRow';
import { createBuiltInSimulatorProfile } from '@/core/profiles/presets';

interface AISetupTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

type TierKey = 'fastLookup' | 'research' | 'strongerModel';

const EMBEDDING_MODEL_RE = /embed|nomic|voyage|bge|e5/i;
const isEmbeddingModel = (modelId: string): boolean => EMBEDDING_MODEL_RE.test(modelId);

export function AISetupTab({ settings, settingsUpdates }: AISetupTabProps) {
    const strings = useSettingsStrings();
    const aiSetupCopy = strings.aiSetup;

    const harness: HarnessSettings | undefined = settings.harnessSettings;
    // Force re-render when ProfileRegistry mutates outside of settings.harnessSettings
    // (Conversation / Knowledge Index bindings live in ProfileRegistry's active*Config).
    const [, setTick] = useState(0);
    const bump = () => setTick((t) => t + 1);

    useEffect(() => {
        const registry = ProfileRegistry.getInstance();
        if (registry.getAllProfiles().some((profile) => profile.kind === 'simulator')) return;
        registry.addProfile(createBuiltInSimulatorProfile());
        bump();
    }, []);

    const writeTier = (tier: TierKey, cfg: RoleConfig | null) => {
        const base: HarnessSettings = harness ?? DEFAULT_HARNESS_SETTINGS;
        const next: HarnessSettings =
            tier === 'fastLookup'
                ? { ...base, localFastConfig: cfg }
                : tier === 'research'
                ? { ...base, localDeepConfig: cfg }
                : { ...base, onlineConfig: cfg };
        settingsUpdates.update('harnessSettings', next);
    };

    const writeConversation = (cfg: RoleConfig | null) => {
        ProfileRegistry.getInstance().setActiveChatConfig(cfg);
        bump();
    };
    const writeEmbedding = (cfg: RoleConfig | null) => {
        ProfileRegistry.getInstance().setActiveEmbeddingConfig(cfg);
        bump();
    };

    const allProfiles = ProfileRegistry.getInstance().getAllProfiles();
    const simulatorProfiles = allProfiles.filter((p) => p.kind === 'simulator');
    const localProfiles = allProfiles.filter((p) => p.kind === 'ollama' || p.kind === 'litellm' || p.kind === 'custom');
    const cloudProfiles = allProfiles.filter(
        (p) => p.kind === 'anthropic' || p.kind === 'openai' || p.kind === 'openrouter' || p.kind === 'google' || p.kind === 'perplexity',
    );

    const chatActive = ProfileRegistry.getInstance().getActiveChatConfig();
    const embeddingActive = ProfileRegistry.getInstance().getActiveEmbeddingConfig();
    const chatBound: RoleConfig | null = chatActive
        ? { profileId: chatActive.profile.id, modelId: chatActive.modelId }
        : null;
    const embeddingBound: RoleConfig | null = embeddingActive
        ? { profileId: embeddingActive.profile.id, modelId: embeddingActive.modelId }
        : null;

    const baseHarness = (): HarnessSettings => settings.harnessSettings ?? DEFAULT_HARNESS_SETTINGS;

    const behaviorRows: BehaviorPickerRowProps[] = [
        { icon: MessageSquare, title: aiSetupCopy.aiBehavior.conversation.title, desc: aiSetupCopy.aiBehavior.conversation.desc, usedBy: aiSetupCopy.aiBehavior.conversation.usedBy, bound: chatBound, fallbackText: null, changeLabel: aiSetupCopy.aiBehavior.change, setupLabel: aiSetupCopy.aiBehavior.setup, profiles: [...cloudProfiles, ...localProfiles], onWrite: writeConversation },
        { icon: Zap, title: aiSetupCopy.aiBehavior.fastLookup.title, desc: aiSetupCopy.aiBehavior.fastLookup.desc, usedBy: aiSetupCopy.aiBehavior.fastLookup.usedBy, bound: harness?.localFastConfig ?? null, fallbackText: aiSetupCopy.aiBehavior.fallsBack, changeLabel: aiSetupCopy.aiBehavior.change, setupLabel: aiSetupCopy.aiBehavior.setup, profiles: [...localProfiles, ...cloudProfiles], onWrite: (cfg) => writeTier('fastLookup', cfg) },
        { icon: SearchIcon, title: aiSetupCopy.aiBehavior.research.title, desc: aiSetupCopy.aiBehavior.research.desc, usedBy: aiSetupCopy.aiBehavior.research.usedBy, bound: harness?.localDeepConfig ?? null, fallbackText: aiSetupCopy.aiBehavior.fallsBack, changeLabel: aiSetupCopy.aiBehavior.change, setupLabel: aiSetupCopy.aiBehavior.setup, profiles: [...simulatorProfiles, ...localProfiles, ...cloudProfiles], onWrite: (cfg) => writeTier('research', cfg) },
        { icon: Sparkle, title: aiSetupCopy.aiBehavior.strongerModel.title, desc: aiSetupCopy.aiBehavior.strongerModel.desc, usedBy: aiSetupCopy.aiBehavior.strongerModel.usedBy, bound: harness?.onlineConfig ?? null, fallbackText: aiSetupCopy.aiBehavior.strongerModel.offChip, changeLabel: aiSetupCopy.aiBehavior.change, setupLabel: aiSetupCopy.aiBehavior.setup, profiles: cloudProfiles, onWrite: (cfg) => writeTier('strongerModel', cfg) },
        { icon: Database, title: aiSetupCopy.aiBehavior.knowledgeIndex.title, desc: aiSetupCopy.aiBehavior.knowledgeIndex.desc, usedBy: aiSetupCopy.aiBehavior.knowledgeIndex.usedBy, bound: embeddingBound, fallbackText: null, changeLabel: aiSetupCopy.aiBehavior.change, setupLabel: aiSetupCopy.aiBehavior.setup, profiles: allProfiles, onWrite: writeEmbedding, modelFilter: isEmbeddingModel },
    ];

    return (
        <div className="pkset-panel">
            <SettingsSection
                title="Runtime"
                sub="Which loop engine runs agents. Auto picks the in-process Vercel AI SDK runtime when supported and falls back to the Claude Agent SDK for Anthropic-only workflows like Vault Search."
            >
                <div className="pkset-row-list">
                    <SettingsRow
                        icon={Cpu}
                        title="Agent runtime"
                        desc="Auto prefers the in-process harness; use In-process to force local models only."
                        right={
                            <select
                                className="pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5"
                                value={settings.harnessSettings?.agentBackend ?? 'auto'}
                                onChange={(e) => settingsUpdates.update('harnessSettings', {
                                    ...baseHarness(),
                                    agentBackend: e.target.value as HarnessSettings['agentBackend'],
                                })}
                            >
                                <option value="auto">Auto</option>
                                <option value="harness">In-process (Vercel AI SDK)</option>
                            </select>
                        }
                    />
                </div>
            </SettingsSection>

            <SettingsSection title="Safety" sub="Write-permission gate for the whole agent surface.">
                <div className="pkset-row-list">
                    <SettingsRow
                        icon={Shield}
                        title="Default safety mode"
                        desc="Controls how agents handle write operations to your vault."
                        right={
                            <Segmented<HarnessSettings['defaultPermissionMode']>
                                value={settings.harnessSettings?.defaultPermissionMode ?? 'acceptEdits'}
                                onValueChange={(next) => settingsUpdates.update('harnessSettings', { ...baseHarness(), defaultPermissionMode: next })}
                                options={[
                                    { value: 'read', label: 'Read only' },
                                    { value: 'acceptEdits', label: 'Ask' },
                                    { value: 'bypassPermissions', label: 'Bypass' },
                                ]}
                                aria-label="Default safety mode"
                            />
                        }
                    />
                </div>
            </SettingsSection>

            <SettingsSection
                title={aiSetupCopy.recommendedSetup.sectionTitle}
                sub={aiSetupCopy.recommendedSetup.sectionSub}
            >
                <RecommendedSetupGrid manual={hasManualBindings(harness)} />
            </SettingsSection>

            <SettingsSection title={aiSetupCopy.aiBehavior.sectionTitle}>
                <div className="pkset-row-list">
                    {behaviorRows.map((row, i) => (
                        <BehaviorPickerRow key={i} {...row} />
                    ))}
                </div>
            </SettingsSection>

            <SettingsSection
                title={aiSetupCopy.providers.sectionTitle}
                sub={aiSetupCopy.providers.sectionSub}
            >
                <ProfilesTab settings={settings} settingsUpdates={settingsUpdates} hideStatusBar />
            </SettingsSection>
        </div>
    );
}

function hasManualBindings(harness: HarnessSettings | undefined): boolean {
    if (!harness) return false;
    return !!(harness.localFastConfig || harness.localDeepConfig || harness.onlineConfig);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Rows
 * ───────────────────────────────────────────────────────────────────────── */

interface BaseRowProps {
    icon: React.ElementType;
    title: string;
    desc: string;
    /** "Who actually consumes this binding" copy, shown in the info hover card. */
    usedBy: string;
    bound: RoleConfig | string | null;
    fallbackText: string | null;
    changeLabel: string;
    setupLabel: string;
}

/**
 * Info affordance next to each behavior row's title. Hovering reveals which
 * product features actually consume this binding (and its fallback), so users
 * can tell e.g. that "Research" is what drives Vault Search / AI Analysis.
 */
function UsedByHint({ title, usedBy }: { title: string; usedBy: string }) {
    const strings = useSettingsStrings();
    return (
        <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    aria-label={`${title} — ${strings.aiSetup.aiBehavior.usedByLabel}`}
                    className="pktw-inline-flex pktw-items-center pktw-text-pk-foreground-faint hover:pktw-text-pk-foreground pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-cursor-help"
                >
                    <Info size={13} />
                </button>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="pktw-w-80">
                <span className="pktw-block pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-pk-foreground-muted pktw-mb-1">
                    {strings.aiSetup.aiBehavior.usedByLabel}
                </span>
                <span className="pktw-block pktw-text-pk-sm pktw-leading-snug pktw-text-pk-foreground">
                    {usedBy}
                </span>
            </HoverCardContent>
        </HoverCard>
    );
}

interface BehaviorPickerRowProps extends BaseRowProps {
    profiles: Profile[];
    onWrite: (cfg: RoleConfig | null) => void;
    /** Optional model id filter, e.g. embedding-only models for Knowledge Index. */
    modelFilter?: (modelId: string) => boolean;
}

function BehaviorPickerRow(props: BehaviorPickerRowProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const display = renderBoundLabel(props.bound);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const activeConfig =
        props.bound && typeof props.bound !== 'string'
            ? (() => {
                  const p = ProfileRegistry.getInstance()
                      .getAllProfiles()
                      .find((p) => p.id === props.bound!.profileId);
                  return p
                      ? { profile: p, modelId: (props.bound as RoleConfig).modelId }
                      : null;
              })()
            : null;

    const handleSelect = (cfg: RoleConfig) => {
        props.onWrite(cfg);
        setOpen(false);
    };
    const handleClear = () => {
        props.onWrite(null);
        setOpen(false);
    };

    return (
        <Row>
            <Row.Icon><props.icon size={16} /></Row.Icon>
            <Row.Body>
                <Row.Title>
                    <span className="pktw-inline-flex pktw-items-center pktw-gap-1.5">
                        {props.title}
                        <UsedByHint title={props.title} usedBy={props.usedBy} />
                    </span>
                </Row.Title>
                <Row.Desc>{props.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {display ? (
                    <Row.Value>{display}</Row.Value>
                ) : props.fallbackText ? (
                    <Chip variant="warning">{props.fallbackText}</Chip>
                ) : (
                    <Chip variant="neutral">—</Chip>
                )}
                <div ref={wrapRef} className="pktw-relative">
                    <button
                        type="button"
                        className="pk-pill pktw-gap-1"
                        onClick={() => setOpen((v) => !v)}
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                        {display ? props.changeLabel : props.setupLabel}
                        <ChevronDown size={12} />
                    </button>
                    {open && (
                        <div
                            className="pktw-absolute pktw-z-50 pktw-mt-1"
                            style={{ right: 0, top: '100%' }}
                        >
                            <RoleModelPicker
                                activeConfig={activeConfig}
                                profiles={props.profiles}
                                onSelect={handleSelect}
                                onClear={handleClear}
                                modelFilter={props.modelFilter}
                            />
                        </div>
                    )}
                </div>
            </Row.Right>
        </Row>
    );
}

function renderBoundLabel(bound: RoleConfig | string | null): string | null {
    if (typeof bound === 'string') return bound;
    if (!bound) return null;
    return formatRoleConfig(bound);
}

function formatRoleConfig(cfg: RoleConfig): string {
    const profile = ProfileRegistry.getInstance()
        .getAllProfiles()
        .find((p) => p.id === cfg.profileId);
    if (!profile) return cfg.modelId;
    return `${profile.name} · ${cfg.modelId}`;
}

function resolveEmbeddingDisplay(): string | null {
    const p = ProfileRegistry.getInstance().getActiveEmbeddingProfile();
    return p ? p.name : null;
}
