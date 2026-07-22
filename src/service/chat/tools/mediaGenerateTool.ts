/**
 * `media_generate` Chat tool (Task D1 §R1).
 *
 * Wires the unified `MediaGenerationService` into the Chat harness so
 * the model can request image / video / music generation via a single
 * ToolDef. Availability is decided by `resolveToolAvailability` (B1)
 * driven by the sync probe MediaGenerationService exposes; execution
 * runs through the same preflight → job → receipt pipeline the note-
 * scoped commands already use.
 *
 * Contract highlights:
 *   - `kind: 'edit'` — every call is a billable mutation, so
 *     PermissionGuard's ask path fires under the B1 UI.
 *   - image kind: fully executed here (route decided by preflight; NO
 *     silent switch, per C2 R3 invariant); the tool returns the vault
 *     paths + receipt ids as a text payload.
 *   - video / music: return a structured "not-yet-available" ToolResult
 *     rather than pretending to complete — the async job UI ships in D2.
 *   - Failures return a structured error string the model can read;
 *     ChatArtifactReceipt with state='failed' is persisted so the UI
 *     can render a failed card + retry.
 *   - Copy strings live in `templates/config/media-generation.json`
 *     (`strings.tool*`) — no inline text in this file.
 */

import { ok } from '@/service/agents/harness/tool/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import type { MediaGenerationService } from '@/service/media/MediaGenerationService';
import { MediaPreflightError } from '@/service/media/MediaGenerationService';
import {
	loadMediaGenerationConfig,
	type MediaGenerationStrings,
} from '@/service/media/mediaGenerationConfig';
import {
	mediaGenerateInputSchema,
	type MediaGenerateToolInput,
} from '@/core/schemas/tools/mediaGenerate';
import type {
	ChatArtifactReceipt,
	ChatArtifactAction,
} from '@/core/types/chat-studio';
import type {
	MediaGenerationRequest,
	MediaKind,
	MediaPreflight,
	MediaReferenceInput,
} from '@/core/types/media-generation';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

export interface MediaGenerateToolDeps {
	service: MediaGenerationService;
	/** Conversation the chat turn belongs to — anchors every persisted receipt. */
	conversationId?: string;
	/** Assistant message id being streamed — anchors every persisted receipt. */
	messageId?: string;
	/** Optional project id override. */
	projectId?: string;
	/**
	 * Persists a receipt directly (used for failed receipts the service
	 * pipeline would otherwise skip, and for batch multi-image expansion).
	 * Defaults to `service.deps.receiptSink.save`; injected here so tests
	 * can capture without touching sqlite.
	 */
	saveReceipt: (receipt: ChatArtifactReceipt) => Promise<void>;
	/**
	 * Zero-gap §4 A1 — turn a model-supplied reference id into a stable
	 * MediaReferenceInput (`vault:` path or `receipt:` artifactId), or null
	 * if the id was not surfaced by the user this turn. This is the ONLY
	 * boundary that decides "can the model actually cite this file"; the
	 * ToolDef refuses to send garbage ids to a paid endpoint.
	 */
	resolveAllowedReference?: (id: string) => MediaReferenceInput | null;
	/** Clock injected for deterministic tests. */
	now?: () => number;
}

/**
 * Build the media_generate ToolDef. Fresh per Chat turn so it captures
 * the current (conversationId, messageId, runId → via ctx.loopId).
 */
