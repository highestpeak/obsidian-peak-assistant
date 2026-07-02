// T4 / T9 pilot — minimal CapabilityRunner.
//
// Ties together every T1-T6 piece landed 2026-07-02:
//
//   T1 CapabilityManifest  — contract the runner consumes
//   T3 RunEnvelope         — session/events/artifact envelope
//   T6 CompiledSkill       — skill + allowedTools resolved via
//                            SkillRegistry.compile()
//   T6 quarantine helper   — pre-flight tool checks (opt-in per call)
//   T5 ToolDef             — the tools the backend may invoke
//
// Backend dispatch is deliberately a caller-supplied `execute` function.
// The runner has no opinion on Hermes vs Claude SDK vs raw provider —
// that responsibility belongs to the composition site that constructs
// the runner options. Keeping the runner backend-agnostic means:
//   1. The runner is unit-testable without spinning up any provider.
//   2. Different backends (T4's `backendPolicy`) can be selected at the
//      composition layer without teaching the runner about them.
//   3. Later, the composition layer can synthesize the `execute`
//      function from a `BackendPolicy` — this file does not need to
//      grow.
//
// Boundary discipline:
//   - Imports only from `@/core/*` and `@/service/skills` / `@/service/run-envelope`.
//     No app-shell, no UI, no Obsidian.

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
import type { CapabilityManifest } from '@/core/types/capability';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import { checkSkillQuarantine } from '@/service/skills/quarantine';

const ARTIFACT_CONTENT_TYPE_DEFAULT = 'application/vnd.peak.capability-run+json';

/** What the caller-supplied backend produces. */
export interface CapabilityExecutionOutput<TResult = unknown> {
	/** The business payload. Runner clones nothing; caller owns lifetime. */
	readonly result: TResult;
	/** Optional artifact override; runner fills sensible defaults if absent. */
	readonly artifactTitle?: string;
	readonly artifactUri?: string;
	readonly artifactContentType?: string;
}

export interface CapabilityRunContext {
	readonly runId: string;
	readonly manifest: CapabilityManifest;
	readonly compiledSkill: CompiledSkill;
	/** Recorder pass-through — backends may emit progress/log events. */
	readonly recorder: InMemoryRunRecorder;
}

export interface CapabilityRunResult<TResult = unknown> {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly result: TResult;
}

export interface CapabilityRunOptions<TInput = unknown, TResult = unknown> {
	readonly manifest: CapabilityManifest;
	readonly compiledSkill: CompiledSkill;
	/**
	 * The backend dispatcher. Composition site synthesizes this from
	 * `manifest.backendPolicy`; unit tests pass a canned function.
	 */
	readonly execute: (input: TInput, ctx: CapabilityRunContext) => Promise<CapabilityExecutionOutput<TResult>>;
	readonly input: TInput;
	readonly trigger?: RunTrigger;
	readonly recorder?: InMemoryRunRecorder;
	readonly clock?: RunClock;
	readonly idFactory?: RunIdFactory;
	readonly onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

/**
 * Verify the capability's `skillRef` matches the compiled skill's id.
 * A mismatch means the composition site handed the runner a wrong
 * skill; fail-loud is safer than silent wrong-tool execution.
 */
function assertSkillMatchesManifest(manifest: CapabilityManifest, compiled: CompiledSkill): void {
	if (manifest.skillRef !== compiled.skillId) {
		throw new Error(
			`CapabilityRunner: manifest '${manifest.id}' references skill '${manifest.skillRef}' but received compiled skill '${compiled.skillId}'.`,
		);
	}
}

/**
 * Execute one capability run inside a fresh RunEnvelope.
 *
 * The runner does the envelope + skill-manifest cross-check + artifact
 * shape work. The actual business logic lives in `options.execute`,
 * which the composition site synthesizes from the backend policy.
 */
export async function runCapability<TInput, TResult>(
	options: CapabilityRunOptions<TInput, TResult>,
): Promise<CapabilityRunResult<TResult>> {
	assertSkillMatchesManifest(options.manifest, options.compiledSkill);

	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory(`cap-${options.manifest.id}`),
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

	const session = recorder.start({
		capabilityId: options.manifest.id,
		trigger: options.trigger ?? 'manual',
	});
	recorder.recordStatus('running');

	let output: CapabilityExecutionOutput<TResult>;
	try {
		output = await options.execute(options.input, {
			runId: session.runId,
			manifest: options.manifest,
			compiledSkill: options.compiledSkill,
			recorder,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: output.artifactTitle ?? `${options.manifest.title} run`,
		...(output.artifactUri !== undefined ? { uri: output.artifactUri } : {}),
		contentType: output.artifactContentType ?? ARTIFACT_CONTENT_TYPE_DEFAULT,
	});
	const finalSession = recorder.finish('completed');

	return {
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
		result: output.result,
	};
}

/**
 * Convenience quarantine gate — the runner does NOT invoke this itself
 * (backends decide when to check), but exposes it so callers running
 * inside a capability can validate tool calls with the compiled skill
 * without importing two modules.
 *
 * Re-exported from `service/skills/quarantine` so consumers touch a
 * single symbol.
 */
export { checkSkillQuarantine };
