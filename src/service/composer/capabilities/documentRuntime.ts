/**
 * Peak Composer — per-document capability runtime (WP3).
 *
 * The run coordinator that ties everything together for ONE open document:
 *
 *   invocation (frozen snapshot)
 *     → registry / applicability
 *     → RunEnvelope via the shared `runCapability` runner
 *     → executor port (typed stream events)
 *     → result materializer (typed envelope)
 *     → writeback adapter (base-revision operations)
 *     → WP2 candidate store (streaming → ready variants)
 *     → accept via the transaction hub (atomic commit + History + Undo)
 *
 * It implements BOTH frozen/declared ports:
 *   - `ComposerCapabilityProjectionPort` (frozen capabilityContracts.ts) for
 *     the editing chrome (actionsFor / invoke);
 *   - `ComposerCandidateRuntimePort` for the candidate UI (streaming events,
 *     regenerate / cancel / accept / discard / variant switching).
 *
 * Ownership: instances are created by the app-owned composition factory per
 * (session, hub) pair. No module-level state, no singletons.
 */

import {
	type ComposerActionDescriptor,
	type ComposerActionSurface,
	type ComposerCandidate,
	type ComposerCandidateRuntimePort,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityId,
	type ComposerCapabilityProjectionPort,
	type ComposerCapabilityRunEvent,
	type ComposerContextSnapshot,
	type ComposerInvocationHandle,
	type ComposerRendererId,
	type ComposerResultEnvelope,
	type ComposerTarget,
	ComposerConflictError,
} from '@/core/composer';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import { runCapability } from '@/service/capabilities/CapabilityRunner';
import type { ComposerDocumentSession } from '../documentSession';
import type { ComposerTransactionHub } from '../transactionHub';
import { resolveComposerActions } from './applicability';
import { assembleComposerContextSnapshot } from './contextAssembler';
import type { ComposerCapabilitiesConfigProvider } from './capabilityConfig';
import { resolvePresentation } from './capabilityConfig';
import type { ComposerCapabilityExecutorPort } from './executorPort';
import type { ComposerCapabilityRegistry } from './registry';
import type { ComposerResultMaterializerRegistry } from './resultMaterializers';
import type { ComposerWritebackAdapterRegistry, WritebackTargetContext } from './writebackAdapters';

export interface ComposerCapabilityDocumentRuntimeDeps {
	registry: ComposerCapabilityRegistry;
	config: ComposerCapabilitiesConfigProvider;
	executor: ComposerCapabilityExecutorPort;
	materializers: ComposerResultMaterializerRegistry;
	writebacks: ComposerWritebackAdapterRegistry;
	session: ComposerDocumentSession;
	hub: ComposerTransactionHub;
}

interface CandidateMeta {
	capabilityId: ComposerCapabilityId;
	/** Frozen invocation-time snapshot (base revision of the candidate). */
	snapshot: ComposerContextSnapshot;
	/** Frozen base-revision anchor of the targeted block/unit. */
	anchor?: { from: number; to: number };
	lastRunId: string;
}

interface ActiveRun {
	runId: string;
	variantId: string;
	abort: AbortController;
}

// Pure monotonic counter for collision-free run ids (same precedent as
// core/composer/ids.ts `idSeq`) — it stores no services or app state, so it
// is NOT the kind of module singleton the runtime-ownership rule forbids.
let runSeq = 0;
function nextRunId(): string {
	runSeq += 1;
	return `cmp-run-${Date.now().toString(36)}-${runSeq.toString(36)}`;
}

/**
 * Minimal compiled-skill shim for the WP3 vertical slice: prompt content lives
 * in the PromptId template (rendered by the executor adapter), no tools are
 * exposed, and quarantine is permissive. Agent-mode packs (WP5+) replace this
 * with real `SkillRegistry.compile()` output.
 */
function syntheticSkill(def: ComposerCapabilityDefinition): CompiledSkill {
	return {
		skillId: def.manifest.skillRef,
		allowedTools: [],
		systemPrompt: '',
		quarantine: 'permissive',
	};
}

