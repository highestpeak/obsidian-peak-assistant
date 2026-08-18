import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Bot,
	Check,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	Cpu,
	Database,
	FileSearch,
	FolderOpen,
	Loader2,
	MessageSquare,
	Network,
	Pencil,
	Search,
	ShieldCheck,
	Sparkles,
	type LucideIcon,
} from 'lucide-react';
import {
	DEFAULT_HARNESS_SETTINGS,
	type ModelAssignment,
	type MyPluginSettings,
} from '@/core/config/settingsTypes';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import {
	buildUnifiedModelChoices,
	type ModelCapabilityRequirement,
} from '@/core/providers/model-selection';
import { modelRegistry } from '@/core/providers/model-registry';
import {
	inspectProviderConnection,
	type ConnectionCheckEvidence,
	type ConnectionEvidence,
} from '@/core/providers/testProviderConnection';
import { ONBOARDING_STEPS } from '@/core/settings/peakSettingsContract';
import { Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import {
	AddProviderForm,
	SavedProfileRow,
} from '@/ui/view/modals/onboarding/ProviderForm';
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

const LAUNCH_PROVIDER_KINDS = [
	'openai',
	'anthropic',
	'openrouter',
	'ollama',
	'codex',
	'claude-code',
] as const;

const ROLE_REQUIREMENTS: Record<keyof OnboardingRoleModels, ModelCapabilityRequirement> = {
	conversation: {},
	knowledge: { reasoning: true },
	agent: { tools: true },
};

type SaveState = 'saved' | 'saving' | 'failed';

export function HarnessOnboardingWizard({ isReRun, initialStep, onClose }: HarnessOnboardingWizardProps) {
	const { settings, settingsActions } = useServiceContext();
	const registry = ProfileRegistry.getInstance();
	const persisted = settings.onboarding;
	const shouldResume = !isReRun && persisted.completedAt === null && persisted.updatedAt > 0;
	const existingChat = registry.getActiveChatConfig();
	const existingAgent = registry.getActiveAgentConfig();
	const existingKnowledge = settings.modelRouting.assignments['vault-search'];
	const controller = useOnboardingState({
		isReRun,
		initialStep: initialStep ?? (shouldResume ? persisted.step : undefined),
		selectedProfileId: shouldResume
			? persisted.selectedProfileId
			: existingChat?.profile.id ?? registry.getAllProfiles().find((profile) => profile.enabled)?.id ?? null,
		models: shouldResume ? persisted.models : {
			conversation: existingChat
				? { mode: 'fixed', config: { profileId: existingChat.profile.id, modelId: existingChat.modelId } }
				: { mode: 'automatic' },
			knowledge: existingKnowledge ?? { mode: 'automatic' },
			agent: existingAgent
				? { mode: 'fixed', config: { profileId: existingAgent.profile.id, modelId: existingAgent.modelId } }
				: { mode: 'automatic' },
		},
	});
	const { state, dispatch } = controller;
	const [profiles, setProfiles] = useState<Profile[]>(() => registry.getAllProfiles());
	const [evidence, setEvidence] = useState<Record<string, ConnectionEvidence>>({});
	const [saveState, setSaveState] = useState<SaveState>('saved');
	const [launchError, setLaunchError] = useState<string | null>(null);
	const operationRef = useRef(0);
	const busyRef = useRef(false);
	const launchProfiles = useMemo(
		() => profiles.filter((profile) => profile.enabled && (LAUNCH_PROVIDER_KINDS as readonly string[]).includes(profile.kind)),
		[profiles],
	);
	const readyProfiles = useMemo(
		() => launchProfiles.filter((profile) => state.connectionChecks[profile.id] === 'ready'),
		[launchProfiles, state.connectionChecks],
	);

	useEffect(() => {
		const selected = launchProfiles.find((candidate) => candidate.id === state.selectedProfileId);
		const selectedUnchecked = selected && state.connectionChecks[selected.id] === undefined ? selected : null;
		const hasReady = Object.values(state.connectionChecks).some((status) => status === 'ready');
		const hasChecking = Object.values(state.connectionChecks).some((status) => status === 'checking');
		const fallback = !hasReady && !hasChecking
			? launchProfiles.find((candidate) => state.connectionChecks[candidate.id] === undefined)
			: null;
		const profile = selectedUnchecked ?? fallback;
		if (!profile) return;
		let cancelled = false;
		dispatch({ type: 'connection-check', profileId: profile.id, status: 'checking' });
		void inspectProviderConnection(uiHttpClient, profile).then((result) => {
			if (cancelled) return;
			recordEvidence(result);
		}).catch(() => {
			if (!cancelled) dispatch({ type: 'connection-check', profileId: profile.id, status: 'error' });
		});
		return () => { cancelled = true; };
	}, [dispatch, launchProfiles, state.connectionChecks, state.selectedProfileId]);

	useEffect(() => {
		setSaveState('saving');
		const timer = window.setTimeout(() => {
			const current = settingsActions.settings.current().onboarding;
			void settingsActions.settings.update('onboarding', {
				...current,
				step: state.step,
				selectedProfileId: state.selectedProfileId,
				models: state.models,
				updatedAt: Date.now(),
			}).then(() => setSaveState('saved')).catch(() => setSaveState('failed'));
		}, 180);
		return () => window.clearTimeout(timer);
	}, [settingsActions.settings, state.models, state.selectedProfileId, state.step]);

	useEffect(() => {
		if (state.step !== 'core-models') return;
		for (const role of Object.keys(ROLE_REQUIREMENTS) as Array<keyof OnboardingRoleModels>) {
			dispatch({ type: 'model-check', role, status: 'checking' });
			const ready = assignmentIsUsable(state.models[role], readyProfiles, ROLE_REQUIREMENTS[role]);
			dispatch({ type: 'model-check', role, status: ready ? 'ready' : 'failed' });
		}
	}, [dispatch, readyProfiles, state.models, state.step]);

	useEffect(() => {
		if (state.step !== 'prepare-vault' || state.betterSqlite !== 'unchecked') return;
		void repairSqlite();
		// State transitions make this a one-shot repair for the current wizard run.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.betterSqlite, state.step]);

	useEffect(() => {
		if (state.step !== 'prepare-vault' || state.betterSqlite !== 'ready' || state.fastIndex !== 'not-started' || state.fastIndexMessage) return;
		let cancelled = false;
		void settingsActions.knowledgeIndex.getReadiness().then((readiness) => {
			if (cancelled) return;
			if (readiness.fullText === 'ready') {
				dispatch({ type: 'index-status', status: 'ready', message: 'Existing full-text index will be reused.' });
				return;
			}
			if (readiness.fullText === 'building') {
				dispatch({ type: 'index-status', status: 'running', message: 'Attached to the active indexing run.' });
				return;
			}
			if (readiness.fullText === 'failed') {
				dispatch({ type: 'index-status', status: 'error', message: 'The previous indexing run failed. Continue to retry it.' });
				return;
			}
			dispatch({ type: 'index-status', status: 'not-started', message: 'A fast full-text index will start when you continue.' });
		}).catch((error) => {
			if (!cancelled) dispatch({ type: 'index-status', status: 'error', message: errorMessage(error) });
		});
		return () => { cancelled = true; };
	}, [dispatch, settingsActions.knowledgeIndex, state.betterSqlite, state.fastIndex, state.fastIndexMessage, state.step]);

	useEffect(() => {
		if (state.step !== 'system-check') return;
		let cancelled = false;
		void runSystemChecks();
		const interval = window.setInterval(() => void refreshFullTextCheck(), 1500);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};

		async function runSystemChecks() {
			const checks: Array<{
				key: keyof OnboardingState['systemChecks'];
				status: OnboardingState['systemChecks'][keyof OnboardingState['systemChecks']];
			}> = [
				{ key: 'connection', status: readyProfiles.length > 0 ? 'ready' : 'failed' },
				{ key: 'conversation', status: assignmentIsUsable(state.models.conversation, readyProfiles, ROLE_REQUIREMENTS.conversation) ? 'ready' : 'failed' },
				{ key: 'knowledge', status: assignmentIsUsable(state.models.knowledge, readyProfiles, ROLE_REQUIREMENTS.knowledge) ? 'ready' : 'failed' },
				{ key: 'agent', status: assignmentIsUsable(state.models.agent, readyProfiles, ROLE_REQUIREMENTS.agent) ? 'ready' : 'failed' },
				{ key: 'sqlite', status: state.betterSqlite === 'ready' ? 'ready' : 'failed' },
			];
			for (const check of checks) {
				if (cancelled) return;
				dispatch({ type: 'system-check', check: check.key, status: 'checking' });
				await delay(220);
				if (cancelled) return;
				dispatch({ type: 'system-check', check: check.key, status: check.status });
			}
			await refreshFullTextCheck();
			if (cancelled) return;
			const mode = settingsActions.settings.current().harnessSettings?.defaultPermissionMode ?? 'ask';
			dispatch({ type: 'system-check', check: 'safety', status: mode === 'bypassPermissions' ? 'needs-attention' : 'ready' });
		}

		async function refreshFullTextCheck() {
			try {
				const readiness = await settingsActions.knowledgeIndex.getReadiness();
				if (cancelled) return;
				const status = readiness.fullText === 'ready'
					? 'ready'
					: readiness.fullText === 'failed'
						? 'failed'
						: 'building';
				dispatch({ type: 'system-check', check: 'fullText', status });
				dispatch({ type: 'index-status', status: status === 'ready' ? 'ready' : status === 'failed' ? 'error' : 'running' });
			} catch {
				if (!cancelled) dispatch({ type: 'system-check', check: 'fullText', status: 'failed' });
			}
		}
	}, [dispatch, readyProfiles, settingsActions.knowledgeIndex, settingsActions.settings, state.betterSqlite, state.models, state.step]);

	function recordEvidence(result: ConnectionEvidence) {
		const profile = registry.getProfileById(result.profileId);
		if (profile && result.catalogModelIds.length > 0) {
			modelRegistry.mergeRuntimeModels(profile.kind, result.catalogModelIds);
		}
		setEvidence((current) => ({ ...current, [result.profileId]: result }));
		dispatch({ type: 'connection-check', profileId: result.profileId, status: result.ready ? 'ready' : 'error' });
	}

	function refreshProfiles(profileId?: string, result?: ConnectionEvidence) {
		setProfiles(registry.getAllProfiles());
		if (profileId) dispatch({ type: 'select-profile', profileId });
		if (result) recordEvidence(result);
	}

	async function repairSqlite() {
		dispatch({ type: 'sqlite-repairing' });
		try {
			const result = await settingsActions.setup.repairBetterSqlite();
			dispatch({ type: 'sqlite-result', ready: result.ready, message: result.message });
		} catch (error) {
			dispatch({ type: 'sqlite-result', ready: false, message: errorMessage(error) });
		}
	}

	async function continueFlow() {
		if (busyRef.current || !canContinue(state)) return;
		const id = ++operationRef.current;
		busyRef.current = true;
		dispatch({ type: 'operation', id, kind: 'continuing' });
		try {
			if (state.step === 'core-models') await saveCoreModels(state.models, settingsActions);
			if (state.step === 'prepare-vault') {
				const result = await settingsActions.knowledgeIndex.prepareFastIndex();
				dispatch({
					type: 'index-status',
					status: result.readiness.fullText === 'ready' ? 'ready' : 'running',
					message: result.disposition === 'reused'
						? 'Existing full-text index was reused.'
						: result.disposition === 'attached'
							? 'Attached to the active indexing run.'
							: 'Fast full-text indexing started in the background.',
				});
			}
			if (state.step === 'system-check') await markConfigurationComplete(settingsActions);
			dispatch({ type: 'operation', id, kind: 'idle' });
			const index = PRIMARY_STEPS.indexOf(state.step);
			if (index < PRIMARY_STEPS.length - 1) dispatch({ type: 'jump', step: PRIMARY_STEPS[index + 1] });
		} catch (error) {
			dispatch({ type: 'operation', id, kind: 'idle', message: errorMessage(error) });
		} finally {
			busyRef.current = false;
		}
	}

	async function launch(target: NonNullable<MyPluginSettings['onboarding']['firstSuccessTarget']>) {
		const launchActions = settingsActions.launch;
		if (!launchActions || busyRef.current) return;
		const id = ++operationRef.current;
		busyRef.current = true;
		setLaunchError(null);
		dispatch({ type: 'operation', id, kind: 'launching' });
		try {
			await markConfigurationComplete(settingsActions);
			const result = target === 'chat-studio'
				? await launchActions.openChatStudio()
				: target === 'vault-search'
					? await launchActions.openVaultSearch()
					: target === 'file-atlas'
						? await launchActions.openFileAtlas()
						: target === 'recent-note'
							? await launchActions.openRecentNote()
							: await launchActions.openComposer();
			if (!result.opened) throw new Error(result.message || 'Peak could not open that feature.');
			const current = settingsActions.settings.current().onboarding;
			await settingsActions.settings.update('onboarding', {
				...current,
				firstSuccessAt: Date.now(),
				firstSuccessTarget: target,
				updatedAt: Date.now(),
			});
			dispatch({ type: 'finish' });
			onClose();
		} catch (error) {
			setLaunchError(errorMessage(error));
			dispatch({ type: 'operation', id, kind: 'idle', message: errorMessage(error) });
		} finally {
			busyRef.current = false;
		}
	}

	async function finishLater() {
		if (busyRef.current) return;
		busyRef.current = true;
		setSaveState('saving');
		try {
			const current = settingsActions.settings.current().onboarding;
			await settingsActions.settings.update('onboarding', {
				...current,
				step: state.step,
				selectedProfileId: state.selectedProfileId,
				models: state.models,
				updatedAt: Date.now(),
			});
			setSaveState('saved');
			onClose();
		} catch {
			setSaveState('failed');
		} finally {
			busyRef.current = false;
		}
	}

	async function finishSetup() {
		if (busyRef.current) return;
		busyRef.current = true;
		try {
			await markConfigurationComplete(settingsActions);
			dispatch({ type: 'finish' });
			onClose();
		} catch (error) {
			setLaunchError(errorMessage(error));
		} finally {
			busyRef.current = false;
		}
	}

	return (
		<div className="pk-onboarding">
			<header className="pk-onboarding__topbar">
				<span className="pk-onboarding__brand"><span>P</span><strong>Set up Peak Assistant</strong></span>
				<span className="pk-onboarding__saved" data-state={saveState}>
					{saveState === 'saving' ? <Loader2 size={16} /> : saveState === 'failed' ? <CircleAlert size={16} /> : <Check size={16} />}
					{saveState === 'saving' ? 'Saving progress…' : saveState === 'failed' ? 'Progress not saved' : 'Progress saved'}
				</span>
				<Button variant="ghost" disabled={saveState === 'saving'} onClick={() => void finishLater()}>Finish later</Button>
			</header>
			<ProgressHeader state={state} />
			<div className="pk-onboarding__content">
				{state.step === 'connect-ai' ? (
					<ConnectAIStep
						state={state}
						dispatch={dispatch}
						profiles={launchProfiles}
						evidence={evidence}
						onProfilesChange={refreshProfiles}
					/>
				) : null}
				{state.step === 'core-models' ? <CoreModelsStep state={state} dispatch={dispatch} profiles={readyProfiles} settings={settings} /> : null}
				{state.step === 'prepare-vault' ? <PrepareVaultStep state={state} onRetry={() => void repairSqlite()} /> : null}
				{state.step === 'system-check' ? <SystemCheckStep state={state} /> : null}
				{state.step === 'try-peak' ? <TryPeakStep launchError={launchError} onLaunch={(target) => void launch(target)} /> : null}
			</div>
			<footer className="pk-onboarding__footer">
				<Button variant="ghost" disabled={state.step === PRIMARY_STEPS[0] || state.operation.kind !== 'idle'} onClick={() => dispatch({ type: 'back' })}>
					<ChevronLeft size={17} /> Back
				</Button>
				<span>{state.operation.message || stepFooterHint(state)}</span>
				{state.step === 'try-peak' ? (
					<Button disabled={state.operation.kind !== 'idle'} onClick={() => void finishSetup()}>Finish setup</Button>
				) : (
					<Button disabled={!canContinue(state)} onClick={() => void continueFlow()}>
						{state.operation.kind === 'continuing' ? <Loader2 size={17} /> : null}
						Continue <ChevronRight size={17} />
					</Button>
				)}
			</footer>
		</div>
	);
}

function ProgressHeader({ state }: { state: OnboardingState }) {
	const active = PRIMARY_STEPS.indexOf(state.step);
	return (
		<div className="pk-onboarding__progress">
			<div className="pk-onboarding__steps">
				{ONBOARDING_STEPS.map((step, index) => (
					<React.Fragment key={step.id}>
						<div className="pk-onboarding-step" data-state={index < active ? 'complete' : index === active ? 'active' : 'future'}>
							<span>{index < active ? <Check size={17} /> : index + 1}</span>
							<div><strong>{step.label}</strong><small>{step.summary}</small></div>
						</div>
						{index < ONBOARDING_STEPS.length - 1 ? <i data-complete={index < active ? 'true' : 'false'} /> : null}
					</React.Fragment>
				))}
			</div>
			<div className="pk-onboarding__step-caption">
				<strong>Step {active + 1} of {PRIMARY_STEPS.length} · {ONBOARDING_STEPS[active]?.label}</strong>
				<span>Only setup that affects first use</span>
			</div>
		</div>
	);
}

function ConnectAIStep({ state, dispatch, profiles, evidence, onProfilesChange }: {
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	profiles: Profile[];
	evidence: Record<string, ConnectionEvidence>;
	onProfilesChange: (id?: string, evidence?: ConnectionEvidence) => void;
}) {
	const [adding, setAdding] = useState(profiles.length === 0);
	const selectedEvidence = state.selectedProfileId ? evidence[state.selectedProfileId] : undefined;
	return (
		<StepShell eyebrow="Step 1 of 5" title="Connect one AI service" intro="Peak needs one verified connection before any AI feature depends on it.">
			{profiles.length === 0 && !adding ? <div className="pk-onboarding-empty"><Cpu size={25} /><strong>No AI service is connected yet</strong><span>Choose one below. You can add more services later in Settings.</span></div> : null}
			{!adding ? (
				<div className="pk-onboarding-provider-list">
					{profiles.map((profile) => (
						<SavedProfileRow
							key={profile.id}
							profile={profile}
							selected={state.selectedProfileId === profile.id}
							status={state.connectionChecks[profile.id] ?? 'idle'}
							onSelect={() => dispatch({ type: 'select-profile', profileId: profile.id })}
							onEvidence={(result) => onProfilesChange(profile.id, result)}
							onChange={() => onProfilesChange(profile.id)}
						/>
					))}
					<Button variant="secondary" className="pk-onboarding-connect-another" onClick={() => setAdding(true)}>Connect another service</Button>
				</div>
			) : (
				<AddProviderForm
					allowedKinds={[...LAUNCH_PROVIDER_KINDS]}
					onAdded={(id, result) => { onProfilesChange(id, result); setAdding(false); }}
					onCancel={profiles.length > 0 ? () => setAdding(false) : undefined}
				/>
			)}
			{selectedEvidence ? (
				<div className="pk-onboarding-check-strip">
					<StatusCell label="Authentication" check={selectedEvidence.authentication} />
					<StatusCell label="Model catalog" check={selectedEvidence.catalog} />
					<StatusCell label="Minimum test" check={selectedEvidence.minimumGeneration} />
				</div>
			) : null}
		</StepShell>
	);
}

function CoreModelsStep({ state, dispatch, profiles, settings }: {
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	profiles: Profile[];
	settings: MyPluginSettings;
}) {
	return (
		<StepShell eyebrow="Step 2 of 5" title="Choose three safe defaults" intro="Automatic is recommended. Pick a specific model only when you need one; incompatible Hermes models are hidden.">
			<div className="pk-onboarding-role-list">
				<ModelRole icon={MessageSquare} title="Conversation" detail="Chat Studio and everyday writing" status={state.modelChecks.conversation} picker={<AssignmentPicker role="conversation" state={state} dispatch={dispatch} profiles={profiles} settings={settings} />} />
				<ModelRole icon={Search} title="Knowledge work" detail="Vault questions, synthesis and reports" status={state.modelChecks.knowledge} picker={<AssignmentPicker role="knowledge" state={state} dispatch={dispatch} profiles={profiles} settings={settings} />} />
				<ModelRole icon={Bot} title="Peak Hermes" detail="Planning and tool execution; tool support is required" status={state.modelChecks.agent} picker={<AssignmentPicker role="agent" state={state} dispatch={dispatch} profiles={profiles} settings={settings} />} />
			</div>
			<div className="pk-onboarding-note"><ShieldCheck size={18} /><span><strong>Peak Hermes remains the only Agent runtime.</strong> The provider supplies its model; it does not replace Peak's workflow, permissions or receipts.</span></div>
		</StepShell>
	);
}

function AssignmentPicker({ role, state, dispatch, profiles, settings }: {
	role: keyof OnboardingRoleModels;
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	profiles: Profile[];
	settings: MyPluginSettings;
}) {
	const assignment = state.models[role];
	return <UnifiedModelPicker profiles={profiles} value={assignment.mode === 'fixed' ? assignment.config : null} requirement={ROLE_REQUIREMENTS[role]} onChange={(config) => dispatch({ type: 'select-model', role, assignment: config ? { mode: 'fixed', config } : { mode: 'automatic' } })} automaticLabel="Automatic" aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} align="end" />;
}

function PrepareVaultStep({ state, onRetry }: { state: OnboardingState; onRetry: () => void }) {
	return (
		<StepShell eyebrow="Step 3 of 5" title="Prepare local search" intro="Peak repairs its required database component. The fastest full-text index starts only if the Vault does not already have one.">
			<div className="pk-onboarding-preflight">
				<PreflightRow icon={Database} title="Better SQLite" state={state.betterSqlite} detail={state.betterSqliteMessage || 'Required local database component'} />
				<PreflightRow icon={FileSearch} title="Fast full-text index" state={state.fastIndex === 'ready' ? 'ready' : state.fastIndex === 'running' || state.fastIndex === 'starting' ? 'repairing' : state.fastIndex === 'error' ? 'error' : 'unchecked'} detail={state.fastIndexMessage || 'Reuses a ready index, or attaches to the single active run'} />
				<PreflightRow icon={Sparkles} title="Semantic and generated knowledge" state="optional" detail="Skipped for first use; configure it later in the Index Workspace" />
			</div>
			{state.betterSqlite === 'error' ? <Button variant="secondary" onClick={onRetry}>Retry database repair</Button> : null}
			<div className="pk-onboarding-note"><ShieldCheck size={18} /><span>Your files are never changed by indexing. Full-text search comes before summaries, tags, relations or embeddings.</span></div>
		</StepShell>
	);
}

function SystemCheckStep({ state }: { state: OnboardingState }) {
	const rows: Array<{ key: keyof OnboardingState['systemChecks']; label: string }> = [
		{ key: 'connection', label: 'AI connection' },
		{ key: 'conversation', label: 'Conversation model' },
		{ key: 'knowledge', label: 'Knowledge model' },
		{ key: 'agent', label: 'Peak Hermes tool model' },
		{ key: 'sqlite', label: 'Better SQLite and FTS' },
		{ key: 'fullText', label: 'Vault full-text search' },
		{ key: 'safety', label: 'Agent safety default' },
	];
	return (
		<StepShell eyebrow="Step 4 of 5" title="System check" intro="Peak verifies each dependency in sequence so failures can be fixed before real work.">
			<div className="pk-onboarding-system-check">{rows.map((row) => <SystemCheckRow key={row.key} label={row.label} status={state.systemChecks[row.key]} />)}</div>
			<div className="pk-onboarding-note"><ShieldCheck size={18} /><span><strong>Safe default:</strong> Agents ask before writes, commands, network access and costly actions. Existing expert bypass settings are shown as needing attention.</span></div>
		</StepShell>
	);
}

function TryPeakStep({ launchError, onLaunch }: {
	launchError: string | null;
	onLaunch: (target: NonNullable<MyPluginSettings['onboarding']['firstSuccessTarget']>) => void;
}) {
	return (
		<StepShell eyebrow="Step 5 of 5" title="Try Peak with something real" intro="Choose one destination. Peak opens the actual product surface instead of leaving you on a setup page.">
			{launchError ? <div className="pk-onboarding-error"><CircleAlert size={18} /><span>{launchError}</span></div> : null}
			<div className="pk-onboarding-launchpad">
				<LaunchCard icon={MessageSquare} title="Open Chat Studio" detail="Ask a question or continue a conversation" onClick={() => onLaunch('chat-studio')} />
				<LaunchCard icon={Search} title="Search the Vault" detail="Use full-text search immediately" onClick={() => onLaunch('vault-search')} />
				<LaunchCard icon={Network} title="Open File Atlas" detail="Explore a document and its relationships" onClick={() => onLaunch('file-atlas')} />
				<LaunchCard icon={FolderOpen} title="Open a recent note" detail="Peak chooses the active or most recently used note" onClick={() => onLaunch('recent-note')} />
				<LaunchCard icon={Pencil} title="Open Composer" detail="Requires an open Markdown note" onClick={() => onLaunch('composer')} />
			</div>
		</StepShell>
	);
}

function StepShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
	return <section className="pk-onboarding-step-content"><span className="pk-onboarding-step-content__eyebrow">{eyebrow}</span><strong className="pk-onboarding-step-content__title">{title}</strong><span className="pk-onboarding-step-content__intro">{intro}</span>{children}</section>;
}

