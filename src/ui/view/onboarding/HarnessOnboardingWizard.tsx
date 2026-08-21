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
	Plus,
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
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import type { IndexReadinessProjection } from '@/core/ports/IndexRunCoordinatorPort';
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
	continueBlocker,
	type OnboardingEvent,
	type OnboardingBlockerId,
	type OnboardingCheckState,
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
	'lmstudio',
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
	const [systemCheckRefresh, setSystemCheckRefresh] = useState(0);
	const onboardingRef = useRef<HTMLDivElement>(null);
	const [modelPickerPortal, setModelPickerPortal] = useState<HTMLElement | null>(null);
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
	const mediaRouteAvailable = useMemo(
		() => readyProfiles.some((profile) => profile.kind === 'openai' || profile.kind === 'openrouter'),
		[readyProfiles],
	);

	useEffect(() => {
		setModelPickerPortal(onboardingRef.current?.closest('.modal-content') as HTMLElement | null);
	}, []);

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
				dispatch({ type: 'index-status', status: 'ready', message: indexReadinessMessage(readiness, 'Existing fast search is ready to use.'), metrics: indexReadinessMetrics(readiness) });
				return;
			}
			if (readiness.fullText === 'building') {
				dispatch({ type: 'index-status', status: 'running', message: indexReadinessMessage(readiness, 'Attached to the active indexing run.'), metrics: indexReadinessMetrics(readiness) });
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
		if (state.step !== 'prepare-vault' || (state.fastIndex !== 'starting' && state.fastIndex !== 'running')) return;
		let cancelled = false;
		const refresh = async () => {
			try {
				const readiness = await settingsActions.knowledgeIndex.getReadiness();
				if (cancelled) return;
				if (readiness.fullText === 'ready') {
				dispatch({ type: 'index-status', status: 'ready', message: indexReadinessMessage(readiness, 'Fast local search is ready.'), metrics: indexReadinessMetrics(readiness) });
					return;
				}
				if (readiness.fullText === 'failed') {
				dispatch({ type: 'index-status', status: 'error', message: indexReadinessMessage(readiness, 'The active indexing run needs attention.'), metrics: indexReadinessMetrics(readiness) });
					return;
				}
				dispatch({ type: 'index-status', status: 'running', message: indexReadinessMessage(readiness, 'Fast local search is still being prepared.'), metrics: indexReadinessMetrics(readiness) });
			} catch (error) {
				if (!cancelled) dispatch({ type: 'index-status', status: 'error', message: errorMessage(error) });
			}
		};
		void refresh();
		const interval = window.setInterval(() => void refresh(), 1500);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [dispatch, settingsActions.knowledgeIndex, state.fastIndex, state.step]);

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
				message: string;
			}> = [
				{ key: 'connection', status: readyProfiles.length > 0 ? 'ready' : 'failed', message: readyProfiles.length > 0 ? 'One verified AI service is available.' : 'No verified AI service is available. Return to Connect AI and test one connection.' },
				{ key: 'conversation', status: assignmentIsUsable(state.models.conversation, readyProfiles, ROLE_REQUIREMENTS.conversation) ? 'ready' : 'failed', message: 'Chat & writing needs a compatible model from a verified connection.' },
				{ key: 'knowledge', status: assignmentIsUsable(state.models.knowledge, readyProfiles, ROLE_REQUIREMENTS.knowledge) ? 'ready' : 'failed', message: 'Search & analysis needs a compatible reasoning model.' },
				{ key: 'agent', status: assignmentIsUsable(state.models.agent, readyProfiles, ROLE_REQUIREMENTS.agent) ? 'ready' : 'failed', message: 'Agent & tools needs a model that supports tool use.' },
				{ key: 'sqlite', status: state.betterSqlite === 'ready' ? 'ready' : 'failed', message: state.betterSqliteMessage || 'Better SQLite has not passed its compatibility and read/write checks.' },
			];
			for (const check of checks) {
				if (cancelled) return;
				dispatch({ type: 'system-check', check: check.key, status: 'checking', message: '' });
				if (cancelled) return;
				dispatch({ type: 'system-check', check: check.key, status: check.status, message: check.message });
			}
			dispatch({ type: 'system-check', check: 'hermes', status: 'checking', message: '' });
			try {
				const hermes = await settingsActions.setup.verifyPeakHermes();
				if (cancelled) return;
				dispatch({ type: 'system-check', check: 'hermes', status: hermes.ready ? 'ready' : 'failed', message: hermes.message });
			} catch (error) {
				if (!cancelled) dispatch({ type: 'system-check', check: 'hermes', status: 'failed', message: errorMessage(error) });
			}
			if (cancelled) return;
			await refreshFullTextCheck();
			if (cancelled) return;
			dispatch({ type: 'system-check', check: 'storage', status: 'checking', message: '' });
			try {
				const storage = await settingsActions.setup.verifyPeakStorage();
				if (cancelled) return;
				dispatch({ type: 'system-check', check: 'storage', status: storage.ready ? 'ready' : 'failed', message: storage.message });
			} catch (error) {
				if (!cancelled) dispatch({ type: 'system-check', check: 'storage', status: 'failed', message: errorMessage(error) });
			}
			if (cancelled) return;
			const mode = settingsActions.settings.current().harnessSettings?.defaultPermissionMode ?? 'ask';
			dispatch({ type: 'system-check', check: 'safety', status: mode === 'bypassPermissions' ? 'needs-attention' : 'ready', message: mode === 'bypassPermissions' ? 'Expert bypass is enabled. Review Safety in Agents if this is not intentional.' : 'Peak will ask before risky or costly actions.' });
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
				dispatch({ type: 'system-check', check: 'fullText', status, message: indexReadinessMessage(readiness, status === 'ready' ? 'Fast local search is ready.' : status === 'failed' ? 'Fast local search needs attention. Return to Prepare vault and retry.' : 'Fast local search is continuing in the background.') });
				dispatch({ type: 'index-status', status: status === 'ready' ? 'ready' : status === 'failed' ? 'error' : 'running', metrics: indexReadinessMetrics(readiness) });
			} catch (error) {
				if (!cancelled) dispatch({ type: 'system-check', check: 'fullText', status: 'failed', message: errorMessage(error) });
			}
		}
	}, [dispatch, readyProfiles, settingsActions.knowledgeIndex, settingsActions.settings, settingsActions.setup, state.betterSqlite, state.models, state.step, systemCheckRefresh]);

	function recordEvidence(result: ConnectionEvidence) {
		const profile = registry.getProfileById(result.profileId);
		if (profile && result.catalogModelIds.length > 0) {
			const catalogId = profileModelCatalogId(profile);
			if (catalogId) modelRegistry.mergeRuntimeModels(catalogId, result.catalogModelIds);
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
		const currentStep = state.step;
		const currentIndex = PRIMARY_STEPS.indexOf(currentStep);
		const nextStep = currentIndex < PRIMARY_STEPS.length - 1 ? PRIMARY_STEPS[currentIndex + 1] : null;
		busyRef.current = true;
		dispatch({ type: 'operation', id, kind: 'continuing' });
		try {
			if (currentStep === 'core-models') {
				if (nextStep) dispatch({ type: 'jump', step: nextStep });
				dispatch({ type: 'operation', id, kind: 'idle' });
				busyRef.current = false;
				void saveCoreModels(state.models, settingsActions).catch((error) => {
					dispatch({ type: 'operation', id, kind: 'idle', message: errorMessage(error) });
				});
				return;
			}
			if (currentStep === 'prepare-vault') {
				dispatch({ type: 'index-status', status: 'starting', message: 'Checking the existing fast search before starting anything new…' });
				if (nextStep) dispatch({ type: 'jump', step: nextStep });
				dispatch({ type: 'operation', id, kind: 'idle' });
				busyRef.current = false;
				void settingsActions.knowledgeIndex.prepareFastIndex().then((result) => {
					const ready = result.readiness.fullText === 'ready';
					dispatch({
						type: 'index-status',
						status: ready ? 'ready' : 'running',
						metrics: indexReadinessMetrics(result.readiness),
						message: indexReadinessMessage(
							result.readiness,
							result.disposition === 'reused'
								? 'Existing fast search was reused.'
								: result.disposition === 'attached'
									? 'Attached to the active indexing run.'
									: 'Fast local search is continuing in the background.',
						),
					});
				}).catch((error) => {
					dispatch({ type: 'index-status', status: 'error', message: errorMessage(error) });
					dispatch({ type: 'system-check', check: 'fullText', status: 'failed', message: errorMessage(error) });
				});
				return;
			}
			if (currentStep === 'system-check') {
				if (nextStep) dispatch({ type: 'jump', step: nextStep });
				dispatch({ type: 'operation', id, kind: 'idle' });
				busyRef.current = false;
				void markConfigurationComplete(settingsActions).catch((error) => {
					setSaveState('failed');
					dispatch({ type: 'operation', id, kind: 'idle', message: errorMessage(error) });
				});
				return;
			}
			dispatch({ type: 'operation', id, kind: 'idle' });
			if (nextStep) dispatch({ type: 'jump', step: nextStep });
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
					: target === 'ai-search'
						? await launchActions.openAiSearch()
					: target === 'file-atlas'
						? await launchActions.openFileAtlas()
						: target === 'ai-graph'
							? await launchActions.openAiGraph()
							: target === 'agent-wizard'
								? await launchActions.openAgentWizard()
								: target === 'create-media'
									? await launchActions.openMediaCreation()
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

	const blocker = continueBlocker(state);
	const footerGuidance = blocker ? blockerGuidance(blocker, state) : null;

	return (
		<div ref={onboardingRef} className="pk-onboarding">
			<header className="pk-onboarding__topbar">
				<span className="pk-onboarding__brand"><i>P</i><strong>Set up Peak Assistant</strong></span>
				<span className="pk-onboarding__saved" data-state={saveState}>
					{saveState === 'saving' ? <Loader2 size={16} /> : saveState === 'failed' ? <CircleAlert size={16} /> : <Check size={16} />}
					{saveState === 'saving' ? 'Saving progress…' : saveState === 'failed' ? 'Progress not saved' : 'Progress saved'}
				</span>
				<Button variant="ghost" className="pk-onboarding-finish-later" disabled={saveState === 'saving'} onClick={() => void finishLater()}>Finish later</Button>
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
				{state.step === 'core-models' ? <CoreModelsStep state={state} dispatch={dispatch} profiles={readyProfiles} settings={settings} portalContainer={modelPickerPortal} /> : null}
				{state.step === 'prepare-vault' ? <PrepareVaultStep state={state} onRetry={() => void repairSqlite()} /> : null}
				{state.step === 'system-check' ? <SystemCheckStep state={state} mediaRouteAvailable={mediaRouteAvailable} onRunAgain={() => setSystemCheckRefresh((current) => current + 1)} onGoToStep={(step) => dispatch({ type: 'jump', step })} onOpenSettings={(tab) => settingsActions.openSettings({ tab })} /> : null}
				{state.step === 'try-peak' ? <TryPeakStep launchError={launchError} mediaRouteAvailable={mediaRouteAvailable} onLaunch={(target) => void launch(target)} /> : null}
			</div>
			<footer className="pk-onboarding__footer">
				<Button variant="ghost" className="pk-onboarding-footer-back" disabled={state.step === PRIMARY_STEPS[0] || state.operation.kind !== 'idle'} onClick={() => dispatch({ type: 'back' })}>
					<ChevronLeft size={17} /> Back
				</Button>
				<span className="pk-onboarding-footer-message" data-state={footerGuidance ? 'blocked' : state.operation.kind}>{footerGuidance ? <><strong>{footerGuidance.title}</strong><small>{footerGuidance.detail}</small></> : state.operation.message || stepFooterHint(state)}</span>
				{state.step === 'try-peak' ? (
					<span className="pk-onboarding__first-success-hint">Choose a task above to finish setup.</span>
				) : (
					<Button className="pk-onboarding-footer-continue" disabled={!canContinue(state)} onClick={() => void continueFlow()}>
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
	const activeStep = ONBOARDING_STEPS[active];
	return (
		<div className="pk-onboarding__progress">
			<div className="pk-onboarding__steps">
				{ONBOARDING_STEPS.map((step, index) => <React.Fragment key={step.id}>
					<div className="pk-onboarding-step" data-state={index < active ? 'complete' : index === active ? 'active' : 'future'}>
						<span>{index < active ? <Check size={15} /> : index + 1}</span>
						<span><strong>{step.label}</strong><small>{step.summary}</small></span>
					</div>
					{index < ONBOARDING_STEPS.length - 1 ? <i className="pk-onboarding-step-connector" data-state={index < active ? 'complete' : 'future'} /> : null}
				</React.Fragment>)}
			</div>
			<div className="pk-onboarding__step-meta"><strong>Step {active + 1} of {ONBOARDING_STEPS.length} · {activeStep.label}</strong><span>Only setup that affects first use is required here.</span></div>
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
		<StepShell step={1} title="Connect AI to Peak" intro="Choose one service to begin. Peak checks the connection before anything else depends on it.">
			{profiles.length === 0 ? <div className="pk-onboarding-empty pk-onboarding-empty--persistent"><Cpu size={25} /><span><strong>No AI connection yet</strong><small>Connect one service now. You can add or change the rest later in AI &amp; Models.</small></span></div> : null}
			{!adding ? (
				profiles.length > 0 ? <div className="pk-onboarding-provider-list">
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
					<Button variant="secondary" className="pk-onboarding-connect-another" onClick={() => setAdding(true)}><Plus size={18} /> Connect another service</Button>
				</div> : null
			) : (
				<>
					<div className="pk-onboarding-choice-heading"><strong>{profiles.length === 0 ? 'Choose a connection' : 'Connect another service'}</strong><span>{profiles.length === 0 ? 'You only need one working service to continue' : 'Every connection can be edited and checked again later'}</span></div>
					<AddProviderForm
						allowedKinds={[...LAUNCH_PROVIDER_KINDS]}
						onAdded={(id, result) => { onProfilesChange(id, result); setAdding(false); }}
						onCancel={() => setAdding(false)}
					/>
				</>
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

function CoreModelsStep({ state, dispatch, profiles, settings, portalContainer }: {
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	profiles: Profile[];
	settings: MyPluginSettings;
	portalContainer: HTMLElement | null;
}) {
	return (
		<StepShell step={2} title="Use safe models for the core jobs" intro="Peak has filtered this list to models that can safely handle each job. You can keep Automatic, or choose a specific compatible model.">
			<div className="pk-onboarding-compatibility"><ShieldCheck size={18} /><span><strong>Only compatible models are offered here.</strong><small>Tool use is required for Peak Hermes. The other roles show only models that can complete their job.</small></span></div>
			<div className="pk-onboarding-role-list">
				<ModelRole icon={MessageSquare} title="Chat & writing" detail="Chat Studio, Composer and everyday writing" status={state.modelChecks.conversation} picker={<AssignmentPicker role="conversation" state={state} dispatch={dispatch} profiles={profiles} settings={settings} portalContainer={portalContainer} />} />
				<ModelRole icon={Search} title="Search & analysis" detail="Vault questions, synthesis and research work" status={state.modelChecks.knowledge} picker={<AssignmentPicker role="knowledge" state={state} dispatch={dispatch} profiles={profiles} settings={settings} portalContainer={portalContainer} />} />
				<ModelRole icon={Bot} title="Agent & tools" detail="Peak Hermes planning and tool execution" status={state.modelChecks.agent} picker={<AssignmentPicker role="agent" state={state} dispatch={dispatch} profiles={profiles} settings={settings} portalContainer={portalContainer} />} />
			</div>
			<div className="pk-onboarding-default-summary"><span><strong>Other features keep their safe defaults</strong><small>Image, media, Atlas and other specialized jobs can be configured later without blocking first use.</small></span></div>
			<div className="pk-onboarding-note"><ShieldCheck size={18} /><span><strong>Peak Hermes remains the only Agent runtime.</strong> The provider supplies its model; it does not replace Peak's workflow, permissions or receipts.</span></div>
		</StepShell>
	);
}

function AssignmentPicker({ role, state, dispatch, profiles, settings, portalContainer }: {
	role: keyof OnboardingRoleModels;
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	profiles: Profile[];
	settings: MyPluginSettings;
	portalContainer: HTMLElement | null;
}) {
	const assignment = state.models[role];
	return <UnifiedModelPicker profiles={profiles} value={assignment.mode === 'fixed' ? assignment.config : null} requirement={ROLE_REQUIREMENTS[role]} onChange={(config) => dispatch({ type: 'select-model', role, assignment: config ? { mode: 'fixed', config } : { mode: 'automatic' } })} automaticLabel="Automatic" aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} align="end" portalContainer={portalContainer} />;
}

function PrepareVaultStep({ state, onRetry }: { state: OnboardingState; onRetry: () => void }) {
	const indexState = state.fastIndex === 'ready' ? 'ready' : state.fastIndex === 'running' || state.fastIndex === 'starting' ? 'repairing' : state.fastIndex === 'error' ? 'error' : 'unchecked';
	const indexWorking = state.fastIndex === 'running' || state.fastIndex === 'starting';
	const progress = state.indexMetrics.percent ?? (state.fastIndex === 'ready' ? 100 : 0);
	return (
		<StepShell step={3} title="Make this vault searchable quickly" intro="Peak recommends a fast local full-text index first. It reuses the index you already have and never starts a second run for the same vault.">
			<div className="pk-onboarding-sqlite-gate" data-state={state.betterSqlite}>
				<Database size={23} />
				<span><strong>Local search engine</strong><small>{state.betterSqliteMessage || 'Checking the required Better SQLite component…'}</small></span>
				<span>{state.betterSqlite === 'repairing' ? <><Loader2 size={17} /> Checking</> : state.betterSqlite === 'ready' ? <><Check size={17} /> Ready</> : state.betterSqlite === 'error' ? 'Needs attention' : 'Waiting'}</span>
			</div>
			<div className="pk-onboarding-vault-scope">
				<div className="pk-onboarding-vault-scope__summary"><FolderOpen size={22} /><span><strong>Your saved vault scope is ready to scan</strong><small>Peak reads only included files. It never changes source files during indexing.</small></span></div>
				<div className="pk-onboarding-index-paths">
					<PreflightRow icon={FileSearch} title="Fast local index" state={indexState} detail={state.fastIndexMessage || 'Recommended first step. Search filenames and extracted text without an AI request.'} />
					<PreflightRow icon={Search} title="Semantic search" state="optional" detail="Add embeddings for meaning-based results later in Knowledge & Search." />
					<PreflightRow icon={Sparkles} title="Generated knowledge" state="optional" detail="Choose summaries, tags and relationships per run later." />
				</div>
				<div className="pk-onboarding-index-facts"><span><strong>{state.indexMetrics.indexedDocuments.toLocaleString()}</strong><small>Indexed documents</small></span><span><strong>{state.indexMetrics.totalDocuments === null ? 'Not available' : state.indexMetrics.totalDocuments.toLocaleString()}</strong><small>Discovered total</small></span><span><strong>{state.indexMetrics.failures}</strong><small>Needs attention</small></span></div>
			</div>
			<div className="pk-onboarding-index-progress" data-state={state.fastIndex}>
				{indexWorking ? <Loader2 size={20} /> : state.fastIndex === 'ready' ? <CheckCircle2 size={20} /> : <FileSearch size={20} />}
				<span><strong>{indexWorking ? 'Fast search is being prepared' : state.fastIndex === 'ready' ? 'Fast local search is ready' : state.fastIndex === 'error' ? 'Fast search needs attention' : 'Fast search has not started yet'}</strong><small>{state.fastIndexMessage || 'Peak will reuse an existing run or start one when you continue.'}</small><i><b style={{ width: `${progress}%` }} /></i></span>
				<em>{state.indexMetrics.percent === null && state.fastIndex !== 'ready' ? 'Progress not available' : `${progress}%`}</em>
			</div>
			{state.betterSqlite === 'error' ? <Button variant="secondary" onClick={onRetry}>Retry database repair</Button> : null}
			<div className="pk-onboarding-note"><ShieldCheck size={18} /><span>Your files are never changed by indexing. Full-text search comes before summaries, tags, relations or embeddings.</span></div>
		</StepShell>
	);
}

function SystemCheckStep({ state, mediaRouteAvailable, onRunAgain, onGoToStep, onOpenSettings }: {
	state: OnboardingState;
	mediaRouteAvailable: boolean;
	onRunAgain: () => void;
	onGoToStep: (step: PrimaryStep) => void;
	onOpenSettings: (tab: 'aiModels' | 'agents' | 'knowledgeSearch' | 'advanced') => void;
}) {
	const coreRoleStatus = combineCheckStatus([
		state.systemChecks.conversation,
		state.systemChecks.knowledge,
		state.systemChecks.agent,
	]);
	const roleFailureDetail = (['conversation', 'knowledge', 'agent'] as const)
		.filter((role) => state.systemChecks[role] === 'failed')
		.map((role) => state.systemCheckMessages[role])
		.filter((message): message is string => !!message)
		.join(' ');
	const requiredRows: SystemCheckRowModel[] = [
		{ id: 'connection', label: 'AI connection', detail: state.systemCheckMessages.connection || 'One verified service is available', icon: Cpu, status: state.systemChecks.connection, action: state.systemChecks.connection === 'failed' ? { label: 'Review connection', run: () => onGoToStep('connect-ai') } : undefined },
		{ id: 'roles', label: 'Core model roles', detail: roleFailureDetail || 'Chat, search and tool-capable Agent routes are valid', icon: Network, status: coreRoleStatus, action: coreRoleStatus === 'failed' ? { label: 'Review models', run: () => onGoToStep('core-models') } : undefined },
		{ id: 'hermes', label: 'Peak Hermes', detail: state.systemCheckMessages.hermes || 'Runtime, tool registry, receipts and recovery are available', icon: Bot, status: state.systemChecks.hermes, action: state.systemChecks.hermes === 'failed' ? { label: 'Run again', run: onRunAgain } : undefined },
		{ id: 'sqlite', label: 'Local search engine', detail: state.systemCheckMessages.sqlite || 'Better SQLite opened and its read/write probe passed', icon: Database, status: state.systemChecks.sqlite, action: state.systemChecks.sqlite === 'failed' ? { label: 'Repair database', run: () => onGoToStep('prepare-vault') } : undefined },
		{ id: 'fullText', label: 'Vault search', detail: state.systemCheckMessages.fullText || 'The local full-text index can answer searches now', icon: FileSearch, status: state.systemChecks.fullText, action: state.systemChecks.fullText === 'failed' ? { label: 'Review search', run: () => onGoToStep('prepare-vault') } : undefined },
		{ id: 'storage', label: 'Local storage', detail: state.systemCheckMessages.storage || 'Peak can safely create and read its own data root', icon: FolderOpen, status: state.systemChecks.storage, action: state.systemChecks.storage === 'failed' ? { label: 'Open storage settings', run: () => onOpenSettings('advanced') } : undefined },
	];
	const safetyRow: SystemCheckRowModel = {
		id: 'safety',
		label: 'Safety defaults',
		detail: state.systemCheckMessages.safety || 'Peak asks before risky or costly actions',
		icon: ShieldCheck,
		status: state.systemChecks.safety,
		action: state.systemChecks.safety === 'needs-attention' ? { label: 'Review safety', run: () => onOpenSettings('agents') } : undefined,
	};
	const settledRequired = requiredRows.filter((row) => row.status !== 'idle' && row.status !== 'checking').length;
	const failedRequired = requiredRows.filter((row) => row.status === 'failed').length;
	const checksRunning = settledRequired !== requiredRows.length;
	const summaryTitle = checksRunning
		? 'Checking your setup'
		: failedRequired > 0
			? `${failedRequired} required ${failedRequired === 1 ? 'item needs' : 'items need'} attention`
			: 'Everything required is ready';
	return (
		<StepShell step={4} title="Check the parts Peak depends on" intro="This is a real pre-flight check, not a settings summary. You can watch each check complete, run it again, and fix anything that needs attention.">
			<div className="pk-onboarding-system-summary" data-state={checksRunning ? 'checking' : failedRequired > 0 ? 'attention' : 'ready'}>
				<span>{checksRunning ? <Loader2 size={19} /> : failedRequired > 0 ? <CircleAlert size={19} /> : <CheckCircle2 size={19} />}{summaryTitle}</span>
				<span>{settledRequired} of {requiredRows.length} required <Button variant="ghost" className="pk-onboarding-run-again" onClick={onRunAgain}>Run again</Button></span>
			</div>
			<div className="pk-onboarding-check-columns">
				<section className="pk-onboarding-system-check"><header className="pk-onboarding-system-check__label"><strong>Required for first use</strong><span>All must pass</span></header>{requiredRows.map((row) => <SystemCheckRow key={row.id} row={row} />)}</section>
				<section className="pk-onboarding-optional-checks"><header><strong>Optional &amp; policy checks</strong><span>Do not block setup</span></header><SystemCheckRow row={safetyRow} /><div className="pk-onboarding-optional-notes"><span><strong>Live web search</strong><small>Configure later in Settings</small></span><span><strong>Media route</strong><small>{mediaRouteAvailable ? 'A compatible service is connected' : 'Not available yet; setup stays visible in Settings'}</small></span></div></section>
			</div>
			<div className="pk-onboarding-note"><ShieldCheck size={18} /><span><strong>Safe default:</strong> Agents ask before writes, commands, network access and costly actions. Existing expert bypass settings are shown as needing attention.</span></div>
		</StepShell>
	);
}

function TryPeakStep({ launchError, mediaRouteAvailable, onLaunch }: {
	launchError: string | null;
	mediaRouteAvailable: boolean;
	onLaunch: (target: NonNullable<MyPluginSettings['onboarding']['firstSuccessTarget']>) => void;
}) {
	return (
		<StepShell step={5} eyebrow="SETUP COMPLETE" title="Where do you want to start?" intro="Choose a real task to finish setup. Peak opens the selected workspace immediately — there is no empty demo screen.">
			{launchError ? <div className="pk-onboarding-error"><CircleAlert size={18} /><span>{launchError}</span></div> : null}
			<div className="pk-onboarding-launchpad">
				<LaunchCard icon={MessageSquare} title="Ask my vault" detail="Open Chat Studio" onClick={() => onLaunch('chat-studio')} />
				<LaunchCard icon={FolderOpen} title="Work on a note" detail="Open the active or most recent note" onClick={() => onLaunch('recent-note')} />
				<LaunchCard icon={Search} title="Search the vault" detail="Open full-text Vault Search" onClick={() => onLaunch('vault-search')} />
				<LaunchCard icon={Search} title="Open AI Search" detail="Ask evidence-based vault questions" onClick={() => onLaunch('ai-search')} />
				<LaunchCard icon={Network} title="Open File Atlas" detail="Explore documents and relationships" onClick={() => onLaunch('file-atlas')} />
				<LaunchCard icon={Network} title="Open AI Graph" detail="Open the graph search workspace" onClick={() => onLaunch('ai-graph')} />
				<LaunchCard icon={Bot} title="Start Agent & Wizard" detail="Open Peak Hermes Command Center" onClick={() => onLaunch('agent-wizard')} />
				<LaunchCard icon={Sparkles} title="Create media" detail={mediaRouteAvailable ? "Open Chat Studio's media actions" : 'Not available yet · connect OpenAI, OpenRouter or fal.ai'} disabled={!mediaRouteAvailable} onClick={() => onLaunch('create-media')} />
				<LaunchCard icon={Pencil} title="Open Composer" detail="Open Composer for the active Markdown note" onClick={() => onLaunch('composer')} />
			</div>
		</StepShell>
	);
}

function StepShell({ step, eyebrow, title, intro, children }: { step: number; eyebrow?: string; title: string; intro: string; children: React.ReactNode }) {
	return <section className="pk-onboarding-step-content"><span className="pk-onboarding-step-content__eyebrow">{eyebrow ?? `STEP ${step} OF ${PRIMARY_STEPS.length}`}</span><strong className="pk-onboarding-step-content__title">{title}</strong><span className="pk-onboarding-step-content__intro">{intro}</span>{children}</section>;
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

interface SystemCheckRowModel {
	id: string;
	label: string;
	detail: string;
	icon: LucideIcon;
	status: OnboardingCheckState;
	action?: { label: string; run: () => void };
}

function SystemCheckRow({ row }: { row: SystemCheckRowModel }) {
	const Icon = row.icon;
	const result = row.status === 'ready' ? 'Ready' : row.status === 'checking' ? 'Checking…' : row.status === 'building' ? 'Finishing in background' : row.status === 'needs-attention' ? 'Review recommended' : row.status === 'failed' ? 'Needs attention' : 'Waiting';
	return <div className="pk-onboarding-system-row" data-state={row.status}><span>{row.status === 'checking' || row.status === 'building' ? <Loader2 size={19} /> : row.status === 'ready' ? <CheckCircle2 size={19} /> : row.status === 'needs-attention' || row.status === 'failed' ? <CircleAlert size={19} /> : <Icon size={19} />}<span><strong>{row.label}</strong><small>{row.detail}</small></span></span><span className="pk-onboarding-system-row__result"><em>{result}</em>{row.action ? <Button variant="secondary" className="pk-onboarding-system-row__action" onClick={row.action.run}>{row.action.label}</Button> : null}</span></div>;
}

function LaunchCard({ icon: Icon, title, detail, disabled = false, onClick }: { icon: LucideIcon; title: string; detail: string; disabled?: boolean; onClick: () => void }) {
	return <Button variant="ghost" disabled={disabled} data-available={disabled ? 'false' : 'true'} onClick={onClick}><Icon size={22} /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Button>;
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
	if (state.step === 'prepare-vault' && (state.fastIndex === 'starting' || state.fastIndex === 'running')) return 'Fast local search is preparing. Peak will reuse this one indexing run.';
	if (state.step === 'system-check') return 'Existing indexing work is reused or attached; it is never duplicated.';
	return '';
}

function blockerGuidance(blocker: OnboardingBlockerId, state: OnboardingState): { title: string; detail: string } {
	if (blocker === 'operation') return { title: 'Moving to the next step…', detail: 'The current action has started. You do not need to click Continue again.' };
	if (blocker === 'checks') return { title: 'Checks are still running', detail: 'Continue becomes available as soon as every required check has a result.' };
	if (blocker === 'connection') return { title: 'Verify one AI connection to continue', detail: state.systemCheckMessages.connection || 'Choose a connection, run its test, and confirm that it is Ready.' };
	if (blocker === 'models' || blocker === 'conversation' || blocker === 'knowledge' || blocker === 'agent') return { title: 'Choose compatible core models to continue', detail: 'Review Chat, Search and Agent roles. Agent & tools must use a tool-capable model.' };
	if (blocker === 'sqlite') return { title: 'Repair the local search engine to continue', detail: state.systemCheckMessages.sqlite || state.betterSqliteMessage || 'Better SQLite must pass compatibility and read/write checks.' };
	if (blocker === 'index' || blocker === 'fullText') return { title: 'Fast local search needs attention', detail: state.systemCheckMessages.fullText || state.fastIndexMessage || 'Return to Prepare vault and retry the fast local index.' };
	if (blocker === 'hermes') return { title: 'Peak Hermes is not ready yet', detail: state.systemCheckMessages.hermes || 'Wait a moment, then run the system check again.' };
	if (blocker === 'storage') return { title: 'Choose a writable Peak data root to continue', detail: state.systemCheckMessages.storage || 'Open Storage settings, choose a Vault-relative folder, then run the check again.' };
	if (blocker === 'safety') return { title: 'Review the current safety policy', detail: state.systemCheckMessages.safety || 'Open Agents settings and confirm the permission mode.' };
	return { title: 'Setup needs attention', detail: 'Review the highlighted item, then run the check again.' };
}

function combineCheckStatus(statuses: OnboardingCheckState[]): OnboardingCheckState {
	if (statuses.some((status) => status === 'failed')) return 'failed';
	if (statuses.some((status) => status === 'needs-attention')) return 'needs-attention';
	if (statuses.some((status) => status === 'checking')) return 'checking';
	if (statuses.some((status) => status === 'building')) return 'building';
	if (statuses.every((status) => status === 'ready')) return 'ready';
	return 'idle';
}

function indexReadinessMessage(readiness: IndexReadinessProjection, fallback: string): string {
	if (readiness.indexedDocuments > 0) return `${readiness.indexedDocuments.toLocaleString()} documents are available or being prepared. ${fallback}`;
	return fallback;
}

function indexReadinessMetrics(readiness: IndexReadinessProjection) {
	return {
		indexedDocuments: readiness.indexedDocuments,
		totalDocuments: null,
		failures: readiness.failures,
		percent: readiness.fullText === 'ready' ? 100 : null,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