export function buildMediaGenerateTool(deps: MediaGenerateToolDeps): ToolDef {
	return {
		name: 'media_generate',
		description:
			'Generate media (image / video / music) via the configured route. ' +
			'Use when the user explicitly asks for a generated visual, video clip, or music/audio piece. ' +
			'Image runs synchronously; video and music currently require the async job UI (not yet wired) ' +
			'and will return a "not-available" result the model must relay to the user. ' +
			'The tool records a persistent ChatArtifactReceipt for every produced asset (success or failure) ' +
			'so the message thread renders the artifact and Resources tab lists it — do NOT re-describe the ' +
			'output as if you generated it locally.',
		inputSchema: mediaGenerateInputSchema,
		source: 'local',
		// Every call is billable & writes a Vault file — treat as a mutation
		// so PermissionGuard's ask path (B1) fires.
		kind: 'edit',
		async execute(args, ctx) {
			const input = args as MediaGenerateToolInput;
			const config = await loadMediaGenerationConfig();
			const strings = config.strings;
			const operation = input.operation ?? 'generate';
			// Zero-gap §4 A1 — resolve references via the app-supplied
			// allow-list. Any id the model made up (or that the user did
			// not actually attach this turn) fails loudly here, before a
			// paid endpoint sees the request.
			let referenceImages: MediaReferenceInput[] | undefined;
			let maskImage: MediaReferenceInput | undefined;
			let referenceError: { id: string; reason: string } | null = null;
			if (operation === 'edit') {
				const ids = input.referenceIds ?? [];
				if (ids.length > 0) {
					if (!deps.resolveAllowedReference) {
						referenceError = { id: ids[0], reason: 'no reference resolver wired' };
					} else {
						referenceImages = [];
						for (const id of ids) {
							const resolved = deps.resolveAllowedReference(id);
							if (!resolved) {
								referenceError = { id, reason: 'not attached this turn' };
								break;
							}
							referenceImages.push(resolved);
						}
					}
				}
				if (!referenceError && input.maskId) {
					const resolvedMask = deps.resolveAllowedReference?.(input.maskId) ?? null;
					if (!resolvedMask) {
						referenceError = { id: input.maskId, reason: 'not attached this turn' };
					} else {
						maskImage = resolvedMask;
					}
				}
			}
			const presetId = input.presetId ?? (operation === 'edit' ? 'edit-default' : 'default');
			const request: MediaGenerationRequest = {
				kind: input.kind,
				prompt: input.prompt,
				operation,
				route: input.route ?? 'auto',
				presetId,
				quantity: input.quantity,
				aspectRatio: input.aspectRatio,
				durationSeconds: input.durationSeconds,
				negativePrompt: input.negativePrompt,
				styleHint: input.styleHint,
				sourceHint: input.kind,
				referenceImages,
				maskImage,
			};

			// Reference resolution failure: honest failed receipt, no cost.
			if (referenceError) {
				const message = fmt(strings.referenceResolveFailedDetail, {
					ref: referenceError.id,
					reason: referenceError.reason,
				});
				const receipt = buildFailedReceipt({
					kind: input.kind,
					prompt: input.prompt,
					deps,
					ctx,
					state: 'needs-configuration',
					errorCode: 'reference-resolution-failed',
					errorMessage: message,
				});
				await deps.saveReceipt(receipt);
				return ok(
					fmt(strings.toolExecuteFailedPayload, {
						kind: input.kind,
						reason: message,
						code: 'reference-resolution-failed',
					}),
				);
			}

			// video / music: durable async job (D2 §R1/§R2). Returns
			// immediately — the chat turn does NOT block on the fal poll.
			if (input.kind === 'video' || input.kind === 'music') {
				try {
					const outcome = await deps.service.startAsyncJob({
						request,
						runId: ctx.loopId,
						conversationId: deps.conversationId,
						messageId: deps.messageId,
						projectId: deps.projectId,
					});
					const payloadTemplate = outcome.requiresConfirmation
						? strings.toolAsyncJobAwaitingConfirmationPayload
						: strings.toolAsyncJobQueuedPayload;
					return ok(
						fmt(payloadTemplate, {
							kind: input.kind,
							jobId: outcome.jobId,
							route: outcome.preflight.executionRoute ?? 'unknown',
							model: outcome.preflight.modelId ?? 'unknown',
							estimate: describeEstimate(outcome.preflight),
							durationSeconds: String(input.durationSeconds ?? '—'),
							quantity: String(input.quantity ?? 1),
						}),
					);
				} catch (err) {
					const preflight = err instanceof MediaPreflightError ? err.preflight : undefined;
					const primary = pickPrimaryProblem(preflight?.problems ?? []);
					const errorMessage =
						primary?.message
						?? (err instanceof Error ? err.message : strings.toolExecuteFailedGeneric);
					const errorCode = primary?.code ?? 'media-async-job-failed';
					// R4 status semantic: preflight refusals map to
					// `needs-configuration` (not `needs-permission` — that
					// meant "user authorisation" not "provider unconfigured").
					const receipt = buildFailedReceipt({
						kind: input.kind,
						prompt: input.prompt,
						deps,
						ctx,
						state: preflight ? 'needs-configuration' : 'failed',
						errorCode,
						errorMessage,
						preflight,
					});
					await deps.saveReceipt(receipt);
					return ok(
						fmt(strings.toolExecuteFailedPayload, {
							kind: input.kind,
							reason: errorMessage,
							code: errorCode,
						}),
					);
				}
			}

			// image happy path — full pipeline via MediaGenerationService.
			try {
				const outcome = await deps.service.produce(
					{
						request,
						runId: ctx.loopId,
						conversationId: deps.conversationId,
						messageId: deps.messageId,
						projectId: deps.projectId,
					},
					// image never gates on cost-confirm today (per C1 R3 doc);
					// permission ask already covered the "does the user allow
					// this?" concern via B1.
					{ bypassConfirmation: true },
				);
				// Batch fan-out: adapters currently return one bytes payload
				// per call, but the service builds one receipt per call. If a
				// future adapter returns multiple images per generate() the
				// service will emit N receipts — the payload below reads them
				// as a list so the model relays the count faithfully.
				const paths = outcome.writtenPaths;
				const receiptIds = outcome.receipts.map((r) => r.artifactId);
				if (operation === 'edit') {
					const maskNote = maskImage ? strings.toolEditMaskNoteSuffix : '';
					return ok(
						fmt(strings.toolEditSuccessPayload, {
							route: outcome.preflight.executionRoute ?? 'unknown',
							model: outcome.preflight.modelId ?? 'unknown',
							referenceCount: String(referenceImages?.length ?? 0),
							maskNote,
							paths: paths.map((p) => `- ${p}`).join('\n'),
							receiptIds: receiptIds.join(', '),
						}),
					);
				}
				return ok(
					fmt(strings.toolImageSuccessPayload, {
						quantity: String(paths.length),
						paths: paths.map((p) => `- ${p}`).join('\n'),
						receiptIds: receiptIds.join(', '),
						route: outcome.preflight.executionRoute ?? 'unknown',
						model: outcome.preflight.modelId ?? 'unknown',
					}),
				);
			} catch (err) {
				const preflight = err instanceof MediaPreflightError ? err.preflight : undefined;
				// Pick per-route configureAction (C2 M-1: MUST use per-route
				// problem, not the aggregate — the aggregate carries a
				// generic `media` action that would route the user to the
				// wrong settings surface).
				const problems = preflight?.problems ?? [];
				const primary = pickPrimaryProblem(problems);
				const errorMessage =
					primary?.message ??
					(err instanceof Error ? err.message : strings.toolExecuteFailedGeneric);
				const errorCode = primary?.code ?? 'media-generate-failed';
				// R4: preflight refusals are "provider unconfigured", not
				// "user must authorise". Route them to `needs-configuration`
				// so the badge + copy match the reality; `needs-permission`
				// stays reserved for PermissionGuard-driven denials.
				const receipt = buildFailedReceipt({
					kind: input.kind,
					prompt: input.prompt,
					deps,
					ctx,
					state: preflight ? 'needs-configuration' : 'failed',
					errorCode,
					errorMessage,
					preflight,
				});
				await deps.saveReceipt(receipt);
				return ok(
					fmt(strings.toolExecuteFailedPayload, {
						kind: input.kind,
						reason: errorMessage,
						code: errorCode,
					}),
				);
			}
		},
	};
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(template: string, slots: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => slots[key] ?? '');
}

