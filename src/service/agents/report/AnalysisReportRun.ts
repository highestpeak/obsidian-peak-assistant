// T3 Wave 3.C — RunEnvelope adoption: AI Analysis Report entry.
//
// Wraps ReportOrchestrator (or any equivalent worker the caller
// supplies) inside a RunSession. Same additive-wrapper pattern as
// ChatConversationRun / CopilotReviewRun.

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

export const ANALYSIS_REPORT_CAPABILITY_ID = 'analysis.report.run';
const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.analysis-report+json';

export interface AnalysisReportRunResult<T = unknown> {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly payload: T;
}

export interface AnalysisReportRunOptions<T = unknown> {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	trigger?: RunTrigger;
	generate: () => Promise<T>;
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

export async function runAnalysisReport<T = unknown>(
	options: AnalysisReportRunOptions<T>,
): Promise<AnalysisReportRunResult<T>> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('analysis-report'),
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
		capabilityId: ANALYSIS_REPORT_CAPABILITY_ID,
		trigger: options.trigger ?? 'manual',
	});
	recorder.recordStatus('running');

	let payload: T;
	try {
		payload = await options.generate();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: 'Analysis report generated',
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
