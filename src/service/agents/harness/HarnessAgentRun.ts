// T3 Wave 3.D — RunEnvelope adoption: Harness Agent Loop entry.
//
// Additive wrapper for the harness runAgentLoop / AgentLoop entry.
// Caller passes the actual loop as `execute`; this file adds only the
// RunSession skeleton so golden-trace conformance + failure capture +
// timing land uniformly.

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

export const HARNESS_AGENT_CAPABILITY_ID = 'harness.agent.loop';
const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.harness-agent+json';

export interface HarnessAgentRunResult<T = unknown> {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly payload: T;
}

export interface HarnessAgentRunOptions<T = unknown> {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	trigger?: RunTrigger;
	execute: () => Promise<T>;
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

export async function runHarnessAgent<T = unknown>(
	options: HarnessAgentRunOptions<T>,
): Promise<HarnessAgentRunResult<T>> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('harness-agent'),
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
		capabilityId: HARNESS_AGENT_CAPABILITY_ID,
		trigger: options.trigger ?? 'manual',
	});
	recorder.recordStatus('running');

	let payload: T;
	try {
		payload = await options.execute();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: 'Harness agent loop completed',
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
