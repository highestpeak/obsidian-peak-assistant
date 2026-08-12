import React, { useEffect, useMemo, useState } from 'react';
import {
	Bot, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Cpu,
	Database, FileSearch, FolderOpen, Loader2, MessageSquare, Network, Pencil,
	Search, ShieldCheck, Sparkles,
} from 'lucide-react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import { buildUnifiedModelChoices } from '@/core/providers/model-selection';
import { modelRegistry } from '@/core/providers/model-registry';
import { testProviderConnection } from '@/core/providers/testProviderConnection';
import { ONBOARDING_STEPS } from '@/core/settings/peakSettingsContract';
import { Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AddProviderForm } from '@/ui/view/modals/onboarding/ProviderForm';
import { UnifiedModelPicker } from '@/ui/view/settings/components/UnifiedModelPicker';
import { uiHttpClient } from '@/ui/util/uiHttpClient';
import {
	PRIMARY_STEPS,
	canContinue,
	type OnboardingEvent,
	type OnboardingRoleModels,
	type OnboardingState,
	type PrimaryStep,
	useOnboardingState,
} from './OnboardingStateMachine';

export interface HarnessOnboardingWizardProps {
	isReRun: boolean;
	initialStep?: PrimaryStep;
	onClose: () => void;
}

const LAUNCH_PROVIDER_KINDS = ['openai', 'anthropic', 'openrouter', 'ollama', 'codex', 'claude-code'] as const;

