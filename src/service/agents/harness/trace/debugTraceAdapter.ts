// Bridge from the harness TraceBus to a DebugRunHandle.
//
// The harness emits its own semantic events (loop_start / step_start /
// step_finish / tool_call / tool_result / tier_escalate / context_compacted /
// loop_finish). This adapter subscribes to those events and translates them
// into DebugSpans on a caller-supplied DebugRunHandle.
//
// Design constraints:
//   - The AgentLoop is not modified. The adapter is a pure subscriber.
//   - If the debug run is the noop handle (mode=off), the adapter is still
//     safe: every `startSpan` returns a noop span handle.
//   - The adapter takes ownership of unsubscribing when the loop finishes so
//     no listeners linger on the TraceBus after the run completes.

import type {
	DebugRunHandle,
	DebugSpanHandle,
} from '@/core/debug-trace';
import type { TraceBus } from './events';

export interface AttachHarnessDebugTraceInput {
	readonly bus: TraceBus;
	readonly debugRun: DebugRunHandle;
}

export interface AttachedHarnessDebugTrace {
	/** Detach subscribers. Safe to call more than once. */
	detach(): void;
}

/**
 * Subscribe to the given TraceBus and mirror each event onto DebugSpans on
 * the given DebugRunHandle. Returns a detach handle; call `detach()` when
 * the loop is over.
 */
export function attachHarnessDebugTrace(
	input: AttachHarnessDebugTraceInput,
): AttachedHarnessDebugTrace {
	const { bus, debugRun } = input;

	// Track the currently-open loop span and step spans so tool_call /
	// tool_result can attach at the right depth.
	let loopSpan: DebugSpanHandle | undefined;
	const stepSpans = new Map<number, DebugSpanHandle>();
	const toolSpans = new Map<string, DebugSpanHandle>();

	const disposers: Array<() => void> = [];

	disposers.push(
		bus.on('loop_start', (payload) => {
			loopSpan = debugRun.startSpan({
				kind: 'custom',
				name: `agent-loop-${payload.loopId}`,
			});
			loopSpan.setParams({ loopId: payload.loopId, startedAt: payload.startedAt });
		}),
	);

	disposers.push(
		bus.on('step_start', (payload) => {
			const parent = loopSpan;
			const span = parent
				? parent.child({ kind: 'model.call', name: `step-${payload.stepIndex}` })
				: debugRun.startSpan({
						kind: 'model.call',
						name: `step-${payload.stepIndex}`,
				  });
			span.setParams({
				stepIndex: payload.stepIndex,
				tier: payload.tier,
				modelId: payload.modelId,
			});
			stepSpans.set(payload.stepIndex, span);
		}),
	);

	disposers.push(
		bus.on('step_finish', (payload) => {
			const span = stepSpans.get(payload.stepIndex);
			if (!span) return;
			span.mergeParams({
				providerId: payload.providerId,
				finishReason: payload.finishReason,
				...(payload.selfScore !== undefined ? { selfScore: payload.selfScore } : {}),
			});
			span.addMetric('promptTokens', payload.promptTokens);
			span.addMetric('completionTokens', payload.completionTokens);
			span.addMetric('totalTokens', payload.totalTokens);
			span.addMetric('durationMs', payload.durationMs);
			if (payload.text) {
				span.setOutput({ raw: payload.text, contentType: 'text/plain' });
			}
			span.finish();
			stepSpans.delete(payload.stepIndex);
		}),
	);

	disposers.push(
		bus.on('tool_call', (payload) => {
			const parent = stepSpans.get(payload.stepIndex) ?? loopSpan;
			const span = parent
				? parent.child({ kind: 'tool.call', name: payload.toolName })
				: debugRun.startSpan({ kind: 'tool.call', name: payload.toolName });
			span.setParams({ toolCallId: payload.toolCallId });
			span.setInput({
				raw: safeStringify(payload.args),
				contentType: 'application/json',
			});
			toolSpans.set(payload.toolCallId, span);
		}),
	);

	disposers.push(
		bus.on('tool_result', (payload) => {
			const span = toolSpans.get(payload.toolCallId);
			if (!span) return;
			span.mergeParams({ ok: payload.ok });
			span.addMetric('durationMs', payload.durationMs);
			span.setOutput({
				raw: safeStringify(payload.payload),
				contentType: 'application/json',
			});
			span.finish();
			toolSpans.delete(payload.toolCallId);
		}),
	);

	disposers.push(
		bus.on('tier_escalate', (payload) => {
			if (!loopSpan) return;
			loopSpan.addDecision({
				decision: 'promote',
				reason: payload.reason,
				target: `${payload.from}→${payload.to}`,
				meta: { auto: payload.auto },
			});
		}),
	);

	disposers.push(
		bus.on('permission_check', (payload) => {
			const parent = stepSpans.get(payload.stepIndex) ?? loopSpan;
			const span = parent
				? parent.child({ kind: 'permission.check', name: payload.toolName })
				: debugRun.startSpan({ kind: 'permission.check', name: payload.toolName });
			span.setParams({
				source: payload.source,
				toolName: payload.toolName,
			});
			span.addDecision({
				decision: payload.decision === 'deny' ? 'deny' : 'keep',
				target: payload.toolName,
				reason: payload.reason ?? payload.source,
			});
			span.finish();
		}),
	);

	disposers.push(
		bus.on('context_compacted', (payload) => {
			const parent = stepSpans.get(payload.stepIndex) ?? loopSpan;
			const span = parent
				? parent.child({ kind: 'context.compact', name: `compact-${payload.stepIndex}` })
				: debugRun.startSpan({
						kind: 'context.compact',
						name: `compact-${payload.stepIndex}`,
				  });
			span.setParams({ stepIndex: payload.stepIndex });
			span.addMetric('tokensBefore', payload.tokensBefore);
			span.addMetric('tokensAfter', payload.tokensAfter);
			span.addMetric('droppedBlocks', payload.droppedBlocks);
			span.addMetric('droppedMessages', payload.droppedMessages);
			span.finish();
		}),
	);

	disposers.push(
		bus.on('loop_finish', (payload) => {
			if (loopSpan) {
				loopSpan.mergeParams({ finishReason: payload.finishReason });
				loopSpan.addMetric('durationMs', payload.durationMs);
				loopSpan.finish();
				loopSpan = undefined;
			}
			// Clean any tool spans that never emitted a result (defensive).
			for (const [, span] of toolSpans) span.finish();
			toolSpans.clear();
			for (const [, span] of stepSpans) span.finish();
			stepSpans.clear();
		}),
	);

	let detached = false;
	return {
		detach(): void {
			if (detached) return;
			detached = true;
			for (const off of disposers) off();
			for (const [, span] of stepSpans) span.finish();
			for (const [, span] of toolSpans) span.finish();
			if (loopSpan) loopSpan.finish();
		},
	};
}

function safeStringify(v: unknown): string {
	if (v === undefined || v === null) return String(v);
	if (typeof v === 'string') return v;
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}
