import { useCallback, useMemo, useReducer } from 'react';
import type { ModelAssignment } from '@/core/config/settingsTypes';
import type { OnboardingStepId } from '@/core/settings/peakSettingsContract';

export type PrimaryStep = OnboardingStepId;

export const PRIMARY_STEPS: readonly PrimaryStep[] = [
	'connect-ai',
	'core-models',
	'prepare-vault',
	'system-check',
	'try-peak',
];

export interface OnboardingRoleModels {
	conversation: ModelAssignment;
	knowledge: ModelAssignment;
	agent: ModelAssignment;
}

export type OnboardingCheckState = 'idle' | 'checking' | 'ready' | 'building' | 'needs-attention' | 'failed';

export interface OnboardingState {
	step: PrimaryStep;
	isReRun: boolean;
	selectedProfileId: string | null;
	connectionChecks: Record<string, 'idle' | 'checking' | 'ready' | 'error'>;
	models: OnboardingRoleModels;
	modelChecks: Record<keyof OnboardingRoleModels, OnboardingCheckState>;
	betterSqlite: 'unchecked' | 'repairing' | 'ready' | 'error';
	betterSqliteMessage: string;
	fastIndex: 'not-started' | 'starting' | 'running' | 'ready' | 'error';
	fastIndexMessage: string;
	systemChecks: {
		connection: OnboardingCheckState;
		conversation: OnboardingCheckState;
		knowledge: OnboardingCheckState;
		agent: OnboardingCheckState;
		hermes: OnboardingCheckState;
		sqlite: OnboardingCheckState;
		fullText: OnboardingCheckState;
		storage: OnboardingCheckState;
		safety: OnboardingCheckState;
	};
	operation: { id: number; kind: 'idle' | 'saving' | 'continuing' | 'launching'; message: string | null };
	done: boolean;
}

export type OnboardingEvent =
	| { type: 'next' }
	| { type: 'back' }
	| { type: 'jump'; step: PrimaryStep }
	| { type: 'select-profile'; profileId: string }
	| { type: 'connection-check'; profileId: string; status: 'checking' | 'ready' | 'error' }
	| { type: 'select-model'; role: keyof OnboardingRoleModels; assignment: ModelAssignment }
	| { type: 'model-check'; role: keyof OnboardingRoleModels; status: OnboardingCheckState }
	| { type: 'sqlite-repairing' }
	| { type: 'sqlite-result'; ready: boolean; message: string }
	| { type: 'index-status'; status: OnboardingState['fastIndex']; message?: string }
	| { type: 'system-check'; check: keyof OnboardingState['systemChecks']; status: OnboardingCheckState }
	| { type: 'operation'; id: number; kind: OnboardingState['operation']['kind']; message?: string | null }
	| { type: 'finish' };

export interface InitialStateOptions {
	isReRun?: boolean;
	initialStep?: PrimaryStep;
	selectedProfileId?: string | null;
	models?: Partial<OnboardingRoleModels>;
	connectionChecks?: OnboardingState['connectionChecks'];
	modelChecks?: Partial<OnboardingState['modelChecks']>;
	betterSqliteReady?: boolean;
	indexReady?: boolean;
}

export function initialState(options: InitialStateOptions = {}): OnboardingState {
	return {
		step: options.initialStep ?? 'connect-ai',
		isReRun: !!options.isReRun,
		selectedProfileId: options.selectedProfileId ?? null,
		connectionChecks: options.connectionChecks ?? {},
		models: {
			conversation: options.models?.conversation ?? { mode: 'automatic' },
			knowledge: options.models?.knowledge ?? { mode: 'automatic' },
			agent: options.models?.agent ?? { mode: 'automatic' },
		},
		modelChecks: {
			conversation: options.modelChecks?.conversation ?? 'idle',
			knowledge: options.modelChecks?.knowledge ?? 'idle',
			agent: options.modelChecks?.agent ?? 'idle',
		},
		betterSqlite: options.betterSqliteReady ? 'ready' : 'unchecked',
		betterSqliteMessage: '',
		fastIndex: options.indexReady ? 'ready' : 'not-started',
		fastIndexMessage: options.indexReady ? 'Existing full-text index is ready.' : '',
		systemChecks: {
			connection: 'idle', conversation: 'idle', knowledge: 'idle', agent: 'idle', hermes: 'idle',
			sqlite: 'idle', fullText: options.indexReady ? 'ready' : 'idle', storage: 'idle', safety: 'idle',
		},
		operation: { id: 0, kind: 'idle', message: null },
		done: false,
	};
}

