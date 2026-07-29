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
	type ComposerCapabilityCatalogItem,
	type ComposerCandidateRuntimePort,
	type ComposerCapabilityDefinition,
	type ComposerCapabilityId,
	type ComposerCapabilityProjectionPort,
	type ComposerCapabilityRunEvent,
	type ComposerContextSnapshot,
	type ComposerInvocationHandle,
	type ComposerPromptExtras,
	type ComposerRendererId,
	type ComposerResultEnvelope,
	type ComposerTarget,
	composerTargetBlockId,
	ComposerConflictError,
} from '@/core/composer';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { ComposerNativeFileFormat } from '@/core/schemas/composer';
import { runCapability } from '@/service/capabilities/CapabilityRunner';
import type { ComposerDocumentSession } from '../documentSession';
import type { ComposerTransactionHub } from '../transactionHub';
import type { ComposerNativeFilePort } from '../packs/native';
import type { NativeFilePatchEnvelopePayload } from './packs/native';
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
	/**
	 * Read/write the SEPARATE native object files (`.base`/`.canvas`/`.excalidraw.md`)
	 * for the native structural-edit capabilities. Absent in a harness with no
	 * vault ⇒ those actions project disabled (never a dead button), and a native
	 * run/accept fails closed. Text-only packs never touch it.
	 */
	nativeFilePort?: ComposerNativeFilePort;
}

/** A resolved native object reference for one target block. */
interface NativeRefResolution {
	targetPath: string;
	format: ComposerNativeFileFormat;
}

