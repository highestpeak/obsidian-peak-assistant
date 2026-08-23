/**
 * Chat ↔ Harness runtime bridge (task A3, plan §5.1).
 *
 * `service-conversation.streamChat` used to drive `vercelStreamChat` → Vercel
 * AI SDK `streamText` → SDK's internal multi-step tool loop. A3 replaces that
 * path with `runAgentLoop` (harness) so Chat and the harness share one
 * runtime with one budget, one permission surface, one TraceBus and one
 * abort story.
 *
 * This module is a thin adapter:
 *
 *   in : { profile, modelId, messages, tools, budget, abortSignal }
 *   out: AsyncGenerator<LLMStreamEvent>  ← same contract useStreamChat
 *                                          already knows how to consume
 *
 * Event translation is defined by the ADAPTER_EVENT_TABLE comment below.
 * If you add a new AgentLoopStreamEvent type, translate it here so Chat
 * keeps a single-subscription surface.
 */

import type { LanguageModel, ModelMessage } from 'ai';
import type { Profile } from '@/core/profiles/types';
import type {
	LLMOutputControlSettings,
	LLMRequestMessage,
	LLMStreamEvent,
	LLMUsage,
	MessagePart,
	ToolResultOutput,
} from '@/core/providers/types';
import { createLanguageModel } from '@/core/providers/vercel/provider-factory';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import type {
	AgentLoopBudget,
	AgentLoopFinishReason,
	AgentLoopModelSettings,
	AgentLoopResult,
	AgentLoopStatus,
	AgentLoopStreamEvent,
	PermissionAskRequest,
	PermissionAskResolution,
} from '@/service/agents/harness/loop/types';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES, type TierBinding } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import type { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import type { DebugTracePort } from '@/core/debug-trace';

export interface HarnessChatStreamRequest {
	profile: Profile;
	modelId: string;
	messages: LLMRequestMessage[];
	tools: ToolDef[];
	loopId: string;
	budget: AgentLoopBudget;
	outputControl?: LLMOutputControlSettings;
	abortSignal?: AbortSignal;
	debugTrace?: DebugTracePort | null;
	/**
	 * B1 §5.2 R4: PermissionGuard is now owned by the caller so mutating
	 * tools (MCP `kind:'edit'`, future media-generate) get an ask-based
	 * approval loop. Absent guard → the harness's default mode
	 * (`acceptEdits`) auto-approves; only pass a guard when the caller
	 * wants runtime confirmation.
	 */
	permission?: PermissionGuard;
	/**
	 * Resolver invoked on every `permission_request`. Chat wires this to a
	 * UI card that surfaces `Allow / Deny`; tests wire it to a canned
	 * decision. Absent → PermissionGuard `ask` decisions become deny (the
	 * harness's safe fallback, see AgentLoop docs).
	 */
	resolvePermissionAsk?: (
		request: PermissionAskRequest,
	) => Promise<PermissionAskResolution> | PermissionAskResolution;
	/**
	 * Optional callback for `permission_request` events. This is the same
	 * information carried on the LLMStreamEvent below; kept as a direct
	 * callback so future non-UI consumers (headless tests, background
	 * jobs) can watch for asks without parsing the UI stream shape.
	 */
	onPermissionRequest?: (event: PermissionRequestEvent) => void;
}

/**
 * Public shape of a permission request forwarded through the Chat stream.
 * Kept structural (no class) so UI code can construct/serialize freely.
 */
export interface PermissionRequestEvent {
	kind: 'permission_request';
	requestId: string;
	toolName: string;
	stepIndex: number;
	argsSummary?: string;
	reason?: string;
}

export interface PermissionResolvedEvent {
	kind: 'permission_resolved';
	requestId: string;
	decision: 'allow' | 'deny';
	reason?: string;
}

export interface RunStatusEvent {
	kind: 'run_status';
	state: 'running' | 'waiting-permission' | 'completed' | 'failed' | 'cancelled' | 'timeout';
	reason?: string;
}

export interface HarnessChatStreamResult {
	runId: string;
	finishReason: AgentLoopFinishReason;
	/**
	 * Terminal lifecycle bucket. Only these four values ever surface on a
	 * finished receipt: `completed | cancelled | timeout | failed`. The
	 * `waiting-permission` state that appears on `AgentLoopRunState` /
	 * `run_status` events is a LIVE (mid-run) state only — it never lands
	 * on a receipt. B1 implementers wiring the ask UI should key on
	 * `run_status` events for the live signal and on this field for the
	 * final receipt. See `AgentLoopStatus` vs `AgentLoopRunState` in
	 * `service/agents/harness/loop/types.ts`.
	 */
	status: AgentLoopStatus;
	totalTokens: number;
	totalToolCalls: number;
	error?: string;
}

/**
 * Drive one chat turn through `runAgentLoop`, yielding UI-shaped
 * `LLMStreamEvent`s as harness events fire. Preserves typewriter behaviour:
 * `text_delta` fans out synchronously with the provider chunk.
 *
 * The returned generator eventually yields a `complete` event carrying the
 * final usage + finishReason. The final `HarnessChatStreamResult` is
 * delivered as the generator's return value (accessible on
 * `IteratorResult.value` when `done` is `true`), which the ConversationService
 * uses to record `runId` / status on the debug run and TurnExecutionReceipt.
 */
export function harnessStreamChat(
	req: HarnessChatStreamRequest,
): AsyncGenerator<LLMStreamEvent, HarnessChatStreamResult, void> {
	const languageModel = createLanguageModel(req.profile, req.modelId);
	return runHarnessStream(req, languageModel);
}

/**
 * Split constructor so tests can substitute a mock LanguageModel without
 * touching the real provider factory (which reaches ProfileRegistry).
 */
export function harnessStreamChatWithModel(
	req: HarnessChatStreamRequest,
	languageModel: LanguageModel,
): AsyncGenerator<LLMStreamEvent, HarnessChatStreamResult, void> {
	return runHarnessStream(req, languageModel);
}

async function* runHarnessStream(
	req: HarnessChatStreamRequest,
	languageModel: LanguageModel,
): AsyncGenerator<LLMStreamEvent, HarnessChatStreamResult, void> {
	const { systemPrompt, harnessMessages } = splitSystemAndConvert(req.messages);

	// Single-tier binding: Chat is unified today (no cascade), so we bind the
	// resolved profile+model to the `fast` tier slot and disable escalation. If
	// future work wires a cascade for Chat, extend TierBindings here.
	const binding: TierBinding = {
		tier: 'fast',
		providerId: req.profile.id ?? req.profile.kind ?? 'unknown',
		modelId: req.modelId,
		resolve: () => languageModel,
		capabilities: { ...DEFAULT_TIER_CAPABILITIES },
		estimatedSingleStepP: 0.99,
	};
	const controller = new TierController({
		bindings: { fast: binding },
		policy: { allowEscalation: false, maxEscalationsPerLoop: 0 },
		loopId: req.loopId,
	});

	const queue: LLMStreamEvent[] = [];
	let done = false;
	let waiter: (() => void) | null = null;
	let lastUsage: LLMUsage | undefined;
	let lastFinishReason: string | undefined;

	const push = (event: LLMStreamEvent) => {
		queue.push(event);
		const w = waiter;
		waiter = null;
		w?.();
	};

	const onStreamEvent = (event: AgentLoopStreamEvent) => {
		if (event.type === 'permission_request' && req.onPermissionRequest) {
			req.onPermissionRequest({
				kind: 'permission_request',
				requestId: event.requestId,
				toolName: event.toolName,
				stepIndex: event.stepIndex,
				argsSummary:
					typeof event.argsSummary === 'string'
						? event.argsSummary
						: event.argsSummary != null
							? safeJsonStringify(event.argsSummary)
							: undefined,
			});
		}
		translateAgentEvent(event, {
			push,
			setUsage: (u) => { lastUsage = mergeUsage(lastUsage, u); },
			setFinishReason: (r) => { lastFinishReason = r; },
		});
	};

	// Kick off the loop; we consume its stream via the queue above. When the
	// loop resolves we flush a trailing `complete` event so useStreamChat gets
	// the same terminal signal it saw from the Vercel adapter.
	//
	// Note on `outputControl.timeoutStepMs` / `timeoutTotalMs`: pre-A3 the
	// Vercel adapter applied stall + total-wall-clock timers driven by these
	// fields. Under the harness path the AgentLoop honours only `abortSignal`,
	// so the Chat runtime layer (this file's caller path) is the correct home
	// for any future timer wiring. Explicitly leaving the door open for a
	// follow-up rather than reintroducing timer state inside the loop.
	const loopPromise: Promise<AgentLoopResult> = runAgentLoop({
		loopId: req.loopId,
		systemPrompt,
		initialMessages: harnessMessages,
		tools: req.tools,
		tierController: controller,
		budget: req.budget,
		abortSignal: req.abortSignal,
		modelSettings: toModelSettings(req.outputControl),
		onStreamEvent,
		debugTrace: req.debugTrace,
		debugSurface: 'chat',
		debugCapabilityId: 'chat.turn',
		// B1 §5.2 R4: propagate permission guard + resolver so mutating
		// tools (MCP `kind:'edit'`) go through the ask path.
		permission: req.permission,
		resolvePermissionAsk: req.resolvePermissionAsk,
	})
		.catch((err) => {
			// Loop internal failure (setup error before onStreamEvent fired,
			// or bug in the harness itself). Surface as an error event so the
			// UI shows a failed message instead of hanging on an open stream.
			push({
				type: 'error',
				error: err instanceof Error ? err : new Error(String(err)),
			});
			throw err;
		})
		.finally(() => {
			done = true;
			const w = waiter;
			waiter = null;
			w?.();
		});
	// Keep a handle so we can await the final result without a race: even if
	// the loop rejects, we drain the queue first, then let the final
	// AgentLoopResult flow through the outer try/catch below.
	let loopSettled: AgentLoopResult | { error: unknown } | null = null;
	loopPromise
		.then((r) => { loopSettled = r; })
		.catch((err) => { loopSettled = { error: err }; });

	try {
		while (true) {
			if (queue.length > 0) {
				yield queue.shift() as LLMStreamEvent;
				continue;
			}
			if (done) break;
			await new Promise<void>((resolve) => { waiter = resolve; });
		}

		// Await the loop's terminal promise so we surface the final status +
		// tokens even after the queue drains. A rejection is fine — we've
		// already pushed a synthetic `error` event; re-throw so the outer
		// generator caller can decide.
		let result: AgentLoopResult;
		try {
			result = await loopPromise;
		} catch (err) {
			// We already pushed a translated error; still yield a `complete`
			// so useStreamChat's post-loop bookkeeping runs.
			yield {
				type: 'complete',
				usage: lastUsage ?? {},
				finishReason: 'error' as const,
			};
			return {
				runId: req.loopId,
				finishReason: 'error',
				status: 'failed',
				totalTokens: lastUsage?.totalTokens ?? 0,
				totalToolCalls: 0,
				error: err instanceof Error ? err.message : String(err),
			};
		}

		// Emit the final `complete` event once the loop settles. We use the
		// harness-derived status/finishReason so downstream consumers key on
		// the same values the loop reported.
		yield {
			type: 'complete',
			usage: lastUsage ?? {
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: result.totalTokens,
			},
			finishReason: mapFinishReasonToVercel(result.finishReason, lastFinishReason),
		};

		return {
			runId: result.loopId,
			finishReason: result.finishReason,
			status: result.status,
			totalTokens: result.totalTokens,
			totalToolCalls: result.totalToolCalls,
			error: result.error,
		};
	} finally {
		// Prevent an unbounded queue if the caller stops iterating early.
		queue.length = 0;
		void loopSettled; // silence lint
	}
}

// ─── event translation ────────────────────────────────────────────────────────

/**
 * ADAPTER_EVENT_TABLE (single source of truth for the harness → UI mapping):
 *
 *   AgentLoopStreamEvent        LLMStreamEvent
 *   ─────────────────────────   ─────────────────────────────────────────────
 *   text_delta               →  text-delta { text: delta }
 *   reasoning_delta          →  reasoning-delta { text: delta }
 *   tool_input_start         →  tool-input-start { toolName }
 *   tool_input_delta         →  tool-input-delta { delta }
 *   tool_call                →  tool-call { toolName, input }
 *   tool_result              →  tool-result { toolName, input?, output }
 *   step_finish              →  on-step-finish { finishReason, usage, text }
 *                               (accumulates usage; final `complete` uses it)
 *   error                    →  error { error: Error }
 *   permission_request       →  chat-permission-request  (B1)
 *   permission_resolved      →  chat-permission-resolved (B1)
 *   run_status               →  chat-run-status          (B1)
 *   loop_start / loop_finish →  (dropped; useStreamChat gets `complete` from
 *                                the harnessStreamChat trailer)
 *   step_start               →  (dropped; TraceBus keeps it for debug)
 */
interface TranslateSinks {
	push: (event: LLMStreamEvent) => void;
	setUsage: (usage: LLMUsage | undefined) => void;
	setFinishReason: (reason: string | undefined) => void;
}

function translateAgentEvent(event: AgentLoopStreamEvent, sinks: TranslateSinks): void {
	switch (event.type) {
		case 'text_delta':
			sinks.push({ type: 'text-delta', text: event.delta });
			return;
		case 'reasoning_delta':
			sinks.push({ type: 'reasoning-delta', text: event.delta });
			return;
		case 'tool_input_start':
			sinks.push({ type: 'tool-input-start', toolName: event.toolName });
			return;
		case 'tool_input_delta':
			sinks.push({ type: 'tool-input-delta', delta: event.delta });
			return;
		case 'tool_call':
			sinks.push({ type: 'tool-call', toolName: event.toolName, input: event.args });
			return;
		case 'tool_result':
			sinks.push({
				type: 'tool-result',
				toolName: event.toolName,
				// AgentLoop's tool_result carries {ok, payload}; for the UI
				// contract we surface `payload` as `output` and skip `input`
				// (UI reconstructs from the paired tool-call).
				output: event.payload,
			} as any);
			return;
		case 'step_finish': {
			const usage: LLMUsage = {
				inputTokens: event.promptTokens,
				outputTokens: event.completionTokens,
				totalTokens: event.totalTokens,
			};
			sinks.setUsage(usage);
			sinks.setFinishReason(event.finishReason);
			sinks.push({
				type: 'on-step-finish',
				text: event.text,
				finishReason: event.finishReason as any,
				usage,
			});
			return;
		}
		case 'error':
			sinks.push({
				type: 'error',
				error: new Error(event.error),
			});
			return;
		case 'permission_request':
			// B1 §5.2 R4: expose the ask on the UI stream so useStreamChat
			// can pop the inline confirmation card. `argsSummary` is the
			// short human-readable label the guard produced; the resolver
			// callback (bound out-of-band via HarnessChatStreamRequest)
			// carries the actual decision back to the loop.
			sinks.push({
				type: 'chat-permission-request',
				requestId: event.requestId,
				toolName: event.toolName,
				stepIndex: event.stepIndex,
				args: event.argsSummary,
			});
			return;
		case 'permission_resolved':
			sinks.push({
				type: 'chat-permission-resolved',
				requestId: event.requestId,
				decision: event.decision,
				reason: event.reason,
			});
			return;
		case 'run_status':
			sinks.push({
				type: 'chat-run-status',
				state: event.state,
				reason: event.reason,
			});
			return;
		case 'loop_start':
		case 'loop_finish':
		case 'step_start':
			// Debug-only signals; not surfaced on the UI stream. Trace
			// consumers still see them via TraceBus.
			return;
	}
}

// ─── message conversion ───────────────────────────────────────────────────────

/**
 * Convert `LLMRequestMessage[]` to `(systemPrompt, ModelMessage[])`. Mirrors
 * `vercel-adapter.ts::extractSystemMessage` + `toAiSdkMessages` so the same
 * prompt semantics the ContextPipeline built continue to hold under the
 * harness.
 */
function splitSystemAndConvert(messages: LLMRequestMessage[]): {
	systemPrompt: string;
	harnessMessages: ModelMessage[];
} {
	const systemParts: string[] = [];
	const harnessMessages: ModelMessage[] = [];
	for (const msg of messages) {
		if (msg.role === 'system') {
			for (const part of msg.content) {
				if (part.type === 'text') systemParts.push(part.text);
			}
			continue;
		}
		const contentParts = msg.content.flatMap(mapContentPart);
		const finalParts = contentParts.length > 0 ? contentParts : [{ type: 'text' as const, text: '' }];
		harnessMessages.push({ role: msg.role, content: finalParts } as ModelMessage);
	}
	return {
		systemPrompt: systemParts.join('\n\n'),
		harnessMessages,
	};
}

function mapContentPart(part: MessagePart): Array<
	| { type: 'text'; text: string }
	| { type: 'image'; image: string }
	| { type: 'file'; url: string; mediaType: string; filename?: string }
	| { type: 'reasoning'; text: string }
	| { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
> {
	switch (part.type) {
		case 'text':
			return [{ type: 'text', text: part.text }];
		case 'image': {
			let imageUrl: string;
			if (typeof part.data === 'string') {
				imageUrl = part.data;
			} else {
				const base64 = Buffer.from(part.data as any).toString('base64');
				imageUrl = `data:${part.mediaType};base64,${base64}`;
			}
			return [{ type: 'image', image: imageUrl }];
		}
		case 'file': {
			let fileUrl: string;
			if (typeof part.data === 'string') {
				fileUrl = part.data;
			} else {
				const base64 = Buffer.from(part.data as any).toString('base64');
				fileUrl = `data:${part.mediaType};base64,${base64}`;
			}
			return [{ type: 'file', url: fileUrl, mediaType: part.mediaType, filename: part.filename }];
		}
		case 'reasoning':
			return [{ type: 'reasoning', text: part.text }];
		case 'tool-call':
			return [{
				type: 'tool-call',
				toolCallId: part.toolCallId ?? `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				toolName: part.toolName,
				input: part.input,
			}];
		case 'tool-result':
			// Same fallback as vercel-adapter for provider compat.
			return [{
				type: 'text',
				text: JSON.stringify({
					type: 'tool-result',
					toolCallId: part.toolCallId,
					toolName: part.toolName,
					output: part.output as ToolResultOutput,
				}),
			}];
		default:
			return [{ type: 'text', text: '' }];
	}
}

/**
 * Project `LLMOutputControlSettings` (the UI-facing shape carrying user
 * generation knobs) onto the loop-facing `AgentLoopModelSettings`. Only the
 * fields Vercel `streamText` accepts as top-level parameters are forwarded;
 * `reasoningEffort` / `textVerbosity` currently have no top-level slot in
 * `streamText` and were not forwarded pre-A3 either, so they stay out of
 * this channel — B1 can widen this when we adopt `providerOptions` per
 * provider adapter. Wall-clock timers (`timeoutStepMs` / `timeoutTotalMs`)
 * are also intentionally excluded; see the note near `runAgentLoop` call.
 *
 * Returns `undefined` when every field is empty so the loop can skip the
 * whole `modelSettings` branch cleanly.
 */
function toModelSettings(
	oc: LLMOutputControlSettings | undefined,
): AgentLoopModelSettings | undefined {
	if (!oc) return undefined;
	const settings: AgentLoopModelSettings = {};
	if (oc.temperature !== undefined) settings.temperature = oc.temperature;
	if (oc.topP !== undefined) settings.topP = oc.topP;
	if (oc.topK !== undefined) settings.topK = oc.topK;
	if (oc.maxOutputTokens !== undefined) settings.maxOutputTokens = oc.maxOutputTokens;
	if (oc.frequencyPenalty !== undefined) settings.frequencyPenalty = oc.frequencyPenalty;
	if (oc.presencePenalty !== undefined) settings.presencePenalty = oc.presencePenalty;
	return Object.keys(settings).length > 0 ? settings : undefined;
}

function safeJsonStringify(v: unknown): string | undefined {
	try {
		return JSON.stringify(v);
	} catch {
		return undefined;
	}
}

function mergeUsage(a: LLMUsage | undefined, b: LLMUsage | undefined): LLMUsage | undefined {
	if (!a) return b;
	if (!b) return a;
	return {
		inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0) || undefined,
		outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0) || undefined,
		totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0) || undefined,
		reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0) || undefined,
		cachedInputTokens: (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0) || undefined,
	};
}

/**
 * Map a harness `AgentLoopFinishReason` to the Vercel-shaped `FinishReason`
 * so the existing `on-step-finish` / `complete` consumers see a known enum.
 * Prefer the last observed provider finishReason (from step_finish) when it
 * is a real string, since the harness rolls all natural stops into `stop`.
 */
function mapFinishReasonToVercel(
	reason: AgentLoopFinishReason,
	lastProviderReason?: string,
): 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown' {
	if (lastProviderReason && lastProviderReason !== 'unknown') {
		switch (lastProviderReason) {
			case 'stop':
			case 'length':
			case 'content-filter':
			case 'tool-calls':
			case 'error':
			case 'other':
			case 'unknown':
				return lastProviderReason;
		}
	}
	switch (reason) {
		case 'stop':
		case 'max_steps':
		case 'max_tokens':
		case 'max_tool_calls':
			return 'stop';
		case 'abort':
			return 'other';
		case 'timeout':
			return 'other';
		case 'error':
		case 'hook_block':
			return 'error';
	}
	return 'unknown';
}
