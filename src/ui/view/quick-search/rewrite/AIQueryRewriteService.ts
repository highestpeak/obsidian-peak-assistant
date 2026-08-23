import type { App } from 'obsidian';
import { vercelGenerateText } from '@/core/providers/vercel';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import { PromptId } from '@/core/types/prompt';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';
import {
	QueryRewriteResponseSchema,
	type BehaviorContextPayload,
	type BehaviorEvent,
	type FirstScreenResultRef,
	type QueryRewriteResponse,
	type RewriteCandidate,
} from '@/core/schemas/queryRewrite';
import { behaviorRecorder } from './BehaviorContextRecorder';
import type { HarnessSettings } from '@/core/config/settingsTypes';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import type { LLMUsage } from '@/core/providers/types';
import type { DebugTracePort } from '@/core/debug-trace';

/**
 * AIQueryRewriteService — orchestrates one round of Suggest.
 *
 * Flow:
 *   1. Snapshot behavior from `BehaviorContextRecorder` + Zustand stores.
 *   2. Resolve the Fast Lookup model binding (Curator's `quick` capability).
 *   3. Render prompts via TemplateManager and call the LLM via
 *      `vercelGenerateText`.
 *   4. Parse + validate the response against `QueryRewriteResponseSchema`.
 *   5. Return the candidate list (or a typed error for the modal to render).
 *
 * See design at `docs/research/2026-07-08-ai-query-rewrite/README.md`.
 */

const MAX_ATTEMPTS = 2;

export type QueryRewriteError =
	| { kind: 'no-fast-tier'; message: string }
	| { kind: 'llm-error'; message: string; attempts: number }
	| { kind: 'schema-error'; message: string; raw: string; attempts: number }
	| { kind: 'aborted' };

/** Progressive lifecycle events emitted while `suggestQueries` runs. Consumed
 *  by the panel to show a live trace so the user isn't staring at an opaque
 *  spinner when the LLM hangs. */
export type QueryRewriteStage =
	| { kind: 'resolving-binding' }
	| { kind: 'resolved-binding'; provider: string; modelId: string }
	| { kind: 'building-context'; eventCount: number }
	| { kind: 'rendering-prompts' }
	| { kind: 'calling-llm'; attempt: number; maxAttempts: number }
	| { kind: 'parsing-response'; attempt: number }
	| { kind: 'validating-schema'; attempt: number }
	| { kind: 'retrying'; attempt: number; reason: string }
	| { kind: 'falling-back'; reason: string };

export interface StageEntry {
	kind: QueryRewriteStage['kind'];
	label: string;
	tMs: number; // relative to suggest start
	durationMs?: number; // filled in when the next stage starts
	meta?: Record<string, string | number>;
}

export interface QueryRewriteSuccess {
	candidates: RewriteCandidate[];
	provider: string;
	modelId: string;
	payloadSnapshot: BehaviorContextPayload;
	/** Marks a fallback path — rule-based candidates when the LLM couldn't help. */
	fromFallback?: boolean;
	/**
	 * When `fromFallback` is true, this holds the last LLM error text so the
	 * panel can surface it to the user (with a copy button) instead of
	 * hiding it in the DevTools console. Empty string means we couldn't
	 * attribute the failure (e.g. no LLM binding at all).
	 */
	fallbackReason?: string;
	/** Raw text returned by the last LLM attempt, if any — useful for
	 *  schema-error debugging. Empty when the call never reached the LLM. */
	fallbackRaw?: string;
	/** Every stage that fired during this round, with timings. */
	trace: StageEntry[];
}

export type QueryRewriteResult =
	| { ok: true; value: QueryRewriteSuccess }
	| { ok: false; error: QueryRewriteError };