export function HarnessOnboardingWizard({ isReRun, initialStep, onClose }: HarnessOnboardingWizardProps) {
	const { indexService, settings, settingsActions } = useServiceContext();
	const registry = ProfileRegistry.getInstance();
	const existingChat = registry.getActiveChatConfig();
	const existingAgent = registry.getActiveAgentConfig();
	const existingKnowledge = settings.modelRouting.assignments['vault-search'];
	const draft = settings.onboarding;
	const shouldResume = !isReRun && draft.completedAt === null && draft.updatedAt > 0;
	const controller = useOnboardingState({
		isReRun,
		initialStep: initialStep ?? (shouldResume ? draft.step : undefined),
		selectedProfileId: shouldResume ? draft.selectedProfileId : existingChat?.profile.id ?? registry.getAllProfiles().find((profile) => profile.enabled)?.id ?? null,
		models: {
			conversation: shouldResume ? draft.models.conversation : existingChat ? { profileId: existingChat.profile.id, modelId: existingChat.modelId } : null,
			knowledge: shouldResume ? draft.models.knowledge : existingKnowledge?.mode === 'fixed' ? existingKnowledge.config : null,
			agent: shouldResume ? draft.models.agent : existingAgent ? { profileId: existingAgent.profile.id, modelId: existingAgent.modelId } : null,
		},
	});
	const { state, dispatch } = controller;
	const updateSetting = settingsActions.settings.update;
	const [profiles, setProfiles] = useState<Profile[]>(() => registry.getAllProfiles());
	const launchProfiles = useMemo(() => profiles.filter((profile) => profile.enabled && (LAUNCH_PROVIDER_KINDS as readonly string[]).includes(profile.kind)), [profiles]);
	const [indexReady, setIndexReady] = useState(false);
	function repairSqlite() {
		dispatch({ type: 'sqlite-repairing' });
		void settingsActions.setup.repairBetterSqlite()
			.then((result) => dispatch({ type: 'sqlite-result', ...result }))
			.catch((error) => dispatch({ type: 'sqlite-result', ready: false, message: String(error) }));
	}

	useEffect(() => {
		const profile = launchProfiles.find((candidate) => candidate.id === state.selectedProfileId);
		if (!profile) return;
		let cancelled = false;
		dispatch({ type: 'connection-check', profileId: profile.id, status: 'checking' });
		void testProviderConnection(uiHttpClient, profile).then((ready) => {
			if (!cancelled) dispatch({ type: 'connection-check', profileId: profile.id, status: ready ? 'ready' : 'error' });
		});
		return () => { cancelled = true; };
	}, [dispatch, launchProfiles, state.selectedProfileId]);

	useEffect(() => {
		void updateSetting('onboarding', {
			step: state.step,
			selectedProfileId: state.selectedProfileId,
			models: state.models,
			updatedAt: Date.now(),
			completedAt: null,
		});
	}, [state.models, state.selectedProfileId, state.step, updateSetting]);

	useEffect(() => {
		if (state.step !== 'prepare-vault' || state.betterSqlite !== 'unchecked') return;
		repairSqlite();
		// repairSqlite is deliberately a one-shot transition keyed by state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dispatch, settingsActions.setup, state.betterSqlite, state.step]);

	useEffect(() => {
		if (state.step !== 'system-check' || !indexService) return;
		void indexService.getIndexStatus().then((status) => setIndexReady(status.isReady)).catch(() => setIndexReady(false));
	}, [indexService, state.step]);

	function refreshProfiles(selectId?: string) {
		const next = registry.getAllProfiles();
		setProfiles(next);
		if (selectId) dispatch({ type: 'select-profile', profileId: selectId });
	}

	async function continueFlow() {
		if (state.step === 'try-peak') {
			await completeOnboarding(settingsActions.settings.current(), updateSetting);
			dispatch({ type: 'finish' });
			onClose();
			return;
		}
		if (state.step === 'core-models') await saveCoreModels(state.models, settingsActions.settings.current(), updateSetting);
		if (state.step === 'prepare-vault') {
			dispatch({ type: 'index-status', status: 'starting' });
			await settingsActions.settings.updateSearch('indexLevel', 'fast');
			void settingsActions.knowledgeIndex.startStagedFullIndexing({ level: 'fast' })
				.then(() => dispatch({ type: 'index-status', status: 'ready' }))
				.catch(() => dispatch({ type: 'index-status', status: 'error' }));
		}
		dispatch({ type: 'next' });
	}

	return <div className="pk-onboarding">
		<header className="pk-onboarding__topbar">
			<span className="pk-onboarding__brand"><span>P</span><strong>Set up Peak Assistant</strong></span>
			<span className="pk-onboarding__saved"><Check size={16} /> Progress saved</span>
			<Button variant="ghost" onClick={onClose}>Finish later</Button>
		</header>
		<ProgressHeader state={state} />
		<div className="pk-onboarding__content">
			{state.step === 'connect-ai' && <ConnectAIStep state={state} dispatch={dispatch} profiles={launchProfiles} onProfilesChange={refreshProfiles} />}
			{state.step === 'core-models' && <CoreModelsStep state={state} dispatch={dispatch} profiles={launchProfiles} settings={settings} />}
			{state.step === 'prepare-vault' && <PrepareVaultStep state={state} onRetry={repairSqlite} />}
			{state.step === 'system-check' && <SystemCheckStep state={state} profiles={launchProfiles} indexReady={indexReady} />}
			{state.step === 'try-peak' && <TryPeakStep onLaunch={async (action) => { await completeOnboarding(settingsActions.settings.current(), updateSetting); onClose(); window.setTimeout(() => void action?.(), 60); }} launch={settingsActions.launch} />}
		</div>
		<footer className="pk-onboarding__footer">
			<Button variant="ghost" disabled={state.step === PRIMARY_STEPS[0]} onClick={() => dispatch({ type: 'back' })}><ChevronLeft size={17} /> Back</Button>
			<span>{stepFooterHint(state)}</span>
			<Button disabled={!canContinue(state)} onClick={() => void continueFlow()}>{state.step === 'try-peak' ? 'Finish setup' : 'Continue'} <ChevronRight size={17} /></Button>
		</footer>
	</div>;
}

function ProgressHeader({ state }: { state: OnboardingState }) {
	const active = PRIMARY_STEPS.indexOf(state.step);
	return <div className="pk-onboarding__progress"><div className="pk-onboarding__steps">{ONBOARDING_STEPS.map((step, index) => <React.Fragment key={step.id}><div className="pk-onboarding-step" data-state={index < active ? 'complete' : index === active ? 'active' : 'future'}><span>{index < active ? <Check size={17} /> : index + 1}</span><strong>{step.label}</strong><small>{step.summary}</small></div>{index < ONBOARDING_STEPS.length - 1 && <i data-complete={index < active ? 'true' : 'false'} />}</React.Fragment>)}</div><div className="pk-onboarding__step-caption"><strong>Step {active + 1} of {PRIMARY_STEPS.length} · {ONBOARDING_STEPS[active]?.label}</strong><span>Only setup that affects first use</span></div></div>;
}

function ConnectAIStep({ state, dispatch, profiles, onProfilesChange }: { state: OnboardingState; dispatch: (event: OnboardingEvent) => void; profiles: Profile[]; onProfilesChange: (id?: string) => void }) {
	const [adding, setAdding] = useState(profiles.length === 0);
	return <StepShell eyebrow="Step 1 of 5" title="Connect one AI service" intro="Peak needs one verified connection before any AI feature depends on it.">
		{profiles.length === 0 ? <div className="pk-onboarding-empty"><Cpu size={25} /><strong>No AI service is connected yet</strong><span>Choose one below. You can add more services later in Settings.</span></div> : <div className="pk-onboarding-provider-list">{profiles.map((profile) => { const status = state.connectionChecks[profile.id] ?? 'idle'; return <Button key={profile.id} variant="ghost" data-selected={state.selectedProfileId === profile.id ? 'true' : 'false'} onClick={() => dispatch({ type: 'select-profile', profileId: profile.id })}><span><strong>{profile.name}</strong><small>{connectionStatus(status, profile)}</small></span>{status === 'checking' ? <Loader2 size={19} /> : status === 'ready' ? <CheckCircle2 size={19} /> : status === 'error' ? <CircleAlert size={19} /> : null}</Button>; })}</div>}
		{adding ? <AddProviderForm allowedKinds={[...LAUNCH_PROVIDER_KINDS]} onAdded={(id) => { onProfilesChange(id); setAdding(false); }} onCancel={() => setAdding(false)} /> : <Button variant="secondary" onClick={() => setAdding(true)}>Connect another service</Button>}
		{profiles.length > 0 && <div className="pk-onboarding-check-strip"><StatusCell label="Authentication" value={selectedConnectionLabel(state)} /><StatusCell label="Model catalog" value={state.selectedProfileId && state.connectionChecks[state.selectedProfileId] === 'ready' ? 'Available' : 'Waiting'} /><StatusCell label="First-use route" value={state.selectedProfileId ? 'Selected' : 'Choose one'} /></div>}
	</StepShell>;
}

function CoreModelsStep({ state, dispatch, profiles, settings }: { state: OnboardingState; dispatch: (event: OnboardingEvent) => void; profiles: Profile[]; settings: ReturnType<typeof useServiceContext>['settings'] }) {
	useDefaultModels(state, dispatch, profiles);
	return <StepShell eyebrow="Step 2 of 5" title="Choose three safe defaults" intro="These are the only model choices needed before first use. Peak hides incompatible Agent models.">
		<div className="pk-onboarding-role-list">
			<ModelRole icon={MessageSquare} title="Conversation" detail="Chat Studio and everyday writing" picker={<UnifiedModelPicker profiles={profiles} value={state.models.conversation} onChange={(config) => dispatch({ type: 'select-model', role: 'conversation', config })} aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} align="end" />} />
			<ModelRole icon={Search} title="Knowledge work" detail="Vault questions, synthesis and reports" picker={<UnifiedModelPicker profiles={profiles} value={state.models.knowledge} requirement={{ reasoning: true }} onChange={(config) => dispatch({ type: 'select-model', role: 'knowledge', config })} aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} align="end" />} />
			<ModelRole icon={Bot} title="Peak Hermes" detail="Planning and tool execution; tool support required" picker={<UnifiedModelPicker profiles={profiles} value={state.models.agent} requirement={{ tools: true }} onChange={(config) => dispatch({ type: 'select-model', role: 'agent', config })} aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} align="end" />} />
		</div>
		<div className="pk-onboarding-note"><ShieldCheck size={18} /><span><strong>Peak Hermes remains the only Agent runtime.</strong> The selected provider supplies its model; it does not replace Peak's workflow, permissions or receipts.</span></div>
	</StepShell>;
}