function describeEstimate(preflight: MediaPreflight): string {
	const e = preflight.estimate;
	if (!e) return '—';
	const amount = typeof e.amountUsd === 'number' ? `$${e.amountUsd.toFixed(4)}` : '—';
	return `${amount} / ${e.billingUnit} (${e.confidence})`;
}

/**
 * Prefer the first per-route problem (fal-* or native-*) over the
 * aggregate `no-available-route` so downstream UI shows the concrete
 * fix action (C2 handoff M-1).
 */
function pickPrimaryProblem(problems: MediaPreflight['problems']) {
	const perRoute = problems.find(
		(p) => p.code.startsWith('fal-') || p.code.startsWith('native-') || p.code === 'preset-missing',
	);
	if (perRoute) return perRoute;
	return problems[0];
}

interface BuildFailedReceiptArgs {
	kind: MediaKind;
	prompt: string;
	deps: MediaGenerateToolDeps;
	ctx: { loopId: string; stepIndex: number; signal: AbortSignal };
	state: 'failed' | 'needs-permission' | 'needs-configuration';
	errorCode: string;
	errorMessage: string;
	preflight?: MediaPreflight;
}

function buildFailedReceipt(args: BuildFailedReceiptArgs): ChatArtifactReceipt {
	const nowFn = args.deps.now ?? Date.now;
	const kindLabel = args.kind === 'image' ? 'image' : args.kind === 'video' ? 'video' : 'audio';
	// Task E1 §R2 — surface a `configure` button when the preflight refusal
	// carries a per-route `configureAction`. The ArtifactReceiptCard renders
	// only actions listed in `availableActions` AND for which a handler
	// exists (B1 policy); MessageViewItem wires the handler via the
	// receipt's media.configureAction → resolveConfigureTab lookup.
	const primary = pickPrimaryProblem(args.preflight?.problems ?? []);
	const configureAction = primary?.configureAction as
		| 'media' | 'profiles' | 'mcp' | 'permissions' | undefined;
	const availableActions: ChatArtifactAction[] = configureAction
		? ['configure', 'retry']
		: ['retry'];
	const receipt: ChatArtifactReceipt & { media?: { configureAction: string } } = {
		artifactId: `art-${generateUuidWithoutHyphens()}`,
		runId: args.ctx.loopId,
		messageId: args.deps.messageId ?? '',
		conversationId: args.deps.conversationId ?? '',
		projectId: args.deps.projectId,
		direction: 'generated',
		kind: kindLabel,
		title: `${args.kind} — ${truncatePrompt(args.prompt)}`,
		preview: { kind: 'none' },
		state: args.state,
		availableActions,
		createdAt: nowFn(),
		error: {
			code: args.errorCode,
			message: args.errorMessage,
			recoverable: true,
		},
	};
	if (configureAction) receipt.media = { configureAction };
	return receipt;
}

function truncatePrompt(prompt: string): string {
	const trimmed = prompt.trim().replace(/\s+/g, ' ');
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
