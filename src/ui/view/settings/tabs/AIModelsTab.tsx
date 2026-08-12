import React, { useMemo, useState } from 'react';
import {
	Bot, ChevronDown, ChevronRight, Database, FileImage, FileText, Image,
	MessageSquare, Network, RefreshCw, Search, Settings2, Wand2,
} from 'lucide-react';
import type { MyPluginSettings, ModelAssignment } from '@/core/config/settingsTypes';
import type { RoleConfig } from '@/core/profiles/types';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { PRODUCT_MODEL_FEATURES, type ProductModelFeature } from '@/core/settings/peakSettingsContract';
import { buildUnifiedModelChoices } from '@/core/providers/model-selection';
import { modelRegistry } from '@/core/providers/model-registry';
import { refreshOpenRouterCatalog } from '@/core/providers/openrouter-catalog';
import { Button } from '@/ui/components/primitives';
import { ProfilesTab } from '../ProfilesTab';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { UnifiedModelPicker } from '../components/UnifiedModelPicker';
import { uiHttpClient } from '@/ui/util/uiHttpClient';

const FEATURE_ICONS = {
	'chat-studio': MessageSquare,
	'composer-copilot': FileText,
	'vault-search': Search,
	'knowledge-index': Database,
	'file-atlas': Network,
	'agent-wizard': Bot,
	'create-media': Image,
} as const;

export function AIModelsTab({
	settings,
	settingsUpdates,
	onOpenAIControlCenter,
}: {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
	onOpenAIControlCenter: () => void | Promise<void>;
}) {
	const [, refreshProfiles] = useState(0);
	const profiles = ProfileRegistry.getInstance().getAllProfiles();
	const routing = settings.modelRouting;

	function updateRouting(patch: Partial<MyPluginSettings['modelRouting']>) {
		void settingsUpdates.update('modelRouting', { ...routing, ...patch });
	}

	function setAssignment(key: string, value: RoleConfig | null) {
		const assignment: ModelAssignment = value
			? { mode: 'fixed', config: value }
			: { mode: 'automatic' };
		updateRouting({ assignments: { ...routing.assignments, [key]: assignment } });
	}

	return (
		<div className="pk-settings-page">
			<header className="pk-settings-page__header">
				<span className="pk-settings-page__eyebrow">AI setup</span>
				<span className="pk-settings-page__title">AI & Models</span>
				<span className="pk-settings-page__intro">Connect services, then choose a model only where Peak's automatic choice is not what you want.</span>
			</header>

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading">
					<span><strong>Connections</strong><small>Services and local runtimes Peak can call.</small></span>
				</div>
				<ProfilesTab
					settings={settings}
					settingsUpdates={settingsUpdates}
					hideStatusBar
					hideAdvancedControls
					onProfilesChange={() => refreshProfiles((tick) => tick + 1)}
				/>
			</section>

			<AutomaticPolicy settings={settings} onChange={updateRouting} />

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading">
					<span><strong>Choose models by feature</strong><small>Change the main model here. Expand a feature for individual actions.</small></span>
					<Button variant="ghost" size="sm" onClick={() => updateRouting({ assignments: {} })}>Restore Automatic</Button>
				</div>
				<div className="pk-feature-model-list">
					{PRODUCT_MODEL_FEATURES.map((feature) => (
						<FeatureModelRow
							key={feature.id}
							feature={feature}
							profiles={profiles}
							settings={settings}
							onAssignment={setAssignment}
							onAdvanced={(key, patch) => updateRouting({
								advancedControls: {
									...routing.advancedControls,
									[key]: { ...routing.advancedControls[key], ...patch },
								},
							})}
							onAttachmentHandling={(value) => void settingsUpdates.updateAI('attachmentHandlingDefault', value)}
						/>
					))}
				</div>
			</section>

			<CatalogManager settings={settings} settingsUpdates={settingsUpdates} profiles={profiles} />

			<section className="pk-settings-section pk-settings-section--last">
				<div className="pk-settings-link-row">
					<span><Settings2 size={18} /><span><strong>AI Control Center</strong><small>Prompts, actions, task bindings and detailed model behavior.</small></span></span>
					<Button variant="secondary" onClick={() => void onOpenAIControlCenter()}>Open control center</Button>
				</div>
			</section>
		</div>
	);
}