function StatusCell({ label, check }: { label: string; check: ConnectionCheckEvidence }) {
	return <span data-state={check.state}><i /><strong>{label}</strong><small>{check.message}</small></span>;
}

function ModelRole({ icon: Icon, title, detail, status, picker }: {
	icon: LucideIcon;
	title: string;
	detail: string;
	status: OnboardingState['modelChecks'][keyof OnboardingState['modelChecks']];
	picker: React.ReactNode;
}) {
	return <div className="pk-onboarding-role" data-state={status}><span><Icon size={20} /><span><strong>{title}</strong><small>{detail}</small></span></span>{picker}</div>;
}

function PreflightRow({ icon: Icon, title, state, detail }: {
	icon: LucideIcon;
	title: string;
	state: OnboardingState['betterSqlite'] | 'optional';
	detail: string;
}) {
	return <div data-state={state}><Icon size={20} /><span><strong>{title}</strong><small>{detail}</small></span><span>{state === 'repairing' ? <><Loader2 size={17} /> Working…</> : state === 'ready' ? <><Check size={17} /> Ready</> : state === 'error' ? 'Needs attention' : state === 'optional' ? 'Later' : 'Automatic'}</span></div>;
}

function SystemCheckRow({ label, status }: { label: string; status: OnboardingState['systemChecks'][keyof OnboardingState['systemChecks']] }) {
	const detail = status === 'ready' ? 'Ready' : status === 'checking' ? 'Checking…' : status === 'building' ? 'Continuing in background' : status === 'needs-attention' ? 'Review recommended' : status === 'failed' ? 'Needs attention' : 'Waiting';
	return <div data-state={status}><span>{status === 'checking' || status === 'building' ? <Loader2 size={19} /> : status === 'ready' ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}<strong>{label}</strong></span><span>{detail}</span></div>;
}

