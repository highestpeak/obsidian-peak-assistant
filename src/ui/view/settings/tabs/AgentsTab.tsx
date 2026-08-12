import React, { useState } from 'react';
import {
	Bot, ChevronDown, ChevronRight, Command, Globe, Puzzle, ShieldCheck,
	Sparkles, Wrench,
} from 'lucide-react';
import type { HarnessSettings, MyPluginSettings } from '@/core/config/settingsTypes';
import { DEFAULT_HARNESS_SETTINGS } from '@/core/config/settingsTypes';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { AGENT_SAFETY_MODES } from '@/core/settings/peakSettingsContract';
import { Button, Toggle } from '@/ui/components/primitives';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { UnifiedModelPicker } from '../components/UnifiedModelPicker';
import { MCPServerSection } from '../components/MCPServerSection';
import { PluginCommandGatewaySection } from '../components/PluginCommandGatewaySection';

export function AgentsTab({ settings, settingsUpdates, onOpenCommandGateway }: {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
	onOpenCommandGateway: () => void | Promise<void>;
}) {
	const harness = settings.harnessSettings ?? DEFAULT_HARNESS_SETTINGS;
	const profiles = ProfileRegistry.getInstance().getAllProfiles();
	function update(patch: Partial<HarnessSettings>) {
		if (patch.executionModel !== undefined) {
			ProfileRegistry.getInstance().setActiveAgentConfig(patch.executionModel);
		}
		void settingsUpdates.update('harnessSettings', { ...harness, ...patch });
	}
	return (
		<div className="pk-settings-page">
			<header className="pk-settings-page__header">
				<span className="pk-settings-page__eyebrow">Agent capabilities & control</span>
				<span className="pk-settings-page__title">Agents</span>
				<span className="pk-settings-page__intro">Choose how Peak Hermes works, which capabilities it may use and where it must ask first.</span>
			</header>

			<SafetyMode harness={harness} onChange={(defaultPermissionMode) => update({ defaultPermissionMode })} />

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading"><span><strong>Agent execution</strong><small>Peak Hermes is the single runtime. The selected provider and model execute its steps.</small></span></div>
				<div className="pk-hermes-status"><span><Bot size={22} /><span><strong>Peak Hermes</strong><small>Planning, tools, permissions, receipts and recovery</small></span></span><span>Runtime ready</span></div>
				<div className="pk-settings-list">
					<div className="pk-settings-model-row"><span><strong>Execution model</strong><small>Only models with reliable tool calling can be selected.</small></span><UnifiedModelPicker profiles={profiles} value={harness.executionModel} requirement={{ tools: true }} onChange={(executionModel) => update({ executionModel })} aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} /></div>
					<ToggleRow label="Use a stronger model when needed" summary="Still follows budget and confirmation rules." checked={harness.allowEscalation} onChange={(allowEscalation) => update({ allowEscalation })} />
					<label className="pk-settings-field-row"><span><strong>Monthly Agent budget</strong><small>Show alerts before expensive work; never silently changes permission rules.</small></span><span className="pk-number-unit"><input type="number" min={0} value={harness.budget.monthlyUsd} onChange={(event) => update({ budget: { ...harness.budget, monthlyUsd: Math.max(0, Number(event.target.value)) } })} /><small>USD</small></span></label>
				</div>
			</section>

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading"><span><strong>Available tools</strong><small>Tools are disabled independently from models and connections.</small></span></div>
				<div className="pk-settings-list">
					<ToolRow icon={Globe} label="Web access" summary="Search and open current information when the task permits it." checked={harness.tools.webAccess} onChange={(webAccess) => update({ tools: { ...harness.tools, webAccess } })} />
					<ToolRow icon={Puzzle} label="MCP servers" summary={`${settings.mcpServers?.filter((server) => server.enabled).length ?? 0} connected servers`} checked={harness.tools.mcp} onChange={(mcp) => update({ tools: { ...harness.tools, mcp } })} />
					<ToolRow icon={Sparkles} label="Agent Skills" summary="Standard skill packages Peak Hermes may discover and invoke." checked={harness.tools.skills} onChange={(skills) => update({ tools: { ...harness.tools, skills } })} />
					<ToolRow icon={Command} label="Obsidian commands" summary="Only explicitly approved commands become tools." checked={harness.tools.obsidianCommands} onChange={(obsidianCommands) => update({ tools: { ...harness.tools, obsidianCommands } })} />
					<ToolRow icon={Wrench} label="External plugin commands" summary="Review third-party commands in Command Gateway." checked={harness.tools.externalPluginCommands} onChange={(externalPluginCommands) => update({ tools: { ...harness.tools, externalPluginCommands } })} />
				</div>
				<details className="pk-settings-native-details"><summary><span><strong>MCP connections</strong><small>Add or repair external tool servers.</small></span><span>{settings.mcpServers?.length ?? 0} servers</span></summary><div className="pk-settings-native-details__body"><MCPServerSection settings={settings} settingsUpdates={settingsUpdates} /></div></details>
				<details className="pk-settings-native-details"><summary><span><strong>Agent Skills</strong><small>Skill format, discovery folder and availability.</small></span><span>{harness.tools.skills ? 'Enabled' : 'Off'}</span></summary><div className="pk-settings-native-details__body"><label className="pk-settings-field-row"><span><strong>Skills folder</strong><small>Packages follow the standard SKILL.md format and remain user-owned.</small></span><input value={settings.skillsFolder ?? ''} onChange={(event) => void settingsUpdates.update('skillsFolder', event.target.value)} /></label></div></details>
				<PluginCommandGatewaySection onOpenManager={onOpenCommandGateway} />
			</section>

			<Permissions harness={harness} onChange={update} />
		</div>
	);
}