interface CandidateMeta {
	capabilityId: ComposerCapabilityId;
	/** Frozen invocation-time snapshot (base revision of the candidate). */
	snapshot: ComposerContextSnapshot;
	/** Frozen base-revision anchor of the targeted block/unit. */
	anchor?: { from: number; to: number };
	lastRunId: string;
	modelId?: string;
	/** Native object path + frozen base bytes (native-file-patch runs only). */
	native?: { targetPath: string; baseText: string; format: ComposerNativeFileFormat };
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
		const descriptors = resolveComposerActions(
			{
				registry: this.deps.registry,
				config: this.deps.config,
				currentRevision: () => this.deps.session.baseRevision,
				resolveBlockKind: (blockId) => this.deps.session.getBlock(blockId)?.kind,
			},
			snapshot,
			surface,
		);
		// Native structural actions (native-file-patch) fan out one definition per
		// format across every embed block; gate each to the target's actual native
		// ref + a present, format-capable native-file port. No matching object ⇒
		// hidden; port missing ⇒ disabled with a reason (never a dead button).
		const gated: ComposerActionDescriptor[] = [];
		for (const descriptor of descriptors) {
			const resolved = this.gateNativeDescriptor(descriptor, snapshot);
			if (resolved) gated.push(resolved);
		}
		return gated;
	}

	catalogFor(snapshot: ComposerContextSnapshot): readonly ComposerCapabilityCatalogItem[] {
		const currentActions = new Map<ComposerCapabilityId, ComposerActionDescriptor>();
		for (const surface of ['block-row', 'selection-toolbar', 'object-toolbar'] as const) {
			for (const action of this.actionsFor(snapshot, surface)) {
				if (action.group !== 'ai' || action.disabledReason || currentActions.has(action.capabilityId)) continue;
				currentActions.set(action.capabilityId, action);
			}
		}
		return this.deps.registry
			.list()
			.filter((definition) => definition.executionMode !== 'deterministic')
			.map((definition) => {
				const presentation = resolvePresentation(
					this.deps.config(),
					definition.configKey,
					definition.presentationFallback,
				);
				return {
					capabilityId: definition.manifest.id,
					title: presentation.title,
					...(presentation.description ? { description: presentation.description } : {}),
					...(presentation.lucideIcon ? { lucideIcon: presentation.lucideIcon } : {}),
					...(currentActions.get(definition.manifest.id)
						? { action: currentActions.get(definition.manifest.id) }
						: {}),
					targetKinds: definition.targetKinds,
				};
			});
	}

	private gateNativeDescriptor(
		descriptor: ComposerActionDescriptor,
		snapshot: ComposerContextSnapshot,
	): ComposerActionDescriptor | null {
		// A descriptor the resolver already disabled (stale / empty) is left as-is.
		if (descriptor.disabledReason) return descriptor;
		const def = this.deps.registry.getById(descriptor.capabilityId);
		if (!def || def.resultKind !== 'native-file-patch') return descriptor;
		const desired = def.resultContext?.format;
		const ref = this.resolveNativeRef(snapshot.target);
		if (!ref || ref.format !== desired) return null; // no native object of this format here
		const port = this.deps.nativeFilePort;
		if (!port || port.format(ref.targetPath) === null) {
			return { ...descriptor, disabledReason: this.deps.config().strings.nativeUnavailable };
		}
		return descriptor;
	}

	/** The Base/Canvas/Excalidraw native ref anchored to a target's block, if any. */
	private resolveNativeRef(target: ComposerTarget): NativeRefResolution | null {
		const blockId = composerTargetBlockId(target);
		if (!blockId) return null;
		const ref = this.deps.session.snapshot.nativeRefs.find(
			(r) => r.blockId === blockId && (r.kind === 'base' || r.kind === 'canvas' || r.kind === 'excalidraw'),
		);
		if (!ref) return null;
		return { targetPath: ref.target, format: ref.kind as ComposerNativeFileFormat };
	}

	invoke(
		capabilityId: ComposerCapabilityId,
		snapshot: ComposerContextSnapshot,
		options?: { instruction?: string; modelId?: string },
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
			...(options?.modelId !== undefined ? { modelId: options.modelId } : {}),
		});
		this.startGeneration(
			def,
			candidate.candidateId,
			candidate.activeVariantId,
			runId,
			options?.instruction,
			options?.modelId,
		);
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

	candidateLabelFor(candidateId: string): string | null {
		const meta = this.candidateMeta.get(candidateId);
		if (!meta) return null;
		const def = this.deps.registry.require(meta.capabilityId);
		return resolvePresentation(this.deps.config(), def.configKey, def.presentationFallback).title;
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
		this.startGeneration(def, candidateId, updated.activeVariantId, runId, instruction, meta.modelId);
		return { runId, cancel: () => this.cancel(candidateId) };
	}

	/**
	 * Re-run a stale candidate against the current document. Fail-closed: if the
	 * anchor block no longer resolves in the live snapshot we return null and leave
	 * the stale candidate in place (the surface keeps its "source changed" notice)
	 * — we never guess a new position. Otherwise the stale candidate is discarded
	 * and the capability is invoked afresh on the block, inheriting the candidate's
	 * last instruction.
	 */
	rerunStale(candidateId: string): ComposerInvocationHandle | null {
		if (this.activeRuns.has(candidateId)) return null;
		const meta = this.requireMeta(candidateId);
		const candidate = this.findCandidate(candidateId);
		// Prefer the candidate's CURRENT anchor (revalidate re-maps content-derived
		// block ids across the reparse); fall back to the frozen target's block.
		const blockId = candidate?.anchorBlockId ?? composerTargetBlockId(meta.snapshot.target);
		if (!blockId) return null;
		if (!this.deps.session.getBlock(blockId)) return null; // anchor gone → fail closed
		const instruction = candidate ? lastInstructionOf(candidate) : undefined;
		this.discard(candidateId);
		const fresh = this.assembleSnapshot({ kind: 'block', blockId });
		return this.invoke(meta.capabilityId, fresh, {
			...(instruction !== undefined ? { instruction } : {}),
			...(meta.modelId !== undefined ? { modelId: meta.modelId } : {}),
		});
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
		// Native structural edits target a SEPARATE file, so they are written through
		// the revision-guarded native-file port rather than the Markdown hub (handoff
		// §10.12) — no Markdown transaction, no document History/Undo entry.
		if (def.resultKind === 'native-file-patch') {
			await this.acceptNative(candidateId, meta);
			return;
		}
		const presentation = resolvePresentation(this.deps.config(), def.configKey, def.presentationFallback);
		await this.deps.hub.acceptCandidate(candidateId, {
			origin: 'ai',
			label: presentation.historyLabel,
			runId: meta.lastRunId,
		});
	}

	private async acceptNative(candidateId: string, meta: CandidateMeta): Promise<void> {
		const candidate = this.findCandidate(candidateId);
		if (!candidate || candidate.status !== 'ready') {
			throw new Error(`native candidate ${candidateId} is not ready to accept`);
		}
		const envelope = candidate.proposedChange.result as ComposerResultEnvelope | undefined;
		const payload = envelope?.payload as NativeFilePatchEnvelopePayload | undefined;
		const core = payload?.core;
		if (!core || core.unsupported === true || core.nextText === undefined) {
			throw new Error(`native edit cannot be applied: ${core?.reason ?? 'no patched bytes'}`);
		}
		const port = this.deps.nativeFilePort;
		if (!port || !meta.native) throw new Error('native-file port unavailable — cannot accept native edit');
		// Revision-guarded write against the frozen base bytes: an external edit to
		// the native file since the run makes the port throw (fail closed).
		await port.writeNative(core.targetPath, core.nextText, meta.native.baseText);
		this.deps.hub.markCandidateAccepted(candidateId);
	}

	/**
	 * Pre-read run inputs the frozen snapshot cannot hold. For a native structural
	 * capability this reads the separate object file's current bytes (fail closed
	 * when the port/ref is missing) and stashes them on the candidate meta for the
	 * materializer + the revision-guarded accept. Non-native runs get no extras.
	 */
	private async prepareRunExtras(
		def: ComposerCapabilityDefinition,
		meta: CandidateMeta,
	): Promise<ComposerPromptExtras | undefined> {
		if (def.resultKind !== 'native-file-patch') return undefined;
		const ref = this.resolveNativeRef(meta.snapshot.target);
		const port = this.deps.nativeFilePort;
		if (!ref || !port || port.format(ref.targetPath) === null) {
			throw new Error('native object is not editable here (no native-file port or unsupported file)');
		}
		const baseText = await port.readNative(ref.targetPath);
		meta.native = { targetPath: ref.targetPath, baseText, format: ref.format };
		return { nativeText: baseText };
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
		// Selection targets are pre-anchored to their exact source range (the
		// text-patch writeback replaces only the selection bytes — WP3 leftover ②).
		if (target.kind === 'selection') return { from: target.from, to: target.to };
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
		modelId?: string,
	): void {
		const abort = new AbortController();
		this.activeRuns.set(candidateId, { runId, variantId, abort });
		this.emit({ type: 'run-started', runId, capabilityId: def.manifest.id, candidateId, variantId });
		void this.runGeneration(def, candidateId, variantId, runId, abort, instruction, modelId).finally(() => {
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
		modelId?: string,
	): Promise<void> {
		const meta = this.requireMeta(candidateId);
		const strings = this.deps.config().strings;
		try {
			if (!def.promptId || !def.buildPromptVariables) {
				throw new Error(`capability '${def.manifest.id}' has no model execution binding`);
			}
			const materializer = this.deps.materializers.resolve(def.resultKind);
			// Typed-object results (table-patch / chart-source …) stream raw JSON,
			// which must NEVER render as the reviewable body. We accumulate the text
			// internally but emit skeleton (empty-text) deltas, and only materialize
			// the typed variant on completion. Prose results stream their body live.
			const typedObject = materializer.streamsTypedObject === true;
			// Native structural runs need the SEPARATE object file's current bytes for
			// both the prompt and the typed-patch application — pre-read them (fail
			// closed when the port/ref is missing) and stash them on the candidate meta.
			const extras = await this.prepareRunExtras(def, meta);
			const variables = def.buildPromptVariables(meta.snapshot, instruction, extras);
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
						...(modelId !== undefined ? { modelId } : {}),
						signal: abort.signal,
					});
					for await (const event of stream) {
						if (abort.signal.aborted) break;
						if (event.type !== 'text-delta') continue;
						text += event.text;
						if (typedObject) {
							this.emit({ type: 'content-delta', runId, candidateId, variantId, delta: '', text: '' });
							continue;
						}
						this.emit({ type: 'content-delta', runId, candidateId, variantId, delta: event.text, text });
					}
					if (abort.signal.aborted) throw new AbortRunError();
					return { result: text };
				},
			});
			const envelope = materializer.materialize({
				definition: def,
				snapshot: meta.snapshot,
				text,
				...(meta.native
					? { nativeBaseText: meta.native.baseText, nativeTargetPath: meta.native.targetPath }
					: {}),
			});
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

/** The most recent instruction across a candidate's variants (active first). */
function lastInstructionOf(candidate: ComposerCandidate): string | undefined {
	const active = candidate.variants.find((v) => v.variantId === candidate.activeVariantId);
	if (active?.instruction !== undefined) return active.instruction;
	for (let i = candidate.variants.length - 1; i >= 0; i--) {
		if (candidate.variants[i].instruction !== undefined) return candidate.variants[i].instruction;
	}
	return undefined;
}

/** Internal marker for user-initiated cancellation. */
class AbortRunError extends Error {
	constructor() {
		super('composer capability run cancelled');
		this.name = 'AbortRunError';
	}
}