function LaunchCard({ icon: Icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick: () => void }) {
	return <Button variant="ghost" onClick={onClick}><Icon size={22} /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Button>;
}

function assignmentIsUsable(assignment: ModelAssignment, profiles: Profile[], requirement: ModelCapabilityRequirement): boolean {
	const choices = buildUnifiedModelChoices(modelRegistry, profiles, requirement).filter((choice) => choice.selectable);
	if (assignment.mode === 'automatic') return choices.length > 0;
	return choices.some((choice) => choice.profileId === assignment.config.profileId && choice.modelId === assignment.config.modelId);
}

async function saveCoreModels(models: OnboardingRoleModels, actions: ReturnType<typeof useServiceContext>['settingsActions']) {
	const current = actions.settings.current();
	const conversation = fixedConfig(models.conversation);
	const agent = fixedConfig(models.agent);
	await actions.settings.updateAll({
		modelRouting: {
			...current.modelRouting,
			assignments: {
				...current.modelRouting.assignments,
				'chat-studio': models.conversation,
				'vault-search': models.knowledge,
				'agent-wizard': models.agent,
			},
		},
		harnessSettings: {
			...DEFAULT_HARNESS_SETTINGS,
			...(current.harnessSettings ?? {}),
			executionModel: agent,
			defaultPermissionMode: current.onboarding.completedAt === null ? 'ask' : (current.harnessSettings?.defaultPermissionMode ?? 'ask'),
		},
	});
	const registry = ProfileRegistry.getInstance();
	registry.setActiveChatConfig(conversation);
	registry.setActiveCopilotConfig(conversation);
	registry.setActiveAgentConfig(agent);
}

async function markConfigurationComplete(actions: ReturnType<typeof useServiceContext>['settingsActions']) {
	const current = actions.settings.current().onboarding;
	await actions.settings.update('onboarding', { ...current, step: 'try-peak', completedAt: current.completedAt ?? Date.now(), updatedAt: Date.now() });
}

function fixedConfig(assignment: ModelAssignment): RoleConfig | null {
	return assignment.mode === 'fixed' ? assignment.config : null;
}

function stepFooterHint(state: OnboardingState): string {
	if (state.step === 'prepare-vault' && state.betterSqlite === 'repairing') return 'Preparing required local components…';
	if (state.step === 'system-check') return 'A ready full-text index is reused; an active run is never duplicated.';
	if (state.step === 'try-peak') return 'Configuration is complete. The first successful launch is recorded separately.';
	return '';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
