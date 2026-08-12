import { useCallback, useMemo, useReducer } from 'react';
import type { RoleConfig } from '@/core/profiles/types';
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
	conversation: RoleConfig | null;
	knowledge: RoleConfig | null;
	agent: RoleConfig | null;
}

export interface OnboardingState {
	step: PrimaryStep;
	isReRun: boolean;
	selectedProfileId: string | null;
	connectionChecks: Record<string, 'idle' | 'checking' | 'ready' | 'error'>;
	models: OnboardingRoleModels;
	betterSqlite: 'unchecked' | 'repairing' | 'ready' | 'error';
	betterSqliteMessage: string;
	fastIndex: 'not-started' | 'starting' | 'running' | 'ready' | 'error';
	done: boolean;
}

export type OnboardingEvent =
	| { type: 'next' }
	| { type: 'back' }
	| { type: 'jump'; step: PrimaryStep }
	| { type: 'select-profile'; profileId: string }
	| { type: 'connection-check'; profileId: string; status: 'checking' | 'ready' | 'error' }
	| { type: 'select-model'; role: keyof OnboardingRoleModels; config: RoleConfig | null }
	| { type: 'sqlite-repairing' }
	| { type: 'sqlite-result'; ready: boolean; message: string }
	| { type: 'index-status'; status: OnboardingState['fastIndex'] }
	| { type: 'finish' };

export interface InitialStateOptions {
	isReRun?: boolean;
	initialStep?: PrimaryStep;
	selectedProfileId?: string | null;
	models?: Partial<OnboardingRoleModels>;
	connectionChecks?: OnboardingState['connectionChecks'];
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
			conversation: options.models?.conversation ?? null,
			knowledge: options.models?.knowledge ?? null,
			agent: options.models?.agent ?? null,
		},
		betterSqlite: options.betterSqliteReady ? 'ready' : 'unchecked',
		betterSqliteMessage: '',
		fastIndex: options.indexReady ? 'ready' : 'not-started',
		done: false,
	};
}

export function reduce(state: OnboardingState, event: OnboardingEvent): OnboardingState {
	if (event.type === 'select-profile') return { ...state, selectedProfileId: event.profileId };
	if (event.type === 'connection-check') return { ...state, connectionChecks: { ...state.connectionChecks, [event.profileId]: event.status } };
	if (event.type === 'select-model') return { ...state, models: { ...state.models, [event.role]: event.config } };
	if (event.type === 'sqlite-repairing') return { ...state, betterSqlite: 'repairing', betterSqliteMessage: '' };
	if (event.type === 'sqlite-result') return { ...state, betterSqlite: event.ready ? 'ready' : 'error', betterSqliteMessage: event.message };
	if (event.type === 'index-status') return { ...state, fastIndex: event.status };
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
	if (state.step === 'connect-ai') return !!state.selectedProfileId && state.connectionChecks[state.selectedProfileId] === 'ready';
	if (state.step === 'core-models') return !!state.models.conversation && !!state.models.knowledge && !!state.models.agent;
	if (state.step === 'prepare-vault') return state.betterSqlite === 'ready';
	return true;
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
