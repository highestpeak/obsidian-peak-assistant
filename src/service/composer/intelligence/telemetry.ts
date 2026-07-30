/**
 * Peak Composer — proactive-intelligence telemetry (WP9, handoff §12.7 / spec
 * §Proactive Intelligence Evaluation Contract).
 *
 * Proactive intelligence CANNOT be judged by "how many suggestions were
 * generated". §12.7 fixes ten evaluation dimensions; their event names and field
 * shapes are DATA in `templates/config/composer.json` → `telemetry`, not literals
 * scattered through the Sidecar UI. This module owns:
 *
 *   - the dimension vocabulary (structural, not i18n);
 *   - the emitter port instrumented at the runtime/store layer (never a UI
 *     temporary counter);
 *   - the privacy guard: document content, prompts and source evidence never
 *     leave via telemetry — only structured/anonymized fields do (§12.7 boundary).
 *
 * Adaptive ranking / learning is interface-only here (no learning implemented),
 * matching the WP scope ("adaptive 部分只留接口不实现学习").
 */

/** The ten evaluation dimensions from handoff §12.7. */
export type IntelligenceMetricDimension =
	| 'relevance'
	| 'outcome'
	| 'control'
	| 'interruption'
	| 'dedup'
	| 'efficiency'
	| 'reliability'
	| 'performance'
	| 'trust'
	| 'learning';

/** A structured field value. Never free text of document content / prompt / evidence. */
export type TelemetryFieldValue = number | string | boolean;

/** One structured telemetry event. Fields are anonymized/structured by contract. */
export interface IntelligenceTelemetryEvent {
	readonly dimension: IntelligenceMetricDimension;
	/** Stable event name declared in the telemetry config catalog. */
	readonly event: string;
	readonly fields: Readonly<Record<string, TelemetryFieldValue>>;
	/** Whether this measures an AI or a deterministic action (§12.7 separation). */
	readonly kind?: 'ai' | 'deterministic';
}

/** The emitter port. The app supplies a sink; the runtime/stores call `emit`. */
export interface IntelligenceTelemetryPort {
	emit(event: IntelligenceTelemetryEvent): void;
}

/**
 * Field keys that must NEVER carry document content, prompts or source evidence
 * (§12.7 "文档内容/prompt/evidence 默认不出境"). The guard drops them defensively
 * even if a caller mistakenly attaches one.
 */
const FORBIDDEN_FIELD_KEYS: ReadonlySet<string> = new Set([
	'content',
	'text',
	'prompt',
	'promptText',
	'evidence',
	'evidenceText',
	'sourceText',
	'excerpt',
	'body',
	'documentText',
]);

/**
 * Strip any forbidden field and any string value that looks like it carries raw
 * content (over a conservative length bound). Structured counts, ids, enums and
 * short labels pass through. Returns a new object — never mutates the input.
 */
export function redactTelemetryFields(
	fields: Readonly<Record<string, TelemetryFieldValue>>,
	maxStringLength = 120,
): Record<string, TelemetryFieldValue> {
	const out: Record<string, TelemetryFieldValue> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (FORBIDDEN_FIELD_KEYS.has(key)) continue;
		if (typeof value === 'string' && value.length > maxStringLength) continue;
		out[key] = value;
	}
	return out;
}

/** Whether a raw fields object is already privacy-safe (no forbidden keys, no long strings). */
export function isPrivacySafe(
	fields: Readonly<Record<string, TelemetryFieldValue>>,
	maxStringLength = 120,
): boolean {
	for (const [key, value] of Object.entries(fields)) {
		if (FORBIDDEN_FIELD_KEYS.has(key)) return false;
		if (typeof value === 'string' && value.length > maxStringLength) return false;
	}
	return true;
}

/**
 * Exposure-normalized rate (§12.7 "不能通过提高曝光量虚增 accept count"). Accept
 * counts are always reported alongside the exposures that produced them so a
 * higher exposure can never masquerade as a better accept rate.
 */
export function exposureNormalizedRate(accepted: number, exposures: number): number {
	if (exposures <= 0) return 0;
	return accepted / exposures;
}

/**
 * A privacy-enforcing wrapper. Every event is redacted before it reaches the
 * sink, so instrumentation call sites can't accidentally leak content. This is
 * the object the IntelligenceRuntime hands to its stores.
 */
export class RedactingTelemetry implements IntelligenceTelemetryPort {
	constructor(
		private readonly sink: IntelligenceTelemetryPort,
		private readonly maxStringLength = 120,
	) {}

	emit(event: IntelligenceTelemetryEvent): void {
		this.sink.emit({
			...event,
			fields: redactTelemetryFields(event.fields, this.maxStringLength),
		});
	}
}

/** Default no-op sink (local-first: telemetry is off unless the app wires a sink). */
export const NOOP_INTELLIGENCE_TELEMETRY: IntelligenceTelemetryPort = {
	emit: () => undefined,
};

/**
 * Minimal append-only file port the {@link JsonlTelemetrySink} writes through.
 * The app binds it to the configured DataStore (Obsidian
 * `vault.adapter.append`); tests bind an in-memory fake — so JSONL
 * serialization/ordering stays framework-neutral and unit-testable.
 */
export interface JsonlAppendPort {
	appendLine(line: string): Promise<void>;
}

/**
 * A privacy-safe local-first sink that writes one JSON object per line to an
 * append-only stream (§12.7 evaluation telemetry — a distinct concern from the
 * cost/token usage dashboard, so it is NOT routed there). Each event becomes
 * `{"ts":<ms>, ...event}\n`. Appends are serialized on an internal tail promise
 * so concurrent emits never interleave a partial line, and failures are swallowed
 * (telemetry must never surface as an editing error). Wrap it in
 * {@link RedactingTelemetry} so content/prompt/evidence are stripped first.
 */
export class JsonlTelemetrySink implements IntelligenceTelemetryPort {
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly port: JsonlAppendPort,
		private readonly now: () => number = Date.now,
	) {}

	emit(event: IntelligenceTelemetryEvent): void {
		const line = JSON.stringify({ ts: this.now(), ...event }) + '\n';
		this.tail = this.tail.then(() => this.port.appendLine(line)).catch(() => undefined);
	}

	/** Resolves once every queued append settles (tests / flush-on-dispose). */
	drain(): Promise<void> {
		return this.tail;
	}
}

/**
 * Adaptive ranking learning surface — interface only (WP scope: no learning
 * implemented). An app can later bind a local, clearable model behind this port;
 * the Sidecar depends only on the interface.
 */
export interface IntelligenceAdaptivePort {
	/** Record an outcome for later, clearable local learning. No-op by default. */
	observe(event: IntelligenceTelemetryEvent): void;
	/** Whether adaptive ranking is currently enabled (must be user-disableable). */
	readonly enabled: boolean;
}

export const NOOP_ADAPTIVE: IntelligenceAdaptivePort = {
	observe: () => undefined,
	enabled: false,
};
