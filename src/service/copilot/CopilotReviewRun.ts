// T3 Wave 3.B — RunEnvelope adoption: Copilot Review entry.
//
// Same additive-wrapper shape as ChatConversationRun. The Copilot
// review pipeline (meta-agent stream → artifact collection → signal
// report) runs under a single RunSession so failures and timings match
// the golden-trace conformance shared with other adopters.
//
// Boundary discipline: no AppContext / service-locator lookups. Caller
// injects the actual review worker.

import {
	InMemoryRunRecorder,
	defaultClock,
	defaultIdFactory,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunIdFactory,
	type RunSession,
	type RunTrigger,
} from '@/service/run-envelope';

export const COPILOT_REVIEW_CAPABILITY_ID = 'copilot.review.run';
const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.copilot-review+json';

export interface CopilotReviewRunResult<T = unknown> {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly payload: T;
}

export interface CopilotReviewRunOptions<T = unknown> {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	trigger?: RunTrigger;
	review: () => Promise<T>;
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

export async function runCopilotReview<T = unknown>(
	options: CopilotReviewRunOptions<T>,
): Promise<CopilotReviewRunResult<T>> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('copilot-review'),
			...(userOnEvent !== undefined
				? {
						onEvent: (event) => {
							const snapshot = recorderRef?.getEvents() ?? [];
							userOnEvent(event, snapshot);
						},
					}
				: {}),
		});
	recorderRef = recorder;

	recorder.start({
		capabilityId: COPILOT_REVIEW_CAPABILITY_ID,
		trigger: options.trigger ?? 'manual',
	});
	recorder.recordStatus('running');

	let payload: T;
	try {
		payload = await options.review();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: 'Copilot review completed',
		contentType: ARTIFACT_CONTENT_TYPE,
	});
	const finalSession = recorder.finish('completed');

	return {
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
		payload,
	};
}