/** Compose one Suggest round. Never throws. */
export async function suggestQueries(opts: {
	app: App;
	harness: HarnessSettings | undefined;
	signal?: AbortSignal;
	/** Fires as each stage begins — used by the panel to show a live trace. */
	onStage?: (stage: QueryRewriteStage) => void;
	debugTrace?: DebugTracePort | null;
}): Promise<QueryRewriteResult> {
	const trace: StageEntry[] = [];
	const suggestStartMs = Date.now();
	const emit = (stage: QueryRewriteStage): void => {
		const now = Date.now();
		const prev = trace[trace.length - 1];
		if (prev) prev.durationMs = now - suggestStartMs - prev.tMs;
		trace.push({
			kind: stage.kind,
			label: stageLabel(stage),
			tMs: now - suggestStartMs,
			meta: stageMeta(stage),
		});
		try { opts.onStage?.(stage); } catch { /* ignore */ }
	};
	const closeTrace = (): void => {
		const last = trace[trace.length - 1];
		if (last && last.durationMs === undefined) {
			last.durationMs = Date.now() - suggestStartMs - last.tMs;
		}
	};

	// 1. Resolve Fast Lookup binding.
	emit({ kind: 'resolving-binding' });
	const binding = resolveFastLookupBinding(opts.harness);
	if (!binding) {
		closeTrace();
		return {
			ok: false,
			error: {
				kind: 'no-fast-tier',
				message: 'Fast Lookup 未绑定模型 · 请在 Settings → AI Setup → AI behavior → Fast Lookup 里选一个模型。',
			},
		};
	}
	const providerIdEarly = (binding.profile as { kind?: string }).kind ?? 'unknown';
	emit({ kind: 'resolved-binding', provider: providerIdEarly, modelId: binding.modelId });

	// 2. Build payload.
	const payload = buildBehaviorContext(opts.app);
	emit({ kind: 'building-context', eventCount: payload.sessionEvents.length });

	// 3. Render prompts.
	emit({ kind: 'rendering-prompts' });
	const tm = TemplateManager.getInstance();
	const systemPrompt = await tm.render(PromptId.QueryRewriteSystem, {});
	const userPrompt = await tm.render(PromptId.QueryRewrite, {
		currentQuery: payload.currentQuery || '(empty)',
		activeFilePath: payload.activeFilePath ?? '(none)',
		currentResultView: payload.currentResultView,
		recentQueriesLine: payload.recentQueries.length ? payload.recentQueries.join(', ') : '(none)',
		recentOpenedFilesLine: payload.recentOpenedFiles.length ? payload.recentOpenedFiles.join(', ') : '(none)',
		pinnedLine: payload.pinnedResultDocIds?.length
			? `${payload.pinnedResultDocIds.length} pinned doc(s)`
			: '(none)',
		knownTopFoldersLine: payload.knownTopFolders.length ? payload.knownTopFolders.join(', ') : '(none)',
		eventCount: payload.sessionEvents.length,
		sessionTimeline: formatTimeline(payload.sessionEvents),
		firstScreenLine: formatFirstScreen(payload.firstScreenResults),
		typedTrail: formatTypedTrail(payload.sessionEvents),
	});

	// 4. Call LLM with retry-with-feedback (up to MAX_ATTEMPTS).
	const providerId = providerIdEarly;
	const startMs = Date.now();
	let lastRaw = '';
	let lastError = '';
	let lastUsage: LLMUsage | undefined;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		if (opts.signal?.aborted) { closeTrace(); return { ok: false, error: { kind: 'aborted' } }; }

		emit({ kind: 'calling-llm', attempt, maxAttempts: MAX_ATTEMPTS });
		try {
			const { text, usage } = await vercelGenerateText(
				binding.profile,
				binding.modelId,
				[
					{ role: 'system', content: [{ type: 'text', text: systemPrompt }] },
					{ role: 'user', content: [{ type: 'text', text: userPrompt }] },
				],
				undefined,
				opts.signal,
				{
					debugTrace: opts.debugTrace ?? null,
					surface: 'search',
					capabilityId: 'search.query-rewrite',
					operation: 'object.generate',
				},
			);
			// If the caller aborted while the provider was mid-stream, the
			// SDK propagates it as an exception — but guard defensively.
			if (opts.signal?.aborted) { closeTrace(); return { ok: false, error: { kind: 'aborted' } }; }
			lastRaw = text ?? '';
			if (usage) lastUsage = usage;
			if (!lastRaw.trim()) {
				lastError = 'LLM returned empty response';
				emit({ kind: 'retrying', attempt, reason: 'empty response' });
				continue;
			}
			emit({ kind: 'parsing-response', attempt });
			const parsed = parseLLMJson(lastRaw);
			emit({ kind: 'validating-schema', attempt });
			const check = QueryRewriteResponseSchema.safeParse(parsed);
			if (!check.success) {
				lastError = check.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join(' · ');
				emit({ kind: 'retrying', attempt, reason: 'schema-mismatch' });
				continue;
			}
			const value: QueryRewriteResponse = check.data;
			// Filterable dev breadcrumb — filter DevTools console by "[Suggest]"
			// to see round-trip payload + response + timing while iterating.
			console.debug('[Suggest] round complete', {
				attempt,
				provider: providerId,
				model: binding.modelId,
				durationMs: Date.now() - startMs,
				candidates: value.candidates,
				payload,
			});
			emitUsage(opts.app, {
				action: 'suggest',
				provider: providerId,
				modelId: binding.modelId,
				usage: lastUsage,
				durationMs: Date.now() - startMs,
			});
			closeTrace();
			return {
				ok: true,
				value: {
					candidates: value.candidates,
					provider: providerId,
					modelId: binding.modelId,
					payloadSnapshot: payload,
					trace,
				},
			};
		} catch (e) {
			// AbortError propagates as either DOMException or a generic Error
			// depending on runtime — recognise both so we don't burn a retry.
			if (opts.signal?.aborted || isAbortError(e)) {
				closeTrace();
				return { ok: false, error: { kind: 'aborted' } };
			}
			// AI SDK's `AI_APICallError` carries useful metadata (statusCode,
			// responseBody, url) beyond `message`. Serialise what we have so
			// the panel can show the user a copyable trace instead of a bare
			// "Not Found".
			lastError = formatError(e);
			emit({ kind: 'retrying', attempt, reason: firstLineOf(lastError) });
			console.debug('[Suggest] LLM call failed', e);
		}
	}

	// 5. LLM path failed — record the (possibly partial) usage then produce
	// rule-based fallback candidates from the same behavior context. Modal
	// still gets something clickable rather than a red error.
	emitUsage(opts.app, {
		action: 'suggest-failed',
		provider: providerId,
		modelId: binding.modelId,
		usage: lastUsage,
		durationMs: Date.now() - startMs,
	});
	emit({ kind: 'falling-back', reason: firstLineOf(lastError) || 'unknown' });
	const fallback = buildRuleBasedCandidates(opts.app, payload);
	closeTrace();
	if (fallback.length > 0) {
		return {
			ok: true,
			value: {
				candidates: fallback,
				provider: providerId,
				modelId: binding.modelId,
				payloadSnapshot: payload,
				fromFallback: true,
				fallbackReason: lastError,
				fallbackRaw: lastRaw,
				trace,
			},
		};
	}
	if (lastRaw) {
		return {
			ok: false,
			error: { kind: 'schema-error', message: lastError, raw: lastRaw, attempts: MAX_ATTEMPTS },
		};
	}
	return {
		ok: false,
		error: { kind: 'llm-error', message: lastError || 'unknown error', attempts: MAX_ATTEMPTS },
	};
}

