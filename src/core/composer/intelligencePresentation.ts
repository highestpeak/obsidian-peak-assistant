/**
 * Leaf-local Intelligence presentation state.
 *
 * The persisted manual preference only changes after an explicit user
 * open/close. Contextual opens (finding, comment, History) are temporary and
 * carry provenance without changing how the next Composer leaf starts.
 */
export type IntelligencePresentationOrigin =
	| { kind: 'automatic-suggestion'; findingId: string; blockId: string }
	| { kind: 'ask-copilot'; blockId: string }
	| { kind: 'comment-handoff'; commentId: string; blockId: string }
	| { kind: 'history-deep-link'; runId: string }
	| { kind: 'native-editor'; filePath: string };

export interface IntelligencePresentationState {
	open: boolean;
	manualPreference: boolean;
	origin: IntelligencePresentationOrigin | null;
	/** True only for an explicit closed/open transition initiated in this leaf. */
	animate: boolean;
}

export type IntelligencePresentationIntent =
	| { kind: 'manual-set'; open: boolean }
	| { kind: 'contextual-open'; origin: IntelligencePresentationOrigin };

export function initialIntelligencePresentationState(
	manualPreference: boolean,
): IntelligencePresentationState {
	return {
		open: manualPreference,
		manualPreference,
		origin: null,
		animate: false,
	};
}

export function reduceIntelligencePresentation(
	current: IntelligencePresentationState,
	intent: IntelligencePresentationIntent,
): IntelligencePresentationState {
	if (intent.kind === 'contextual-open') {
		return {
			open: true,
			manualPreference: current.manualPreference,
			origin: { ...intent.origin },
			animate: !current.open,
		};
	}
	return {
		open: intent.open,
		manualPreference: intent.open,
		origin: null,
		animate: current.open !== intent.open,
	};
}