export function reduce(state: OnboardingState, event: OnboardingEvent): OnboardingState {
	if (event.type === 'select-profile') return { ...state, selectedProfileId: event.profileId };
	if (event.type === 'connection-check') return { ...state, connectionChecks: { ...state.connectionChecks, [event.profileId]: event.status } };
	if (event.type === 'select-model') return { ...state, models: { ...state.models, [event.role]: event.assignment } };
	if (event.type === 'model-check') return { ...state, modelChecks: { ...state.modelChecks, [event.role]: event.status } };
	if (event.type === 'sqlite-repairing') return { ...state, betterSqlite: 'repairing', betterSqliteMessage: '' };
	if (event.type === 'sqlite-result') return { ...state, betterSqlite: event.ready ? 'ready' : 'error', betterSqliteMessage: event.message };
	if (event.type === 'index-status') return {
		...state,
		fastIndex: event.status,
		fastIndexMessage: event.message ?? state.fastIndexMessage,
	};
	if (event.type === 'system-check') return { ...state, systemChecks: { ...state.systemChecks, [event.check]: event.status } };
	if (event.type === 'operation') {
		if (event.id < state.operation.id) return state;
		return { ...state, operation: { id: event.id, kind: event.kind, message: event.message ?? null } };
	}
	if (event.type === 'jump') return { ...state, step: event.step };
	if (event.type === 'finish') return { ...state, done: true };
	if (event.type === 'next') {
		if (!canContinue(state)) return state;
		const index = primaryStepIndex(state.step);
		return index === PRIMARY_STEPS.length - 1 ? { ...state, done: true } : { ...state, step: PRIMARY_STEPS[index + 1] };
	}
	if (event.type === 'back') {
		const index = primaryStepIndex(state.step);
		return index <= 0 ? state : { ...state, step: PRIMARY_STEPS[index - 1] };
	}
	return state;
}

export function canContinue(state: OnboardingState): boolean {
	if (state.operation.kind !== 'idle') return false;
	if (state.step === 'connect-ai') return Object.values(state.connectionChecks).some((status) => status === 'ready');
	if (state.step === 'core-models') return Object.values(state.modelChecks).every((status) => status === 'ready');
	if (state.step === 'prepare-vault') {
		return state.betterSqlite === 'ready' && state.fastIndex !== 'starting' && state.fastIndex !== 'running';
	}
	if (state.step === 'system-check') {
		return Object.entries(state.systemChecks).every(([key, status]) =>
			status === 'ready' || status === 'building' || (key === 'safety' && status === 'needs-attention'),
		);
	}
	return state.step === 'try-peak';
}

export function primaryStepIndex(step: PrimaryStep): number {
	return Math.max(0, PRIMARY_STEPS.indexOf(step));
}

export interface OnboardingController {
	state: OnboardingState;
	dispatch: (event: OnboardingEvent) => void;
	primaryIndex: number;
	canContinue: boolean;
}

export function useOnboardingState(options: InitialStateOptions = {}): OnboardingController {
	const [state, rawDispatch] = useReducer(reduce, options, initialState);
	const dispatch = useCallback((event: OnboardingEvent) => rawDispatch(event), []);
	return useMemo(() => ({
		state,
		dispatch,
		primaryIndex: primaryStepIndex(state.step),
		canContinue: canContinue(state),
	}), [dispatch, state]);
}