function stageLabel(stage: QueryRewriteStage): string {
	switch (stage.kind) {
		case 'resolving-binding':   return 'Resolving Fast Lookup binding';
		case 'resolved-binding':    return `Model: ${stage.provider} · ${stage.modelId}`;
		case 'building-context':    return `Snapshotting behavior (${stage.eventCount} events)`;
		case 'rendering-prompts':   return 'Rendering prompts';
		case 'calling-llm':         return `Calling LLM (attempt ${stage.attempt}/${stage.maxAttempts})`;
		case 'parsing-response':    return 'Parsing JSON response';
		case 'validating-schema':   return 'Validating against schema';
		case 'retrying':            return `Retry — ${stage.reason}`;
		case 'falling-back':        return `Falling back to rule-based candidates — ${stage.reason}`;
	}
}

function stageMeta(stage: QueryRewriteStage): Record<string, string | number> | undefined {
	if (stage.kind === 'resolved-binding') return { provider: stage.provider, modelId: stage.modelId };
	if (stage.kind === 'building-context') return { eventCount: stage.eventCount };
	if (stage.kind === 'calling-llm') return { attempt: stage.attempt, maxAttempts: stage.maxAttempts };
	if (stage.kind === 'retrying' || stage.kind === 'falling-back') return { reason: stage.reason };
	return undefined;
}