function PrepareVaultStep({ state, onRetry }: { state: OnboardingState; onRetry: () => void }) {
	return <StepShell eyebrow="Step 3 of 5" title="Prepare local search" intro="Peak repairs its required database component, then starts the fastest full-text index. Semantic enrichment can wait.">
		<div className="pk-onboarding-preflight">
			<PreflightRow icon={Database} title="Better SQLite" state={state.betterSqlite} detail={state.betterSqliteMessage || 'Required local database component'} />
			<PreflightRow icon={FileSearch} title="Fast full-text index" state={state.fastIndex === 'ready' ? 'ready' : 'unchecked'} detail="Runs locally and makes the Vault searchable first" />
			<PreflightRow icon={Sparkles} title="Semantic and generated knowledge" state="optional" detail="Skipped for first use; configure it later in the Index Workspace" />
		</div>
		{state.betterSqlite === 'error' && <Button variant="secondary" onClick={onRetry}>Retry database repair</Button>}
		<div className="pk-onboarding-note"><ShieldCheck size={18} /><span>Your files are not changed by indexing. Full-text search is prepared before summaries, tags, relations or embeddings.</span></div>
	</StepShell>;
}

function SystemCheckStep({ state, profiles, indexReady }: { state: OnboardingState; profiles: Profile[]; indexReady: boolean }) {
	const rows = [
		['AI connection', !!state.selectedProfileId && state.connectionChecks[state.selectedProfileId] === 'ready', state.selectedProfileId ? selectedConnectionLabel(state) : 'Missing'],
		['Conversation model', !!state.models.conversation, state.models.conversation?.modelId ?? 'Missing'],
		['Knowledge model', !!state.models.knowledge, state.models.knowledge?.modelId ?? 'Missing'],
		['Peak Hermes model', !!state.models.agent, state.models.agent?.modelId ?? 'Missing'],
		['Better SQLite', state.betterSqlite === 'ready', state.betterSqliteMessage || 'Required'],
		['Fast full-text search', true, indexReady || state.fastIndex === 'ready' ? 'Ready' : 'Building in background'],
	] as const;
	return <StepShell eyebrow="Step 4 of 5" title="System check" intro="Peak verifies the dependencies that would otherwise fail later during real work."><div className="pk-onboarding-system-check">{rows.map(([label, ready, detail]) => <div key={label}><span>{ready ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}<strong>{label}</strong></span><span>{detail}</span></div>)}</div><div className="pk-onboarding-note"><ShieldCheck size={18} /><span><strong>Safe default:</strong> Agents ask before writes, commands, network access and costly actions. You can change the policy later in Settings → Agents.</span></div></StepShell>;
}

