/**
 * Description state machine (chat-studio §9 / PROJ-02 / RUN-05).
 *
 * States: view → editing → (optional) generating → editing → saving → view.
 * Human edits and AI drafts share ONE draft (single textarea). AI never
 * auto-saves; only an explicit user Save calls the service. Cancel restores
 * the last-saved value. Pure reducer so it can be unit-tested independently
 * of React.
 */

export type DescriptionStatus =
	| 'view'
	| 'editing'
	| 'generating'
	| 'saving'
	| 'error';

export interface DescriptionState {
	status: DescriptionStatus;
	/** Value currently rendered / edited in the textarea. */
	draft: string;
	/** Last persisted value, used to compare "dirty" + to restore on Cancel. */
	saved: string;
	/** Present when status === 'error'. */
	errorMessage?: string;
}

export type DescriptionAction =
	| { type: 'start-edit' }
	| { type: 'change'; value: string }
	| { type: 'ai-start' }
	| { type: 'ai-done'; value: string }
	| { type: 'ai-error'; message: string }
	| { type: 'save-start' }
	| { type: 'save-done'; value: string }
	| { type: 'save-error'; message: string }
	| { type: 'cancel' }
	| { type: 'saved-changed'; value: string };

export function initialDescriptionState(saved: string | undefined): DescriptionState {
	const s = saved ?? '';
	return { status: 'view', draft: s, saved: s };
}

export function descriptionReducer(
	state: DescriptionState,
	action: DescriptionAction,
): DescriptionState {
	switch (action.type) {
		case 'start-edit':
			// AI never auto-enters editing; user click triggers this.
			if (state.status !== 'view' && state.status !== 'error') return state;
			return { ...state, status: 'editing', draft: state.saved, errorMessage: undefined };
		case 'change':
			// While generating we still allow textarea to reflect the running
			// draft — but human typing does NOT cancel the async request; the
			// caller is responsible for signal-abort. Keep status honest.
			if (state.status === 'view') return state;
			return { ...state, draft: action.value };
		case 'ai-start':
			if (state.status !== 'editing' && state.status !== 'error') return state;
			return { ...state, status: 'generating', errorMessage: undefined };
		case 'ai-done':
			// AI RESULT replaces the textarea, but never persists (RUN-05).
			return { ...state, status: 'editing', draft: action.value };
		case 'ai-error':
			return { ...state, status: 'error', errorMessage: action.message };
		case 'save-start':
			return { ...state, status: 'saving', errorMessage: undefined };
		case 'save-done':
			return { status: 'view', draft: action.value, saved: action.value };
		case 'save-error':
			return { ...state, status: 'error', errorMessage: action.message };
		case 'cancel':
			return { status: 'view', draft: state.saved, saved: state.saved };
		case 'saved-changed':
			// External save (e.g. reload) — only replace if user isn't editing.
			if (state.status === 'view') {
				return { status: 'view', draft: action.value, saved: action.value };
			}
			return { ...state, saved: action.value };
	}
}

/** UI helpers */
export function isDescriptionDirty(state: DescriptionState): boolean {
	return state.draft !== state.saved;
}

export function isDescriptionBusy(state: DescriptionState): boolean {
	return state.status === 'generating' || state.status === 'saving';
}