function AutomaticPolicy({
	settings,
	onChange,
}: {
	settings: MyPluginSettings;
	onChange: (patch: Partial<MyPluginSettings['modelRouting']>) => void;
}) {
	const [open, setOpen] = useState(false);
	const policy = settings.modelRouting.automatic;
	return (
		<section className="pk-settings-section">
			<Button variant="ghost" className="pk-settings-disclosure" onClick={() => setOpen((value) => !value)}>
				<span><Wand2 size={18} /><span><strong>How Automatic chooses a model</strong><small>{policy.optimizeFor === 'recommended' ? 'Recommended quality' : policy.optimizeFor.replace('-', ' ')} · {policy.processingLocation.replaceAll('-', ' ')}</small></span></span>
				{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
			</Button>
			{open && (
				<div className="pk-settings-disclosure__body">
					<span className="pk-settings-note">This rule changes only actions still set to Automatic. Fixed choices stay untouched.</span>
					<div className="pk-choice-stack" role="radiogroup" aria-label="Automatic model priority">
						{([
							['recommended', 'Recommended', 'A practical balance for everyday work.'],
							['lower-cost', 'Lower cost', 'Prefer less expensive or local models when they can do the job.'],
							['higher-quality', 'Higher quality', 'Prefer stronger models for research and complex writing.'],
						] as const).map(([id, label, summary]) => (
							<Button key={id} variant="ghost" role="radio" aria-checked={policy.optimizeFor === id} data-selected={policy.optimizeFor === id ? 'true' : 'false'} onClick={() => onChange({ automatic: { ...policy, optimizeFor: id } })}>
								<span><strong>{label}</strong><small>{summary}</small></span>
								{policy.optimizeFor === id && <CheckMark />}
							</Button>
						))}
					</div>
					<label className="pk-settings-field-row">
						<span><strong>Where may task content be processed?</strong><small>This controls data location, not answer quality.</small></span>
						<select value={policy.processingLocation} onChange={(event) => onChange({ automatic: { ...policy, processingLocation: event.target.value as typeof policy.processingLocation } })}>
							<option value="cloud-and-local">Cloud and this computer</option>
							<option value="prefer-local">Prefer this computer</option>
							<option value="local-only">This computer only</option>
						</select>
					</label>
				</div>
			)}
		</section>
	);
}

function FeatureModelRow({
	feature,
	profiles,
	settings,
	onAssignment,
	onAdvanced,
	onAttachmentHandling,
}: {
	feature: ProductModelFeature;
	profiles: ReturnType<ProfileRegistry['getAllProfiles']>;
	settings: MyPluginSettings;
	onAssignment: (key: string, config: RoleConfig | null) => void;
	onAdvanced: (key: string, patch: Partial<LLMOutputControlSettings>) => void;
	onAttachmentHandling: (value: 'direct' | 'degrade_to_text') => void;
}) {
	const [open, setOpen] = useState(false);
	const Icon = FEATURE_ICONS[feature.id as keyof typeof FEATURE_ICONS] ?? FileImage;
	const assignment = settings.modelRouting.assignments[feature.id];
	const value = assignment?.mode === 'fixed' ? assignment.config : null;
	return (
		<div className="pk-feature-model" data-open={open ? 'true' : 'false'}>
			<div className="pk-feature-model__main">
				<Button variant="ghost" className="pk-feature-model__identity" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
					<Icon size={19} />
					<span><strong>{feature.label}</strong><small>{feature.summary}</small></span>
					{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
				</Button>
				<UnifiedModelPicker
					profiles={profiles}
					value={value}
					requirement={feature.requiredCapabilities}
					onChange={(config) => onAssignment(feature.id, config)}
					aliases={settings.modelCatalog.aliases}
					hiddenModels={settings.modelCatalog.hiddenModels}
				/>
			</div>
			{open && (
				<div className="pk-feature-model__actions">
					{feature.actions.map((action) => {
						const key = `${feature.id}/${action.id}`;
						const child = settings.modelRouting.assignments[key];
						return (
							<div className="pk-feature-model__action" key={action.id}>
								<span>{action.label}</span>
								<UnifiedModelPicker
									profiles={profiles}
									value={child?.mode === 'fixed' ? child.config : null}
									requirement={action.requiredCapabilities}
									automaticLabel="Inherit feature"
									onChange={(config) => onAssignment(key, config)}
									aliases={settings.modelCatalog.aliases}
									hiddenModels={settings.modelCatalog.hiddenModels}
								/>
							</div>
						);
					})}
					{feature.id === 'chat-studio' && (
						<label className="pk-settings-field-row pk-feature-model__setting">
							<span><strong>Default attachment handling</strong><small>Use native model input or extract readable text first.</small></span>
							<select value={settings.ai.attachmentHandlingDefault ?? 'direct'} onChange={(event) => onAttachmentHandling(event.target.value as 'direct' | 'degrade_to_text')}>
								<option value="direct">Send to a compatible model</option>
								<option value="degrade_to_text">Extract text first</option>
							</select>
						</label>
					)}
					<AdvancedControls assignmentKey={feature.id} value={settings.modelRouting.advancedControls[feature.id] ?? {}} onChange={onAdvanced} />
				</div>
			)}
		</div>
	);
}

function AdvancedControls({ assignmentKey, value, onChange }: { assignmentKey: string; value: Partial<LLMOutputControlSettings>; onChange: (key: string, patch: Partial<LLMOutputControlSettings>) => void }) {
	return (
		<details className="pk-advanced-controls">
			<summary>Advanced model controls <small>9 controls</small></summary>
			<div>
				{([
					['temperature', 'Temperature', 1, 0, 2, 0.1],
					['topP', 'Top P', 0.9, 0, 1, 0.05],
					['topK', 'Top K', 50, 0, 200, 1],
					['presencePenalty', 'Presence penalty', 0, -2, 2, 0.1],
					['frequencyPenalty', 'Frequency penalty', 0, -2, 2, 0.1],
				] as const).map(([key, label, fallback, min, max, step]) => (
					<label key={key}><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number(value[key] ?? fallback)} onChange={(event) => onChange(assignmentKey, { [key]: Number(event.target.value) })} /></label>
				))}
				<label><span>Reasoning effort</span><select value={String(value.reasoningEffort ?? 'medium')} onChange={(event) => onChange(assignmentKey, { reasoningEffort: event.target.value })}><option>low</option><option>medium</option><option>high</option></select></label>
				<label><span>Output detail</span><select value={String(value.textVerbosity ?? 'medium')} onChange={(event) => onChange(assignmentKey, { textVerbosity: event.target.value })}><option value="concise">Concise</option><option value="medium">Medium</option><option value="detailed">Detailed</option></select></label>
				<label><span>Total timeout (seconds)</span><input type="number" min={0} value={Number(value.timeoutTotalMs ?? 300000) / 1000} onChange={(event) => onChange(assignmentKey, { timeoutTotalMs: Number(event.target.value) * 1000 })} /></label>
				<label><span>Step timeout (seconds)</span><input type="number" min={0} value={Number(value.timeoutStepMs ?? 30000) / 1000} onChange={(event) => onChange(assignmentKey, { timeoutStepMs: Number(event.target.value) * 1000 })} /></label>
			</div>
		</details>
	);
}

function CatalogManager({ settings, settingsUpdates, profiles }: { settings: MyPluginSettings; settingsUpdates: SettingsUpdates; profiles: ReturnType<ProfileRegistry['getAllProfiles']> }) {
	const [query, setQuery] = useState('');
	const [catalogRevision, setCatalogRevision] = useState(0);
	const [checking, setChecking] = useState(false);
	const choices = useMemo(() => buildUnifiedModelChoices(modelRegistry, profiles, {}), [catalogRevision, profiles]);
	const filtered = choices.filter((choice) => `${choice.profileName} ${choice.modelId}`.toLowerCase().includes(query.toLowerCase()));
	function update(patch: Partial<MyPluginSettings['modelCatalog']>) {
		void settingsUpdates.update('modelCatalog', { ...settings.modelCatalog, ...patch });
	}
	async function checkCatalog() {
		setChecking(true);
		try {
			const result = await refreshOpenRouterCatalog(uiHttpClient, settings.modelCatalog);
			if (result.catalog) modelRegistry.mergeProviderData(result.catalog);
			await settingsUpdates.update('modelCatalog', result.settings);
			setCatalogRevision((value) => value + 1);
		} finally {
			setChecking(false);
		}
	}
	return (
		<section className="pk-settings-section">
			<details className="pk-settings-native-details">
				<summary><span><strong>Model catalog</strong><small>OpenRouter source, hidden models and aliases.</small></span><span>{settings.modelCatalog.hiddenModels.length} hidden</span></summary>
				<div className="pk-catalog-manager">
					<label className="pk-settings-field-row"><span><strong>OpenRouter catalog JSON</strong><small>{catalogStatus(settings.modelCatalog)}</small></span><span className="pk-catalog-source"><input value={settings.modelCatalog.openRouterCatalogUrl} onChange={(event) => update({ openRouterCatalogUrl: event.target.value, lastError: null })} placeholder="Project URL or GitHub Gist raw URL" /><Button variant="secondary" onClick={() => void checkCatalog()} disabled={checking}>{checking ? <RefreshCw size={15} className="pk-spin" /> : <RefreshCw size={15} />} {checking ? 'Checking…' : 'Check now'}</Button></span></label>
					<input className="pk-catalog-manager__search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models to hide or rename" />
					<div className="pk-catalog-manager__list">
						{filtered.map((choice) => {
							const key = `${choice.profileId}/${choice.modelId}`;
							const hidden = settings.modelCatalog.hiddenModels.includes(key);
							return <div key={key}><span><strong>{choice.displayName}</strong><small>{choice.profileName} · {choice.modelId}</small></span><input value={settings.modelCatalog.aliases[key] ?? ''} onChange={(event) => update({ aliases: { ...settings.modelCatalog.aliases, [key]: event.target.value } })} placeholder="Alias" /><label><input type="checkbox" checked={hidden} onChange={() => update({ hiddenModels: hidden ? settings.modelCatalog.hiddenModels.filter((id) => id !== key) : [...settings.modelCatalog.hiddenModels, key] })} /> Hide</label></div>;
						})}
					</div>
				</div>
			</details>
		</section>
	);
}

function catalogStatus(catalog: MyPluginSettings['modelCatalog']) {
	if (catalog.lastError) return `Last check failed: ${catalog.lastError}`;
	if (!catalog.lastCheckedAt) return 'Conditional GET keeps the last working catalog if the network or JSON fails.';
	return `Checked ${new Date(catalog.lastCheckedAt).toLocaleString()}${catalog.cachedOpenRouterCatalog?.catalogVersion ? ` · ${catalog.cachedOpenRouterCatalog.catalogVersion}` : ''}`;
}

function CheckMark() {
	return <span className="pk-checkmark">✓</span>;
}