function SafetyMode({ harness, onChange }: { harness: HarnessSettings; onChange: (value: HarnessSettings['defaultPermissionMode']) => void }) {
	const [open, setOpen] = useState(false);
	const selected = AGENT_SAFETY_MODES.find((mode) => mode.id === harness.defaultPermissionMode) ?? AGENT_SAFETY_MODES[1];
	return (
		<section className="pk-settings-section">
			<div className="pk-settings-section__heading"><span><strong>Default safety mode</strong><small>Used when a new Agent task starts. Individual high-risk actions may still require confirmation.</small></span></div>
			<Button variant="ghost" className="pk-safety-current" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span><ShieldCheck size={19} /><span><strong>{selected.label}</strong><small>{selected.summary}</small></span></span>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</Button>
			{open && <div className="pk-choice-stack pk-choice-stack--attached" role="radiogroup">{AGENT_SAFETY_MODES.map((mode) => <Button key={mode.id} variant="ghost" role="radio" aria-checked={mode.id === selected.id} data-selected={mode.id === selected.id ? 'true' : 'false'} onClick={() => { onChange(mode.id); setOpen(false); }}><span><strong>{mode.label}</strong><small>{mode.summary}</small></span>{'recommended' in mode && mode.recommended && <small>Recommended</small>}</Button>)}</div>}
		</section>
	);
}

function Permissions({ harness, onChange }: { harness: HarnessSettings; onChange: (patch: Partial<HarnessSettings>) => void }) {
	const permissions = harness.permissions;
	return <section className="pk-settings-section pk-settings-section--last"><div className="pk-settings-section__heading"><span><strong>Permissions & confirmations</strong><small>Capability, scope and confirmation are separate. Enabling a tool never grants unrestricted access.</small></span></div><div className="pk-settings-list">
		<ToggleRow label="Read files in this Vault" summary="Allow tasks to inspect user-selected and relevant files." checked={permissions.readVault} onChange={(readVault) => onChange({ permissions: { ...permissions, readVault } })} />
		<ToggleRow label="Create and edit Vault files" summary="Still follows the selected safety mode and run scope." checked={permissions.writeVault} onChange={(writeVault) => onChange({ permissions: { ...permissions, writeVault } })} />
		<PermissionSelect label="Local commands & working folders" value={permissions.localCommands} onChange={(localCommands) => onChange({ permissions: { ...permissions, localCommands } })} />
		<PermissionSelect label="Network & provider data access" value={permissions.networkAccess} onChange={(networkAccess) => onChange({ permissions: { ...permissions, networkAccess } })} />
		<ToggleRow label="Remember approvals" summary="Remember task-scoped allow or deny choices." checked={permissions.rememberedApprovals} onChange={(rememberedApprovals) => onChange({ permissions: { ...permissions, rememberedApprovals } })} />
	</div></section>;
}

function PermissionSelect({ label, value, onChange }: { label: string; value: 'deny' | 'ask' | 'allow'; onChange: (value: 'deny' | 'ask' | 'allow') => void }) {
	return <label className="pk-settings-field-row"><span><strong>{label}</strong></span><select value={value} onChange={(event) => onChange(event.target.value as typeof value)}><option value="deny">Deny</option><option value="ask">Ask each time</option><option value="allow">Allow in task scope</option></select></label>;
}

function ToggleRow({ label, summary, checked, onChange }: { label: string; summary: string; checked: boolean; onChange: (value: boolean) => void }) {
	return <div className="pk-settings-toggle-row"><span><strong>{label}</strong><small>{summary}</small></span><Toggle checked={checked} onCheckedChange={onChange} label={label} /></div>;
}

function ToolRow({ icon: Icon, ...props }: { icon: React.ComponentType<{ size?: number }>; label: string; summary: string; checked: boolean; onChange: (value: boolean) => void }) {
	return <div className="pk-settings-toggle-row pk-settings-toggle-row--icon"><Icon size={18} /><span><strong>{props.label}</strong><small>{props.summary}</small></span><Toggle checked={props.checked} onCheckedChange={props.onChange} label={props.label} /></div>;
}