function TryPeakStep({ onLaunch, launch }: { onLaunch: (action?: () => void | Promise<void>) => void | Promise<void>; launch: ReturnType<typeof useServiceContext>['settingsActions']['launch'] }) {
	function go(action?: () => void | Promise<void>) { void onLaunch(action); }
	return <StepShell eyebrow="Step 5 of 5" title="Try Peak with something real" intro="Choose a destination. Peak opens the actual product surface instead of leaving you on an empty setup page."><div className="pk-onboarding-launchpad"><LaunchCard icon={MessageSquare} title="Open Chat Studio" detail="Ask a question or continue a conversation" onClick={() => go(launch?.openChatStudio)} /><LaunchCard icon={Search} title="Search the Vault" detail="Use full-text search immediately" onClick={() => go(launch?.openVaultSearch)} /><LaunchCard icon={Network} title="Open File Atlas" detail="Explore a document and its relationships" onClick={() => go(launch?.openFileAtlas)} /><LaunchCard icon={FolderOpen} title="Open a recent note" detail="Jump to the most recently used Markdown note" onClick={() => go(launch?.openRecentNote)} /><LaunchCard icon={Pencil} title="Open Composer" detail="Write with Copilot beside a document" onClick={() => go(launch?.openComposer)} /></div></StepShell>;
}

function StepShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) { return <section className="pk-onboarding-step-content"><span className="pk-onboarding-step-content__eyebrow">{eyebrow}</span><strong className="pk-onboarding-step-content__title">{title}</strong><span className="pk-onboarding-step-content__intro">{intro}</span>{children}</section>; }
function StatusCell({ label, value }: { label: string; value: string }) { return <span><i /><strong>{label}</strong><small>{value}</small></span>; }
function ModelRole({ icon: Icon, title, detail, picker }: { icon: React.ComponentType<{ size?: number }>; title: string; detail: string; picker: React.ReactNode }) { return <div><span><Icon size={20} /><span><strong>{title}</strong><small>{detail}</small></span></span>{picker}</div>; }
function PreflightRow({ icon: Icon, title, state, detail }: { icon: React.ComponentType<{ size?: number }>; title: string; state: OnboardingState['betterSqlite'] | 'optional'; detail: string }) { return <div data-state={state}><Icon size={20} /><span><strong>{title}</strong><small>{detail}</small></span><span>{state === 'repairing' ? <><Loader2 size={17} /> Repairing</> : state === 'ready' ? <><Check size={17} /> Ready</> : state === 'error' ? 'Needs attention' : state === 'optional' ? 'Later' : 'Automatic'}</span></div>; }
function LaunchCard({ icon: Icon, title, detail, onClick }: { icon: React.ComponentType<{ size?: number }>; title: string; detail: string; onClick: () => void }) { return <Button variant="ghost" onClick={onClick}><Icon size={22} /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Button>; }
function providerStatus(profile: Profile) { if (profile.kind === 'ollama') return 'Local service · no API key'; if (profile.kind === 'codex' || profile.kind === 'claude-code') return 'Peak execution gateway'; return profile.apiKey ? 'Credentials saved' : 'Needs credentials'; }
function connectionStatus(status: OnboardingState['connectionChecks'][string], profile: Profile) { if (status === 'checking') return 'Checking connection…'; if (status === 'ready') return 'Verified and ready'; if (status === 'error') return 'Could not verify — review this connection'; return providerStatus(profile); }
function selectedConnectionLabel(state: OnboardingState) { if (!state.selectedProfileId) return 'Choose one'; const status = state.connectionChecks[state.selectedProfileId] ?? 'idle'; return status === 'ready' ? 'Verified' : status === 'checking' ? 'Checking…' : status === 'error' ? 'Needs attention' : 'Waiting'; }
function stepFooterHint(state: OnboardingState) { if (state.step === 'prepare-vault' && state.betterSqlite === 'repairing') return 'Preparing required local components…'; if (state.step === 'system-check') return 'Indexing may continue safely in the background'; if (state.step === 'try-peak') return 'Your setup remains available in Settings'; return ''; }

function useDefaultModels(state: OnboardingState, dispatch: (event: OnboardingEvent) => void, profiles: Profile[]) {
	const defaults = useMemo(() => ({
		conversation: firstCompatible(profiles, {}),
		knowledge: firstCompatible(profiles, { reasoning: true }),
		agent: firstCompatible(profiles, { tools: true }),
	}), [profiles]);
	useEffect(() => {
		for (const role of Object.keys(defaults) as Array<keyof OnboardingRoleModels>) {
			if (!state.models[role] && defaults[role]) dispatch({ type: 'select-model', role, config: defaults[role] });
		}
	}, [defaults, dispatch, state.models]);
}

function firstCompatible(profiles: Profile[], requirement: Parameters<typeof buildUnifiedModelChoices>[2]): RoleConfig | null {
	const choice = buildUnifiedModelChoices(modelRegistry, profiles, requirement).find((item) => item.selectable);
	return choice ? { profileId: choice.profileId, modelId: choice.modelId } : null;
}

async function saveCoreModels(models: OnboardingRoleModels, settings: ReturnType<typeof useServiceContext>['settings'], update: <K extends keyof ReturnType<typeof useServiceContext>['settings']>(key: K, value: ReturnType<typeof useServiceContext>['settings'][K]) => Promise<void>) {
	if (!models.conversation || !models.knowledge || !models.agent) return;
	const registry = ProfileRegistry.getInstance();
	registry.setActiveChatConfig(models.conversation);
	registry.setActiveCopilotConfig(models.conversation);
	registry.setActiveAgentConfig(models.agent);
	await update('modelRouting', {
		...settings.modelRouting,
		assignments: {
			...settings.modelRouting.assignments,
			'chat-studio': { mode: 'fixed', config: models.conversation },
			'vault-search': { mode: 'fixed', config: models.knowledge },
			'agent-wizard': { mode: 'fixed', config: models.agent },
		},
	});
}

async function completeOnboarding(settings: ReturnType<typeof useServiceContext>['settings'], update: <K extends keyof ReturnType<typeof useServiceContext>['settings']>(key: K, value: ReturnType<typeof useServiceContext>['settings'][K]) => Promise<void>) {
	await update('onboarding', { ...settings.onboarding, step: 'try-peak', updatedAt: Date.now(), completedAt: Date.now() });
}