export class ComposerCapabilityDocumentRuntime
	implements ComposerCapabilityProjectionPort, ComposerCandidateRuntimePort
{
	private readonly candidateMeta = new Map<string, CandidateMeta>();
	private readonly activeRuns = new Map<string, ActiveRun>();
	private readonly runEventSubs = new Set<(event: ComposerCapabilityRunEvent) => void>();

	constructor(private readonly deps: ComposerCapabilityDocumentRuntimeDeps) {}

	// ── ComposerCapabilityProjectionPort ────────────────────────────────────────

	actionsFor(
		snapshot: ComposerContextSnapshot,
		surface: ComposerActionSurface,
	): readonly ComposerActionDescriptor[] {
		return resolveComposerActions(
			{
				registry: this.deps.registry,
				config: this.deps.config,
				currentRevision: () => this.deps.session.baseRevision,
				resolveBlockKind: (blockId) => this.deps.session.getBlock(blockId)?.kind,
			},
			snapshot,
			surface,
		);
	}

	invoke(
		capabilityId: ComposerCapabilityId,
		snapshot: ComposerContextSnapshot,
		options?: { instruction?: string },
	): ComposerInvocationHandle {
		const def = this.deps.registry.require(capabilityId);
		def.inputSchema.parse({ instruction: options?.instruction });
		if (snapshot.revision !== this.deps.session.baseRevision) {
			throw new ComposerConflictError(
				'revision-mismatch',
				`invoke '${capabilityId}': snapshot revision drifted from the live document`,
			);
		}
		const anchor = this.resolveAnchor(snapshot.target);
		const candidate = this.deps.hub.createCandidate({
			target: snapshot.target,
			streaming: true,
			...(options?.instruction !== undefined ? { instruction: options.instruction } : {}),
			proposedChange: { operations: [] },
		});
		const runId = nextRunId();
		this.candidateMeta.set(candidate.candidateId, {
			capabilityId,
			snapshot,
			...(anchor !== undefined ? { anchor } : {}),
			lastRunId: runId,
		});
		this.startGeneration(def, candidate.candidateId, candidate.activeVariantId, runId, options?.instruction);
		return { runId, cancel: () => this.cancel(candidate.candidateId) };
	}

	// ── ComposerCandidateRuntimePort ────────────────────────────────────────────

	subscribe(cb: (candidates: readonly ComposerCandidate[]) => void): () => void {
		return this.deps.hub.subscribe((projection) => cb(projection.candidates));
	}

	onRunEvent(cb: (event: ComposerCapabilityRunEvent) => void): () => void {
		this.runEventSubs.add(cb);
		return () => this.runEventSubs.delete(cb);
	}

	rendererIdFor(candidateId: string): ComposerRendererId | null {
		const meta = this.candidateMeta.get(candidateId);
		if (!meta) return null;
		return this.deps.registry.require(meta.capabilityId).rendererId;
	}

	regenerate(candidateId: string, instruction?: string): ComposerInvocationHandle {
		if (this.activeRuns.has(candidateId)) {
			throw new Error(`candidate ${candidateId} is still streaming — cancel before regenerating`);
		}
		const meta = this.requireMeta(candidateId);
		const candidate = this.findCandidate(candidateId);
		if (!candidate || candidate.status === 'accepted' || candidate.status === 'discarded') {
			throw new Error(`candidate ${candidateId} is not regenerable`);
		}
		if (candidate.status === 'stale' || candidate.baseRevision !== this.deps.session.baseRevision) {
			// Stale-source regeneration against the NEW revision requires a candidate
			// rebase API the WP2 store does not expose yet; fail closed and let the
			// surface offer a fresh invocation instead of guessing anchors.
			throw new ComposerConflictError(
				'stale-candidate',
				`candidate ${candidateId} is stale — re-run the capability against the current document`,
			);
		}
		const def = this.deps.registry.require(meta.capabilityId);
		def.inputSchema.parse({ instruction });
		const updated = this.deps.hub.addVariant(candidateId, {
			streaming: true,
			...(instruction !== undefined ? { instruction } : {}),
			proposedChange: { operations: [] },
		});
		const runId = nextRunId();
		meta.lastRunId = runId;
		this.startGeneration(def, candidateId, updated.activeVariantId, runId, instruction);
		return { runId, cancel: () => this.cancel(candidateId) };
	}

	cancel(candidateId: string): void {
		const run = this.activeRuns.get(candidateId);
		if (!run) return;
		run.abort.abort();
	}

	isStreaming(candidateId: string): boolean {
		return this.activeRuns.has(candidateId);
	}

	async accept(candidateId: string): Promise<void> {
		const meta = this.requireMeta(candidateId);
		const def = this.deps.registry.require(meta.capabilityId);
		const presentation = resolvePresentation(this.deps.config(), def.configKey, def.presentationFallback);
		await this.deps.hub.acceptCandidate(candidateId, {
			origin: 'ai',
			label: presentation.historyLabel,
			runId: meta.lastRunId,
		});
	}

	discard(candidateId: string): void {
		this.cancel(candidateId);
		this.deps.hub.discardCandidate(candidateId);
	}

	setActiveVariant(candidateId: string, variantId: string): void {
		if (this.activeRuns.has(candidateId)) {
			throw new Error(`candidate ${candidateId} is streaming — variant navigation is disabled`);
		}
		this.deps.hub.setActiveVariant(candidateId, variantId);
	}

	// ── context assembly convenience (integration wiring point) ───────────────

	/**
	 * Assemble a frozen snapshot for a target in THIS document (bounded by the
	 * configured context policy). The chrome calls this before actionsFor/invoke.
	 */
	assembleSnapshot(target: ComposerTarget, selectionText?: string): ComposerContextSnapshot {
		return assembleComposerContextSnapshot(this.deps.session, target, {
			...(selectionText !== undefined ? { selectionText } : {}),
			nearbyChars: this.deps.config().context.nearbyChars,
		});
	}

	// ── internals ───────────────────────────────────────────────────────────────

	private resolveAnchor(target: ComposerTarget): { from: number; to: number } | undefined {
		if (target.kind === 'document') return undefined;
		const block = this.deps.session.getBlock(target.blockId);
		if (!block) {
			throw new ComposerConflictError(
				'target-missing-after-reparse',
				`target block '${target.blockId}' not found in the current snapshot`,
			);
		}
		if (target.kind === 'block') return { from: block.source.from, to: block.source.to };
		const unit = block.units.find((u) => u.unitId === target.unitId);
		if (!unit) {
			throw new ComposerConflictError(
				'target-missing-after-reparse',
				`target unit '${target.unitId}' not found in block '${target.blockId}'`,
			);
		}
		return { from: unit.from, to: unit.to };
	}

	private startGeneration(
		def: ComposerCapabilityDefinition,
		candidateId: string,
		variantId: string,
		runId: string,
		instruction?: string,
	): void {
		const abort = new AbortController();
		this.activeRuns.set(candidateId, { runId, variantId, abort });
		this.emit({ type: 'run-started', runId, capabilityId: def.manifest.id, candidateId, variantId });
		void this.runGeneration(def, candidateId, variantId, runId, abort, instruction).finally(() => {
			this.activeRuns.delete(candidateId);
		});
	}

	private async runGeneration(
		def: ComposerCapabilityDefinition,
		candidateId: string,
		variantId: string,
		runId: string,
		abort: AbortController,
		instruction?: string,
	): Promise<void> {
		const meta = this.requireMeta(candidateId);
		const strings = this.deps.config().strings;
		try {
			if (!def.promptId || !def.buildPromptVariables) {
				throw new Error(`capability '${def.manifest.id}' has no model execution binding`);
			}
			const variables = def.buildPromptVariables(meta.snapshot, instruction);
			let text = '';
			await runCapability({
				manifest: def.manifest,
				compiledSkill: syntheticSkill(def),
				input: { instruction },
				trigger: 'manual',
				execute: async () => {
					const stream = this.deps.executor.stream({
						capabilityId: def.manifest.id,
						promptId: def.promptId!,
						variables,
						signal: abort.signal,
					});
					for await (const event of stream) {
						if (abort.signal.aborted) break;
						if (event.type !== 'text-delta') continue;
						text += event.text;
						this.emit({ type: 'content-delta', runId, candidateId, variantId, delta: event.text, text });
					}
					if (abort.signal.aborted) throw new AbortRunError();
					return { result: text };
				},
			});
			const materializer = this.deps.materializers.resolve(def.resultKind);
			const envelope = materializer.materialize({ definition: def, snapshot: meta.snapshot, text });
			const operations = this.buildOperations(def, envelope, meta);
			const presentation = resolvePresentation(this.deps.config(), def.configKey, def.presentationFallback);
			this.deps.hub.markVariantReady(candidateId, {
				operations,
				result: envelope,
				summary: presentation.historyLabel,
			});
			// Clear the streaming flag BEFORE the terminal event so subscribers
			// observing 'variant-ready' can immediately regenerate/accept.
			this.activeRuns.delete(candidateId);
			this.emit({ type: 'variant-ready', runId, candidateId, variantId, envelope });
		} catch (err) {
			this.failVariantSafely(candidateId);
			this.activeRuns.delete(candidateId);
			if (err instanceof AbortRunError || abort.signal.aborted) {
				this.emit({ type: 'run-cancelled', runId, candidateId, variantId });
				return;
			}
			const message = err instanceof Error ? err.message : strings.runFailed;
			this.emit({ type: 'run-failed', runId, candidateId, variantId, error: message });
		}
	}

	private buildOperations(
		def: ComposerCapabilityDefinition,
		envelope: ComposerResultEnvelope,
		meta: CandidateMeta,
	) {
		if (!def.writebackAdapterId) return [];
		const adapter = this.deps.writebacks.resolve(envelope);
		const ctx: WritebackTargetContext = {
			target: meta.snapshot.target,
			...(meta.anchor !== undefined ? { anchor: meta.anchor } : {}),
		};
		return adapter.buildOperations(envelope, ctx);
	}

	private failVariantSafely(candidateId: string): void {
		try {
			this.deps.hub.markVariantFailed(candidateId);
		} catch {
			// Candidate was discarded mid-run — nothing to mark.
		}
	}

	private findCandidate(candidateId: string): ComposerCandidate | undefined {
		return this.deps.hub.projection().candidates.find((c) => c.candidateId === candidateId);
	}

	private requireMeta(candidateId: string): CandidateMeta {
		const meta = this.candidateMeta.get(candidateId);
		if (!meta) throw new Error(`no capability run metadata for candidate ${candidateId}`);
		return meta;
	}

	private emit(event: ComposerCapabilityRunEvent): void {
		for (const cb of this.runEventSubs) cb(event);
	}
}

/** Internal marker for user-initiated cancellation. */
class AbortRunError extends Error {
	constructor() {
		super('composer capability run cancelled');
		this.name = 'AbortRunError';
	}
}