function firstLineOf(s: string): string {
	const nl = s.indexOf('\n');
	const line = nl >= 0 ? s.slice(0, nl) : s;
	return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

/**
 * Emit an outcome signal when the user picks a candidate. Consumers (usage
 * dashboard, prompt-quality analytics) subscribe to `USAGE_RECORDED` and can
 * key on `action: 'suggest-selected'`. Fire-and-forget.
 */
export function recordCandidateSelection(opts: {
	app: App;
	candidate: RewriteCandidate;
	index: number;
	totalCandidates: number;
	fromFallback: boolean;
}): void {
	try {
		EventBus.getInstance(opts.app).dispatch(new UsageRecordedViewEvent({
			sessionId: 'query-rewrite',
			feature: 'query_rewrite',
			action: 'suggest-selected',
			provider: 'n/a',
			model: 'n/a',
			inputTokens: 0,
			outputTokens: 0,
			cachedTokens: 0,
			reasoningTokens: 0,
			costUsd: 0,
			durationMs: 0,
			isStreaming: false,
			metadata: {
				index: opts.index,
				total: opts.totalCandidates,
				query: opts.candidate.query,
				title: opts.candidate.title,
				fromFallback: opts.fromFallback,
			},
		}));
	} catch (e) {
		console.warn('[AIQueryRewriteService] recordCandidateSelection failed:', e);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveFastLookupBinding(
	harness: HarnessSettings | undefined,
): { profile: Parameters<typeof vercelGenerateText>[0]; modelId: string } | null {
	// Prefer the explicit Fast Lookup binding. Fall back to the agent-fast
	// StatusBar role (older settings surface) so Suggest still works before
	// the user completes the AI Setup Curator wizard. If we end up on Chat
	// tier we warn — that model may be significantly more expensive than
	// the user expects for a fast-tier feature.
	const reg = ProfileRegistry.getInstance();
	const cfg = harness?.localFastConfig ?? null;
	if (cfg) {
		const profile = reg.getProfileById(cfg.profileId);
		if (profile) return { profile, modelId: cfg.modelId };
	}
	const agentFast = reg.getActiveAgentFastConfig();
	if (agentFast) return { profile: agentFast.profile, modelId: agentFast.modelId };
	const chat = reg.getActiveChatConfig();
	if (chat) {
		console.warn('[AIQueryRewriteService] No Fast Lookup binding — falling back to Conversation tier (`' + chat.modelId + '`). This may be more expensive than expected. Configure Fast Lookup in Settings → AI Setup for a fast-tier model.');
		return { profile: chat.profile, modelId: chat.modelId };
	}
	return null;
}

function buildBehaviorContext(app: App): BehaviorContextPayload {
	const shared = useSharedStore.getState();
	const vault = useVaultSearchStore.getState();
	const activeFile = app.workspace.getActiveFile();
	// Push the terminal click IFF the recorder hasn't already logged it in
	// this round — Try Again re-invokes `buildBehaviorContext`, which used to
	// re-push `clickedAI` on every retry and pollute the tail of the timeline.
	const currentEvents = behaviorRecorder.snapshotEvents();
	const lastEvent = currentEvents[currentEvents.length - 1];
	if (lastEvent?.kind !== 'clickedAI') {
		behaviorRecorder.push('clickedAI');
	}
	const finalEvents = behaviorRecorder.snapshotEvents();

	return {
		currentQuery: shared.vaultSearchQuery ?? '',
		activeFilePath: activeFile ? activeFile.path : null,
		currentResultView: vault.resultView,
		recentQueries: (shared.recentQueries ?? []).slice(0, 5),
		recentOpenedFiles: getRecentOpenedFiles(app),
		pinnedResultDocIds: vault.pinnedResultDocIds ? [...vault.pinnedResultDocIds] : null,
		sessionEvents: finalEvents,
		knownTopFolders: getKnownTopFolders(app),
		firstScreenResults: getFirstScreenResults(vault.lastSearchResults),
	};
}

/**
 * Compact projection of the top-N search results the user has on-screen.
 * We take the first `FIRST_SCREEN_CAP` (10) items in the order the store
 * renders them — that matches "what the user actually sees above the fold"
 * in list view. No highlight snippet — just path + display title + score.
 */
const FIRST_SCREEN_CAP = 10;
function getFirstScreenResults(results: readonly {
	path?: string; title?: string; score?: number; finalScore?: number;
}[] | undefined): FirstScreenResultRef[] {
	if (!results || results.length === 0) return [];
	const out: FirstScreenResultRef[] = [];
	for (const r of results.slice(0, FIRST_SCREEN_CAP)) {
		if (!r.path) continue;
		const score = r.finalScore ?? r.score;
		const title = deriveDisplayTitle(r.path, r.title);
		out.push({
			path: r.path,
			title,
			score: typeof score === 'number' && score > 0 ? Math.round(score * 100) / 100 : undefined,
		});
	}
	return out;
}

/**
 * Same display-name logic as `VaultSearchResult` uses in the row: filename
 * basename minus extension. FTS titles are normalised (spaces inserted
 * between CJK chars) which reads oddly to the LLM; the raw filename is
 * what the user recognises.
 */
function deriveDisplayTitle(path: string, fallback?: string): string {
	const base = path.split('/').pop();
	if (!base) return fallback ?? path;
	const dot = base.lastIndexOf('.');
	return dot > 0 ? base.slice(0, dot) : base;
}

function getRecentOpenedFiles(app: App): string[] {
	// Obsidian's workspace exposes `getLastOpenFiles()` in the private API.
	const anyWorkspace = app.workspace as unknown as { getLastOpenFiles?: () => string[] };
	if (typeof anyWorkspace.getLastOpenFiles === 'function') {
		try { return anyWorkspace.getLastOpenFiles().slice(0, 5); } catch { /* ignore */ }
	}
	return [];
}

function getKnownTopFolders(app: App): string[] {
	// Enumerate top-level folders in the vault so the LLM can pick real ones.
	// Capped to keep the payload compact.
	const root = app.vault.getRoot();
	const children = (root as unknown as { children?: Array<{ name: string; children?: unknown }> }).children ?? [];
	const folders = children.filter((c) => Array.isArray(c.children)).map((c) => c.name);
	return folders.slice(0, 20);
}

/**
 * Extract the typed queries the user cycled through this session, in order,
 * with the last cleared-vs-committed state annotated. The single most
 * important intent signal in the whole payload — surfaced at the top of the
 * user prompt separate from the full timeline so the LLM doesn't have to
 * hunt.
 */
function formatTypedTrail(events: BehaviorEvent[]): string {
	const trail: Array<{ value: string; cleared: boolean; t: number }> = [];
	let last: { value: string; t: number } | null = null;
	for (const e of events) {
		if (e.kind === 'typed' && e.value !== undefined) {
			last = { value: e.value, t: e.t };
			trail.push({ value: e.value, cleared: false, t: e.t });
		} else if (e.kind === 'clearedInput' && last) {
			const prev = trail[trail.length - 1];
			if (prev) prev.cleared = true;
			last = null;
		}
	}
	if (trail.length === 0) return '(no typed queries this session)';
	return trail.map((t, i) => {
		const marker = i === trail.length - 1
			? (t.cleared ? '  ← LAST, then CLEARED (strongest intent signal)' : '  ← LAST (strongest intent signal)')
			: (t.cleared ? ' (cleared)' : '');
		return `  ${String(i + 1).padStart(2)}. +${t.t.toFixed(1)}s  "${t.value}"${marker}`;
	}).join('\n');
}

function formatFirstScreen(results: FirstScreenResultRef[]): string {
	if (!results || results.length === 0) return '(no results on screen — user has not searched yet or search returned nothing)';
	return results.map((r, i) => {
		const score = r.score != null ? ` · score ${r.score}` : '';
		return `  ${String(i + 1).padStart(2)}. ${r.title}${score}\n      ${r.path}`;
	}).join('\n');
}

function formatTimeline(events: BehaviorEvent[]): string {
	if (events.length === 0) return '(no events)';
	return events.map((e) => {
		const t = `+${e.t.toFixed(1)}s`;
		const kind = e.kind;
		const extra = [
			e.value !== undefined ? `value=${JSON.stringify(e.value)}` : '',
			e.path !== undefined ? `path=${e.path}` : '',
			e.durationMs !== undefined ? `${e.durationMs}ms` : '',
		].filter(Boolean).join(' · ');
		return `${t.padStart(7)}  ${kind.padEnd(22)} ${extra}`.trimEnd();
	}).join('\n');
}

/**
 * Serialise an LLM/HTTP error into a human-readable multi-line string. The
 * AI SDK's `AI_APICallError` and Vercel provider errors carry rich metadata
 * (statusCode, url, responseHeaders, responseBody) that would otherwise be
 * lost if we only kept `e.message`. Panel surfaces this as a copyable block
 * so the user can debug 401/404/rate-limit / model-name issues without
 * needing DevTools.
 */
function formatError(e: unknown): string {
	if (!e) return 'Unknown error';
	if (typeof e === 'string') return e;
	const anyE = e as Record<string, unknown>;
	const parts: string[] = [];
	const name = String(anyE.name ?? 'Error');
	const message = String(anyE.message ?? '');
	parts.push(`${name}: ${message || '(no message)'}`);
	if (anyE.statusCode != null) parts.push(`statusCode: ${anyE.statusCode}`);
	if (anyE.url) parts.push(`url: ${anyE.url}`);
	if (anyE.requestBodyValues) {
		const rbv = typeof anyE.requestBodyValues === 'string'
			? anyE.requestBodyValues
			: JSON.stringify(anyE.requestBodyValues);
		const trunc = rbv.length > 800 ? `${rbv.slice(0, 800)}…(truncated)` : rbv;
		parts.push(`requestBody: ${trunc}`);
	}
	if (anyE.responseHeaders) {
		parts.push(`responseHeaders: ${JSON.stringify(anyE.responseHeaders)}`);
	}
	if (anyE.responseBody) {
		const body = typeof anyE.responseBody === 'string'
			? anyE.responseBody
			: JSON.stringify(anyE.responseBody);
		const truncated = body.length > 800 ? `${body.slice(0, 800)}…(truncated)` : body;
		parts.push(`responseBody: ${truncated}`);
	}
	if (anyE.data) {
		const data = typeof anyE.data === 'string' ? anyE.data : JSON.stringify(anyE.data);
		parts.push(`data: ${data.length > 400 ? `${data.slice(0, 400)}…` : data}`);
	}
	if (anyE.stack) {
		parts.push(`stack:\n${String(anyE.stack)}`);
	}
	if (anyE.cause && anyE.cause !== e) {
		parts.push(`---\ncaused by:\n${formatError(anyE.cause)}`);
	}
	return parts.join('\n');
}

function isAbortError(e: unknown): boolean {
	if (!e) return false;
	if (typeof e === 'object' && e !== null) {
		const anyE = e as { name?: string; code?: string };
		return anyE.name === 'AbortError' || anyE.code === 'ABORT_ERR';
	}
	return false;
}

/** @internal — exposed for unit tests. */
export function parseLLMJson(raw: string): unknown {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	return JSON.parse(candidate);
}

/**
 * Fire a usage-recorded event so the Usage Dashboard can attribute the tokens
 * spent on Suggest to a distinct `query_rewrite` category. Cost lookup goes
 * through the standard model info path in the dashboard side — we don't
 * duplicate the price table here.
 */
function emitUsage(
	app: App,
	opts: {
		action: 'suggest' | 'suggest-failed';
		provider: string;
		modelId: string;
		usage?: LLMUsage;
		durationMs: number;
	},
): void {
	try {
		const usage = opts.usage ?? { inputTokens: 0, outputTokens: 0 } as LLMUsage;
		const u = usage as Record<string, unknown>;
		EventBus.getInstance(app).dispatch(new UsageRecordedViewEvent({
			sessionId: 'query-rewrite',
			feature: 'query_rewrite',
			action: opts.action,
			provider: opts.provider,
			model: opts.modelId,
			inputTokens: Number(u.inputTokens ?? u.promptTokens ?? 0) || 0,
			outputTokens: Number(u.outputTokens ?? u.completionTokens ?? 0) || 0,
			cachedTokens: Number(u.cachedInputTokens ?? 0) || 0,
			reasoningTokens: Number(u.reasoningTokens ?? 0) || 0,
			costUsd: 0, // Dashboard resolves cost from model catalog when displaying.
			durationMs: opts.durationMs,
			isStreaming: false,
		}));
	} catch (e) {
		console.warn('[AIQueryRewriteService] emitUsage failed:', e);
	}
}

/**
 * Rule-based fallback candidates. When the LLM fails, we still owe the user
 * something clickable — heuristics: (a) narrow to active file's folder,
 * (b) narrow to a folder we saw the user browsing, (c) surface a recent
 * query variation. Empty-list means we couldn't derive anything meaningful
 * (typically: no query + no active file + no browsing).
 */
/** @internal — exposed for unit tests. `app` unused in the current
 *  implementation but reserved for future signals (e.g. per-vault stats). */
export function buildRuleBasedCandidates(app: App | null, payload: BehaviorContextPayload): RewriteCandidate[] {
	const out: RewriteCandidate[] = [];
	const q = payload.currentQuery.trim();
	const activeFolder = payload.activeFilePath ? dirname(payload.activeFilePath) : null;
	const browsedFolders = collectBrowsedFolders(payload);
	const seen = new Set<string>();

	function add(c: RewriteCandidate) {
		const key = c.query;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(c);
	}

	if (q && activeFolder) {
		add({
			title: 'Narrow to current file’s folder',
			query: `${q} folder:${activeFolder}`,
			reason: `Fallback: your active file is under \`${activeFolder}\`, so limit results there.`,
		});
	}
	for (const folder of browsedFolders.slice(0, 2)) {
		if (q) {
			add({
				title: `Narrow to ${folder}`,
				query: `${q} folder:${folder}`,
				reason: `Fallback: you were browsing \`${folder}\` just now.`,
			});
		} else {
			add({
				title: `Everything in ${folder}`,
				query: `folder:${folder}`,
				reason: `Fallback: you were browsing \`${folder}\` — this lists everything there.`,
			});
		}
	}
	if (q && payload.recentQueries.length > 0) {
		const prior = payload.recentQueries.find((r) => r !== q);
		if (prior) {
			add({
				title: 'Combine with a recent search',
				query: `${q} ${prior}`,
				reason: `Fallback: your recent query was \`${prior}\` — this AND-combines with the current one.`,
			});
		}
	}
	// Do not silently fabricate — if we have nothing to lean on, return [].
	void app;
	return out.slice(0, 3);
}

function collectBrowsedFolders(payload: BehaviorContextPayload): string[] {
	const folders = new Set<string>();
	for (const evt of payload.sessionEvents) {
		if (evt.path && (evt.kind === 'focusedFile' || evt.kind === 'expandedFolder' || evt.kind === 'openedFile')) {
			const dir = evt.kind === 'expandedFolder' ? evt.path : dirname(evt.path);
			if (dir) folders.add(dir);
		}
	}
	return [...folders];
}

function dirname(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx <= 0 ? '' : path.slice(0, idx);
}
